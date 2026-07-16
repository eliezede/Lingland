import { createHash } from 'crypto';
import {
  AI_ACTIONS,
  AIAction,
  AIActionDefinition,
  AIControlConfig,
  AIMode,
  DEFAULT_AI_CONTROL_CONFIG,
  DEEPSEEK_MODELS,
  SAFE_AI_MODES,
} from './types';

export const AI_ACTION_REGISTRY: Record<AIAction, AIActionDefinition> = {
  REVIEW_ASSIGNMENT: {
    action: 'REVIEW_ASSIGNMENT',
    risk: 'MEDIUM',
    description: 'Ask staff to review an unassigned or at-risk job.',
    executionAvailable: false,
    externalCommunication: false,
  },
  REVIEW_OVERDUE_JOB: {
    action: 'REVIEW_OVERDUE_JOB',
    risk: 'MEDIUM',
    description: 'Ask staff to reconcile an overdue operational record.',
    executionAvailable: false,
    externalCommunication: false,
  },
  REVIEW_STATUS_CONSISTENCY: {
    action: 'REVIEW_STATUS_CONSISTENCY',
    risk: 'MEDIUM',
    description: 'Ask staff to validate contradictory lifecycle signals.',
    executionAvailable: false,
    externalCommunication: false,
  },
  REVIEW_BILLING_GAP: {
    action: 'REVIEW_BILLING_GAP',
    risk: 'MEDIUM',
    description: 'Ask finance staff to review delivered work with a billing gap.',
    executionAvailable: false,
    externalCommunication: false,
  },
  REVIEW_INVOICE_INTEGRITY: {
    action: 'REVIEW_INVOICE_INTEGRITY',
    risk: 'MEDIUM',
    description: 'Ask finance staff to review an incomplete invoice record.',
    executionAvailable: false,
    externalCommunication: false,
  },
  REVIEW_SYNC_CONFLICT: {
    action: 'REVIEW_SYNC_CONFLICT',
    risk: 'LOW',
    description: 'Ask staff to inspect an unresolved mirror conflict.',
    executionAvailable: false,
    externalCommunication: false,
  },
  REVIEW_COST_ANOMALY: {
    action: 'REVIEW_COST_ANOMALY',
    risk: 'MEDIUM',
    description: 'Ask finance staff to verify a possible negative-margin job.',
    executionAvailable: false,
    externalCommunication: false,
  },
  CREATE_PROCESS_IMPROVEMENT: {
    action: 'CREATE_PROCESS_IMPROVEMENT',
    risk: 'LOW',
    description: 'Create a reviewable internal process improvement suggestion.',
    executionAvailable: false,
    externalCommunication: false,
  },
};

export const isKnownAIAction = (value: unknown): value is AIAction => (
  typeof value === 'string' && (AI_ACTIONS as readonly string[]).includes(value)
);

export const normalizeConfidence = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const boundedInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
};

export const mergeAIControlConfig = (stored?: Record<string, unknown>): AIControlConfig => {
  const mode = typeof stored?.mode === 'string' && SAFE_AI_MODES.includes(stored.mode as AIMode)
    ? stored.mode as AIMode
    : DEFAULT_AI_CONTROL_CONFIG.mode;
  const model = typeof stored?.model === 'string' && (DEEPSEEK_MODELS as readonly string[]).includes(stored.model)
    ? stored.model as AIControlConfig['model']
    : DEFAULT_AI_CONTROL_CONFIG.model;

  return {
    ...DEFAULT_AI_CONTROL_CONFIG,
    mode,
    model,
    emergencyPaused: stored?.emergencyPaused !== false,
    minimumConfidence: boundedInteger(stored?.minimumConfidence, DEFAULT_AI_CONTROL_CONFIG.minimumConfidence, 50, 95),
    maxSuggestionsPerRun: boundedInteger(stored?.maxSuggestionsPerRun, DEFAULT_AI_CONTROL_CONFIG.maxSuggestionsPerRun, 5, 50),
    dailyRunLimit: boundedInteger(stored?.dailyRunLimit, DEFAULT_AI_CONTROL_CONFIG.dailyRunLimit, 1, 50),
    providerConfigured: stored?.providerConfigured === true,
    lastConnectionTestAt: typeof stored?.lastConnectionTestAt === 'string' ? stored.lastConnectionTestAt : undefined,
    lastConnectionTestStatus: stored?.lastConnectionTestStatus === 'CONNECTED' || stored?.lastConnectionTestStatus === 'ERROR'
      ? stored.lastConnectionTestStatus
      : 'NOT_TESTED',
    updatedAt: typeof stored?.updatedAt === 'string' ? stored.updatedAt : undefined,
    updatedBy: typeof stored?.updatedBy === 'string' ? stored.updatedBy : undefined,
    executionEnabled: false,
    externalCommunicationEnabled: false,
    provider: 'DEEPSEEK',
    piiPolicy: 'MINIMIZED',
  };
};

export const validateAIControlPatch = (input: unknown): Partial<AIControlConfig> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const patch: Partial<AIControlConfig> = {};

  if (source.mode !== undefined) {
    if (typeof source.mode !== 'string' || !SAFE_AI_MODES.includes(source.mode as AIMode)) {
      throw new Error('This AI mode is locked until the production readiness gates are complete.');
    }
    patch.mode = source.mode as AIMode;
  }
  if (source.model !== undefined) {
    if (typeof source.model !== 'string' || !(DEEPSEEK_MODELS as readonly string[]).includes(source.model)) {
      throw new Error('Unsupported DeepSeek model.');
    }
    patch.model = source.model as AIControlConfig['model'];
  }
  if (source.emergencyPaused !== undefined) patch.emergencyPaused = Boolean(source.emergencyPaused);
  if (source.minimumConfidence !== undefined) {
    patch.minimumConfidence = boundedInteger(source.minimumConfidence, DEFAULT_AI_CONTROL_CONFIG.minimumConfidence, 50, 95);
  }
  if (source.maxSuggestionsPerRun !== undefined) {
    patch.maxSuggestionsPerRun = boundedInteger(source.maxSuggestionsPerRun, DEFAULT_AI_CONTROL_CONFIG.maxSuggestionsPerRun, 5, 50);
  }
  if (source.dailyRunLimit !== undefined) {
    patch.dailyRunLimit = boundedInteger(source.dailyRunLimit, DEFAULT_AI_CONTROL_CONFIG.dailyRunLimit, 1, 50);
  }
  return patch;
};

export const suggestionFingerprint = (input: {
  action: string;
  entityType: string;
  entityId: string;
  title: string;
}) => createHash('sha256')
  .update([input.action, input.entityType, input.entityId, input.title.trim().toLowerCase()].join('|'))
  .digest('hex');

export const opaqueEntityId = (entityType: string, id: string) => createHash('sha256')
  .update(`lingland-ai-context-v1|${entityType}|${id}`)
  .digest('hex')
  .slice(0, 20);
