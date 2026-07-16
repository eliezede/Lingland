import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
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
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
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
  AIMode,
  AIReviewScope,
  AISuggestion,
} from '../../../services/aiControlService';

type ControlTab = AIControlGuideTab;

const tabs: Array<{ id: ControlTab; label: string; icon: React.ElementType }> = [
  { id: 'control', label: 'Control', icon: Gauge },
  { id: 'suggestions', label: 'Suggestions', icon: Sparkles },
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
  if (status === 'APPROVED') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (status === 'PENDING') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-300';
  if (status === 'REJECTED') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300';
  if (status === 'DISMISSED') return 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/70 dark:bg-violet-950/40 dark:text-violet-300';
};

const Pill = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-normal ${className}`}>
    {children}
  </span>
);

const SafetyState = ({ state }: { state: AIControlState }) => (
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
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"><CirclePause size={18} /></div>
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase text-slate-400">Execution</p><p className="truncate text-sm font-semibold text-slate-950 dark:text-white">Disabled</p></div>
    </div>
    <div className="flex min-h-20 items-center gap-3 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"><ShieldCheck size={18} /></div>
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase text-slate-400">External comms</p><p className="truncate text-sm font-semibold text-slate-950 dark:text-white">Blocked</p></div>
    </div>
  </section>
);

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
  const [selectedScope, setSelectedScope] = useState<AIReviewScope>('JOBS');
  const [selectedSuggestion, setSelectedSuggestion] = useState<AISuggestion | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [reviewNote, setReviewNote] = useState('');
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

  const saveSettings = async () => {
    if (!draft || !state) return;
    setSaving(true);
    try {
      await AIControlService.updateSettings({
        mode: draft.mode,
        model: draft.model,
        emergencyPaused: draft.emergencyPaused,
        minimumConfidence: draft.minimumConfidence,
        maxSuggestionsPerRun: draft.maxSuggestionsPerRun,
        dailyRunLimit: draft.dailyRunLimit,
      });
      showToast('AI control settings saved', 'success');
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
      const providerNote = result.providerStatus === 'NOT_CONFIGURED' ? ' Local rules completed; DeepSeek was not configured.' : '';
      showToast(`${result.createdCount} finding(s) created, ${result.promotedCount} promoted.${providerNote}`, result.createdCount || result.promotedCount ? 'success' : 'info');
      await loadState(true);
      setTab('suggestions');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setRunning(false);
    }
  };

  const reviewSuggestion = async (suggestion: AISuggestion, decision: 'APPROVE' | 'REJECT' | 'DISMISS') => {
    setReviewingId(suggestion.id);
    try {
      await AIControlService.reviewSuggestion(suggestion.id, decision, reviewNote);
      showToast(decision === 'APPROVE' ? 'Suggestion approved for record only; no action was executed' : 'Suggestion review recorded', 'success');
      setReviewNote('');
      await loadState(true);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setReviewingId(null);
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

  return (
    <div className="min-w-0">
      <PageHeader title="AI Control Center" subtitle="Controlled operational intelligence with human review, minimized data and an immutable decision trail.">
        <AIControlHelpButton onClick={() => { setSelectedSuggestion(null); setTourStep(null); setManualOpen(true); }} />
        <Button variant="secondary" icon={RefreshCw} onClick={() => void loadState()} disabled={loading}>Refresh</Button>
      </PageHeader>

      <SafetyState state={state} />

      <div data-ai-tour="sections" className="mb-5 flex overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="AI Control sections">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const badge = tab.id === 'suggestions' ? state.counts.pending + state.counts.observed : undefined;
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
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
            <section data-ai-tour="guardrails" className="rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Operating guardrails</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Server-enforced policy for analysis and review.</p></div>
                <Pill className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">No execution</Pill>
              </div>
              <div className="space-y-5 p-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">Operating mode</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(['OFF', 'READ_ONLY_AUDIT', 'SUGGEST'] as AIMode[]).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        disabled={!state.viewer.canManageSettings}
                        onClick={() => setDraft(current => current ? { ...current, mode } : current)}
                        className={`min-h-10 rounded-md border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${draft.mode === mode ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}
                      >{mode.replaceAll('_', ' ')}</button>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {['ASSISTED', 'CONTROLLED AUTOPILOT', 'FULL AUTOPILOT'].map(mode => (
                      <div key={mode} className="flex min-h-9 items-center justify-between rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"><span>{mode}</span><ShieldCheck size={13} /></div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">DeepSeek model</span><select value={draft.model} disabled={!state.viewer.canManageSettings} onChange={event => setDraft(current => current ? { ...current, model: event.target.value as AIControlConfig['model'] } : current)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="deepseek-v4-flash">deepseek-v4-flash</option><option value="deepseek-v4-pro">deepseek-v4-pro</option></select></label>
                  <div className="flex items-end"><button type="button" role="switch" aria-checked={draft.emergencyPaused} disabled={!state.viewer.canManageSettings} onClick={() => setDraft(current => current ? { ...current, emergencyPaused: !current.emergencyPaused } : current)} className="flex h-10 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"><span>Emergency pause</span><span className={`relative h-5 w-9 shrink-0 overflow-hidden rounded-full transition-colors ${draft.emergencyPaused ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-700'}`}><span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${draft.emergencyPaused ? 'translate-x-[18px]' : 'translate-x-0.5'}`} /></span></button></div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block"><span className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300"><span>Minimum confidence</span><span>{draft.minimumConfidence}%</span></span><input type="range" min="50" max="95" step="1" disabled={!state.viewer.canManageSettings} value={draft.minimumConfidence} onChange={event => setDraft(current => current ? { ...current, minimumConfidence: Number(event.target.value) } : current)} className="mt-3 w-full accent-blue-600" /></label>
                  <label className="block"><span className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300"><span>Findings per run</span><span>{draft.maxSuggestionsPerRun}</span></span><input type="range" min="5" max="50" step="5" disabled={!state.viewer.canManageSettings} value={draft.maxSuggestionsPerRun} onChange={event => setDraft(current => current ? { ...current, maxSuggestionsPerRun: Number(event.target.value) } : current)} className="mt-3 w-full accent-blue-600" /></label>
                  <label className="block"><span className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300"><span>Daily run limit</span><span>{draft.dailyRunLimit}</span></span><input type="range" min="1" max="50" step="1" disabled={!state.viewer.canManageSettings} value={draft.dailyRunLimit} onChange={event => setDraft(current => current ? { ...current, dailyRunLimit: Number(event.target.value) } : current)} className="mt-3 w-full accent-blue-600" /></label>
                </div>

                <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Execution and external communication remain false regardless of browser input.</p>
                  <Button icon={Save} isLoading={saving} onClick={() => void saveSettings()} disabled={!state.viewer.canManageSettings}>Save policy</Button>
                </div>
              </div>
            </section>

            <div className="space-y-5">
              <section data-ai-tour="provider" className="rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Provider connection</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Credential state from Firebase Secret Manager.</p></div>
                <div className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-900 dark:text-white">{state.provider.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">Last test: {formatDateTime(state.provider.lastTestAt)}</p></div><Pill className={state.provider.configured ? statusClass('APPROVED') : riskClass('MEDIUM')}>{state.provider.configured ? 'Connected' : state.provider.lastTestStatus.replaceAll('_', ' ')}</Pill></div>
                  <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span>The API key is never returned to the browser or stored in Firestore.</span></div>
                  <Button variant="secondary" icon={Activity} isLoading={testing} onClick={() => void testConnection()} className="w-full">Test connection</Button>
                </div>
              </section>

              <section className="rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Autopilot readiness</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Advanced modes remain server-locked.</p></div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {state.capabilities.unlockRequirements.map(item => <div key={item.id} className="flex items-center gap-3 px-4 py-3"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${item.satisfied ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>{item.satisfied ? <Check size={12} /> : <FileClock size={12} />}</span><span className="text-xs font-medium text-slate-700 dark:text-slate-300">{item.label}</span></div>)}
                </div>
              </section>
            </div>
          </div>

          <section data-ai-tour="review" className="rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Review console</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">On-demand, read-only operational analysis.</p></div><Button icon={Play} isLoading={running} onClick={() => void runReview()} disabled={draft.mode === 'OFF'}>Run {selectedScope.toLowerCase()} review</Button></div>
            <div className="grid gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-2 xl:grid-cols-6">
              {reviewScopes.map(scope => <button key={scope.id} type="button" onClick={() => setSelectedScope(scope.id)} className={`min-h-24 bg-white p-4 text-left transition-colors dark:bg-slate-900 ${selectedScope === scope.id ? 'shadow-[inset_0_-3px_0_#2563eb] bg-blue-50/50 dark:bg-blue-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}><span className="text-xs font-bold text-slate-900 dark:text-white">{scope.label}</span><span className="mt-1 block text-xs leading-4 text-slate-500 dark:text-slate-400">{scope.detail}</span></button>)}
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="text-sm font-semibold text-slate-950 dark:text-white">Action registry</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Server-owned allowlist for the current release.</p></div>
            <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800"><thead className="bg-slate-50 dark:bg-slate-950/60"><tr><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Action</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Risk</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Purpose</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Execution</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{state.actionRegistry.map(action => <tr key={action.action}><td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-800 dark:text-slate-200">{action.action}</td><td className="px-4 py-3"><Pill className={riskClass(action.risk)}>{action.risk}</Pill></td><td className="min-w-64 px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{action.description}</td><td className="px-4 py-3 text-xs font-semibold text-slate-500">Blocked</td></tr>)}</tbody></table></div>
          </section>
        </div>
      )}

      {activeTab === 'suggestions' && (
        <section data-ai-tour="suggestions" className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-2 border-b border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_160px_140px_150px]">
            <label className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search finding or record" className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="OBSERVED">Observed</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="DISMISSED">Dismissed</option></select>
            <select value={riskFilter} onChange={event => setRiskFilter(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="ALL">All risks</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select>
            <select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="ALL">All sources</option><option value="RULE_ENGINE">Rule engine</option><option value="DEEPSEEK">DeepSeek</option></select>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full table-fixed divide-y divide-slate-200 text-left dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-950/60"><tr><th className="w-[42%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Finding</th><th className="w-[16%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Record</th><th className="w-[10%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Risk</th><th className="w-[10%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Confidence</th><th className="w-[12%] px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Status</th><th className="w-[10%] px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filteredSuggestions.map(suggestion => <tr key={suggestion.id} onDoubleClick={() => setSelectedSuggestion(suggestion)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="px-4 py-3"><div className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${suggestion.source === 'DEEPSEEK' ? 'bg-violet-500' : 'bg-blue-500'}`} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{suggestion.title}</p><p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{suggestion.reason}</p></div></div></td><td className="px-4 py-3"><p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{suggestion.entityLabel}</p><p className="mt-0.5 truncate text-[10px] uppercase text-slate-400">{suggestion.entityType.replaceAll('_', ' ')}</p></td><td className="px-4 py-3"><Pill className={riskClass(suggestion.risk)}>{suggestion.risk}</Pill></td><td className="px-4 py-3"><span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{suggestion.confidence}%</span></td><td className="px-4 py-3"><Pill className={statusClass(suggestion.status)}>{suggestion.status}</Pill></td><td className="px-4 py-3 text-right"><button type="button" title="Open finding" onClick={() => setSelectedSuggestion(suggestion)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-700"><ChevronRight size={17} /></button></td></tr>)}</tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">{filteredSuggestions.map(suggestion => <button key={suggestion.id} type="button" onClick={() => setSelectedSuggestion(suggestion)} className="block w-full p-4 text-left"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-950 dark:text-white">{suggestion.title}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{suggestion.entityLabel}</p></div><ChevronRight size={17} className="mt-0.5 shrink-0 text-slate-400" /></div><div className="mt-3 flex flex-wrap gap-2"><Pill className={riskClass(suggestion.risk)}>{suggestion.risk}</Pill><Pill className={statusClass(suggestion.status)}>{suggestion.status}</Pill><span className="text-xs font-semibold text-slate-500">{suggestion.confidence}%</span></div></button>)}</div>

          {filteredSuggestions.length === 0 && <div className="px-6 py-16 text-center"><Eye size={28} className="mx-auto text-slate-300 dark:text-slate-700" /><p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">No findings match these filters</p></div>}
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800"><span>{filteredSuggestions.length} visible</span><span>{state.counts.pending} awaiting review</span></div>
        </section>
      )}

      {activeTab === 'runs' && (
        <section data-ai-tour="runs" className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left dark:divide-slate-800"><thead className="bg-slate-50 dark:bg-slate-950/60"><tr><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Started</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Scope</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Mode</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Provider</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Findings</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Result</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{state.runs.map(run => <tr key={run.id}><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{formatDateTime(run.createdAt)}</td><td className="px-4 py-3 text-xs font-semibold text-slate-900 dark:text-white">{run.scope}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{run.mode.replaceAll('_', ' ')}</td><td className="px-4 py-3"><Pill className={run.providerStatus === 'CONNECTED' ? statusClass('APPROVED') : run.providerStatus === 'ERROR' ? riskClass('HIGH') : statusClass('OBSERVED')}>{(run.providerStatus || 'PENDING').replaceAll('_', ' ')}</Pill></td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{Number(run.createdSuggestionCount || 0) + Number(run.promotedSuggestionCount || 0)}</td><td className="px-4 py-3"><Pill className={run.status === 'COMPLETED' ? statusClass('APPROVED') : run.status === 'FAILED' ? riskClass('HIGH') : statusClass('PENDING')}>{run.status}</Pill></td></tr>)}</tbody></table></div>
          {state.runs.length === 0 && <div className="px-6 py-16 text-center text-sm text-slate-500">No AI reviews have run yet.</div>}
        </section>
      )}

      {activeTab === 'audit' && (
        <section data-ai-tour="audit" className="overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left dark:divide-slate-800"><thead className="bg-slate-50 dark:bg-slate-950/60"><tr><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Timestamp</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Event</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Scope</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Role</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Approval</th><th className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">Result</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{state.auditEvents.map(event => <tr key={event.id}><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{formatDateTime(event.createdAt)}</td><td className="px-4 py-3"><p className="whitespace-nowrap text-xs font-semibold text-slate-900 dark:text-white">{event.eventType.replaceAll('_', ' ')}</p><p className="mt-0.5 text-[10px] text-slate-400">No execution · no external communication</p></td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{event.scope || 'SYSTEM'}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{event.actorRole}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{event.approvalStatus.replaceAll('_', ' ')}</td><td className="px-4 py-3"><Pill className={event.result === 'ERROR' ? riskClass('HIGH') : statusClass('APPROVED')}>{event.result}</Pill></td></tr>)}</tbody></table></div>
          {state.auditEvents.length === 0 && <div className="px-6 py-16 text-center text-sm text-slate-500">No AI audit events have been recorded.</div>}
        </section>
      )}

      {selectedSuggestion && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedSuggestion(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="ai-suggestion-title" className="max-h-[96dvh] w-full overflow-y-auto rounded-t-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-w-3xl sm:rounded-lg">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-5"><div className="min-w-0"><div className="mb-2 flex flex-wrap gap-2"><Pill className={riskClass(selectedSuggestion.risk)}>{selectedSuggestion.risk} risk</Pill><Pill className={statusClass(selectedSuggestion.status)}>{selectedSuggestion.status}</Pill><Pill className={selectedSuggestion.source === 'DEEPSEEK' ? 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300' : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'}>{selectedSuggestion.source.replaceAll('_', ' ')}</Pill></div><h2 id="ai-suggestion-title" className="text-lg font-semibold text-slate-950 dark:text-white">{selectedSuggestion.title}</h2><p className="mt-1 text-xs text-slate-500">{selectedSuggestion.entityLabel} · {selectedSuggestion.confidence}% confidence</p></div><button type="button" title="Close" onClick={() => setSelectedSuggestion(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={19} /></button></div>
            <div className="space-y-5 p-4 sm:p-5">
              <div className="grid gap-5 sm:grid-cols-2"><div><p className="text-[10px] font-bold uppercase text-slate-400">Reason</p><p className="mt-1.5 text-sm leading-6 text-slate-700 dark:text-slate-200">{selectedSuggestion.reason}</p></div><div><p className="text-[10px] font-bold uppercase text-slate-400">Expected benefit</p><p className="mt-1.5 text-sm leading-6 text-slate-700 dark:text-slate-200">{selectedSuggestion.expectedBenefit}</p></div></div>
              <div className="grid gap-5 border-y border-slate-200 py-5 dark:border-slate-800 sm:grid-cols-2"><div><p className="text-[10px] font-bold uppercase text-slate-400">Evidence</p><ul className="mt-2 space-y-2">{selectedSuggestion.evidence.length ? selectedSuggestion.evidence.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />{item}</li>) : <li className="text-xs text-slate-500">No additional evidence listed.</li>}</ul></div><div><p className="text-[10px] font-bold uppercase text-slate-400">Data used</p><div className="mt-2 flex flex-wrap gap-2">{selectedSuggestion.dataUsed.map(item => <span key={item} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item}</span>)}</div></div></div>

              {selectedSuggestion.entityType !== 'SYSTEM' && <Button variant="secondary" icon={ExternalLink} onClick={() => openEntity(selectedSuggestion)}>Open source record</Button>}

              {selectedSuggestion.status === 'PENDING' && <div className="rounded-md border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/60 dark:bg-blue-950/20"><div className="flex items-start gap-2"><Info size={16} className="mt-0.5 shrink-0 text-blue-600" /><p className="text-xs leading-5 text-blue-800 dark:text-blue-200">Approval records a human decision only. It does not modify records, assign professionals, issue invoices or send communications.</p></div><textarea value={reviewNote} onChange={event => setReviewNote(event.target.value)} maxLength={500} placeholder="Review note (optional)" className="mt-3 min-h-20 w-full resize-y rounded-md border border-blue-200 bg-white p-3 text-sm outline-none focus:border-blue-500 dark:border-blue-900 dark:bg-slate-950 dark:text-white" /><div className="mt-3 grid gap-2 sm:grid-cols-3"><Button icon={ThumbsUp} isLoading={reviewingId === selectedSuggestion.id} onClick={() => void reviewSuggestion(selectedSuggestion, 'APPROVE')}>Approve record</Button><Button variant="secondary" icon={ThumbsDown} disabled={reviewingId === selectedSuggestion.id} onClick={() => void reviewSuggestion(selectedSuggestion, 'REJECT')}>Reject</Button><Button variant="ghost" icon={XCircle} disabled={reviewingId === selectedSuggestion.id} onClick={() => void reviewSuggestion(selectedSuggestion, 'DISMISS')}>Dismiss</Button></div></div>}

              <div><p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Learning feedback</p><div className="mt-2 grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)_auto]"><select value={feedbackReason} onChange={event => setFeedbackReason(event.target.value as typeof feedbackReason)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="USEFUL">Useful</option><option value="WRONG">Wrong</option><option value="TOO_RISKY">Too risky</option><option value="MISSING_CONTEXT">Missing context</option><option value="GOOD_NOT_NOW">Good, not now</option><option value="SHOULD_BECOME_RULE">Should become a rule</option></select><input value={feedbackComment} onChange={event => setFeedbackComment(event.target.value)} maxLength={500} placeholder="Feedback detail (optional)" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><Button variant="secondary" icon={BrainCircuit} isLoading={reviewingId === selectedSuggestion.id} onClick={() => void submitFeedback(selectedSuggestion)}>Submit</Button></div>{selectedSuggestion.latestFeedback && <p className="mt-2 text-xs text-slate-500">Latest: {selectedSuggestion.latestFeedback.reason.replaceAll('_', ' ')} · {formatDateTime(selectedSuggestion.latestFeedback.submittedAt)}</p>}</div>
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
