import { createHash } from 'crypto';
import {
  AI_ACTIONS,
  AIAction,
  AIActionDefinition,
  AIControlConfig,
  AIMode,
  AI_REVIEW_SCOPES,
  DEFAULT_AI_CONTROL_CONFIG,
  DEEPSEEK_MODELS,
  SAFE_AI_MODES,
} from './types';

export const AI_ACTION_REGISTRY: Record<AIAction, AIActionDefinition> = {
  REVIEW_ASSIGNMENT: {
    action: 'REVIEW_ASSIGNMENT',
    risk: 'MEDIUM',
    description: 'Ask staff to review an unassigned or at-risk job.',
    executionAvailable: true,
    externalCommunication: false,
    reversible: true,
    handler: 'CREATE_OPERATION_TASK',
  },
  REVIEW_OVERDUE_JOB: {
    action: 'REVIEW_OVERDUE_JOB',
    risk: 'MEDIUM',
    description: 'Ask staff to reconcile an overdue operational record.',
    executionAvailable: true,
    externalCommunication: false,
    reversible: true,
    handler: 'CREATE_OPERATION_TASK',
  },
  REVIEW_STATUS_CONSISTENCY: {
    action: 'REVIEW_STATUS_CONSISTENCY',
    risk: 'MEDIUM',
    description: 'Ask staff to validate contradictory lifecycle signals.',
    executionAvailable: true,
    externalCommunication: false,
    reversible: true,
    handler: 'CREATE_OPERATION_TASK',
  },
  REVIEW_BILLING_GAP: {
    action: 'REVIEW_BILLING_GAP',
    risk: 'MEDIUM',
    description: 'Ask finance staff to review delivered work with a billing gap.',
    executionAvailable: true,
    externalCommunication: false,
    reversible: true,
    handler: 'CREATE_OPERATION_TASK',
  },
  REVIEW_INVOICE_INTEGRITY: {
    action: 'REVIEW_INVOICE_INTEGRITY',
    risk: 'MEDIUM',
    description: 'Ask finance staff to review an incomplete invoice record.',
    executionAvailable: true,
    externalCommunication: false,
    reversible: true,
    handler: 'CREATE_OPERATION_TASK',
  },
  REVIEW_SYNC_CONFLICT: {
    action: 'REVIEW_SYNC_CONFLICT',
    risk: 'LOW',
    description: 'Ask staff to inspect an unresolved mirror conflict.',
    executionAvailable: true,
    externalCommunication: false,
    reversible: true,
    handler: 'CREATE_OPERATION_TASK',
  },
  REVIEW_COST_ANOMALY: {
    action: 'REVIEW_COST_ANOMALY',
    risk: 'MEDIUM',
    description: 'Ask finance staff to verify a possible negative-margin job.',
    executionAvailable: true,
    externalCommunication: false,
    reversible: true,
    handler: 'CREATE_OPERATION_TASK',
  },
  CREATE_PROCESS_IMPROVEMENT: {
    action: 'CREATE_PROCESS_IMPROVEMENT',
    risk: 'LOW',
    description: 'Create a reviewable internal process improvement suggestion.',
    executionAvailable: true,
    externalCommunication: false,
    reversible: true,
    handler: 'CREATE_OPERATION_TASK',
  },
  CREATE_INTERNAL_ALERT: {
    action: 'CREATE_INTERNAL_ALERT',
    risk: 'LOW',
    description: 'Create a traceable internal alert for active administrators.',
    executionAvailable: true,
    externalCommunication: false,
    reversible: false,
    handler: 'CREATE_INTERNAL_ALERT',
  },
  PLACE_JOB_ON_HOLD: {
    action: 'PLACE_JOB_ON_HOLD',
    risk: 'MEDIUM',
    description: 'Place an inconsistent job on a reversible administrative hold.',
    executionAvailable: true,
    externalCommunication: false,
    reversible: true,
    handler: 'PLACE_JOB_ON_HOLD',
  },
  OFFER_INTERPRETER: {
    action: 'OFFER_INTERPRETER',
    risk: 'HIGH',
    description: 'Create a direct assignment offer for a deterministically ranked professional.',
    executionAvailable: true,
    externalCommunication: true,
    reversible: true,
    handler: 'OFFER_INTERPRETER',
  },
  CREATE_CLIENT_INVOICE_DRAFT: {
    action: 'CREATE_CLIENT_INVOICE_DRAFT',
    risk: 'HIGH',
    description: 'Create an idempotent draft invoice from approved, uninvoiced timesheets.',
    executionAvailable: true,
    externalCommunication: false,
    reversible: true,
    handler: 'CREATE_CLIENT_INVOICE_DRAFT',
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

const booleanValue = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;

const scheduleInterval = (value: unknown, fallback: number) => {
  const allowed = [30, 60, 120, 180, 240, 360, 720, 1440];
  const parsed = Number(value);
  return allowed.includes(parsed) ? parsed : fallback;
};

const scheduledScopes = (value: unknown): AIControlConfig['scheduledScopes'] => {
  if (!Array.isArray(value)) return DEFAULT_AI_CONTROL_CONFIG.scheduledScopes;
  const scopes = value
    .map(item => String(item).toUpperCase())
    .filter((item): item is AIControlConfig['scheduledScopes'][number] => (AI_REVIEW_SCOPES as readonly string[]).includes(item));
  return Array.from(new Set(scopes)).slice(0, AI_REVIEW_SCOPES.length);
};

export const mergeAIControlConfig = (stored?: Record<string, unknown>): AIControlConfig => {
  const mode = typeof stored?.mode === 'string' && SAFE_AI_MODES.includes(stored.mode as AIMode)
    ? stored.mode as AIMode
    : DEFAULT_AI_CONTROL_CONFIG.mode;
  const executionMode = ['ASSISTED', 'CONTROLLED_AUTOPILOT', 'FULL_AUTOPILOT'].includes(mode);
  const automaticMode = ['CONTROLLED_AUTOPILOT', 'FULL_AUTOPILOT'].includes(mode);
  const model = typeof stored?.model === 'string' && (DEEPSEEK_MODELS as readonly string[]).includes(stored.model)
    ? stored.model as AIControlConfig['model']
    : DEFAULT_AI_CONTROL_CONFIG.model;

  return {
    ...DEFAULT_AI_CONTROL_CONFIG,
    mode,
    model,
    emergencyPaused: stored?.emergencyPaused !== false,
    executionEnabled: executionMode && stored?.executionEnabled === true,
    externalCommunicationEnabled: mode === 'FULL_AUTOPILOT' && stored?.externalCommunicationEnabled === true,
    simulationOnly: stored?.simulationOnly !== false,
    autoExecuteLowRisk: automaticMode && stored?.autoExecuteLowRisk === true,
    autoExecuteMediumRisk: automaticMode && stored?.autoExecuteMediumRisk === true,
    autoExecuteHighRisk: mode === 'FULL_AUTOPILOT' && stored?.autoExecuteHighRisk === true,
    requireApprovalForMediumRisk: stored?.requireApprovalForMediumRisk !== false,
    requireApprovalForHighRisk: stored?.requireApprovalForHighRisk !== false,
    maxActionsPerRun: boundedInteger(stored?.maxActionsPerRun, DEFAULT_AI_CONTROL_CONFIG.maxActionsPerRun, 1, 20),
    dailyActionLimit: boundedInteger(stored?.dailyActionLimit, DEFAULT_AI_CONTROL_CONFIG.dailyActionLimit, 1, 200),
    scheduledReviewsEnabled: mode !== 'OFF' && stored?.scheduledReviewsEnabled === true,
    scheduledScopes: scheduledScopes(stored?.scheduledScopes),
    scheduleIntervalMinutes: scheduleInterval(stored?.scheduleIntervalMinutes, DEFAULT_AI_CONTROL_CONFIG.scheduleIntervalMinutes),
    minimumConfidence: boundedInteger(stored?.minimumConfidence, DEFAULT_AI_CONTROL_CONFIG.minimumConfidence, 50, 95),
    maxSuggestionsPerRun: boundedInteger(stored?.maxSuggestionsPerRun, DEFAULT_AI_CONTROL_CONFIG.maxSuggestionsPerRun, 5, 50),
    dailyRunLimit: boundedInteger(stored?.dailyRunLimit, DEFAULT_AI_CONTROL_CONFIG.dailyRunLimit, 1, 50),
    providerConfigured: stored?.providerConfigured === true,
    lastConnectionTestAt: typeof stored?.lastConnectionTestAt === 'string' ? stored.lastConnectionTestAt : undefined,
    lastConnectionTestStatus: stored?.lastConnectionTestStatus === 'CONNECTED' || stored?.lastConnectionTestStatus === 'ERROR'
      ? stored.lastConnectionTestStatus
      : 'NOT_TESTED',
    automationAcknowledgedAt: typeof stored?.automationAcknowledgedAt === 'string' ? stored.automationAcknowledgedAt : undefined,
    automationAcknowledgedBy: typeof stored?.automationAcknowledgedBy === 'string' ? stored.automationAcknowledgedBy : undefined,
    liveExecutionAcknowledgedAt: typeof stored?.liveExecutionAcknowledgedAt === 'string' ? stored.liveExecutionAcknowledgedAt : undefined,
    liveExecutionAcknowledgedBy: typeof stored?.liveExecutionAcknowledgedBy === 'string' ? stored.liveExecutionAcknowledgedBy : undefined,
    lastScheduledRunAt: typeof stored?.lastScheduledRunAt === 'string' ? stored.lastScheduledRunAt : undefined,
    updatedAt: typeof stored?.updatedAt === 'string' ? stored.updatedAt : undefined,
    updatedBy: typeof stored?.updatedBy === 'string' ? stored.updatedBy : undefined,
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
      throw new Error('Unsupported AI operating mode.');
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
  if (source.executionEnabled !== undefined) patch.executionEnabled = Boolean(source.executionEnabled);
  if (source.externalCommunicationEnabled !== undefined) patch.externalCommunicationEnabled = Boolean(source.externalCommunicationEnabled);
  if (source.simulationOnly !== undefined) patch.simulationOnly = Boolean(source.simulationOnly);
  if (source.autoExecuteLowRisk !== undefined) patch.autoExecuteLowRisk = booleanValue(source.autoExecuteLowRisk, false);
  if (source.autoExecuteMediumRisk !== undefined) patch.autoExecuteMediumRisk = booleanValue(source.autoExecuteMediumRisk, false);
  if (source.autoExecuteHighRisk !== undefined) patch.autoExecuteHighRisk = booleanValue(source.autoExecuteHighRisk, false);
  if (source.requireApprovalForMediumRisk !== undefined) patch.requireApprovalForMediumRisk = booleanValue(source.requireApprovalForMediumRisk, true);
  if (source.requireApprovalForHighRisk !== undefined) patch.requireApprovalForHighRisk = booleanValue(source.requireApprovalForHighRisk, true);
  if (source.scheduledReviewsEnabled !== undefined) patch.scheduledReviewsEnabled = Boolean(source.scheduledReviewsEnabled);
  if (source.scheduledScopes !== undefined) patch.scheduledScopes = scheduledScopes(source.scheduledScopes);
  if (source.scheduleIntervalMinutes !== undefined) patch.scheduleIntervalMinutes = scheduleInterval(source.scheduleIntervalMinutes, DEFAULT_AI_CONTROL_CONFIG.scheduleIntervalMinutes);
  if (source.minimumConfidence !== undefined) {
    patch.minimumConfidence = boundedInteger(source.minimumConfidence, DEFAULT_AI_CONTROL_CONFIG.minimumConfidence, 50, 95);
  }
  if (source.maxSuggestionsPerRun !== undefined) {
    patch.maxSuggestionsPerRun = boundedInteger(source.maxSuggestionsPerRun, DEFAULT_AI_CONTROL_CONFIG.maxSuggestionsPerRun, 5, 50);
  }
  if (source.dailyRunLimit !== undefined) {
    patch.dailyRunLimit = boundedInteger(source.dailyRunLimit, DEFAULT_AI_CONTROL_CONFIG.dailyRunLimit, 1, 50);
  }
  if (source.maxActionsPerRun !== undefined) {
    patch.maxActionsPerRun = boundedInteger(source.maxActionsPerRun, DEFAULT_AI_CONTROL_CONFIG.maxActionsPerRun, 1, 20);
  }
  if (source.dailyActionLimit !== undefined) {
    patch.dailyActionLimit = boundedInteger(source.dailyActionLimit, DEFAULT_AI_CONTROL_CONFIG.dailyActionLimit, 1, 200);
  }
  return patch;
};

export const isExecutionMode = (mode: AIMode) => ['ASSISTED', 'CONTROLLED_AUTOPILOT', 'FULL_AUTOPILOT'].includes(mode);

export const executionPolicyDecision = (input: {
  config: AIControlConfig;
  definition: AIActionDefinition;
  confidence: number;
  humanApproved?: boolean;
}) => {
  const { config, definition, humanApproved = false } = input;
  if (!definition.executionAvailable) return { allowed: false, reason: 'ACTION_NOT_EXECUTABLE' } as const;
  if (!isExecutionMode(config.mode)) return { allowed: false, reason: 'MODE_DOES_NOT_EXECUTE' } as const;
  if (!config.executionEnabled) return { allowed: false, reason: 'EXECUTION_DISABLED' } as const;
  if (config.emergencyPaused) return { allowed: false, reason: 'EMERGENCY_PAUSED' } as const;
  if (normalizeConfidence(input.confidence) < config.minimumConfidence) return { allowed: false, reason: 'BELOW_CONFIDENCE_THRESHOLD' } as const;
  if (humanApproved) return { allowed: true, reason: config.simulationOnly ? 'HUMAN_APPROVED_SIMULATION' : 'HUMAN_APPROVED' } as const;
  if (config.mode === 'ASSISTED') return { allowed: false, reason: 'HUMAN_APPROVAL_REQUIRED' } as const;

  if (definition.risk === 'LOW') {
    return config.autoExecuteLowRisk
      ? { allowed: true, reason: config.simulationOnly ? 'LOW_RISK_SIMULATION' : 'LOW_RISK_POLICY' } as const
      : { allowed: false, reason: 'LOW_RISK_AUTO_DISABLED' } as const;
  }
  if (definition.risk === 'MEDIUM') {
    const allowed = config.autoExecuteMediumRisk && !config.requireApprovalForMediumRisk;
    return allowed
      ? { allowed: true, reason: config.simulationOnly ? 'MEDIUM_RISK_SIMULATION' : 'MEDIUM_RISK_POLICY' } as const
      : { allowed: false, reason: 'MEDIUM_RISK_APPROVAL_REQUIRED' } as const;
  }
  const allowed = config.mode === 'FULL_AUTOPILOT'
    && config.autoExecuteHighRisk
    && !config.requireApprovalForHighRisk;
  return allowed
    ? { allowed: true, reason: config.simulationOnly ? 'HIGH_RISK_SIMULATION' : 'HIGH_RISK_POLICY' } as const
    : { allowed: false, reason: 'HIGH_RISK_APPROVAL_REQUIRED' } as const;
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
