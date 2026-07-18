import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  CirclePause,
  ExternalLink,
  Eye,
  FileClock,
  Gauge,
  History,
  Info,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Workflow,
  X,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../context/ToastContext';
import {
  AIControlHelpButton,
  AIControlManual,
  AIControlTour,
} from './AIControlGuide';
import {
  AI_CONTROL_TOUR_STEPS,
  AI_CONTROL_TOUR_STORAGE_KEY,
  AIControlGuideTab,
} from './aiControlGuideData';
import {
  AIControlConfig,
  AIControlService,
  AIControlState,
  AIExecution,
  AIMode,
  AIReviewScope,
  AISuggestion,
} from '../../../services/aiControlService';

type ControlTab = AIControlGuideTab;

const tabs: Array<{ id: ControlTab; label: string; icon: React.ElementType }> = [
  { id: 'control', label: 'Control', icon: Gauge },
  { id: 'suggestions', label: 'Suggestions', icon: Sparkles },
  { id: 'executions', label: 'Executions', icon: Workflow },
  { id: 'runs', label: 'Runs', icon: Activity },
  { id: 'audit', label: 'Audit', icon: History },
];

const reviewScopes: Array<{ id: AIReviewScope; label: string; detail: string }> = [
  { id: 'JOBS', label: 'Jobs', detail: 'Lifecycle and overdue records' },
  { id: 'ALLOCATION', label: 'Allocation', detail: 'Unassigned and at-risk work' },
  { id: 'BILLING', label: 'Billing', detail: 'Invoice and delivery gaps' },
  { id: 'SYNC', label: 'Mirror sync', detail: 'Open Airtable conflicts' },
  { id: 'COST', label: 'Cost', detail: 'Margin and rate anomalies' },
  { id: 'PLATFORM', label: 'Platform', detail: 'Cross-workflow review' },
];

const modes: Array<{ id: AIMode; label: string; detail: string }> = [
  { id: 'OFF', label: 'Off', detail: 'No reviews or actions' },
  { id: 'READ_ONLY_AUDIT', label: 'Read-only audit', detail: 'Observe without approval' },
  { id: 'SUGGEST', label: 'Suggest', detail: 'Human review queue only' },
  { id: 'ASSISTED', label: 'Assisted', detail: 'Every action needs approval' },
  { id: 'CONTROLLED_AUTOPILOT', label: 'Controlled Autopilot', detail: 'Policy-bound automation' },
  { id: 'FULL_AUTOPILOT', label: 'Full Autopilot', detail: 'All risk tiers configurable' },
];

const executionModes: AIMode[] = ['ASSISTED', 'CONTROLLED_AUTOPILOT', 'FULL_AUTOPILOT'];

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

const errorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return message
    .replace(/^Firebase:\s*/i, '')
    .replace(/^.*?\(functions\/[a-z-]+\)\.\s*/i, '')
    .slice(0, 240);
};

const riskClass = (risk: string) => {
  if (risk === 'HIGH') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300';
  if (risk === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300';
};

const statusClass = (status: string) => {
  if (['APPROVED', 'EXECUTED', 'SUCCEEDED', 'VERIFIED', 'COMPLETED', 'CONNECTED'].includes(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (['PENDING', 'QUEUED', 'EXECUTING', 'ROLLING_BACK', 'RUNNING'].includes(status)) return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-300';
  if (['FAILED', 'ROLLBACK_FAILED', 'REJECTED', 'DRIFTED', 'ERROR'].includes(status)) return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300';
  if (['DISMISSED', 'ROLLED_BACK', 'NOT_APPLICABLE'].includes(status)) return 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/70 dark:bg-violet-950/40 dark:text-violet-300';
};

const Pill = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-normal ${className}`}>
    {children}
  </span>
);

const Toggle = ({
  label,
  detail,
  checked,
  disabled = false,
  danger = false,
  onChange,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  disabled?: boolean;
  danger?: boolean;
  onChange: () => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={onChange}
    className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800/50"
  >
    <span className="min-w-0">
      <span className="block text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
      {detail && <span className="mt-0.5 block text-xs leading-4 text-slate-500 dark:text-slate-400">{detail}</span>}
    </span>
    <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? (danger ? 'bg-red-500' : 'bg-blue-600') : 'bg-slate-300 dark:bg-slate-700'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </span>
  </button>
);

const SafetyState = ({ state }: { state: AIControlState }) => {
  const executionLabel = state.config.emergencyPaused
    ? 'Emergency paused'
    : !state.config.executionEnabled
      ? 'Disabled'
      : state.config.simulationOnly
        ? 'Simulation'
        : 'Live';
  const executionTone = state.config.emergencyPaused
    ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300'
    : state.config.executionEnabled
      ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300'
      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300';
  return (
    <section data-ai-tour="safety" className="mb-5 grid border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 xl:grid-cols-4">
      <div className="flex min-h-20 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:border-r xl:border-b-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><BrainCircuit size={18} /></div>
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase text-slate-400">Mode</p><p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{state.config.mode.replaceAll('_', ' ')}</p></div>
      </div>
      <div className="flex min-h-20 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:border-b xl:border-r xl:border-b-0">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${state.provider.configured ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}><Bot size={18} /></div>
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase text-slate-400">DeepSeek</p><p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{state.provider.configured ? 'Configured' : 'Not configured'}</p></div>
      </div>
      <div className="flex min-h-20 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:border-r sm:border-b-0 xl:border-r">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${executionTone}`}>{state.config.emergencyPaused ? <CirclePause size={18} /> : <Workflow size={18} />}</div>
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase text-slate-400">Execution</p><p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{executionLabel}</p></div>
      </div>
      <div className="flex min-h-20 items-center gap-3 px-4 py-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${state.config.externalCommunicationEnabled ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300'}`}><Radio size={18} /></div>
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase text-slate-400">External comms</p><p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{state.config.externalCommunicationEnabled ? 'Enabled by policy' : 'Blocked'}</p></div>
      </div>
    </section>
  );
};

export const AIControlCenter = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as ControlTab | null;
  const activeTab: ControlTab = tabs.some(tab => tab.id === requestedTab) ? requestedTab! : 'control';
  const [state, setState] = useState<AIControlState | null>(null);
  const [draft, setDraft] = useState<AIControlConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [selectedScope, setSelectedScope] = useState<AIReviewScope>('JOBS');
  const [selectedSuggestion, setSelectedSuggestion] = useState<AISuggestion | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<AIExecution | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [reviewNote, setReviewNote] = useState('');
  const [activationConfirmation, setActivationConfirmation] = useState('');
  const [liveExecutionConfirmation, setLiveExecutionConfirmation] = useState('');
  const [externalConfirmation, setExternalConfirmation] = useState('');
  const [feedbackReason, setFeedbackReason] = useState<'USEFUL' | 'WRONG' | 'TOO_RISKY' | 'MISSING_CONTEXT' | 'GOOD_NOT_NOW' | 'SHOULD_BECOME_RULE'>('USEFUL');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [tourAutoChecked, setTourAutoChecked] = useState(false);

  const loadState = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await AIControlService.getState(150);
      setState(next);
      setDraft(next.config);
      setSelectedSuggestion(current => current ? next.suggestions.find(item => item.id === current.id) || null : null);
      setSelectedExecution(current => current ? next.executions.find(item => item.id === current.id) || null : null);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void loadState(); }, [loadState]);

  const setTab = useCallback((tab: ControlTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'control') next.delete('tab'); else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (loading || !state || tourAutoChecked) return;
    setTourAutoChecked(true);
    try {
      if (window.localStorage.getItem(AI_CONTROL_TOUR_STORAGE_KEY) !== 'completed') {
        setManualOpen(false);
        setTourStep(0);
      }
    } catch {
      // The guide remains available from the help button when storage is unavailable.
    }
  }, [loading, state, tourAutoChecked]);

  const markTourSeen = () => {
    try { window.localStorage.setItem(AI_CONTROL_TOUR_STORAGE_KEY, 'completed'); } catch { /* no-op */ }
  };

  const startTour = () => {
    setSelectedSuggestion(null);
    setManualOpen(false);
    setTab('control');
    setTourStep(0);
  };

  const closeTour = (returnToControl = false) => {
    markTourSeen();
    setTourStep(null);
    if (returnToControl) setTab('control');
  };

  const advanceTour = () => {
    setTourStep(current => {
      if (current === null) return null;
      if (current >= AI_CONTROL_TOUR_STEPS.length - 1) {
        markTourSeen();
        window.setTimeout(() => setTab('control'), 0);
        return null;
      }
      return current + 1;
    });
  };

  const patchDraft = <K extends keyof AIControlConfig>(key: K, value: AIControlConfig[K]) => {
    setDraft(current => current ? { ...current, [key]: value } : current);
  };

  const selectMode = (mode: AIMode) => {
    setDraft(current => {
      if (!current) return current;
      const executionMode = executionModes.includes(mode);
      return {
        ...current,
        mode,
        executionEnabled: executionMode ? current.executionEnabled : false,
        externalCommunicationEnabled: mode === 'FULL_AUTOPILOT' ? current.externalCommunicationEnabled : false,
        autoExecuteHighRisk: mode === 'FULL_AUTOPILOT' ? current.autoExecuteHighRisk : false,
      };
    });
  };

  const saveSettings = async () => {
    if (!draft || !state) return;
    setSaving(true);
    try {
      await AIControlService.updateSettings({
        mode: draft.mode,
        model: draft.model,
        emergencyPaused: draft.emergencyPaused,
        executionEnabled: draft.executionEnabled,
        externalCommunicationEnabled: draft.externalCommunicationEnabled,
        simulationOnly: draft.simulationOnly,
        autoExecuteLowRisk: draft.autoExecuteLowRisk,
        autoExecuteMediumRisk: draft.autoExecuteMediumRisk,
        autoExecuteHighRisk: draft.autoExecuteHighRisk,
        requireApprovalForMediumRisk: draft.requireApprovalForMediumRisk,
        requireApprovalForHighRisk: draft.requireApprovalForHighRisk,
        maxActionsPerRun: draft.maxActionsPerRun,
        dailyActionLimit: draft.dailyActionLimit,
        scheduledReviewsEnabled: draft.scheduledReviewsEnabled,
        scheduledScopes: draft.scheduledScopes,
        scheduleIntervalMinutes: draft.scheduleIntervalMinutes,
        minimumConfidence: draft.minimumConfidence,
        maxSuggestionsPerRun: draft.maxSuggestionsPerRun,
        dailyRunLimit: draft.dailyRunLimit,
      }, {
        activationConfirmation: activationConfirmation || undefined,
        liveExecutionConfirmation: liveExecutionConfirmation || undefined,
        externalCommunicationConfirmation: externalConfirmation || undefined,
      });
      showToast('AI control policy saved', 'success');
      setActivationConfirmation('');
      setLiveExecutionConfirmation('');
      setExternalConfirmation('');
      await loadState(true);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const result = await AIControlService.testConnection();
      showToast(`DeepSeek connected. ${result.models.length} model(s) available.`, 'success');
      await loadState(true);
    } catch (error) {
      showToast(errorMessage(error), 'error');
      await loadState(true);
    } finally {
      setTesting(false);
    }
  };

  const runReview = async () => {
    setRunning(true);
    try {
      const result = await AIControlService.runReview(selectedScope);
      const auto = result.automaticExecution;
      const executionNote = auto.candidates
        ? ` ${auto.succeeded} action(s) completed, ${auto.blocked} held by policy.`
        : '';
      const providerNote = result.providerStatus === 'NOT_CONFIGURED' ? ' Local rules completed; DeepSeek was not configured.' : '';
      showToast(`${result.createdCount} finding(s) created, ${result.promotedCount} promoted.${executionNote}${providerNote}`, result.createdCount || result.promotedCount || auto.succeeded ? 'success' : 'info');
      await loadState(true);
      setTab(auto.succeeded || auto.failed ? 'executions' : 'suggestions');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setRunning(false);
    }
  };

  const reviewSuggestion = async (suggestion: AISuggestion, decision: 'APPROVE' | 'REJECT' | 'DISMISS') => {
    setReviewingId(suggestion.id);
    try {
      const result = await AIControlService.reviewSuggestion(suggestion.id, decision, reviewNote, true);
      const message = decision !== 'APPROVE'
        ? 'Suggestion review recorded'
        : result.executionAttempted
          ? `Approved and ${state?.config.simulationOnly ? 'simulated' : 'executed'}`
          : 'Suggestion approved; policy kept execution in the queue';
      showToast(message, 'success');
      setReviewNote('');
      await loadState(true);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setReviewingId(null);
    }
  };

  const executeSuggestion = async (suggestion: AISuggestion) => {
    setExecutingId(suggestion.id);
    try {
      const result = await AIControlService.executeAction(suggestion.id);
      if (!result.success) throw new Error(result.reason || 'Action was blocked by policy.');
      showToast(result.status === 'SIMULATED' ? 'Action simulation completed' : 'Action executed successfully', 'success');
      await loadState(true);
      setTab('executions');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setExecutingId(null);
    }
  };

  const rollbackExecution = async (execution: AIExecution) => {
    setRollingBackId(execution.id);
    try {
      await AIControlService.rollbackAction(execution.id);
      showToast('Execution rolled back and audited', 'success');
      await loadState(true);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setRollingBackId(null);
    }
  };

  const verifyOutcomes = async () => {
    setVerifying(true);
    try {
      const result = await AIControlService.verifyOutcomes(100);
      showToast(`${result.checked} outcome(s) checked: ${result.verified} verified, ${result.drifted} drifted.`, result.drifted ? 'error' : 'success');
      await loadState(true);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setVerifying(false);
    }
  };

  const submitFeedback = async (suggestion: AISuggestion) => {
    setReviewingId(suggestion.id);
    try {
      await AIControlService.submitFeedback(suggestion.id, feedbackReason, feedbackComment);
      showToast('Feedback added to AI learning memory', 'success');
      setFeedbackComment('');
      await loadState(true);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setReviewingId(null);
    }
  };

  const filteredSuggestions = useMemo(() => {
    if (!state) return [];
    const query = search.trim().toLowerCase();
    return state.suggestions.filter(item => (
      (!query || [item.title, item.entityLabel, item.action, item.reason].some(value => String(value).toLowerCase().includes(query)))
      && (statusFilter === 'ALL' || item.status === statusFilter)
      && (riskFilter === 'ALL' || item.risk === riskFilter)
      && (sourceFilter === 'ALL' || item.source === sourceFilter)
    ));
  }, [riskFilter, search, sourceFilter, state, statusFilter]);

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
    if (path) navigate(path, { state: { returnTo: `/admin/ai-control?tab=suggestions`, returnLabel: 'AI suggestions' } });
  };

  if (loading || !state || !draft) {
    return (
      <div className="animate-pulse space-y-4" aria-busy="true">
        <div className="h-16 rounded-md bg-slate-200 dark:bg-slate-800" />
        <div className="h-20 bg-slate-200 dark:bg-slate-800" />
        <div className="h-80 rounded-md bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  const selectedModeExecutes = executionModes.includes(draft.mode);
  const configuredModeExecutes = executionModes.includes(state.config.mode);
  const activationRequired = selectedModeExecutes && !state.config.automationAcknowledgedAt;
  const liveExecutionConfirmationRequired = draft.executionEnabled
    && !draft.simulationOnly
    && (state.config.simulationOnly || !state.config.executionEnabled)
    && !state.config.liveExecutionAcknowledgedAt;
  const canExecuteSelected = selectedSuggestion?.executionAvailable && configuredModeExecutes && state.config.executionEnabled;

  return (
    <div className="min-w-0">
      <PageHeader title="AI Control Center" subtitle="Governed operational automation with explicit policy, reversible tools and a complete decision trail.">
        <AIControlHelpButton onClick={() => { setSelectedSuggestion(null); setTourStep(null); setManualOpen(true); }} />
        <Button variant="secondary" icon={RefreshCw} onClick={() => void loadState()} disabled={loading}>Refresh</Button>
      </PageHeader>

      <SafetyState state={state} />

      <div data-ai-tour="sections" className="mb-5 flex overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="AI Control sections">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const badge = tab.id === 'suggestions'
            ? state.counts.pending + state.counts.observed
            : tab.id === 'executions'
              ? state.executions.filter(item => ['QUEUED', 'EXECUTING', 'FAILED'].includes(item.status)).length
              : undefined;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setTab(tab.id)}
              className={`flex h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors ${activeTab === tab.id ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
            >
              <Icon size={16} />{tab.label}
              {badge !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{badge}</span>}
            </button>
          );
        })}
      </div>

      {activeTab === 'control' && (
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <section data-ai-tour="guardrails" className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Operating policy</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Server-enforced mode, risk limits and kill switch.</p></div>
                <Pill className={draft.executionEnabled ? (draft.simulationOnly ? statusClass('OBSERVED') : riskClass('MEDIUM')) : statusClass('DISMISSED')}>{draft.executionEnabled ? (draft.simulationOnly ? 'Simulation' : 'Execution enabled') : 'Execution disabled'}</Pill>
              </div>

              <div className="border-b border-slate-200 p-4 dark:border-slate-800">
                <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Operating mode</p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {modes.map(mode => (
                    <button
                      key={mode.id}
                      type="button"
                      disabled={!state.viewer.canManageSettings}
                      onClick={() => selectMode(mode.id)}
                      className={`min-h-16 rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${draft.mode === mode.id ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}
                    >
                      <span className="block text-xs font-bold">{mode.label}</span>
                      <span className="mt-1 block text-[11px] leading-4 opacity-75">{mode.detail}</span>
                    </button>
                  ))}
                </div>
                {activationRequired && (
                  <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/70 dark:bg-amber-950/30">
                    <div className="flex gap-2 text-xs leading-5 text-amber-900 dark:text-amber-200"><ShieldAlert size={16} className="mt-0.5 shrink-0" /><span>First activation requires a Super Admin acknowledgement. Type <strong>ENABLE LINGLAND AUTOPILOT</strong>.</span></div>
                    <input value={activationConfirmation} onChange={event => setActivationConfirmation(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-amber-300 bg-white px-3 text-sm outline-none focus:border-amber-500 dark:border-amber-900 dark:bg-slate-950 dark:text-white" placeholder="Activation acknowledgement" />
                  </div>
                )}
              </div>

              <div className="grid divide-y divide-slate-100 dark:divide-slate-800 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <Toggle label="Emergency pause" detail="Immediately blocks every execution" checked={draft.emergencyPaused} danger onChange={() => patchDraft('emergencyPaused', !draft.emergencyPaused)} disabled={!state.viewer.canManageSettings} />
                <Toggle label="Execution engine" detail={selectedModeExecutes ? 'Permit tools under the policy below' : 'Choose an assisted or autopilot mode'} checked={draft.executionEnabled} onChange={() => patchDraft('executionEnabled', !draft.executionEnabled)} disabled={!state.viewer.canManageSettings || !selectedModeExecutes} />
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800">
                <Toggle label="Simulation only" detail="Build plans and audit results without writing platform records" checked={draft.simulationOnly} onChange={() => patchDraft('simulationOnly', !draft.simulationOnly)} disabled={!state.viewer.canManageSettings || !selectedModeExecutes} />
              </div>
              {liveExecutionConfirmationRequired && (
                <div className="border-t border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/20">
                  <div className="flex gap-2 text-xs leading-5 text-red-800 dark:text-red-200"><ShieldAlert size={16} className="mt-0.5 shrink-0" /><span>Moving from simulation to platform writes requires a second acknowledgement. Type <strong>ENABLE LIVE EXECUTION</strong>.</span></div>
                  <input value={liveExecutionConfirmation} onChange={event => setLiveExecutionConfirmation(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-red-300 bg-white px-3 text-sm outline-none focus:border-red-500 dark:border-red-900 dark:bg-slate-950 dark:text-white" placeholder="Live execution acknowledgement" />
                </div>
              )}

              <div className="border-t border-slate-200 p-4 dark:border-slate-800">
                <div className="mb-3"><h3 className="text-xs font-bold uppercase text-slate-500">Automation by risk</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Human approval always overrides automatic execution limits.</p></div>
                <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-950/60"><tr><th className="px-3 py-2">Risk</th><th className="px-3 py-2">Auto execute</th><th className="px-3 py-2">Human approval</th></tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      <tr><td className="px-3 py-3"><Pill className={riskClass('LOW')}>Low</Pill></td><td className="px-3 py-3"><input type="checkbox" checked={draft.autoExecuteLowRisk} onChange={event => patchDraft('autoExecuteLowRisk', event.target.checked)} disabled={!state.viewer.canManageSettings || draft.mode === 'ASSISTED'} className="h-4 w-4 accent-blue-600" /></td><td className="px-3 py-3 text-slate-500">Optional queue review</td></tr>
                      <tr><td className="px-3 py-3"><Pill className={riskClass('MEDIUM')}>Medium</Pill></td><td className="px-3 py-3"><input type="checkbox" checked={draft.autoExecuteMediumRisk} onChange={event => patchDraft('autoExecuteMediumRisk', event.target.checked)} disabled={!state.viewer.canManageSettings || !['CONTROLLED_AUTOPILOT', 'FULL_AUTOPILOT'].includes(draft.mode)} className="h-4 w-4 accent-blue-600" /></td><td className="px-3 py-3"><label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300"><input type="checkbox" checked={draft.requireApprovalForMediumRisk} onChange={event => patchDraft('requireApprovalForMediumRisk', event.target.checked)} disabled={!state.viewer.canManageSettings} className="h-4 w-4 accent-blue-600" />Required</label></td></tr>
                      <tr><td className="px-3 py-3"><Pill className={riskClass('HIGH')}>High</Pill></td><td className="px-3 py-3"><input type="checkbox" checked={draft.autoExecuteHighRisk} onChange={event => patchDraft('autoExecuteHighRisk', event.target.checked)} disabled={!state.viewer.canManageSettings || draft.mode !== 'FULL_AUTOPILOT'} className="h-4 w-4 accent-blue-600" /></td><td className="px-3 py-3"><label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300"><input type="checkbox" checked={draft.requireApprovalForHighRisk} onChange={event => patchDraft('requireApprovalForHighRisk', event.target.checked)} disabled={!state.viewer.canManageSettings || draft.mode !== 'FULL_AUTOPILOT'} className="h-4 w-4 accent-blue-600" />Required</label></td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-4 border-t border-slate-200 p-4 dark:border-slate-800 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block"><span className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300"><span>Minimum confidence</span><span>{draft.minimumConfidence}%</span></span><input type="range" min="50" max="95" step="1" disabled={!state.viewer.canManageSettings} value={draft.minimumConfidence} onChange={event => patchDraft('minimumConfidence', Number(event.target.value))} className="mt-3 w-full accent-blue-600" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Actions per run</span><input type="number" min="1" max="20" value={draft.maxActionsPerRun} onChange={event => patchDraft('maxActionsPerRun', Number(event.target.value))} disabled={!state.viewer.canManageSettings} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Daily action limit</span><input type="number" min="1" max="200" value={draft.dailyActionLimit} onChange={event => patchDraft('dailyActionLimit', Number(event.target.value))} disabled={!state.viewer.canManageSettings} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              </div>
            </section>

            <div className="space-y-5">
              <section data-ai-tour="provider" className="rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Provider connection</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Credential state from Firebase Secret Manager.</p></div>
                <div className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-900 dark:text-white">{state.provider.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">Last test: {formatDateTime(state.provider.lastTestAt)}</p></div><Pill className={state.provider.configured ? statusClass('APPROVED') : riskClass('MEDIUM')}>{state.provider.configured ? 'Connected' : state.provider.lastTestStatus.replaceAll('_', ' ')}</Pill></div>
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">DeepSeek model</span><select value={draft.model} disabled={!state.viewer.canManageSettings} onChange={event => patchDraft('model', event.target.value as AIControlConfig['model'])} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="deepseek-v4-flash">deepseek-v4-flash</option><option value="deepseek-v4-pro">deepseek-v4-pro</option></select></label>
                  <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span>The API key is never returned to the browser or stored in Firestore.</span></div>
                  <Button variant="secondary" icon={Activity} isLoading={testing} onClick={() => void testConnection()} className="w-full">Test connection</Button>
                </div>
              </section>

              <section className="rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Autopilot readiness</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Independent gates before live automation.</p></div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {state.capabilities.unlockRequirements.map(item => <div key={item.id} className="flex items-center gap-3 px-4 py-3"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${item.satisfied ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>{item.satisfied ? <Check size={12} /> : <FileClock size={12} />}</span><span className="text-xs font-medium text-slate-700 dark:text-slate-300">{item.label}</span></div>)}
                </div>
              </section>

              <section className="rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Review limits</h2></div>
                <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <label><span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Findings per run</span><input type="number" min="5" max="50" value={draft.maxSuggestionsPerRun} onChange={event => patchDraft('maxSuggestionsPerRun', Number(event.target.value))} disabled={!state.viewer.canManageSettings} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
                  <label><span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Daily reviews</span><input type="number" min="1" max="50" value={draft.dailyRunLimit} onChange={event => patchDraft('dailyRunLimit', Number(event.target.value))} disabled={!state.viewer.canManageSettings} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
                </div>
              </section>
            </div>
          </div>

          <section className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Scheduled reviews</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">The scheduler wakes every 30 minutes and honours this interval and daily limits.</p></div><Pill className={draft.scheduledReviewsEnabled ? statusClass('APPROVED') : statusClass('DISMISSED')}>{draft.scheduledReviewsEnabled ? 'Active' : 'Off'}</Pill></div>
            <div className="grid md:grid-cols-[280px_minmax(0,1fr)]">
              <div className="border-b border-slate-200 dark:border-slate-800 md:border-b-0 md:border-r"><Toggle label="Enable schedule" detail={`Last scheduled run: ${formatDateTime(state.config.lastScheduledRunAt)}`} checked={draft.scheduledReviewsEnabled} onChange={() => patchDraft('scheduledReviewsEnabled', !draft.scheduledReviewsEnabled)} disabled={!state.viewer.canManageSettings || draft.mode === 'OFF'} /></div>
              <div className="grid gap-4 p-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                <label><span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Review interval</span><select value={draft.scheduleIntervalMinutes} onChange={event => patchDraft('scheduleIntervalMinutes', Number(event.target.value))} disabled={!state.viewer.canManageSettings} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value={30}>Every 30 minutes</option><option value={60}>Every hour</option><option value={120}>Every 2 hours</option><option value={240}>Every 4 hours</option><option value={720}>Every 12 hours</option><option value={1440}>Daily</option></select></label>
                <div><span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">Scopes</span><div className="flex flex-wrap gap-2">{reviewScopes.map(scope => { const checked = draft.scheduledScopes.includes(scope.id); return <button key={scope.id} type="button" disabled={!state.viewer.canManageSettings} onClick={() => patchDraft('scheduledScopes', checked ? draft.scheduledScopes.filter(item => item !== scope.id) : [...draft.scheduledScopes, scope.id])} className={`h-10 rounded-md border px-3 text-xs font-semibold ${checked ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{scope.label}</button>; })}</div></div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-red-200 bg-white dark:border-red-900/60 dark:bg-slate-900">
            <div className="border-b border-red-100 px-4 py-3 dark:border-red-900/50"><h2 className="text-sm font-semibold text-slate-950 dark:text-white">External communication boundary</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Email remains blocked by default and also depends on the platform-wide communication mode.</p></div>
            <div className="grid md:grid-cols-[320px_minmax(0,1fr)]">
              <div className="border-b border-red-100 dark:border-red-900/50 md:border-b-0 md:border-r"><Toggle label="Permit external communication" detail="Only Full Autopilot can enable this boundary" checked={draft.externalCommunicationEnabled} danger onChange={() => patchDraft('externalCommunicationEnabled', !draft.externalCommunicationEnabled)} disabled={!state.viewer.canManageSettings || draft.mode !== 'FULL_AUTOPILOT'} /></div>
              <div className="p-4">
                {draft.externalCommunicationEnabled && !state.config.externalCommunicationEnabled ? <><p className="text-xs leading-5 text-red-700 dark:text-red-300">Type <strong>ENABLE EXTERNAL COMMUNICATION</strong>. This does not bypass Hybrid/Beta platform communication restrictions.</p><input value={externalConfirmation} onChange={event => setExternalConfirmation(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-red-300 bg-white px-3 text-sm outline-none focus:border-red-500 dark:border-red-900 dark:bg-slate-950 dark:text-white" placeholder="External communication acknowledgement" /></> : <div className="flex items-start gap-2 text-xs leading-5 text-slate-600 dark:text-slate-300"><Info size={15} className="mt-0.5 shrink-0" /><span>Interpreter offers can send email only when both this boundary and the global communication policy explicitly permit it. Invoice drafts never send automatically.</span></div>}
              </div>
            </div>
          </section>

          <div className="sticky bottom-3 z-20 flex flex-col gap-2 rounded-md border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">Policy changes apply on the server before the next review or execution.</p>
            <Button icon={Save} isLoading={saving} onClick={() => void saveSettings()} disabled={!state.viewer.canManageSettings}>Save policy</Button>
          </div>

          <section data-ai-tour="review" className="rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Review console</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Rules create executable proposals; DeepSeek contributes analysis-only findings.</p></div><Button icon={Play} isLoading={running} onClick={() => void runReview()} disabled={draft.mode === 'OFF'}>Run {selectedScope.toLowerCase()} review</Button></div>
            <div className="grid gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-2 xl:grid-cols-6">
              {reviewScopes.map(scope => <button key={scope.id} type="button" onClick={() => setSelectedScope(scope.id)} className={`min-h-24 bg-white p-4 text-left transition-colors dark:bg-slate-900 ${selectedScope === scope.id ? 'bg-blue-50/50 shadow-[inset_0_-3px_0_#2563eb] dark:bg-blue-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}><span className="text-xs font-bold text-slate-900 dark:text-white">{scope.label}</span><span className="mt-1 block text-xs leading-4 text-slate-500 dark:text-slate-400">{scope.detail}</span></button>)}
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Action registry</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Closed server-owned allowlist. DeepSeek cannot add tools or change their risk.</p></div>
            <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800"><thead className="bg-slate-50 dark:bg-slate-950/60"><tr><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Action</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Risk</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Purpose</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Tool</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Controls</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{state.actionRegistry.map(action => <tr key={action.action}><td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-800 dark:text-slate-200">{action.action}</td><td className="px-4 py-3"><Pill className={riskClass(action.risk)}>{action.risk}</Pill></td><td className="min-w-64 px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{action.description}</td><td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300">{action.executionAvailable ? action.handler.replaceAll('_', ' ') : 'Analysis only'}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1">{action.executionAvailable && <Pill className={statusClass('APPROVED')}>Executable</Pill>}{action.reversible && <Pill className={statusClass('OBSERVED')}>Reversible</Pill>}{action.externalCommunication && <Pill className={riskClass('HIGH')}>May communicate</Pill>}</div></td></tr>)}</tbody></table></div>
          </section>
        </div>
      )}

      {activeTab === 'suggestions' && (
        <section data-ai-tour="suggestions" className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-2 border-b border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_170px_140px_150px]">
            <label className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search finding or record" className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="ALL">All statuses</option>{['PENDING', 'OBSERVED', 'APPROVED', 'QUEUED', 'EXECUTING', 'EXECUTED', 'FAILED', 'ROLLED_BACK', 'REJECTED', 'DISMISSED'].map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>
            <select value={riskFilter} onChange={event => setRiskFilter(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="ALL">All risks</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select>
            <select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="ALL">All sources</option><option value="RULE_ENGINE">Rule engine</option><option value="DEEPSEEK">DeepSeek</option></select>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full table-fixed divide-y divide-slate-200 text-left dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-950/60"><tr><th className="w-[36%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Finding</th><th className="w-[16%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Record</th><th className="w-[13%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Action</th><th className="w-[9%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Risk</th><th className="w-[9%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Confidence</th><th className="w-[12%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Status</th><th className="w-[5%] px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filteredSuggestions.map(suggestion => <tr key={suggestion.id} onDoubleClick={() => setSelectedSuggestion(suggestion)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="px-4 py-3"><div className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${suggestion.source === 'DEEPSEEK' ? 'bg-violet-500' : 'bg-blue-500'}`} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{suggestion.title}</p><p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{suggestion.reason}</p></div></div></td><td className="px-4 py-3"><p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{suggestion.entityLabel}</p><p className="mt-0.5 truncate text-[10px] uppercase text-slate-400">{suggestion.entityType.replaceAll('_', ' ')}</p></td><td className="px-4 py-3"><p className="truncate font-mono text-[10px] text-slate-600 dark:text-slate-300">{suggestion.action}</p>{suggestion.executionAvailable && <span className="mt-1 block text-[10px] font-semibold text-blue-600">Executable</span>}</td><td className="px-4 py-3"><Pill className={riskClass(suggestion.risk)}>{suggestion.risk}</Pill></td><td className="px-4 py-3"><span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{suggestion.confidence}%</span></td><td className="px-4 py-3"><Pill className={statusClass(suggestion.status)}>{suggestion.status}</Pill></td><td className="px-4 py-3 text-right"><button type="button" title="Open finding" onClick={() => setSelectedSuggestion(suggestion)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-700"><ChevronRight size={17} /></button></td></tr>)}</tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">{filteredSuggestions.map(suggestion => <button key={suggestion.id} type="button" onClick={() => setSelectedSuggestion(suggestion)} className="block w-full p-4 text-left"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-950 dark:text-white">{suggestion.title}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{suggestion.entityLabel}</p></div><ChevronRight size={17} className="mt-0.5 shrink-0 text-slate-400" /></div><div className="mt-3 flex flex-wrap gap-2"><Pill className={riskClass(suggestion.risk)}>{suggestion.risk}</Pill><Pill className={statusClass(suggestion.status)}>{suggestion.status}</Pill><span className="text-xs font-semibold text-slate-500">{suggestion.confidence}%</span></div></button>)}</div>

          {filteredSuggestions.length === 0 && <div className="px-6 py-16 text-center"><Eye size={28} className="mx-auto text-slate-300 dark:text-slate-700" /><p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">No findings match these filters</p></div>}
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800"><span>{filteredSuggestions.length} visible</span><span>{state.counts.pending} awaiting review</span></div>
        </section>
      )}

      {activeTab === 'executions' && (
        <section data-ai-tour="executions" className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Execution ledger</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Idempotent actions, simulations, outcome checks and rollback state.</p></div><Button variant="secondary" icon={CheckCircle2} isLoading={verifying} onClick={() => void verifyOutcomes()}>Verify outcomes</Button></div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-950/60"><tr><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Created</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Action / record</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Mode</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Status</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Outcome</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Boundary</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{state.executions.map(execution => <tr key={execution.id} onDoubleClick={() => setSelectedExecution(execution)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{formatDateTime(execution.createdAt)}</td><td className="min-w-56 px-4 py-3"><p className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{execution.action}</p><p className="mt-0.5 text-[10px] text-slate-500">{execution.entityType} - {execution.entityId}</p>{execution.error && <p className="mt-1 max-w-md text-xs text-red-600 dark:text-red-300">{execution.error}</p>}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{execution.mode.replaceAll('_', ' ')}{execution.simulationOnly && <span className="mt-1 block font-semibold text-violet-600">Simulation</span>}</td><td className="px-4 py-3"><Pill className={statusClass(execution.status)}>{execution.status}</Pill></td><td className="px-4 py-3"><Pill className={statusClass(execution.outcomeStatus)}>{execution.outcomeStatus.replaceAll('_', ' ')}</Pill></td><td className="px-4 py-3"><span className={`text-xs font-semibold ${execution.externalCommunicationAttempted ? 'text-red-600' : 'text-emerald-600'}`}>{execution.externalCommunicationAttempted ? 'External attempted' : 'Internal only'}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-1">{execution.rollbackAvailable && execution.status === 'SUCCEEDED' && <Button size="sm" variant="secondary" icon={RotateCcw} isLoading={rollingBackId === execution.id} onClick={event => { event.stopPropagation(); void rollbackExecution(execution); }} disabled={!state.viewer.canManageSettings}>Rollback</Button>}<button type="button" title="Open execution" onClick={() => setSelectedExecution(execution)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-700"><ChevronRight size={17} /></button></div></td></tr>)}</tbody>
            </table>
          </div>
          {state.executions.length === 0 && <div className="px-6 py-16 text-center"><Workflow size={28} className="mx-auto text-slate-300 dark:text-slate-700" /><p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">No actions have been executed or simulated yet.</p></div>}
        </section>
      )}

      {activeTab === 'runs' && (
        <section data-ai-tour="runs" className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left dark:divide-slate-800"><thead className="bg-slate-50 dark:bg-slate-950/60"><tr><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Started</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Scope</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Mode</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Provider</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Findings</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Result</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{state.runs.map(run => <tr key={run.id}><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{formatDateTime(run.createdAt)}</td><td className="px-4 py-3 text-xs font-semibold text-slate-900 dark:text-white">{run.scope}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{run.mode.replaceAll('_', ' ')}</td><td className="px-4 py-3"><Pill className={statusClass(run.providerStatus || 'PENDING')}>{(run.providerStatus || 'PENDING').replaceAll('_', ' ')}</Pill></td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{Number(run.createdSuggestionCount || 0) + Number(run.promotedSuggestionCount || 0)}</td><td className="px-4 py-3"><Pill className={statusClass(run.status)}>{run.status}</Pill></td></tr>)}</tbody></table></div>
          {state.runs.length === 0 && <div className="px-6 py-16 text-center text-sm text-slate-500">No AI reviews have run yet.</div>}
        </section>
      )}

      {activeTab === 'audit' && (
        <section data-ai-tour="audit" className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left dark:divide-slate-800"><thead className="bg-slate-50 dark:bg-slate-950/60"><tr><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Timestamp</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Event</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Scope</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Role</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Approval</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Boundaries</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Result</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{state.auditEvents.map(event => <tr key={event.id}><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{formatDateTime(event.createdAt)}</td><td className="px-4 py-3"><p className="whitespace-nowrap text-xs font-semibold text-slate-900 dark:text-white">{event.eventType.replaceAll('_', ' ')}</p><p className="mt-0.5 text-[10px] text-slate-400">{event.entityType || 'SYSTEM'}{event.entityId ? ` - ${event.entityId}` : ''}</p></td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{event.scope || 'SYSTEM'}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{event.actorRole}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{event.approvalStatus.replaceAll('_', ' ')}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1">{event.executionAttempted && <Pill className={statusClass('OBSERVED')}>Execution</Pill>}{event.externalCommunicationAttempted && <Pill className={riskClass('HIGH')}>External comm</Pill>}{!event.executionAttempted && !event.externalCommunicationAttempted && <span className="text-xs text-slate-500">No side effect</span>}</div></td><td className="px-4 py-3"><Pill className={statusClass(event.result)}>{event.result}</Pill></td></tr>)}</tbody></table></div>
          {state.auditEvents.length === 0 && <div className="px-6 py-16 text-center text-sm text-slate-500">No AI audit events have been recorded.</div>}
        </section>
      )}

      {selectedSuggestion && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedSuggestion(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="ai-suggestion-title" className="max-h-[96dvh] w-full overflow-y-auto rounded-t-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-w-3xl sm:rounded-lg">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-5"><div className="min-w-0"><div className="mb-2 flex flex-wrap gap-2"><Pill className={riskClass(selectedSuggestion.risk)}>{selectedSuggestion.risk} risk</Pill><Pill className={statusClass(selectedSuggestion.status)}>{selectedSuggestion.status}</Pill><Pill className={selectedSuggestion.source === 'DEEPSEEK' ? 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300' : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'}>{selectedSuggestion.source.replaceAll('_', ' ')}</Pill></div><h2 id="ai-suggestion-title" className="text-lg font-semibold text-slate-950 dark:text-white">{selectedSuggestion.title}</h2><p className="mt-1 text-xs text-slate-500">{selectedSuggestion.entityLabel} - {selectedSuggestion.confidence}% confidence</p></div><button type="button" title="Close" onClick={() => setSelectedSuggestion(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={19} /></button></div>
            <div className="space-y-5 p-4 sm:p-5">
              <div className="grid gap-5 sm:grid-cols-2"><div><p className="text-[10px] font-bold uppercase text-slate-400">Reason</p><p className="mt-1.5 text-sm leading-6 text-slate-700 dark:text-slate-200">{selectedSuggestion.reason}</p></div><div><p className="text-[10px] font-bold uppercase text-slate-400">Expected benefit</p><p className="mt-1.5 text-sm leading-6 text-slate-700 dark:text-slate-200">{selectedSuggestion.expectedBenefit}</p></div></div>
              <div className="grid gap-5 border-y border-slate-200 py-5 dark:border-slate-800 sm:grid-cols-2"><div><p className="text-[10px] font-bold uppercase text-slate-400">Evidence</p><ul className="mt-2 space-y-2">{selectedSuggestion.evidence.length ? selectedSuggestion.evidence.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />{item}</li>) : <li className="text-xs text-slate-500">No additional evidence listed.</li>}</ul></div><div><p className="text-[10px] font-bold uppercase text-slate-400">Data used</p><div className="mt-2 flex flex-wrap gap-2">{selectedSuggestion.dataUsed.map(item => <span key={item} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item}</span>)}</div></div></div>

              {selectedSuggestion.executionAvailable && <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase text-slate-400">Proposed tool</p><p className="mt-1 font-mono text-xs font-semibold text-slate-900 dark:text-white">{selectedSuggestion.executionHandler || selectedSuggestion.action}</p></div><Pill className={selectedSuggestion.rollbackAvailable ? statusClass('OBSERVED') : riskClass('MEDIUM')}>{selectedSuggestion.rollbackAvailable ? 'Reversible' : 'No rollback'}</Pill></div>{selectedSuggestion.proposedParameters && <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">{JSON.stringify(selectedSuggestion.proposedParameters, null, 2)}</pre>}</div>}

              {selectedSuggestion.entityType !== 'SYSTEM' && <Button variant="secondary" icon={ExternalLink} onClick={() => openEntity(selectedSuggestion)}>Open source record</Button>}

              {selectedSuggestion.status === 'PENDING' && <div className="rounded-md border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/60 dark:bg-blue-950/20"><div className="flex items-start gap-2"><Info size={16} className="mt-0.5 shrink-0 text-blue-600" /><p className="text-xs leading-5 text-blue-800 dark:text-blue-200">{canExecuteSelected ? `Approval will ${state.config.simulationOnly ? 'simulate' : 'execute'} this allowlisted tool under the current server policy.` : 'Approval records the human decision. Execution remains blocked until an execution mode and engine are enabled.'}</p></div><textarea value={reviewNote} onChange={event => setReviewNote(event.target.value)} maxLength={500} placeholder="Review note (optional)" className="mt-3 min-h-20 w-full resize-y rounded-md border border-blue-200 bg-white p-3 text-sm outline-none focus:border-blue-500 dark:border-blue-900 dark:bg-slate-950 dark:text-white" /><div className="mt-3 grid gap-2 sm:grid-cols-3"><Button icon={ThumbsUp} isLoading={reviewingId === selectedSuggestion.id} onClick={() => void reviewSuggestion(selectedSuggestion, 'APPROVE')}>{canExecuteSelected ? (state.config.simulationOnly ? 'Approve & simulate' : 'Approve & execute') : 'Approve finding'}</Button><Button variant="secondary" icon={ThumbsDown} disabled={reviewingId === selectedSuggestion.id} onClick={() => void reviewSuggestion(selectedSuggestion, 'REJECT')}>Reject</Button><Button variant="ghost" icon={XCircle} disabled={reviewingId === selectedSuggestion.id} onClick={() => void reviewSuggestion(selectedSuggestion, 'DISMISS')}>Dismiss</Button></div></div>}

              {selectedSuggestion.executionAvailable && ['APPROVED', 'FAILED'].includes(selectedSuggestion.status) && <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" /><p className="text-xs leading-5 text-amber-900 dark:text-amber-200">This action will be checked again against the current mode, confidence, pause state, daily limit and idempotency key.</p></div><Button icon={Play} isLoading={executingId === selectedSuggestion.id} onClick={() => void executeSuggestion(selectedSuggestion)}>{state.config.simulationOnly ? 'Simulate action' : 'Execute action'}</Button></div>}

              <div><p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Learning feedback</p><div className="mt-2 grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)_auto]"><select value={feedbackReason} onChange={event => setFeedbackReason(event.target.value as typeof feedbackReason)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="USEFUL">Useful</option><option value="WRONG">Wrong</option><option value="TOO_RISKY">Too risky</option><option value="MISSING_CONTEXT">Missing context</option><option value="GOOD_NOT_NOW">Good, not now</option><option value="SHOULD_BECOME_RULE">Should become a rule</option></select><input value={feedbackComment} onChange={event => setFeedbackComment(event.target.value)} maxLength={500} placeholder="Feedback detail (optional)" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><Button variant="secondary" icon={BrainCircuit} isLoading={reviewingId === selectedSuggestion.id} onClick={() => void submitFeedback(selectedSuggestion)}>Submit</Button></div>{selectedSuggestion.latestFeedback && <p className="mt-2 text-xs text-slate-500">Latest: {selectedSuggestion.latestFeedback.reason.replaceAll('_', ' ')} - {formatDateTime(selectedSuggestion.latestFeedback.submittedAt)}</p>}</div>
            </div>
          </div>
        </div>
      )}

      {selectedExecution && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedExecution(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="ai-execution-title" className="max-h-[96dvh] w-full overflow-y-auto rounded-t-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-w-4xl sm:rounded-lg">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-5">
              <div className="min-w-0"><div className="mb-2 flex flex-wrap gap-2"><Pill className={statusClass(selectedExecution.status)}>{selectedExecution.status}</Pill><Pill className={riskClass(selectedExecution.risk)}>{selectedExecution.risk} risk</Pill><Pill className={statusClass(selectedExecution.outcomeStatus)}>{selectedExecution.outcomeStatus.replaceAll('_', ' ')}</Pill></div><h2 id="ai-execution-title" className="font-mono text-base font-semibold text-slate-950 dark:text-white">{selectedExecution.action}</h2><p className="mt-1 text-xs text-slate-500">{selectedExecution.entityType} - {selectedExecution.entityId}</p></div>
              <button type="button" title="Close" onClick={() => setSelectedExecution(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={19} /></button>
            </div>
            <div className="space-y-5 p-4 sm:p-5">
              <div className="grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-2 lg:grid-cols-4">
                {[['Mode', selectedExecution.mode.replaceAll('_', ' ')], ['Created', formatDateTime(selectedExecution.createdAt)], ['Completed', formatDateTime(selectedExecution.completedAt || selectedExecution.rolledBackAt)], ['Communication', selectedExecution.externalCommunicationAttempted ? 'External attempted' : 'Internal only']].map(([label, value]) => <div key={label} className="bg-white p-3 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase text-slate-400">{label}</p><p className="mt-1 text-xs font-semibold text-slate-800 dark:text-slate-200">{value}</p></div>)}
              </div>
              {selectedExecution.error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">{selectedExecution.error}</div>}
              <div className="grid gap-4 lg:grid-cols-2">
                <div><p className="mb-2 text-[10px] font-bold uppercase text-slate-400">Parameters</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">{JSON.stringify(selectedExecution.parameters || {}, null, 2)}</pre></div>
                <div><p className="mb-2 text-[10px] font-bold uppercase text-slate-400">Result</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">{JSON.stringify(selectedExecution.resultSummary || {}, null, 2)}</pre></div>
              </div>
              {!selectedExecution.simulationOnly && (selectedExecution.beforeSnapshot || selectedExecution.afterSnapshot) && <details className="rounded-md border border-slate-200 dark:border-slate-800"><summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200">Recorded before and after state</summary><div className="grid gap-3 border-t border-slate-200 p-3 dark:border-slate-800 lg:grid-cols-2"><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">{JSON.stringify(selectedExecution.beforeSnapshot || {}, null, 2)}</pre><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">{JSON.stringify(selectedExecution.afterSnapshot || {}, null, 2)}</pre></div></details>}
              <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setSelectedExecution(null)}>Close</Button>{selectedExecution.rollbackAvailable && selectedExecution.status === 'SUCCEEDED' && <Button variant="danger" icon={RotateCcw} isLoading={rollingBackId === selectedExecution.id} onClick={() => void rollbackExecution(selectedExecution)} disabled={!state.viewer.canManageSettings}>Rollback execution</Button>}</div>
            </div>
          </div>
        </div>
      )}

      <AIControlManual open={manualOpen && tourStep === null} onClose={() => setManualOpen(false)} onStartTour={startTour} />
      <AIControlTour
        stepIndex={tourStep}
        activeTab={activeTab as AIControlGuideTab}
        onTabChange={setTab}
        onBack={() => setTourStep(current => current === null ? null : Math.max(0, current - 1))}
        onNext={advanceTour}
        onClose={() => closeTour(false)}
      />
    </div>
  );
};
