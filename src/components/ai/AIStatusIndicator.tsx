import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  Bot,
  ChevronRight,
  CirclePause,
  ExternalLink,
  RefreshCw,
  Settings,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAIControl } from '../../context/AIControlContext';
import { AIControlService } from '../../services/aiControlService';
import { AIActivityItem, buildAIActivity, deriveAIPresence } from '../../pages/admin/ai/aiPresentation';
import { useToast } from '../../context/ToastContext';

const toneClasses = {
  neutral: 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  working: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300',
  attention: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
  danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300',
};

const dotClasses = {
  neutral: 'bg-slate-400',
  working: 'bg-blue-600 animate-pulse',
  attention: 'bg-amber-500',
  danger: 'bg-red-500',
};

const statusTone = (status: string) => {
  if (['FAILED', 'ROLLBACK_FAILED', 'DRIFTED'].includes(status)) return 'text-red-600 dark:text-red-300';
  if (['RUNNING', 'QUEUED', 'EXECUTING', 'PENDING'].includes(status)) return 'text-blue-600 dark:text-blue-300';
  if (['SUCCEEDED', 'COMPLETED', 'VERIFIED', 'EXECUTED'].includes(status)) return 'text-emerald-600 dark:text-emerald-300';
  return 'text-slate-500 dark:text-slate-400';
};

const formatTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

export const AIStatusIndicator = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { state, loading, refreshing, error, lastUpdatedAt, refresh } = useAIControl();
  const [open, setOpen] = useState(false);
  const [pausing, setPausing] = useState(false);
  const presence = useMemo(() => deriveAIPresence(state, error), [error, state]);
  const activity = useMemo(() => state ? buildAIActivity(state, 7) : [], [state]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const goTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const activityPath = (item: AIActivityItem) => {
    const id = encodeURIComponent(item.sourceId);
    if (item.kind === 'FINDING') {
      const view = ['PENDING', 'FAILED'].includes(item.status) ? 'attention' : 'insights';
      return `/admin/ai-command/${view}?finding=${id}`;
    }
    if (item.kind === 'EXECUTION') return `/admin/ai-command/activity?execution=${id}`;
    return `/admin/ai-command/activity?run=${id}`;
  };

  const pauseAI = async () => {
    if (!state || state.config.emergencyPaused) return;
    setPausing(true);
    try {
      await AIControlService.updateSettings({ emergencyPaused: true });
      await refresh(true);
      showToast('AI execution paused. Reviews and audit history remain available.', 'success');
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'Could not pause AI execution.', 'error');
    } finally {
      setPausing(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${presence.label}. Open AI activity`}
        title={`${presence.label}: ${presence.detail}`}
        className={`inline-flex h-9 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold transition-colors hover:brightness-95 sm:h-10 ${toneClasses[presence.tone]}`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClasses[presence.tone]}`} />
        <Bot size={16} />
        <span className="hidden max-w-32 truncate lg:inline">{loading ? 'Checking AI' : presence.label}</span>
      </button>

      {open && createPortal((
        <div className="fixed inset-0 z-[95] bg-slate-950/45" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <aside role="dialog" aria-modal="true" aria-label="AI activity" className="ml-auto flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${dotClasses[presence.tone]}`} />
                  <h2 className="text-base font-semibold text-slate-950 dark:text-white">{presence.label}</h2>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{presence.detail}</p>
              </div>
              <button type="button" aria-label="Close AI activity" title="Close" onClick={() => setOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={19} /></button>
            </header>

            <div className="grid grid-cols-3 border-b border-slate-200 dark:border-slate-800">
              <div className="px-4 py-3"><p className="text-[10px] font-bold uppercase text-slate-400">Mode</p><p className="mt-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{state?.config.mode.replaceAll('_', ' ') || 'Unknown'}</p></div>
              <div className="border-x border-slate-200 px-4 py-3 dark:border-slate-800"><p className="text-[10px] font-bold uppercase text-slate-400">Active</p><p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{presence.activeCount}</p></div>
              <div className="px-4 py-3"><p className="text-[10px] font-bold uppercase text-slate-400">Attention</p><p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{presence.attentionCount}</p></div>
            </div>

            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
              <div><p className="text-xs font-semibold text-slate-900 dark:text-white">Live activity</p><p className="mt-0.5 text-[10px] text-slate-400">Updated {lastUpdatedAt ? formatTime(lastUpdatedAt.toISOString()) : 'when available'}</p></div>
              <button type="button" title="Refresh AI state" aria-label="Refresh AI state" disabled={refreshing} onClick={() => void refresh()} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {error && <div className="m-4 flex gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</div>}
              {activity.map(item => (
                <button key={item.id} type="button" onClick={() => goTo(activityPath(item))} className="flex w-full items-start gap-3 border-b border-slate-100 px-5 py-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">{item.kind === 'RUN' ? <Activity size={15} /> : item.kind === 'EXECUTION' ? <ExternalLink size={15} /> : <Bot size={15} />}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{item.title}</span><span className="mt-1 block truncate text-[11px] text-slate-500 dark:text-slate-400">{item.detail}</span><span className="mt-1 block text-[10px] text-slate-400">{formatTime(item.createdAt)}</span></span>
                  <span className={`mt-1 shrink-0 text-[10px] font-bold uppercase ${statusTone(item.status)}`}>{item.status.replaceAll('_', ' ')}</span>
                </button>
              ))}
              {!error && activity.length === 0 && <div className="px-6 py-16 text-center"><Bot size={26} className="mx-auto text-slate-300 dark:text-slate-700" /><p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">No recent AI activity</p><p className="mt-1 text-xs text-slate-500">Run a review from AI Command when operational analysis is needed.</p></div>}
            </div>

            <footer className="space-y-2 border-t border-slate-200 p-4 dark:border-slate-800">
              <button type="button" onClick={() => goTo('/admin/ai-command')} className="flex h-10 w-full items-center justify-between rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"><span className="flex items-center gap-2"><Bot size={17} />Open AI Command</span><ChevronRight size={17} /></button>
              <div className="grid grid-cols-2 gap-2">
                {state?.viewer.canManageSettings && !state.config.emergencyPaused ? (
                  <button type="button" disabled={pausing} onClick={() => void pauseAI()} className="flex h-10 items-center justify-center gap-2 rounded-md border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"><CirclePause size={16} />{pausing ? 'Pausing...' : 'Pause execution'}</button>
                ) : (
                  <button type="button" onClick={() => goTo('/admin/ai-command/attention')} className="flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><ShieldAlert size={16} />Open attention</button>
                )}
                <button type="button" onClick={() => goTo('/admin/administration/ai')} className="flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Settings size={16} />Governance</button>
              </div>
            </footer>
          </aside>
        </div>
      ), document.body)}
    </>
  );
};
