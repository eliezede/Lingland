import { AIControlState, AIExecution, AIRun, AISuggestion } from '../../../services/aiControlService';

export type AIPresenceTone = 'neutral' | 'working' | 'attention' | 'danger';

export interface AIPresenceState {
  label: string;
  detail: string;
  tone: AIPresenceTone;
  activeCount: number;
  attentionCount: number;
}

export interface AIActivityItem {
  id: string;
  sourceId: string;
  kind: 'RUN' | 'EXECUTION' | 'FINDING';
  title: string;
  detail: string;
  status: string;
  createdAt: string;
  entityId?: string;
}

const withinHours = (value: string | undefined, hours: number) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time <= hours * 60 * 60 * 1000;
};

const latestTerminalRunsByScope = (runs: AIRun[]) => {
  const latest = new Map<string, AIRun>();
  [...runs]
    .filter(item => item.status !== 'RUNNING')
    .sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime())
    .forEach(item => {
      if (!latest.has(item.scope)) latest.set(item.scope, item);
    });
  return [...latest.values()];
};

export const deriveAIPresence = (state: AIControlState | null, error?: string | null): AIPresenceState => {
  if (error) return { label: 'AI issue', detail: error, tone: 'danger', activeCount: 0, attentionCount: 1 };
  if (!state) return { label: 'Checking AI', detail: 'Loading operational state', tone: 'neutral', activeCount: 0, attentionCount: 0 };

  const activeRuns = state.runs.filter(item => item.status === 'RUNNING').length;
  const activeExecutions = state.executions.filter(item => ['QUEUED', 'EXECUTING', 'ROLLING_BACK'].includes(item.status)).length;
  const approvals = state.suggestions.filter(item => item.status === 'PENDING').length;
  const recentExecutionFailures = state.executions.filter(item => item.status === 'FAILED' && withinHours(item.completedAt || item.createdAt, 24)).length;
  const unrecoveredRunFailures = latestTerminalRunsByScope(state.runs)
    .filter(item => (item.status === 'FAILED' || item.providerStatus === 'ERROR') && withinHours(item.completedAt || item.createdAt, 24)).length;
  const recentFailures = recentExecutionFailures + unrecoveredRunFailures;
  const activeCount = activeRuns + activeExecutions;
  const attentionCount = approvals + recentFailures;

  if (recentFailures > 0) {
    return { label: 'AI issue', detail: `${recentFailures} recent failure${recentFailures === 1 ? '' : 's'} need review`, tone: 'danger', activeCount, attentionCount };
  }
  if (state.config.emergencyPaused) {
    return { label: 'AI paused', detail: 'Execution is blocked by the emergency pause', tone: 'attention', activeCount, attentionCount };
  }
  if (state.config.mode === 'OFF') {
    return { label: 'AI off', detail: 'Reviews and execution are disabled', tone: 'neutral', activeCount, attentionCount };
  }
  if (activeCount > 0) {
    return { label: `AI working ${activeCount}`, detail: 'Reviews or governed actions are in progress', tone: 'working', activeCount, attentionCount };
  }
  if (approvals > 0) {
    return { label: `${approvals} approval${approvals === 1 ? '' : 's'}`, detail: 'Human decisions are waiting in AI Command', tone: 'attention', activeCount, attentionCount };
  }
  return { label: 'AI idle', detail: `${state.config.mode.replaceAll('_', ' ')} is ready`, tone: 'neutral', activeCount, attentionCount };
};

const runActivity = (run: AIRun): AIActivityItem => ({
  id: `run-${run.id}`,
  sourceId: run.id,
  kind: 'RUN',
  title: `${run.scope} review`,
  detail: `${Number(run.createdSuggestionCount || 0) + Number(run.promotedSuggestionCount || 0)} findings`,
  status: run.status,
  createdAt: run.createdAt,
});

const executionActivity = (execution: AIExecution): AIActivityItem => ({
  id: `execution-${execution.id}`,
  sourceId: execution.id,
  kind: 'EXECUTION',
  title: execution.action.replaceAll('_', ' '),
  detail: `${execution.entityType.replaceAll('_', ' ')} ${execution.entityId}`,
  status: execution.status,
  createdAt: execution.createdAt,
  entityId: execution.entityId,
});

const suggestionActivity = (suggestion: AISuggestion): AIActivityItem => ({
  id: `finding-${suggestion.id}`,
  sourceId: suggestion.id,
  kind: 'FINDING',
  title: suggestion.title,
  detail: suggestion.entityLabel,
  status: suggestion.status,
  createdAt: suggestion.createdAt,
  entityId: suggestion.entityId,
});

export const buildAIActivity = (state: AIControlState, limit = 8): AIActivityItem[] => [
  ...state.runs.slice(0, limit).map(runActivity),
  ...state.executions.slice(0, limit).map(executionActivity),
  ...state.suggestions.filter(item => ['PENDING', 'FAILED', 'QUEUED', 'EXECUTING'].includes(item.status)).slice(0, limit).map(suggestionActivity),
]
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  .slice(0, limit);
