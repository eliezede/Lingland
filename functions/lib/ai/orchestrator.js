"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAIOrchestrator = void 0;
const contextBuilder_1 = require("./contextBuilder");
const deepSeekClient_1 = require("./deepSeekClient");
const policy_1 = require("./policy");
const actionScopes = {
    REVIEW_ASSIGNMENT: ['JOBS', 'ALLOCATION', 'PLATFORM'],
    REVIEW_OVERDUE_JOB: ['JOBS', 'PLATFORM'],
    REVIEW_STATUS_CONSISTENCY: ['JOBS', 'BILLING', 'SYNC', 'PLATFORM'],
    REVIEW_BILLING_GAP: ['BILLING', 'PLATFORM'],
    REVIEW_INVOICE_INTEGRITY: ['BILLING', 'PLATFORM'],
    REVIEW_SYNC_CONFLICT: ['SYNC', 'PLATFORM'],
    REVIEW_COST_ANOMALY: ['COST', 'BILLING', 'PLATFORM'],
    CREATE_PROCESS_IMPROVEMENT: ['JOBS', 'ALLOCATION', 'BILLING', 'SYNC', 'COST', 'PLATFORM'],
};
const safeText = (value, max) => String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const modelSuggestionToDraft = (suggestion, context) => {
    if (!(0, policy_1.isKnownAIAction)(suggestion.action))
        return null;
    if (!actionScopes[suggestion.action]?.includes(context.scope))
        return null;
    let entityType;
    let entityId;
    let entityLabel;
    if (suggestion.entityId === 'SYSTEM' && suggestion.entityType.toUpperCase() === 'SYSTEM') {
        if (suggestion.action !== 'CREATE_PROCESS_IMPROVEMENT')
            return null;
        entityType = 'SYSTEM';
        entityId = 'ai-operational-review';
        entityLabel = 'Platform operations';
    }
    else {
        const entity = context.entityLookup[suggestion.entityId];
        if (!entity)
            return null;
        entityType = entity.entityType;
        entityId = entity.entityId;
        entityLabel = entity.entityLabel;
    }
    const title = safeText(suggestion.title, 120);
    const reason = safeText(suggestion.reason, 500);
    const expectedBenefit = safeText(suggestion.expectedBenefit, 300);
    const confidence = (0, policy_1.normalizeConfidence)(suggestion.confidence);
    if (!title || !reason || !expectedBenefit || confidence === 0)
        return null;
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
const runAIOrchestrator = async (input) => {
    const localSuggestions = (0, contextBuilder_1.analyseOperationalContext)(input.context);
    let providerDrafts = [];
    let providerStatus = input.apiKey ? 'CONNECTED' : 'NOT_CONFIGURED';
    let providerError;
    if (input.apiKey) {
        try {
            const providerSuggestions = await (0, deepSeekClient_1.requestDeepSeekSuggestions)({
                apiKey: input.apiKey,
                model: input.config.model,
                scope: input.context.scope,
                context: input.context.providerContext,
                actorUid: input.actorUid,
                maxSuggestions: Math.min(12, input.config.maxSuggestionsPerRun),
            });
            providerDrafts = providerSuggestions
                .map(item => modelSuggestionToDraft(item, input.context))
                .filter((item) => item !== null);
        }
        catch (error) {
            providerStatus = 'ERROR';
            providerError = error instanceof Error ? safeText(error.message, 180) : 'DeepSeek review failed.';
        }
    }
    const unique = new Map();
    for (const suggestion of [...localSuggestions, ...providerDrafts]) {
        const definition = policy_1.AI_ACTION_REGISTRY[suggestion.action];
        if (definition.executionAvailable || definition.externalCommunication)
            continue;
        if (suggestion.confidence < input.config.minimumConfidence)
            continue;
        const key = [suggestion.action, suggestion.entityType, suggestion.entityId, suggestion.title.toLowerCase()].join('|');
        const existing = unique.get(key);
        if (!existing || suggestion.confidence > existing.confidence)
            unique.set(key, suggestion);
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
exports.runAIOrchestrator = runAIOrchestrator;
//# sourceMappingURL=orchestrator.js.map