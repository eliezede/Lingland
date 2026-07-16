import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseConfig';

export type AIMode = 'OFF' | 'READ_ONLY_AUDIT' | 'SUGGEST' | 'ASSISTED' | 'CONTROLLED_AUTOPILOT' | 'FULL_AUTOPILOT';
export type AIReviewScope = 'JOBS' | 'ALLOCATION' | 'BILLING' | 'SYNC' | 'COST' | 'PLATFORM';
export type AISuggestionStatus = 'OBSERVED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISMISSED';

export interface AIControlConfig {
  mode: AIMode;
  provider: 'DEEPSEEK';
  model: 'deepseek-v4-flash' | 'deepseek-v4-pro';
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
  executionAvailable: false;
  approvalExecutesAction: false;
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
  executionAttempted: false;
  externalCommunicationAttempted: false;
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
    implementationStage: 'SUGGESTIONS_ONLY';
    readOnlyAnalysis: true;
    suggestions: true;
    humanReview: true;
    structuredFeedback: true;
    execution: false;
    externalCommunication: false;
    advancedModesLocked: true;
    unlockRequirements: Array<{ id: string; label: string; satisfied: boolean }>;
  };
  counts: {
    pending: number;
    observed: number;
    approved: number;
    rejected: number;
    dismissed: number;
    reviewedLast30Days: number;
  };
  actionRegistry: Array<{
    action: string;
    risk: 'LOW' | 'MEDIUM' | 'HIGH';
    description: string;
    executionAvailable: false;
    externalCommunication: false;
  }>;
  suggestions: AISuggestion[];
  runs: AIRun[];
  auditEvents: AIAuditEvent[];
  viewer: { role: 'ADMIN' | 'SUPER_ADMIN'; canManageSettings: boolean };
}

const callable = <Request, Response>(name: string) => httpsCallable<Request, Response>(functions, name, { timeout: 120000 });

export const AIControlService = {
  getState: async (limit = 100) => {
    const response = await callable<{ limit: number }, AIControlState>('getAIControlState')({ limit });
    return response.data;
  },

  updateSettings: async (settings: Partial<AIControlConfig>) => {
    const response = await callable<{ settings: Partial<AIControlConfig> }, { success: true; config: AIControlConfig }>('updateAIControlSettings')({ settings });
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
      executionAttempted: false;
      externalCommunicationAttempted: false;
    }>('runAIReview')({ scope });
    return response.data;
  },

  reviewSuggestion: async (suggestionId: string, decision: 'APPROVE' | 'REJECT' | 'DISMISS', note = '') => {
    const response = await callable<
      { suggestionId: string; decision: string; note: string },
      { success: true; suggestionId: string; status: AISuggestionStatus; executionAttempted: false }
    >('reviewAISuggestion')({ suggestionId, decision, note });
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
