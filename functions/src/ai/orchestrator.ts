import { AIReviewContext, analyseOperationalContext } from './contextBuilder';
import { DeepSeekSuggestionResponse, requestDeepSeekSuggestions } from './deepSeekClient';
import { AI_ACTION_REGISTRY, isKnownAIAction, normalizeConfidence } from './policy';
import { AIControlConfig, AIReviewScope, AISuggestionDraft } from './types';

const actionScopes: Record<string, AIReviewScope[]> = {
  REVIEW_ASSIGNMENT: ['JOBS', 'ALLOCATION', 'PLATFORM'],
  REVIEW_OVERDUE_JOB: ['JOBS', 'PLATFORM'],
  REVIEW_STATUS_CONSISTENCY: ['JOBS', 'BILLING', 'SYNC', 'PLATFORM'],
  REVIEW_BILLING_GAP: ['BILLING', 'PLATFORM'],
  REVIEW_INVOICE_INTEGRITY: ['BILLING', 'PLATFORM'],
  REVIEW_SYNC_CONFLICT: ['SYNC', 'PLATFORM'],
  REVIEW_COST_ANOMALY: ['COST', 'BILLING', 'PLATFORM'],
  CREATE_PROCESS_IMPROVEMENT: ['JOBS', 'ALLOCATION', 'BILLING', 'SYNC', 'COST', 'PLATFORM'],
  CREATE_INTERNAL_ALERT: ['JOBS', 'ALLOCATION', 'BILLING', 'SYNC', 'COST', 'PLATFORM'],
  PLACE_JOB_ON_HOLD: ['JOBS', 'PLATFORM'],
  OFFER_INTERPRETER: ['ALLOCATION', 'JOBS', 'PLATFORM'],
  CREATE_CLIENT_INVOICE_DRAFT: ['BILLING', 'PLATFORM'],
};

const safeText = (value: unknown, max: number) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const modelSuggestionToDraft = (
  suggestion: DeepSeekSuggestionResponse,
  context: AIReviewContext,
): AISuggestionDraft | null => {
  if (!isKnownAIAction(suggestion.action)) return null;
  if (!actionScopes[suggestion.action]?.includes(context.scope)) return null;

  let entityType: AISuggestionDraft['entityType'];
  let entityId: string;
  let entityLabel: string;
  if (suggestion.entityId === 'SYSTEM' && suggestion.entityType.toUpperCase() === 'SYSTEM') {
    if (suggestion.action !== 'CREATE_PROCESS_IMPROVEMENT') return null;
    entityType = 'SYSTEM';
    entityId = 'ai-operational-review';
    entityLabel = 'Platform operations';
  } else {
    const entity = context.entityLookup[suggestion.entityId];
    if (!entity) return null;
    entityType = entity.entityType;
    entityId = entity.entityId;
    entityLabel = entity.entityLabel;
  }

  const title = safeText(suggestion.title, 120);
  const reason = safeText(suggestion.reason, 500);
  const expectedBenefit = safeText(suggestion.expectedBenefit, 300);
  const confidence = normalizeConfidence(suggestion.confidence);
  if (!title || !reason || !expectedBenefit || confidence === 0) return null;

  return {
    action: suggestion.action,
    category: suggestion.action === 'CREATE_PROCESS_IMPROVEMENT' ? 'PLATFORM' : context.scope,
    entityType,
    entityId,
    entityLabel,
    title,
    reason,
    expectedBenefit,
    confidence,
    evidence: (suggestion.evidence || []).map(item => safeText(item, 160)).filter(Boolean).slice(0, 5),
    source: 'DEEPSEEK',
    dataUsed: ['minimized operational context', 'opaque entity identifiers'],
  };
};

export interface AIOrchestrationResult {
  suggestions: AISuggestionDraft[];
  localSuggestionCount: number;
  providerSuggestionCount: number;
  providerStatus: 'CONNECTED' | 'NOT_CONFIGURED' | 'ERROR';
  providerError?: string;
}

export const runAIOrchestrator = async (input: {
  context: AIReviewContext;
  config: AIControlConfig;
  actorUid: string;
  apiKey?: string;
}): Promise<AIOrchestrationResult> => {
  const localSuggestions = analyseOperationalContext(input.context);
  let providerDrafts: AISuggestionDraft[] = [];
  let providerStatus: AIOrchestrationResult['providerStatus'] = input.apiKey ? 'CONNECTED' : 'NOT_CONFIGURED';
  let providerError: string | undefined;

  if (input.apiKey) {
    try {
      const providerSuggestions = await requestDeepSeekSuggestions({
        apiKey: input.apiKey,
        model: input.config.model,
        scope: input.context.scope,
        context: input.context.providerContext,
        actorUid: input.actorUid,
        maxSuggestions: Math.min(12, input.config.maxSuggestionsPerRun),
      });
      providerDrafts = providerSuggestions
        .map(item => modelSuggestionToDraft(item, input.context))
        .filter((item): item is AISuggestionDraft => item !== null);
    } catch (error) {
      providerStatus = 'ERROR';
      providerError = error instanceof Error ? safeText(error.message, 180) : 'DeepSeek review failed.';
    }
  }

  const unique = new Map<string, AISuggestionDraft>();
  for (const suggestion of [...localSuggestions, ...providerDrafts]) {
    const definition = AI_ACTION_REGISTRY[suggestion.action];
    if (suggestion.source === 'DEEPSEEK' && definition.handler !== 'CREATE_OPERATION_TASK') continue;
    if (suggestion.confidence < input.config.minimumConfidence) continue;
    const key = [suggestion.action, suggestion.entityType, suggestion.entityId, suggestion.title.toLowerCase()].join('|');
    const existing = unique.get(key);
    if (!existing || suggestion.confidence > existing.confidence) unique.set(key, suggestion);
  }

  return {
    suggestions: Array.from(unique.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, input.config.maxSuggestionsPerRun),
    localSuggestionCount: localSuggestions.length,
    providerSuggestionCount: providerDrafts.length,
    providerStatus,
    providerError,
  };
};
