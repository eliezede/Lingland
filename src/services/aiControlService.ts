import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseConfig';
import { normalizeAIControlState } from './aiControlStateNormalizer';

export type AIMode = 'OFF' | 'READ_ONLY_AUDIT' | 'SUGGEST' | 'ASSISTED' | 'CONTROLLED_AUTOPILOT' | 'FULL_AUTOPILOT';
export type AIReviewScope = 'JOBS' | 'ALLOCATION' | 'BILLING' | 'SYNC' | 'COST' | 'PLATFORM';
export type AISuggestionStatus = 'OBSERVED' | 'PENDING' | 'APPROVED' | 'QUEUED' | 'EXECUTING' | 'EXECUTED' | 'FAILED' | 'ROLLED_BACK' | 'REJECTED' | 'DISMISSED';

export interface AIControlConfig {
  mode: AIMode;
  provider: 'DEEPSEEK';
  model: 'deepseek-v4-flash' | 'deepseek-v4-pro';
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

export interface AISuggestion {
  id: string;
  runId: string;
  scope: AIReviewScope;
  mode: AIMode;
  status: AISuggestionStatus;
  action: string;
  category: AIReviewScope;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  entityType: string;
  entityId: string;
  entityLabel: string;
  title: string;
  reason: string;
  expectedBenefit: string;
  confidence: number;
  evidence: string[];
  dataUsed: string[];
  source: 'RULE_ENGINE' | 'DEEPSEEK';
  executionAvailable: boolean;
  approvalExecutesAction: boolean;
  rollbackAvailable?: boolean;
  executionHandler?: string;
  proposedParameters?: Record<string, unknown>;
  lastExecutionId?: string;
  lastExecutionStatus?: string;
  simulationPlan?: Record<string, unknown>;
  executionError?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewDecision?: string;
  reviewNote?: string;
  latestFeedback?: { reason: string; comment?: string; submittedAt: string };
}

export interface AIRun {
  id: string;
  scope: AIReviewScope;
  mode: AIMode;
  model: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  completedAt?: string;
  providerStatus?: 'CONNECTED' | 'NOT_CONFIGURED' | 'ERROR';
  providerError?: string;
  localSuggestionCount?: number;
  providerSuggestionCount?: number;
  createdSuggestionCount?: number;
  promotedSuggestionCount?: number;
  duplicateSuggestionCount?: number;
  dataSummary?: Record<string, number>;
}

export interface AIAuditEvent {
  id: string;
  createdAt: string;
  eventType: string;
  actorRole: string;
  mode: string;
  scope: string;
  result: string;
  risk: string;
  approvalStatus: string;
  entityType: string;
  entityId: string;
  inputSummary?: Record<string, unknown>;
  executionAttempted: boolean;
  externalCommunicationAttempted: boolean;
}

export interface AIExecution {
  id: string;
  suggestionId: string;
  runId: string;
  action: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  entityType: string;
  entityId: string;
  mode: AIMode;
  status: 'QUEUED' | 'EXECUTING' | 'SIMULATED' | 'SUCCEEDED' | 'FAILED' | 'ROLLING_BACK' | 'ROLLED_BACK' | 'ROLLBACK_FAILED';
  outcomeStatus: 'PENDING' | 'VERIFIED' | 'DRIFTED' | 'NOT_APPLICABLE';
  simulationOnly: boolean;
  parameters: Record<string, unknown>;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  resultSummary?: Record<string, unknown>;
  rollbackAvailable: boolean;
  externalCommunicationAttempted: boolean;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  rolledBackAt?: string;
  error?: string;
}

export interface AIControlState {
  config: AIControlConfig;
  provider: {
    name: 'DeepSeek';
    configured: boolean;
    lastTestAt: string | null;
    lastTestStatus: 'CONNECTED' | 'ERROR' | 'NOT_TESTED';
    apiKeyExposed: false;
  };
  capabilities: {
    implementationStage: 'AUTOPILOT_ENGINE';
    readOnlyAnalysis: boolean;
    suggestions: boolean;
    humanReview: boolean;
    structuredFeedback: boolean;
    execution: boolean;
    rollback: boolean;
    outcomeVerification: boolean;
    scheduledReviews: boolean;
    externalCommunication: boolean;
    advancedModesLocked: boolean;
    unlockRequirements: Array<{ id: string; label: string; satisfied: boolean }>;
  };
  counts: {
    pending: number;
    observed: number;
    approved: number;
    executed: number;
    failed: number;
    rejected: number;
    dismissed: number;
    reviewedLast30Days: number;
    openTasks: number;
  };
  actionRegistry: Array<{
    action: string;
    risk: 'LOW' | 'MEDIUM' | 'HIGH';
    description: string;
    executionAvailable: boolean;
    externalCommunication: boolean;
    reversible: boolean;
    handler: string;
  }>;
  suggestions: AISuggestion[];
  runs: AIRun[];
  executions: AIExecution[];
  auditEvents: AIAuditEvent[];
  viewer: { role: 'ADMIN' | 'SUPER_ADMIN'; canManageSettings: boolean };
}

const callable = <Request, Response>(name: string) => httpsCallable<Request, Response>(functions, name, { timeout: 120000 });

export const AIControlService = {
  getState: async (limit = 100) => {
    const response = await callable<{ limit: number }, AIControlState>('getAIControlState')({ limit });
    return normalizeAIControlState(response.data);
  },

  updateSettings: async (settings: Partial<AIControlConfig>, confirmations: { activationConfirmation?: string; liveExecutionConfirmation?: string; externalCommunicationConfirmation?: string } = {}) => {
    const response = await callable<
      { settings: Partial<AIControlConfig>; activationConfirmation?: string; liveExecutionConfirmation?: string; externalCommunicationConfirmation?: string },
      { success: true; config: AIControlConfig }
    >('updateAIControlSettings')({ settings, ...confirmations });
    return response.data;
  },

  testConnection: async () => {
    const response = await callable<Record<string, never>, { connected: boolean; testedAt: string; models: string[]; apiKeyExposed: false }>('testDeepSeekConnection')({});
    return response.data;
  },

  runReview: async (scope: AIReviewScope) => {
    const response = await callable<{ scope: AIReviewScope }, {
      success: true;
      runId: string;
      scope: AIReviewScope;
      providerStatus: string;
      providerMessage: string;
      createdCount: number;
      promotedCount: number;
      duplicateCount: number;
      dataSummary: Record<string, number>;
      executionAttempted: boolean;
      externalCommunicationAttempted: boolean;
      automaticExecution: { candidates: number; succeeded: number; failed: number; blocked: number };
    }>('runAIReview')({ scope });
    return response.data;
  },

  reviewSuggestion: async (suggestionId: string, decision: 'APPROVE' | 'REJECT' | 'DISMISS', note = '', executeNow = true) => {
    const response = await callable<
      { suggestionId: string; decision: string; note: string; executeNow: boolean },
      { success: true; suggestionId: string; status: AISuggestionStatus; executionAttempted: boolean; execution: Record<string, unknown> | null }
    >('reviewAISuggestion')({ suggestionId, decision, note, executeNow });
    return response.data;
  },

  executeAction: async (suggestionId: string) => {
    const response = await callable<{ suggestionId: string }, { success: boolean; executionId?: string; status: string; reason?: string }>('executeAIAction')({ suggestionId });
    return response.data;
  },

  rollbackAction: async (executionId: string) => {
    const response = await callable<{ executionId: string }, { success: true; executionId: string; status: 'ROLLED_BACK' }>('rollbackAIAction')({ executionId });
    return response.data;
  },

  verifyOutcomes: async (limit = 50) => {
    const response = await callable<{ limit: number }, { checked: number; verified: number; drifted: number }>('verifyAIOutcomes')({ limit });
    return response.data;
  },

  submitFeedback: async (
    suggestionId: string,
    reason: 'USEFUL' | 'WRONG' | 'TOO_RISKY' | 'MISSING_CONTEXT' | 'GOOD_NOT_NOW' | 'SHOULD_BECOME_RULE',
    comment = '',
  ) => {
    const response = await callable<
      { suggestionId: string; reason: string; comment: string },
      { success: true; feedbackId: string; learningMemoryUpdated: true }
    >('submitAISuggestionFeedback')({ suggestionId, reason, comment });
    return response.data;
  },
};
