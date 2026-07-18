import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIControlState, AIExecution, AIRun, AISuggestion } from '../../../services/aiControlService';
import { buildAIActivity, deriveAIPresence } from './aiPresentation';

const NOW = new Date('2026-07-18T12:00:00.000Z');

const createState = (overrides: Partial<AIControlState> = {}): AIControlState => ({
  config: {
    mode: 'SUGGEST',
    provider: 'DEEPSEEK',
    model: 'deepseek-v4-flash',
    emergencyPaused: false,
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
    scheduledScopes: [],
    scheduleIntervalMinutes: 60,
    piiPolicy: 'MINIMIZED',
    minimumConfidence: 0.8,
    maxSuggestionsPerRun: 20,
    dailyRunLimit: 20,
  },
  provider: {
    name: 'DeepSeek',
    configured: true,
    lastTestAt: null,
    lastTestStatus: 'CONNECTED',
    apiKeyExposed: false,
  },
  capabilities: {
    implementationStage: 'AUTOPILOT_ENGINE',
    readOnlyAnalysis: true,
    suggestions: true,
    humanReview: true,
    structuredFeedback: true,
    execution: true,
    rollback: true,
    outcomeVerification: true,
    scheduledReviews: true,
    externalCommunication: false,
    advancedModesLocked: true,
    unlockRequirements: [],
  },
  counts: {
    pending: 0,
    observed: 0,
    approved: 0,
    executed: 0,
    failed: 0,
    rejected: 0,
    dismissed: 0,
    reviewedLast30Days: 0,
    openTasks: 0,
  },
  actionRegistry: [],
  suggestions: [],
  runs: [],
  executions: [],
  auditEvents: [],
  viewer: { role: 'SUPER_ADMIN', canManageSettings: true },
  ...overrides,
});

const createSuggestion = (overrides: Partial<AISuggestion> = {}): AISuggestion => ({
  id: 'suggestion-1',
  runId: 'run-1',
  scope: 'JOBS',
  mode: 'SUGGEST',
  status: 'PENDING',
  action: 'REVIEW_JOB',
  category: 'JOBS',
  risk: 'LOW',
  entityType: 'BOOKING',
  entityId: 'booking-1',
  entityLabel: 'LING26.17001',
  title: 'Review overdue job',
  reason: 'The job needs attention.',
  expectedBenefit: 'Keep the operation current.',
  confidence: 0.9,
  evidence: [],
  dataUsed: [],
  source: 'RULE_ENGINE',
  executionAvailable: false,
  approvalExecutesAction: false,
  createdAt: '2026-07-18T10:00:00.000Z',
  ...overrides,
});

const createRun = (overrides: Partial<AIRun> = {}): AIRun => ({
  id: 'run-1',
  scope: 'JOBS',
  mode: 'SUGGEST',
  model: 'deepseek-v4-flash',
  status: 'COMPLETED',
  createdAt: '2026-07-18T09:00:00.000Z',
  ...overrides,
});

const createExecution = (overrides: Partial<AIExecution> = {}): AIExecution => ({
  id: 'execution-1',
  suggestionId: 'suggestion-1',
  runId: 'run-1',
  action: 'REVIEW_JOB',
  risk: 'LOW',
  entityType: 'BOOKING',
  entityId: 'booking-1',
  mode: 'SUGGEST',
  status: 'SUCCEEDED',
  outcomeStatus: 'VERIFIED',
  simulationOnly: true,
  parameters: {},
  rollbackAvailable: false,
  externalCommunicationAttempted: false,
  createdAt: '2026-07-18T11:00:00.000Z',
  ...overrides,
});

describe('deriveAIPresence', () => {
  beforeEach(() => vi.setSystemTime(NOW));
  afterEach(() => vi.useRealTimers());

  it('prioritises recent failures over every other state', () => {
    const state = createState({
      config: { ...createState().config, emergencyPaused: true },
      executions: [createExecution({ status: 'FAILED', completedAt: '2026-07-18T11:30:00.000Z' })],
    });

    expect(deriveAIPresence(state)).toMatchObject({
      label: 'AI issue',
      tone: 'danger',
      attentionCount: 1,
    });
  });

  it('does not keep stale failures in the global warning state', () => {
    const state = createState({
      executions: [createExecution({ status: 'FAILED', completedAt: '2026-07-16T11:30:00.000Z' })],
    });

    expect(deriveAIPresence(state)).toMatchObject({ label: 'AI idle', tone: 'neutral' });
  });

  it('surfaces a recent provider error even when local rules completed the review', () => {
    const state = createState({
      runs: [createRun({ status: 'COMPLETED', providerStatus: 'ERROR', completedAt: '2026-07-18T11:45:00.000Z' })],
    });

    expect(deriveAIPresence(state)).toMatchObject({
      label: 'AI issue',
      tone: 'danger',
      attentionCount: 1,
    });
  });

  it('clears a provider warning after a newer successful review of the same scope', () => {
    const state = createState({
      runs: [
        createRun({ id: 'recovered', providerStatus: 'CONNECTED', completedAt: '2026-07-18T11:55:00.000Z' }),
        createRun({ id: 'provider-error', providerStatus: 'ERROR', completedAt: '2026-07-18T11:45:00.000Z' }),
      ],
    });

    expect(deriveAIPresence(state)).toMatchObject({ label: 'AI idle', tone: 'neutral', attentionCount: 0 });
  });

  it('keeps an unresolved provider warning from another review scope visible', () => {
    const state = createState({
      runs: [
        createRun({ id: 'jobs-ok', scope: 'JOBS', providerStatus: 'CONNECTED', completedAt: '2026-07-18T11:55:00.000Z' }),
        createRun({ id: 'billing-error', scope: 'BILLING', providerStatus: 'ERROR', completedAt: '2026-07-18T11:45:00.000Z' }),
      ],
    });

    expect(deriveAIPresence(state)).toMatchObject({ label: 'AI issue', tone: 'danger', attentionCount: 1 });
  });

  it('shows the emergency pause before routine attention items', () => {
    const state = createState({
      config: { ...createState().config, emergencyPaused: true },
      suggestions: [createSuggestion()],
    });

    expect(deriveAIPresence(state)).toMatchObject({
      label: 'AI paused',
      tone: 'attention',
      attentionCount: 1,
    });
  });

  it('shows active work and then pending approvals', () => {
    const working = createState({
      runs: [createRun({ status: 'RUNNING' })],
      executions: [createExecution({ status: 'EXECUTING' })],
      suggestions: [createSuggestion()],
    });
    const waiting = createState({ suggestions: [createSuggestion(), createSuggestion({ id: 'suggestion-2' })] });

    expect(deriveAIPresence(working)).toMatchObject({ label: 'AI working 2', activeCount: 2, attentionCount: 1 });
    expect(deriveAIPresence(waiting)).toMatchObject({ label: '2 approvals', tone: 'attention' });
  });
});

describe('buildAIActivity', () => {
  it('merges operational records in reverse chronological order and applies the limit', () => {
    const state = createState({
      runs: [createRun()],
      executions: [createExecution()],
      suggestions: [createSuggestion()],
    });

    expect(buildAIActivity(state, 2).map(item => item.id)).toEqual([
      'execution-execution-1',
      'finding-suggestion-1',
    ]);
    expect(buildAIActivity(state, 2).map(item => item.sourceId)).toEqual([
      'execution-1',
      'suggestion-1',
    ]);
  });

  it('excludes resolved findings from the live activity feed', () => {
    const state = createState({ suggestions: [createSuggestion({ status: 'DISMISSED' })] });

    expect(buildAIActivity(state)).toEqual([]);
  });
});
