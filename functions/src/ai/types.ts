export const AI_MODE_VALUES = [
  'OFF',
  'READ_ONLY_AUDIT',
  'SUGGEST',
  'ASSISTED',
  'CONTROLLED_AUTOPILOT',
  'FULL_AUTOPILOT',
] as const;

export type AIMode = typeof AI_MODE_VALUES[number];

export const SAFE_AI_MODES: AIMode[] = [...AI_MODE_VALUES];

export const DEEPSEEK_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'] as const;
export type DeepSeekModel = typeof DEEPSEEK_MODELS[number];

export const AI_REVIEW_SCOPES = [
  'JOBS',
  'ALLOCATION',
  'BILLING',
  'SYNC',
  'COST',
  'PLATFORM',
] as const;

export type AIReviewScope = typeof AI_REVIEW_SCOPES[number];

export const AI_ACTIONS = [
  'REVIEW_ASSIGNMENT',
  'REVIEW_OVERDUE_JOB',
  'REVIEW_STATUS_CONSISTENCY',
  'REVIEW_BILLING_GAP',
  'REVIEW_INVOICE_INTEGRITY',
  'REVIEW_SYNC_CONFLICT',
  'REVIEW_COST_ANOMALY',
  'CREATE_PROCESS_IMPROVEMENT',
  'CREATE_INTERNAL_ALERT',
  'PLACE_JOB_ON_HOLD',
  'OFFER_INTERPRETER',
  'CREATE_CLIENT_INVOICE_DRAFT',
] as const;

export type AIAction = typeof AI_ACTIONS[number];
export type AIRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type AISuggestionSource = 'RULE_ENGINE' | 'DEEPSEEK';
export type AISuggestionStatus = 'OBSERVED' | 'PENDING' | 'APPROVED' | 'QUEUED' | 'EXECUTING' | 'EXECUTED' | 'FAILED' | 'ROLLED_BACK' | 'REJECTED' | 'DISMISSED';
export type AIExecutionStatus = 'QUEUED' | 'EXECUTING' | 'SIMULATED' | 'SUCCEEDED' | 'FAILED' | 'ROLLING_BACK' | 'ROLLED_BACK' | 'ROLLBACK_FAILED';
export type AIOutcomeStatus = 'PENDING' | 'VERIFIED' | 'DRIFTED' | 'NOT_APPLICABLE';

export interface AIControlConfig {
  mode: AIMode;
  provider: 'DEEPSEEK';
  model: DeepSeekModel;
  emergencyPaused: boolean;
  executionEnabled: boolean;
  externalCommunicationEnabled: boolean;
  simulationOnly: boolean;
  autoExecuteLowRisk: boolean;
  autoExecuteMediumRisk: boolean;
  autoExecuteHighRisk: boolean;
  requireApprovalForMediumRisk: boolean;
  requireApprovalForHighRisk: boolean;
  maxActionsPerRun: number;
  dailyActionLimit: number;
  scheduledReviewsEnabled: boolean;
  scheduledScopes: AIReviewScope[];
  scheduleIntervalMinutes: number;
  piiPolicy: 'MINIMIZED';
  minimumConfidence: number;
  maxSuggestionsPerRun: number;
  dailyRunLimit: number;
  providerConfigured?: boolean;
  lastConnectionTestAt?: string;
  lastConnectionTestStatus?: 'CONNECTED' | 'ERROR' | 'NOT_TESTED';
  automationAcknowledgedAt?: string;
  automationAcknowledgedBy?: string;
  liveExecutionAcknowledgedAt?: string;
  liveExecutionAcknowledgedBy?: string;
  lastScheduledRunAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_AI_CONTROL_CONFIG: AIControlConfig = {
  mode: 'OFF',
  provider: 'DEEPSEEK',
  model: 'deepseek-v4-flash',
  emergencyPaused: true,
  executionEnabled: false,
  externalCommunicationEnabled: false,
  simulationOnly: true,
  autoExecuteLowRisk: false,
  autoExecuteMediumRisk: false,
  autoExecuteHighRisk: false,
  requireApprovalForMediumRisk: true,
  requireApprovalForHighRisk: true,
  maxActionsPerRun: 5,
  dailyActionLimit: 20,
  scheduledReviewsEnabled: false,
  scheduledScopes: ['JOBS', 'ALLOCATION', 'BILLING', 'SYNC', 'COST'],
  scheduleIntervalMinutes: 60,
  piiPolicy: 'MINIMIZED',
  minimumConfidence: 65,
  maxSuggestionsPerRun: 25,
  dailyRunLimit: 10,
  providerConfigured: false,
  lastConnectionTestStatus: 'NOT_TESTED',
};

export interface AIActor {
  uid: string;
  role: 'ADMIN' | 'SUPER_ADMIN';
  organizationId: string;
}

export interface AISuggestionDraft {
  action: AIAction;
  category: AIReviewScope;
  entityType: 'BOOKING' | 'CLIENT_INVOICE' | 'INTERPRETER_INVOICE' | 'SYNC_CONFLICT' | 'SYSTEM';
  entityId: string;
  entityLabel: string;
  title: string;
  reason: string;
  expectedBenefit: string;
  confidence: number;
  evidence: string[];
  source: AISuggestionSource;
  dataUsed: string[];
  proposedParameters?: Record<string, unknown>;
}

export interface AIActionDefinition {
  action: AIAction;
  risk: AIRisk;
  description: string;
  executionAvailable: boolean;
  externalCommunication: boolean;
  reversible: boolean;
  handler: 'CREATE_OPERATION_TASK' | 'CREATE_INTERNAL_ALERT' | 'PLACE_JOB_ON_HOLD' | 'OFFER_INTERPRETER' | 'CREATE_CLIENT_INVOICE_DRAFT';
}

export interface AIExecutionRecord {
  id: string;
  suggestionId: string;
  runId: string;
  action: AIAction;
  risk: AIRisk;
  entityType: string;
  entityId: string;
  mode: AIMode;
  status: AIExecutionStatus;
  outcomeStatus: AIOutcomeStatus;
  simulationOnly: boolean;
  idempotencyKey: string;
  parameters: Record<string, unknown>;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  resultSummary?: Record<string, unknown>;
  rollbackAvailable: boolean;
  externalCommunicationAttempted: boolean;
  createdAt: string;
  createdBy: string;
  startedAt?: string;
  completedAt?: string;
  rolledBackAt?: string;
  error?: string;
}
