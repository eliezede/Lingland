import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  CirclePause,
  ExternalLink,
  Eye,
  FileSearch,
  HelpCircle,
  History,
  Info,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Workflow,
  X,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { useAIControl } from '../../../context/AIControlContext';
import { useToast } from '../../../context/ToastContext';
import {
  AIControlService,
  AIExecution,
  AIReviewScope,
  AIRun,
  AISuggestion,
} from '../../../services/aiControlService';
import { deriveAIPresence } from './aiPresentation';

type CommandView = 'overview' | 'attention' | 'activity' | 'insights';

const commandViews: Array<{ id: CommandView; label: string; icon: React.ElementType; path: string }> = [
  { id: 'overview', label: 'Now', icon: Bot, path: '/admin/ai-command' },
  { id: 'attention', label: 'Human attention', icon: ShieldAlert, path: '/admin/ai-command/attention' },
  { id: 'activity', label: 'Activity', icon: Activity, path: '/admin/ai-command/activity' },
  { id: 'insights', label: 'Insights', icon: Sparkles, path: '/admin/ai-command/insights' },
];

const reviewScopes: Array<{ id: AIReviewScope; label: string }> = [
  { id: 'JOBS', label: 'Jobs' },
  { id: 'ALLOCATION', label: 'Allocation' },
  { id: 'BILLING', label: 'Billing' },
  { id: 'SYNC', label: 'Mirror sync' },
  { id: 'COST', label: 'Cost' },
  { id: 'PLATFORM', label: 'Platform' },
];

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

const cleanError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected AI operation error.';
  return message.replace(/^Firebase:\s*/i, '').replace(/^.*?\(functions\/[a-z-]+\)\.\s*/i, '').slice(0, 240);
};

const riskClass = (risk: string) => {
  if (risk === 'HIGH') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300';
  if (risk === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300';
};

const statusClass = (status: string) => {
  if (['APPROVED', 'EXECUTED', 'SUCCEEDED', 'VERIFIED', 'COMPLETED', 'CONNECTED'].includes(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (['PENDING', 'QUEUED', 'EXECUTING', 'ROLLING_BACK', 'RUNNING'].includes(status)) return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300';
  if (['FAILED', 'ROLLBACK_FAILED', 'REJECTED', 'DRIFTED', 'ERROR'].includes(status)) return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300';
  return 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
};

const Pill = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${className}`}>{children}</span>
);

const workPriority = (suggestion: AISuggestion) => {
  const statusWeights: Partial<Record<AISuggestion['status'], number>> = { FAILED: 0, PENDING: 1, EXECUTING: 2, QUEUED: 3, APPROVED: 4, OBSERVED: 5 };
  const riskWeights: Record<AISuggestion['risk'], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const status = statusWeights[suggestion.status] ?? 9;
  const risk = riskWeights[suggestion.risk];
  return status * 10 + risk;
};

const WorkQueue = ({
  suggestions,
  onOpen,
  emptyTitle,
  emptyDetail,
}: {
  suggestions: AISuggestion[];
  onOpen: (suggestion: AISuggestion) => void;
  emptyTitle: string;
  emptyDetail: string;
}) => (
  <section className="overflow-hidden border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-full table-fixed divide-y divide-slate-200 text-left dark:divide-slate-800">
        <thead className="bg-slate-50 dark:bg-slate-950/60">
          <tr>
            <th className="w-[10%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Priority</th>
            <th className="w-[13%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Workstream</th>
            <th className="w-[20%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Record</th>
            <th className="w-[31%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Proposed work</th>
            <th className="w-[13%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">State</th>
            <th className="w-[10%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Created</th>
            <th className="w-[3%] px-2 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {suggestions.map(suggestion => (
            <tr key={suggestion.id} onClick={() => onOpen(suggestion)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-3"><Pill className={riskClass(suggestion.risk)}>{suggestion.risk}</Pill></td>
              <td className="px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300">{suggestion.scope.replaceAll('_', ' ')}</td>
              <td className="px-4 py-3"><p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{suggestion.entityLabel}</p><p className="mt-0.5 truncate text-[10px] uppercase text-slate-400">{suggestion.entityType.replaceAll('_', ' ')}</p></td>
              <td className="px-4 py-3"><p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{suggestion.title}</p><p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{suggestion.reason}</p></td>
              <td className="px-4 py-3"><Pill className={statusClass(suggestion.status)}>{suggestion.status.replaceAll('_', ' ')}</Pill></td>
              <td className="whitespace-nowrap px-4 py-3 text-[11px] text-slate-500">{formatDateTime(suggestion.createdAt)}</td>
              <td className="px-2 py-3 text-right"><ChevronRight size={17} className="text-slate-400" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
      {suggestions.map(suggestion => (
        <button key={suggestion.id} type="button" onClick={() => onOpen(suggestion)} className="block w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{suggestion.title}</p><p className="mt-1 truncate text-xs text-slate-500">{suggestion.entityLabel}</p></div><ChevronRight size={17} className="shrink-0 text-slate-400" /></div>
          <div className="mt-3 flex flex-wrap gap-2"><Pill className={riskClass(suggestion.risk)}>{suggestion.risk}</Pill><Pill className={statusClass(suggestion.status)}>{suggestion.status}</Pill><span className="text-xs font-semibold text-slate-500">{suggestion.scope}</span></div>
        </button>
      ))}
    </div>
    {suggestions.length === 0 && <div className="px-6 py-16 text-center"><CheckCircle2 size={28} className="mx-auto text-emerald-500" /><p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">{emptyTitle}</p><p className="mt-1 text-xs text-slate-500">{emptyDetail}</p></div>}
  </section>
);

const RunTraceDrawer = ({ run, onClose }: { run: AIRun; onClose: () => void }) => {
  const findings = Number(run.createdSuggestionCount || 0) + Number(run.promotedSuggestionCount || 0);
  const summary = Object.entries(run.dataSummary || {});
  return (
    <div className="fixed inset-0 z-[92] bg-slate-950/50" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="ai-run-title" className="ml-auto flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <div className="mb-2 flex flex-wrap gap-2"><Pill className={statusClass(run.status)}>{run.status}</Pill><Pill className="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300">{run.mode.replaceAll('_', ' ')}</Pill></div>
            <h2 id="ai-run-title" className="text-lg font-semibold text-slate-950 dark:text-white">{run.scope.replaceAll('_', ' ')} review</h2>
            <p className="mt-1 text-xs text-slate-500">Run {run.id}</p>
          </div>
          <button type="button" title="Close" aria-label="Close review run" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={19} /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-2">
            {[
              ['Started', formatDateTime(run.createdAt)],
              ['Completed', formatDateTime(run.completedAt)],
              ['Provider', (run.providerStatus || 'UNKNOWN').replaceAll('_', ' ')],
              ['Model', run.model],
              ['Findings', String(findings)],
              ['Duplicates avoided', String(run.duplicateSuggestionCount || 0)],
            ].map(([label, value]) => <div key={label} className="bg-white p-3 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase text-slate-400">{label}</p><p className="mt-1 text-xs font-semibold text-slate-800 dark:text-slate-200">{value}</p></div>)}
          </div>
          {run.providerError && <div className="border-y border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{run.providerError}</div>}
          <section>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">Review result</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                ['Local findings', run.localSuggestionCount || 0],
                ['Provider findings', run.providerSuggestionCount || 0],
                ['Created', run.createdSuggestionCount || 0],
                ['Promoted', run.promotedSuggestionCount || 0],
              ].map(([label, value]) => <div key={label} className="border-l-2 border-blue-500 pl-3"><p className="text-[10px] font-bold uppercase text-slate-400">{label}</p><p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{value}</p></div>)}
            </div>
          </section>
          {summary.length > 0 && <section className="border-t border-slate-200 pt-5 dark:border-slate-800"><h3 className="text-xs font-semibold text-slate-900 dark:text-white">Data reviewed</h3><dl className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">{summary.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 py-2"><dt className="text-xs text-slate-500">{label.replaceAll('_', ' ')}</dt><dd className="text-xs font-semibold text-slate-900 dark:text-white">{value}</dd></div>)}</dl></section>}
        </div>
        <footer className="flex justify-end border-t border-slate-200 p-4 dark:border-slate-800"><Button variant="secondary" onClick={onClose}>Close</Button></footer>
      </aside>
    </div>
  );
};

const AICommandHelp = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 z-[100] bg-slate-950/50" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside role="dialog" aria-modal="true" aria-labelledby="ai-command-help-title" className="ml-auto flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800"><div><h2 id="ai-command-help-title" className="text-lg font-semibold text-slate-950 dark:text-white">Working with AI Command</h2><p className="mt-1 text-xs text-slate-500">Operational work, human decisions and traceability.</p></div><button type="button" title="Close" aria-label="Close AI Command help" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={19} /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <ol className="space-y-6">
          {[
            ['1', 'Review what is happening now', 'Now combines active work, queued proposals, failures and the latest outcomes. It is the operational starting point.'],
            ['2', 'Resolve Human attention', 'Open a proposal, inspect its evidence and source record, then approve, reject or dismiss it. Server policy still decides whether execution is allowed.'],
            ['3', 'Follow Activity', 'Every review and action has a timestamp, state and trace. Failed or drifted outcomes remain visible until reviewed.'],
            ['4', 'Teach through Insights', 'Structured feedback records what was useful, wrong, too risky or missing context. It does not silently change live policy.'],
          ].map(([number, title, detail]) => <li key={number} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{number}</span><div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{detail}</p></div></li>)}
        </ol>
        <div className="mt-8 flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><Info size={18} className="mt-0.5 shrink-0" /><p>Provider credentials, operating modes, schedules, risk policy and the emergency boundary live in Administration &gt; AI Governance.</p></div>
      </div>
    </aside>
  </div>
);

export const AICommandCenter = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { state, loading, error, refreshing, refresh } = useAIControl();
  const [selectedScope, setSelectedScope] = useState<AIReviewScope>('JOBS');
  const [running, setRunning] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [selectedSuggestion, setSelectedSuggestionState] = useState<AISuggestion | null>(null);
  const [selectedExecution, setSelectedExecutionState] = useState<AIExecution | null>(null);
  const [selectedRun, setSelectedRunState] = useState<AIRun | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [feedbackReason, setFeedbackReason] = useState<'USEFUL' | 'WRONG' | 'TOO_RISKY' | 'MISSING_CONTEXT' | 'GOOD_NOT_NOW' | 'SHOULD_BECOME_RULE'>('USEFUL');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [search, setSearch] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);

  const activeView: CommandView = location.pathname.endsWith('/attention')
    ? 'attention'
    : location.pathname.endsWith('/activity')
      ? 'activity'
      : location.pathname.endsWith('/insights')
        ? 'insights'
        : 'overview';

  const presence = useMemo(() => deriveAIPresence(state, error), [error, state]);
  const sortedWork = useMemo(() => (state?.suggestions || [])
    .filter(item => ['PENDING', 'APPROVED', 'QUEUED', 'EXECUTING', 'FAILED', 'OBSERVED'].includes(item.status))
    .sort((a, b) => workPriority(a) - workPriority(b) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [state]);
  const attentionWork = useMemo(() => sortedWork.filter(item => ['PENDING', 'FAILED'].includes(item.status)), [sortedWork]);
  const insightWork = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (state?.suggestions || []).filter(item => !query || [item.title, item.reason, item.entityLabel, item.expectedBenefit].some(value => String(value).toLowerCase().includes(query)));
  }, [search, state]);
  const attentionCount = attentionWork.length + (state?.executions.filter(item => item.outcomeStatus === 'DRIFTED').length || 0);

  const setDetailLink = (type?: 'finding' | 'execution' | 'run', id?: string) => {
    const params = new URLSearchParams(location.search);
    ['finding', 'execution', 'run'].forEach(key => params.delete(key));
    if (type && id) params.set(type, id);
    const query = params.toString();
    navigate({ pathname: location.pathname, search: query ? `?${query}` : '' }, { replace: true });
  };

  const openSuggestion = (suggestion: AISuggestion) => setDetailLink('finding', suggestion.id);
  const openExecution = (execution: AIExecution) => setDetailLink('execution', execution.id);
  const openRun = (run: AIRun) => setDetailLink('run', run.id);
  const closeDetail = () => setDetailLink();

  const setSelectedSuggestion = (suggestion: AISuggestion | null) => {
    setSelectedSuggestionState(suggestion);
    if (!suggestion && new URLSearchParams(location.search).has('finding')) closeDetail();
  };
  const setSelectedExecution = (execution: AIExecution | null) => {
    setSelectedExecutionState(execution);
    if (!execution && new URLSearchParams(location.search).has('execution')) closeDetail();
  };
  const setSelectedRun = (run: AIRun | null) => {
    setSelectedRunState(run);
    if (!run && new URLSearchParams(location.search).has('run')) closeDetail();
  };

  useEffect(() => {
    if (!state) return;
    const params = new URLSearchParams(location.search);
    const findingId = params.get('finding');
    const executionId = params.get('execution');
    const runId = params.get('run');

    setSelectedSuggestionState(findingId ? state.suggestions.find(item => item.id === findingId) || null : null);
    setSelectedExecutionState(executionId ? state.executions.find(item => item.id === executionId) || null : null);
    setSelectedRunState(runId ? state.runs.find(item => item.id === runId) || null : null);
  }, [location.search, state]);

  const runReview = async () => {
    setRunning(true);
    try {
      const result = await AIControlService.runReview(selectedScope);
      const automatic = result.automaticExecution;
      showToast(`${result.createdCount} new finding(s), ${result.promotedCount} promoted, ${automatic.succeeded} action(s) completed.`, result.createdCount || result.promotedCount || automatic.succeeded ? 'success' : 'info');
      await refresh(true);
    } catch (caught) {
      showToast(cleanError(caught), 'error');
    } finally {
      setRunning(false);
    }
  };

  const reviewSuggestion = async (suggestion: AISuggestion, decision: 'APPROVE' | 'REJECT' | 'DISMISS') => {
    setReviewingId(suggestion.id);
    try {
      const result = await AIControlService.reviewSuggestion(suggestion.id, decision, reviewNote, true);
      showToast(decision === 'APPROVE' && result.executionAttempted ? 'Approved and processed under the current policy.' : 'Human decision recorded.', 'success');
      setReviewNote('');
      const next = await refresh(true);
      setSelectedSuggestion(next?.suggestions.find(item => item.id === suggestion.id) || null);
    } catch (caught) {
      showToast(cleanError(caught), 'error');
    } finally {
      setReviewingId(null);
    }
  };

  const executeSuggestion = async (suggestion: AISuggestion) => {
    setExecutingId(suggestion.id);
    try {
      const result = await AIControlService.executeAction(suggestion.id);
      if (!result.success) throw new Error(result.reason || 'Action was blocked by policy.');
      showToast(result.status === 'SIMULATED' ? 'Action simulation completed.' : 'Action executed successfully.', 'success');
      await refresh(true);
      setSelectedSuggestion(null);
      navigate('/admin/ai-command/activity');
    } catch (caught) {
      showToast(cleanError(caught), 'error');
    } finally {
      setExecutingId(null);
    }
  };

  const rollbackExecution = async (execution: AIExecution) => {
    setRollingBackId(execution.id);
    try {
      await AIControlService.rollbackAction(execution.id);
      showToast('Execution rolled back and audited.', 'success');
      await refresh(true);
      closeDetail();
    } catch (caught) {
      showToast(cleanError(caught), 'error');
    } finally {
      setRollingBackId(null);
    }
  };

  const verifyOutcomes = async () => {
    setVerifying(true);
    try {
      const result = await AIControlService.verifyOutcomes(100);
      showToast(`${result.checked} outcomes checked: ${result.verified} verified, ${result.drifted} drifted.`, result.drifted ? 'error' : 'success');
      await refresh(true);
    } catch (caught) {
      showToast(cleanError(caught), 'error');
    } finally {
      setVerifying(false);
    }
  };

  const submitFeedback = async (suggestion: AISuggestion) => {
    setReviewingId(suggestion.id);
    try {
      await AIControlService.submitFeedback(suggestion.id, feedbackReason, feedbackComment);
      showToast('Feedback added to AI learning memory.', 'success');
      setFeedbackComment('');
      const next = await refresh(true);
      setSelectedSuggestion(next?.suggestions.find(item => item.id === suggestion.id) || null);
    } catch (caught) {
      showToast(cleanError(caught), 'error');
    } finally {
      setReviewingId(null);
    }
  };

  const openEntity = (suggestion: AISuggestion) => {
    const path = suggestion.entityType === 'BOOKING'
      ? `/admin/bookings/${suggestion.entityId}`
      : suggestion.entityType === 'CLIENT_INVOICE'
        ? `/admin/billing/client-invoices/${suggestion.entityId}`
        : suggestion.entityType === 'INTERPRETER_INVOICE'
          ? `/admin/billing/interpreter-invoices/${suggestion.entityId}`
          : suggestion.entityType === 'SYNC_CONFLICT'
            ? '/admin/administration/migration'
            : '';
    if (path) navigate(path, { state: { returnTo: `${location.pathname}${location.search}`, returnLabel: 'AI Command' } });
  };

  if (loading && !state) return <div className="animate-pulse space-y-4" aria-busy="true"><div className="h-16 rounded-md bg-slate-200 dark:bg-slate-800" /><div className="h-20 bg-slate-200 dark:bg-slate-800" /><div className="h-96 bg-slate-200 dark:bg-slate-800" /></div>;

  if (!state) return <div className="border-y border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"><div className="flex gap-3"><AlertTriangle size={19} className="shrink-0" /><div><p className="font-semibold">AI Command could not load</p><p className="mt-1">{error || 'The operational state is unavailable.'}</p><Button className="mt-4" variant="secondary" icon={RefreshCw} onClick={() => void refresh()}>Try again</Button></div></div></div>;

  const activeRuns = state.runs.filter(item => item.status === 'RUNNING').length;
  const activeExecutions = state.executions.filter(item => ['QUEUED', 'EXECUTING', 'ROLLING_BACK'].includes(item.status)).length;
  const successfulOutcomes = state.executions.filter(item => ['SUCCEEDED', 'SIMULATED'].includes(item.status)).length;
  const canExecuteSelected = Boolean(selectedSuggestion?.executionAvailable && state.config.executionEnabled && !state.config.emergencyPaused && ['ASSISTED', 'CONTROLLED_AUTOPILOT', 'FULL_AUTOPILOT'].includes(state.config.mode));

  return (
    <div className="min-w-0">
      <PageHeader title="AI Command" subtitle="Live operational work, human decisions and traceable outcomes.">
        <button type="button" title="How AI Command works" aria-label="Open AI Command guide" onClick={() => setHelpOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"><HelpCircle size={18} /></button>
        <Button variant="secondary" icon={RefreshCw} onClick={() => void refresh()} disabled={refreshing}>Refresh</Button>
        <div className="flex h-10 items-center rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
          <select aria-label="AI review scope" value={selectedScope} onChange={event => setSelectedScope(event.target.value as AIReviewScope)} className="h-full min-w-28 rounded-l-md bg-transparent px-3 text-sm font-medium text-slate-700 outline-none dark:text-slate-200">{reviewScopes.map(scope => <option key={scope.id} value={scope.id}>{scope.label}</option>)}</select>
          <button type="button" disabled={running || state.config.mode === 'OFF'} onClick={() => void runReview()} className="flex h-full items-center gap-2 rounded-r-md border-l border-blue-700 bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Play size={16} />{running ? 'Reviewing' : 'Run review'}</button>
        </div>
      </PageHeader>

      <section className="mb-5 grid border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex min-h-20 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:border-r xl:border-b-0"><span className={`h-2.5 w-2.5 rounded-full ${presence.tone === 'danger' ? 'bg-red-500' : presence.tone === 'attention' ? 'bg-amber-500' : presence.tone === 'working' ? 'animate-pulse bg-blue-600' : 'bg-slate-400'}`} /><div><p className="text-[10px] font-bold uppercase text-slate-400">AI state</p><p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{presence.label}</p></div></div>
        <div className="flex min-h-20 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:border-b xl:border-r xl:border-b-0"><div><p className="text-[10px] font-bold uppercase text-slate-400">Active now</p><p className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{activeRuns + activeExecutions}</p></div><Activity size={20} className="text-blue-500" /></div>
        <button type="button" onClick={() => navigate('/admin/ai-command/attention')} className="flex min-h-20 items-center justify-between border-b border-slate-200 px-4 py-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 sm:border-r sm:border-b-0 xl:border-r"><div><p className="text-[10px] font-bold uppercase text-slate-400">Human attention</p><p className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{attentionCount}</p></div><ChevronRight size={18} className="text-slate-400" /></button>
        <div className="flex min-h-20 items-center justify-between px-4 py-3"><div><p className="text-[10px] font-bold uppercase text-slate-400">Outcomes recorded</p><p className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{successfulOutcomes}</p></div><CheckCircle2 size={20} className="text-emerald-500" /></div>
      </section>

      {(state.config.emergencyPaused || state.config.mode === 'OFF') && <div className="mb-5 flex flex-col gap-3 border-y border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><CirclePause size={18} className="mt-0.5 shrink-0" /><p><strong>{state.config.emergencyPaused ? 'Execution is paused.' : 'AI is off.'}</strong> Operational history remains available; policy changes belong in AI Governance.</p></div><Button variant="secondary" icon={Settings} onClick={() => navigate('/admin/administration/ai')}>Open governance</Button></div>}

      <nav className="mb-5 flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 xl:hidden" aria-label="AI Command views">
        {commandViews.map(view => { const Icon = view.icon; const badge = view.id === 'attention' ? attentionCount : undefined; return <button key={view.id} type="button" onClick={() => navigate(view.path)} className={`flex h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-semibold ${activeView === view.id ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}><Icon size={16} />{view.label}{badge ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">{badge}</span> : null}</button>; })}
      </nav>

      {activeView === 'overview' && <div className="space-y-5"><div className="flex items-center justify-between px-1"><div><h2 className="text-sm font-semibold text-slate-950 dark:text-white">AI work queue</h2><p className="mt-0.5 text-xs text-slate-500">Prioritised by failure, human decision and operational risk.</p></div><span className="text-xs font-semibold text-slate-500">{sortedWork.length} open</span></div><WorkQueue suggestions={sortedWork.slice(0, 15)} onOpen={openSuggestion} emptyTitle="The AI work queue is clear" emptyDetail="Run an operational review or wait for the next scheduled cycle." />{sortedWork.length > 15 && <div className="flex justify-end"><Button variant="secondary" onClick={() => navigate('/admin/ai-command/attention')}>Review all attention items</Button></div>}</div>}

      {activeView === 'attention' && <div className="space-y-5"><div className="flex items-center justify-between px-1"><div><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Human attention</h2><p className="mt-0.5 text-xs text-slate-500">Decisions, failed proposals and drift that automation cannot resolve alone.</p></div><span className="text-xs font-semibold text-slate-500">{attentionCount} items</span></div><WorkQueue suggestions={attentionWork} onOpen={openSuggestion} emptyTitle="No human decision is waiting" emptyDetail="New approvals and failed proposals will appear here." />{state.executions.some(item => item.outcomeStatus === 'DRIFTED') && <section className="border-y border-red-200 bg-white dark:border-red-900 dark:bg-slate-900"><div className="border-b border-red-100 px-4 py-3 dark:border-red-900"><h3 className="text-sm font-semibold text-red-800 dark:text-red-200">Outcome drift</h3></div>{state.executions.filter(item => item.outcomeStatus === 'DRIFTED').map(execution => <button key={execution.id} type="button" onClick={() => openExecution(execution)} className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"><div><p className="text-xs font-semibold text-slate-900 dark:text-white">{execution.action.replaceAll('_', ' ')}</p><p className="mt-1 text-[11px] text-slate-500">{execution.entityType} - {execution.entityId}</p></div><ChevronRight size={17} className="text-slate-400" /></button>)}</section>}</div>}

      {activeView === 'activity' && <div className="space-y-5"><div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Execution and review activity</h2><p className="mt-0.5 text-xs text-slate-500">Chronological evidence of analysis, actions and outcomes.</p></div><Button variant="secondary" icon={FileSearch} isLoading={verifying} onClick={() => void verifyOutcomes()}>Verify outcomes</Button></div><section className="overflow-hidden border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left dark:divide-slate-800"><thead className="bg-slate-50 dark:bg-slate-950/60"><tr><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Time</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Type</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Work</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Record / scope</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">State</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Outcome</th><th className="px-4 py-2.5" /></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{[...state.executions.map(item => ({ type: 'ACTION' as const, createdAt: item.createdAt, id: item.id, work: item.action, record: `${item.entityType} - ${item.entityId}`, status: item.status, outcome: item.outcomeStatus, execution: item, run: null })), ...state.runs.map(item => ({ type: 'REVIEW' as const, createdAt: item.createdAt, id: item.id, work: `${item.scope} review`, record: item.scope, status: item.status, outcome: `${Number(item.createdSuggestionCount || 0) + Number(item.promotedSuggestionCount || 0)} findings`, execution: null, run: item }))].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(item => <tr key={`${item.type}-${item.id}`} onClick={() => item.execution ? openExecution(item.execution) : item.run ? openRun(item.run) : undefined} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDateTime(item.createdAt)}</td><td className="px-4 py-3"><Pill className={item.type === 'ACTION' ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300' : 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300'}>{item.type}</Pill></td><td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">{item.work.replaceAll('_', ' ')}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{item.record.replaceAll('_', ' ')}</td><td className="px-4 py-3"><Pill className={statusClass(item.status)}>{item.status}</Pill></td><td className="px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">{item.outcome.replaceAll('_', ' ')}</td><td className="px-4 py-3"><ChevronRight size={17} className="text-slate-400" /></td></tr>)}</tbody></table></div>{state.executions.length === 0 && state.runs.length === 0 && <div className="px-6 py-16 text-center text-sm text-slate-500">No AI reviews or actions have been recorded.</div>}</section></div>}

      {activeView === 'insights' && <div className="space-y-5"><div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Operational insights</h2><p className="mt-0.5 text-xs text-slate-500">Search findings, inspect expected benefit and add structured learning feedback.</p></div><label className="relative w-full sm:max-w-sm"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search insight or record" className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></label></div><WorkQueue suggestions={insightWork} onOpen={openSuggestion} emptyTitle="No insight matches this search" emptyDetail="Clear the search or run a new review." /></div>}

      {selectedSuggestion && <div className="fixed inset-0 z-[90] bg-slate-950/50" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedSuggestion(null); }}><aside role="dialog" aria-modal="true" aria-labelledby="ai-work-title" className="ml-auto flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"><header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800"><div className="min-w-0"><div className="mb-2 flex flex-wrap gap-2"><Pill className={riskClass(selectedSuggestion.risk)}>{selectedSuggestion.risk} risk</Pill><Pill className={statusClass(selectedSuggestion.status)}>{selectedSuggestion.status}</Pill><Pill className="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300">{selectedSuggestion.source.replaceAll('_', ' ')}</Pill></div><h2 id="ai-work-title" className="text-lg font-semibold text-slate-950 dark:text-white">{selectedSuggestion.title}</h2><p className="mt-1 text-xs text-slate-500">{selectedSuggestion.entityLabel} - {selectedSuggestion.confidence}% confidence</p></div><button type="button" title="Close" aria-label="Close AI work item" onClick={() => setSelectedSuggestion(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={19} /></button></header><div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5"><div className="grid gap-5 sm:grid-cols-2"><div><p className="text-[10px] font-bold uppercase text-slate-400">Reason</p><p className="mt-1.5 text-sm leading-6 text-slate-700 dark:text-slate-200">{selectedSuggestion.reason}</p></div><div><p className="text-[10px] font-bold uppercase text-slate-400">Expected benefit</p><p className="mt-1.5 text-sm leading-6 text-slate-700 dark:text-slate-200">{selectedSuggestion.expectedBenefit}</p></div></div><div className="grid gap-5 border-y border-slate-200 py-5 dark:border-slate-800 sm:grid-cols-2"><div><p className="text-[10px] font-bold uppercase text-slate-400">Evidence</p><ul className="mt-2 space-y-2">{selectedSuggestion.evidence.length ? selectedSuggestion.evidence.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />{item}</li>) : <li className="text-xs text-slate-500">No additional evidence listed.</li>}</ul></div><div><p className="text-[10px] font-bold uppercase text-slate-400">Data used</p><div className="mt-2 flex flex-wrap gap-2">{selectedSuggestion.dataUsed.map(item => <span key={item} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item}</span>)}</div></div></div>{selectedSuggestion.entityType !== 'SYSTEM' && <Button variant="secondary" icon={ExternalLink} onClick={() => openEntity(selectedSuggestion)}>Open source record</Button>}{selectedSuggestion.status === 'PENDING' && <div className="border-y border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20"><p className="text-xs leading-5 text-blue-800 dark:text-blue-200">{canExecuteSelected ? `Approval will ${state.config.simulationOnly ? 'simulate' : 'execute'} this allowlisted tool under server policy.` : 'Approval records the human decision. Execution remains blocked by the current governance policy.'}</p><textarea value={reviewNote} onChange={event => setReviewNote(event.target.value)} maxLength={500} placeholder="Review note (optional)" className="mt-3 min-h-20 w-full resize-y rounded-md border border-blue-200 bg-white p-3 text-sm outline-none focus:border-blue-500 dark:border-blue-900 dark:bg-slate-950 dark:text-white" /><div className="mt-3 grid gap-2 sm:grid-cols-3"><Button icon={ThumbsUp} isLoading={reviewingId === selectedSuggestion.id} onClick={() => void reviewSuggestion(selectedSuggestion, 'APPROVE')}>{canExecuteSelected ? (state.config.simulationOnly ? 'Approve & simulate' : 'Approve & execute') : 'Approve finding'}</Button><Button variant="secondary" icon={ThumbsDown} disabled={reviewingId === selectedSuggestion.id} onClick={() => void reviewSuggestion(selectedSuggestion, 'REJECT')}>Reject</Button><Button variant="ghost" icon={XCircle} disabled={reviewingId === selectedSuggestion.id} onClick={() => void reviewSuggestion(selectedSuggestion, 'DISMISS')}>Dismiss</Button></div></div>}{selectedSuggestion.executionAvailable && ['APPROVED', 'FAILED'].includes(selectedSuggestion.status) && <div className="flex flex-col gap-3 border-y border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-amber-900 dark:text-amber-200">Current mode, confidence, pause state, limits and idempotency will be checked again before execution.</p><Button icon={Play} isLoading={executingId === selectedSuggestion.id} onClick={() => void executeSuggestion(selectedSuggestion)}>{state.config.simulationOnly ? 'Simulate action' : 'Execute action'}</Button></div>}<div><p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Learning feedback</p><div className="mt-2 grid gap-2 sm:grid-cols-[210px_minmax(0,1fr)_auto]"><select value={feedbackReason} onChange={event => setFeedbackReason(event.target.value as typeof feedbackReason)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="USEFUL">Useful</option><option value="WRONG">Wrong</option><option value="TOO_RISKY">Too risky</option><option value="MISSING_CONTEXT">Missing context</option><option value="GOOD_NOT_NOW">Good, not now</option><option value="SHOULD_BECOME_RULE">Should become a rule</option></select><input value={feedbackComment} onChange={event => setFeedbackComment(event.target.value)} maxLength={500} placeholder="Feedback detail" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><Button variant="secondary" icon={Sparkles} isLoading={reviewingId === selectedSuggestion.id} onClick={() => void submitFeedback(selectedSuggestion)}>Submit</Button></div></div></div></aside></div>}

      {selectedExecution && <div className="fixed inset-0 z-[92] bg-slate-950/50" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedExecution(null); }}><aside role="dialog" aria-modal="true" aria-labelledby="ai-trace-title" className="ml-auto flex h-full w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"><header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800"><div><div className="mb-2 flex gap-2"><Pill className={statusClass(selectedExecution.status)}>{selectedExecution.status}</Pill><Pill className={riskClass(selectedExecution.risk)}>{selectedExecution.risk} risk</Pill><Pill className={statusClass(selectedExecution.outcomeStatus)}>{selectedExecution.outcomeStatus.replaceAll('_', ' ')}</Pill></div><h2 id="ai-trace-title" className="font-mono text-base font-semibold text-slate-950 dark:text-white">{selectedExecution.action}</h2><p className="mt-1 text-xs text-slate-500">{selectedExecution.entityType} - {selectedExecution.entityId}</p></div><button type="button" title="Close" aria-label="Close execution trace" onClick={() => setSelectedExecution(null)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={19} /></button></header><div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5"><div className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-2 lg:grid-cols-4">{[['Mode', selectedExecution.mode.replaceAll('_', ' ')], ['Created', formatDateTime(selectedExecution.createdAt)], ['Completed', formatDateTime(selectedExecution.completedAt || selectedExecution.rolledBackAt)], ['Communication', selectedExecution.externalCommunicationAttempted ? 'External attempted' : 'Internal only']].map(([label, value]) => <div key={label} className="bg-white p-3 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase text-slate-400">{label}</p><p className="mt-1 text-xs font-semibold text-slate-800 dark:text-slate-200">{value}</p></div>)}</div>{selectedExecution.error && <div className="border-y border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{selectedExecution.error}</div>}<div className="grid gap-4 lg:grid-cols-2"><div><p className="mb-2 text-[10px] font-bold uppercase text-slate-400">Parameters</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">{JSON.stringify(selectedExecution.parameters || {}, null, 2)}</pre></div><div><p className="mb-2 text-[10px] font-bold uppercase text-slate-400">Result</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">{JSON.stringify(selectedExecution.resultSummary || {}, null, 2)}</pre></div></div>{!selectedExecution.simulationOnly && (selectedExecution.beforeSnapshot || selectedExecution.afterSnapshot) && <details className="border-y border-slate-200 dark:border-slate-800"><summary className="cursor-pointer px-2 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200">Recorded before and after state</summary><div className="grid gap-3 border-t border-slate-200 py-3 dark:border-slate-800 lg:grid-cols-2"><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">{JSON.stringify(selectedExecution.beforeSnapshot || {}, null, 2)}</pre><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">{JSON.stringify(selectedExecution.afterSnapshot || {}, null, 2)}</pre></div></details>}</div><footer className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800"><Button variant="secondary" onClick={() => setSelectedExecution(null)}>Close</Button>{selectedExecution.rollbackAvailable && selectedExecution.status === 'SUCCEEDED' && <Button variant="danger" icon={RotateCcw} isLoading={rollingBackId === selectedExecution.id} onClick={() => void rollbackExecution(selectedExecution)} disabled={!state.viewer.canManageSettings}>Rollback execution</Button>}</footer></aside></div>}

      {selectedRun && <RunTraceDrawer run={selectedRun} onClose={() => setSelectedRun(null)} />}

      {helpOpen && <AICommandHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
};
