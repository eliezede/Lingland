"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.opaqueEntityId = exports.suggestionFingerprint = exports.validateAIControlPatch = exports.mergeAIControlConfig = exports.normalizeConfidence = exports.isKnownAIAction = exports.AI_ACTION_REGISTRY = void 0;
const crypto_1 = require("crypto");
const types_1 = require("./types");
exports.AI_ACTION_REGISTRY = {
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
const isKnownAIAction = (value) => (typeof value === 'string' && types_1.AI_ACTIONS.includes(value));
exports.isKnownAIAction = isKnownAIAction;
const normalizeConfidence = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return 0;
    return Math.max(0, Math.min(100, Math.round(parsed)));
};
exports.normalizeConfidence = normalizeConfidence;
const boundedInteger = (value, fallback, min, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
};
const mergeAIControlConfig = (stored) => {
    const mode = typeof stored?.mode === 'string' && types_1.SAFE_AI_MODES.includes(stored.mode)
        ? stored.mode
        : types_1.DEFAULT_AI_CONTROL_CONFIG.mode;
    const model = typeof stored?.model === 'string' && types_1.DEEPSEEK_MODELS.includes(stored.model)
        ? stored.model
        : types_1.DEFAULT_AI_CONTROL_CONFIG.model;
    return {
        ...types_1.DEFAULT_AI_CONTROL_CONFIG,
        mode,
        model,
        emergencyPaused: stored?.emergencyPaused !== false,
        minimumConfidence: boundedInteger(stored?.minimumConfidence, types_1.DEFAULT_AI_CONTROL_CONFIG.minimumConfidence, 50, 95),
        maxSuggestionsPerRun: boundedInteger(stored?.maxSuggestionsPerRun, types_1.DEFAULT_AI_CONTROL_CONFIG.maxSuggestionsPerRun, 5, 50),
        dailyRunLimit: boundedInteger(stored?.dailyRunLimit, types_1.DEFAULT_AI_CONTROL_CONFIG.dailyRunLimit, 1, 50),
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
exports.mergeAIControlConfig = mergeAIControlConfig;
const validateAIControlPatch = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return {};
    const source = input;
    const patch = {};
    if (source.mode !== undefined) {
        if (typeof source.mode !== 'string' || !types_1.SAFE_AI_MODES.includes(source.mode)) {
            throw new Error('This AI mode is locked until the production readiness gates are complete.');
        }
        patch.mode = source.mode;
    }
    if (source.model !== undefined) {
        if (typeof source.model !== 'string' || !types_1.DEEPSEEK_MODELS.includes(source.model)) {
            throw new Error('Unsupported DeepSeek model.');
        }
        patch.model = source.model;
    }
    if (source.emergencyPaused !== undefined)
        patch.emergencyPaused = Boolean(source.emergencyPaused);
    if (source.minimumConfidence !== undefined) {
        patch.minimumConfidence = boundedInteger(source.minimumConfidence, types_1.DEFAULT_AI_CONTROL_CONFIG.minimumConfidence, 50, 95);
    }
    if (source.maxSuggestionsPerRun !== undefined) {
        patch.maxSuggestionsPerRun = boundedInteger(source.maxSuggestionsPerRun, types_1.DEFAULT_AI_CONTROL_CONFIG.maxSuggestionsPerRun, 5, 50);
    }
    if (source.dailyRunLimit !== undefined) {
        patch.dailyRunLimit = boundedInteger(source.dailyRunLimit, types_1.DEFAULT_AI_CONTROL_CONFIG.dailyRunLimit, 1, 50);
    }
    return patch;
};
exports.validateAIControlPatch = validateAIControlPatch;
const suggestionFingerprint = (input) => (0, crypto_1.createHash)('sha256')
    .update([input.action, input.entityType, input.entityId, input.title.trim().toLowerCase()].join('|'))
    .digest('hex');
exports.suggestionFingerprint = suggestionFingerprint;
const opaqueEntityId = (entityType, id) => (0, crypto_1.createHash)('sha256')
    .update(`lingland-ai-context-v1|${entityType}|${id}`)
    .digest('hex')
    .slice(0, 20);
exports.opaqueEntityId = opaqueEntityId;
//# sourceMappingURL=policy.js.map