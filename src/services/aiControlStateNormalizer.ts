import type { AIControlConfig, AIControlState, AIMode, AIReviewScope } from './aiControlService';

const MODES: AIMode[] = ['OFF', 'READ_ONLY_AUDIT', 'SUGGEST', 'ASSISTED', 'CONTROLLED_AUTOPILOT', 'FULL_AUTOPILOT'];
const SCOPES: AIReviewScope[] = ['JOBS', 'ALLOCATION', 'BILLING', 'SYNC', 'COST', 'PLATFORM'];

const DEFAULT_CONFIG: AIControlConfig = {
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
  dailyActionLimit: 25,
  scheduledReviewsEnabled: false,
  scheduledScopes: ['JOBS', 'ALLOCATION', 'BILLING', 'SYNC', 'COST', 'PLATFORM'],
  scheduleIntervalMinutes: 60,
  piiPolicy: 'MINIMIZED',
  minimumConfidence: 75,
  maxSuggestionsPerRun: 20,
  dailyRunLimit: 10,
};

const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const array = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

export const normalizeAIControlState = (value: unknown): AIControlState => {
  const source = record(value);
  const configSource = record(source.config);
  const storedMode = String(configSource.mode || '');
  const mode = MODES.includes(storedMode as AIMode) ? storedMode as AIMode : DEFAULT_CONFIG.mode;
  const storedScopes = array<unknown>(configSource.scheduledScopes)
    .map(item => String(item).toUpperCase())
    .filter((item): item is AIReviewScope => SCOPES.includes(item as AIReviewScope));
  const config: AIControlConfig = {
    ...DEFAULT_CONFIG,
    ...configSource,
    mode,
    scheduledScopes: storedScopes.length > 0 ? Array.from(new Set(storedScopes)) : DEFAULT_CONFIG.scheduledScopes,
    executionEnabled: configSource.executionEnabled === true,
    externalCommunicationEnabled: configSource.externalCommunicationEnabled === true,
    simulationOnly: configSource.simulationOnly !== false,
    emergencyPaused: configSource.emergencyPaused !== false,
  } as AIControlConfig;

  const providerSource = record(source.provider);
  const capabilitiesSource = record(source.capabilities);
  const countsSource = record(source.counts);
  const viewerSource = record(source.viewer);

  return {
    ...source,
    config,
    provider: {
      name: 'DeepSeek',
      configured: providerSource.configured === true,
      lastTestAt: typeof providerSource.lastTestAt === 'string' ? providerSource.lastTestAt : null,
      lastTestStatus: providerSource.lastTestStatus === 'CONNECTED' || providerSource.lastTestStatus === 'ERROR'
        ? providerSource.lastTestStatus
        : 'NOT_TESTED',
      apiKeyExposed: false,
    },
    capabilities: {
      implementationStage: 'AUTOPILOT_ENGINE',
      readOnlyAnalysis: true,
      suggestions: true,
      humanReview: true,
      structuredFeedback: true,
      execution: false,
      rollback: false,
      outcomeVerification: false,
      scheduledReviews: false,
      externalCommunication: false,
      advancedModesLocked: true,
      ...capabilitiesSource,
      unlockRequirements: array<AIControlState['capabilities']['unlockRequirements'][number]>(capabilitiesSource.unlockRequirements),
    } as AIControlState['capabilities'],
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
      ...countsSource,
    } as AIControlState['counts'],
    actionRegistry: array<AIControlState['actionRegistry'][number]>(source.actionRegistry),
    suggestions: array<AIControlState['suggestions'][number]>(source.suggestions),
    runs: array<AIControlState['runs'][number]>(source.runs),
    executions: array<AIControlState['executions'][number]>(source.executions),
    auditEvents: array<AIControlState['auditEvents'][number]>(source.auditEvents),
    viewer: {
      role: viewerSource.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN',
      canManageSettings: viewerSource.canManageSettings === true,
    },
  } as AIControlState;
};
