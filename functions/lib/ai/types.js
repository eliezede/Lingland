"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_AI_CONTROL_CONFIG = exports.AI_ACTIONS = exports.AI_REVIEW_SCOPES = exports.DEEPSEEK_MODELS = exports.SAFE_AI_MODES = exports.AI_MODE_VALUES = void 0;
exports.AI_MODE_VALUES = [
    'OFF',
    'READ_ONLY_AUDIT',
    'SUGGEST',
    'ASSISTED',
    'CONTROLLED_AUTOPILOT',
    'FULL_AUTOPILOT',
];
exports.SAFE_AI_MODES = ['OFF', 'READ_ONLY_AUDIT', 'SUGGEST'];
exports.DEEPSEEK_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'];
exports.AI_REVIEW_SCOPES = [
    'JOBS',
    'ALLOCATION',
    'BILLING',
    'SYNC',
    'COST',
    'PLATFORM',
];
exports.AI_ACTIONS = [
    'REVIEW_ASSIGNMENT',
    'REVIEW_OVERDUE_JOB',
    'REVIEW_STATUS_CONSISTENCY',
    'REVIEW_BILLING_GAP',
    'REVIEW_INVOICE_INTEGRITY',
    'REVIEW_SYNC_CONFLICT',
    'REVIEW_COST_ANOMALY',
    'CREATE_PROCESS_IMPROVEMENT',
];
exports.DEFAULT_AI_CONTROL_CONFIG = {
    mode: 'OFF',
    provider: 'DEEPSEEK',
    model: 'deepseek-v4-flash',
    emergencyPaused: true,
    executionEnabled: false,
    externalCommunicationEnabled: false,
    piiPolicy: 'MINIMIZED',
    minimumConfidence: 65,
    maxSuggestionsPerRun: 25,
    dailyRunLimit: 10,
    providerConfigured: false,
    lastConnectionTestStatus: 'NOT_TESTED',
};
//# sourceMappingURL=types.js.map