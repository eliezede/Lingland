export const AI_MODE_VALUES = [
  'OFF',
  'READ_ONLY_AUDIT',
  'SUGGEST',
  'ASSISTED',
  'CONTROLLED_AUTOPILOT',
  'FULL_AUTOPILOT',
] as const;

export type AIMode = typeof AI_MODE_VALUES[number];

export const SAFE_AI_MODES: AIMode[] = ['OFF', 'READ_ONLY_AUDIT', 'SUGGEST'];

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
] as const;

export type AIAction = typeof AI_ACTIONS[number];
export type AIRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type AISuggestionSource = 'RULE_ENGINE' | 'DEEPSEEK';
export type AISuggestionStatus = 'OBSERVED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISMISSED';

export interface AIControlConfig {
  mode: AIMode;
  provider: 'DEEPSEEK';
  model: DeepSeekModel;
  emergencyPaused: boolean;
  executionEnabled: false;
  externalCommunicationEnabled: false;
  piiPolicy: 'MINIMIZED';
  minimumConfidence: number;
  maxSuggestionsPerRun: number;
  dailyRunLimit: number;
  providerConfigured?: boolean;
  lastConnectionTestAt?: string;
  lastConnectionTestStatus?: 'CONNECTED' | 'ERROR' | 'NOT_TESTED';
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
}

export interface AIActionDefinition {
  action: AIAction;
  risk: AIRisk;
  description: string;
  executionAvailable: false;
  externalCommunication: false;
}
