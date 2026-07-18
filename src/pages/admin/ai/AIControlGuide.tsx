import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  Gauge,
  KeyRound,
  ListChecks,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Workflow,
  Wrench,
  X,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { AI_CONTROL_TOUR_STEPS, AIControlGuideTab } from './aiControlGuideData';

type ManualSection = 'quick-start' | 'modes' | 'reviews' | 'suggestions' | 'executions' | 'safety' | 'troubleshooting';


const manualSections: Array<{ id: ManualSection; label: string; icon: React.ElementType }> = [
  { id: 'quick-start', label: 'Daily workflow', icon: Play },
  { id: 'modes', label: 'Modes and limits', icon: Gauge },
  { id: 'reviews', label: 'Review scopes', icon: ListChecks },
  { id: 'suggestions', label: 'Findings and feedback', icon: Sparkles },
  { id: 'executions', label: 'Execution and rollback', icon: Workflow },
  { id: 'safety', label: 'Safety and privacy', icon: ShieldCheck },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: Wrench },
];

const SectionTitle = ({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) => (
  <div className="border-b border-slate-200 pb-5 dark:border-slate-800">
    <p className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-300">{eyebrow}</p>
    <h3 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{title}</h3>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
  </div>
);

const DailyWorkflow = () => {
  const steps = [
    ['Check the safety strip', 'Confirm the mode, provider, execution state and external communication boundary before running a review.'],
    ['Choose a review scope', 'Run the smallest relevant scope instead of scanning the whole platform without a specific operational question.'],
    ['Run the review', 'The server builds a minimized context, applies local rules and, when configured, asks DeepSeek for structured findings.'],
    ['Inspect Suggestions', 'Open each finding and verify the record, evidence, confidence, risk and expected operational benefit.'],
    ['Record the human decision', 'Approve, reject or dismiss. In an execution mode, approval can execute an allowlisted tool after a fresh server policy check.'],
    ['Verify the execution', 'Use the execution ledger to confirm the result, outcome verification and rollback availability.'],
    ['Add learning feedback', 'Mark the finding useful, wrong, too risky, missing context, good but not now, or suitable for a future rule.'],
    ['Check Runs and Audit', 'Confirm the provider result and preserve the decision trail before closing the review session.'],
  ];
  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Quick start" title="Daily review workflow" description="Use this sequence for every controlled AI review. It keeps analysis focused and decisions traceable." />
      <ol className="divide-y divide-slate-200 dark:divide-slate-800">
        {steps.map(([title, detail], index) => (
          <li key={title} className="flex gap-4 py-4 first:pt-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{index + 1}</span>
            <div><p className="text-sm font-semibold text-slate-950 dark:text-white">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{detail}</p></div>
          </li>
        ))}
      </ol>
    </div>
  );
};

const ModesGuide = () => {
  const modes = [
    ['OFF', 'No review or action can be started.'],
    ['READ ONLY AUDIT', 'Creates OBSERVED findings. There is no approval queue or execution.'],
    ['SUGGEST', 'Creates PENDING findings for human review without execution.'],
    ['ASSISTED', 'Allowlisted tools run only after explicit human approval.'],
    ['CONTROLLED AUTOPILOT', 'Low and medium-risk actions can run under the configured risk and approval policy.'],
    ['FULL AUTOPILOT', 'Adds configurable high-risk automation and an independently confirmed external communication boundary.'],
  ];
  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Control" title="Modes, thresholds and limits" description="The browser edits policy, but the server is the source of truth and validates every guardrail again at execution time." />
      <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {modes.map(([mode, detail]) => <div key={mode} className="grid gap-1 px-4 py-3 sm:grid-cols-[190px_1fr]"><p className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{mode}</p><p className="text-sm text-slate-600 dark:text-slate-300">{detail}</p></div>)}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="border-l-2 border-blue-500 pl-4"><p className="text-sm font-semibold text-slate-900 dark:text-white">Minimum confidence</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Findings below this threshold are discarded before they reach the queue.</p></div>
        <div className="border-l-2 border-blue-500 pl-4"><p className="text-sm font-semibold text-slate-900 dark:text-white">Run limits</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Findings per run and daily run limits protect cost, review capacity and provider usage.</p></div>
      </div>
    </div>
  );
};

const ReviewsGuide = () => {
  const scopes = [
    ['Jobs', 'Lifecycle contradictions, overdue work and financial status without an invoice link.'],
    ['Allocation', 'Unassigned jobs, booked work without a professional and assignment risk.'],
    ['Billing', 'Completed work not ready for billing, invoice integrity and missing financial links.'],
    ['Mirror sync', 'Unresolved Airtable conflicts and records requiring reconciliation.'],
    ['Cost', 'Negative margin and rate anomalies when the required financial values are available.'],
    ['Platform', 'A cross-workflow review combining the supported operational checks.'],
  ];
  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Review console" title="Choose the narrowest useful scope" description="Focused reviews are easier to validate, cheaper to run and less likely to hide the most important issue inside a large queue." />
      <div className="grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-2">
        {scopes.map(([scope, detail]) => <div key={scope} className="bg-white p-4 dark:bg-slate-900"><p className="text-sm font-semibold text-slate-950 dark:text-white">{scope}</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{detail}</p></div>)}
      </div>
      <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"><Activity size={17} className="mt-0.5 shrink-0" /><p>A completed run with zero new findings can mean that the same issues were already deduplicated. Check Suggestions and filters before assuming no issue exists.</p></div>
    </div>
  );
};

const SuggestionsGuide = () => {
  const statuses = [
    ['OBSERVED', 'Read-only finding. It is visible for audit and feedback.'],
    ['PENDING', 'Waiting for a human decision in Suggest mode.'],
    ['APPROVED', 'Human agrees with the finding; an executable action can now enter the policy engine.'],
    ['QUEUED / EXECUTING', 'The server owns an idempotent execution lock for the action.'],
    ['EXECUTED', 'The tool completed and the execution ledger contains its result.'],
    ['FAILED', 'The tool failed safely and can be retried after the cause is resolved.'],
    ['ROLLED BACK', 'A Super Admin reversed a supported action and preserved both events.'],
    ['REJECTED', 'Human disagrees with the recommendation.'],
    ['DISMISSED', 'Valid or low-value finding removed from the active review queue.'],
  ];
  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Suggestion queue" title="Read the evidence, then record the outcome" description="A finding is not an instruction. It is a reviewable operational hypothesis with server-owned risk and confidence." />
      <div className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {statuses.map(([status, detail]) => <div key={status} className="grid gap-1 px-4 py-3 sm:grid-cols-[130px_1fr]"><p className="text-xs font-bold text-slate-900 dark:text-white">{status}</p><p className="text-sm text-slate-600 dark:text-slate-300">{detail}</p></div>)}
      </div>
      <div className="border-l-2 border-violet-500 pl-4"><p className="text-sm font-semibold text-slate-900 dark:text-white">Learning feedback</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Feedback is aggregated as structured memory. It does not train a model directly or allow the AI to rewrite platform rules.</p></div>
    </div>
  );
};

const ExecutionsGuide = () => {
  const protections = [
    ['Fresh policy check', 'Mode, pause, confidence, risk approvals and daily limits are read again immediately before execution.'],
    ['Idempotency', 'The same suggestion cannot create the same side effect twice, even after a retry or timeout.'],
    ['Simulation', 'The engine records the exact tool plan without writing business records. Use this before enabling live execution.'],
    ['Outcome verification', 'The verifier compares the expected result with current platform state and marks it verified or drifted.'],
    ['Rollback', 'Reversible tools restore their recorded before-state only when later changes do not make that unsafe.'],
    ['Communication boundary', 'Potentially external actions require both AI policy and the platform-wide communication mode to permit delivery.'],
  ];
  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Execution ledger" title="Operate Autopilot without losing control" description="Every action is a deterministic server tool with a risk tier, idempotency key, result record and explicit rollback capability." />
      <div className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {protections.map(([title, detail]) => <div key={title} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]"><p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{detail}</p></div>)}
      </div>
      <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"><RotateCcw size={17} className="mt-0.5 shrink-0" /><p>Rollback is not a substitute for review. Inspect the source record and execution result before reversing a live action.</p></div>
    </div>
  );
};

const SafetyGuide = () => {
  const protections = [
    'The API key is held in Firebase Secret Manager and is never returned to the browser.',
    'Provider context excludes names, emails, phone numbers, addresses, free-text notes and patient data.',
    'DeepSeek receives opaque identifiers and only the minimum structured fields needed for the selected review.',
    'Provider output is validated against known records and a closed server-owned action registry.',
    'Execution is limited to a closed server-owned tool registry; DeepSeek cannot define actions or parameters for live tools.',
    'External communication is separately disabled by default and requires Full Autopilot plus an exact Super Admin confirmation.',
    'Every settings change, run and human decision is written to the AI audit trail.',
  ];
  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Safety" title="Data minimization and server control" description="The AI cannot browse the database freely. It receives a bounded context assembled by the platform for one supported review scope." />
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {protections.map(item => <li key={item} className="flex gap-3 py-3 first:pt-0"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Check size={12} /></span><span className="text-sm leading-6 text-slate-600 dark:text-slate-300">{item}</span></li>)}
      </ul>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex gap-3 rounded-md border border-slate-200 p-4 dark:border-slate-800"><KeyRound size={18} className="shrink-0 text-blue-600" /><div><p className="text-sm font-semibold text-slate-900 dark:text-white">Credential change</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">After creating a new secret version, redeploy the AI functions that use DeepSeek and run Test connection.</p></div></div>
        <div className="flex gap-3 rounded-md border border-slate-200 p-4 dark:border-slate-800"><LockKeyhole size={18} className="shrink-0 text-blue-600" /><div><p className="text-sm font-semibold text-slate-900 dark:text-white">Emergency pause</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Keep it active whenever provider behaviour, policy or data quality requires investigation.</p></div></div>
      </div>
    </div>
  );
};

const TroubleshootingGuide = () => {
  const issues = [
    ['Provider not configured', 'Create or update DEEPSEEK_API_KEY in Firebase Secret Manager, redeploy runAIReview and testDeepSeekConnection, then test again.'],
    ['Connection error', 'Confirm the secret version, model availability and provider account. Review the latest Run and Audit entries before retrying.'],
    ['No new findings', 'Check filters and existing observations. Deduplication prevents the same active finding from being created repeatedly.'],
    ['Unexpected finding', 'Open the source record, verify the evidence, then submit Wrong or Missing context feedback with a concise reason.'],
    ['Review button disabled', 'The mode is OFF or the signed-in user does not have the required administrative permissions.'],
    ['Action blocked after approval', 'Check the current mode, emergency pause, confidence threshold, risk approval rule, daily limit and execution toggle. Approval never bypasses policy.'],
    ['Need to undo an action', 'Open Executions, verify the source record has not drifted, then use Rollback when the tool is marked reversible.'],
  ];
  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Support" title="Diagnose without bypassing the guardrails" description="Use Runs and Audit as the first source of truth. Do not solve provider or data problems by enabling a more permissive mode." />
      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {issues.map(([issue, resolution]) => <div key={issue} className="py-4 first:pt-0"><p className="text-sm font-semibold text-slate-950 dark:text-white">{issue}</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{resolution}</p></div>)}
      </div>
    </div>
  );
};

export const AIControlManual = ({
  open,
  onClose,
  onStartTour,
}: {
  open: boolean;
  onClose: () => void;
  onStartTour: () => void;
}) => {
  const [section, setSection] = useState<ManualSection>('quick-start');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ai-manual-title" className="flex max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-w-5xl sm:rounded-lg">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-5">
          <div className="flex min-w-0 gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><BookOpen size={20} /></span><div><h2 id="ai-manual-title" className="text-lg font-semibold text-slate-950 dark:text-white">AI Control operating manual</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Safe review workflow, decisions, learning and audit.</p></div></div>
          <button type="button" aria-label="Close AI Control manual" title="Close" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={19} /></button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="Manual sections" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40 md:block md:overflow-y-auto md:border-b-0 md:border-r">
            {manualSections.map(item => {
              const Icon = item.icon;
              return <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-left text-xs font-semibold transition-colors md:mb-1 md:w-full ${section === item.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'}`}><Icon size={15} />{item.label}</button>;
            })}
          </nav>

          <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
            {section === 'quick-start' && <DailyWorkflow />}
            {section === 'modes' && <ModesGuide />}
            {section === 'reviews' && <ReviewsGuide />}
            {section === 'suggestions' && <SuggestionsGuide />}
            {section === 'executions' && <ExecutionsGuide />}
            {section === 'safety' && <SafetyGuide />}
            {section === 'troubleshooting' && <TroubleshootingGuide />}
          </div>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Start in simulation, verify outcomes, then expand one risk tier at a time.</p>
          <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Close</Button><Button icon={Play} onClick={onStartTour}>Start guided tour</Button></div>
        </footer>
      </div>
    </div>
  );
};

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

export const AIControlTour = ({
  stepIndex,
  activeTab,
  onTabChange,
  onBack,
  onNext,
  onClose,
}: {
  stepIndex: number | null;
  activeTab: AIControlGuideTab;
  onTabChange: (tab: AIControlGuideTab) => void;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
}) => {
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const step = stepIndex === null ? null : AI_CONTROL_TOUR_STEPS[stepIndex];

  useEffect(() => {
    if (!step) return;
    if (activeTab !== step.tab) {
      setRect(null);
      onTabChange(step.tab);
      return;
    }

    let cancelled = false;
    let revealTimer = 0;
    const update = () => {
      const target = document.querySelector<HTMLElement>(`[data-ai-tour="${step.target}"]`);
      if (!target || cancelled) return;
      const bounds = target.getBoundingClientRect();
      setRect({
        top: Math.max(8, bounds.top - 6),
        left: Math.max(8, bounds.left - 6),
        width: Math.min(window.innerWidth - 16, bounds.width + 12),
        height: Math.min(window.innerHeight - 16, bounds.height + 12),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    };

    const target = document.querySelector<HTMLElement>(`[data-ai-tour="${step.target}"]`);
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      revealTimer = window.setTimeout(update, 320);
    }
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelled = true;
      window.clearTimeout(revealTimer);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [activeTab, step, onTabChange]);

  useEffect(() => {
    if (!step) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, step]);

  const calloutStyle = useMemo<React.CSSProperties>(() => {
    if (!rect) return { opacity: 0 };
    const width = Math.min(370, rect.viewportWidth - 24);
    if (rect.viewportWidth < 640) {
      return rect.top > rect.viewportHeight / 2
        ? { left: 12, top: 12, width }
        : { bottom: 12, left: 12, width };
    }
    const spaceBelow = rect.viewportHeight - (rect.top + rect.height);
    const top = spaceBelow >= 300 ? rect.top + rect.height + 14 : Math.max(14, rect.top - 284);
    const left = Math.max(14, Math.min(rect.left, rect.viewportWidth - width - 14));
    return { left, top, width };
  }, [rect]);

  if (!step) return null;
  const isLast = stepIndex === AI_CONTROL_TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[120]" aria-live="polite">
      <div className="absolute inset-0" aria-hidden="true" />
      {rect && <div aria-hidden="true" className="pointer-events-none fixed rounded-md border-2 border-blue-400 shadow-[0_0_0_9999px_rgba(2,6,23,0.72)] transition-[top,left,width,height] duration-200" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />}
      <div role="dialog" aria-modal="true" aria-label={`Guided tour step ${Number(stepIndex) + 1} of ${AI_CONTROL_TOUR_STEPS.length}`} className="fixed max-h-[calc(100dvh-24px)] overflow-y-auto rounded-md border border-slate-700 bg-slate-950 p-4 text-white shadow-2xl transition-all" style={calloutStyle}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase text-blue-300">Step {Number(stepIndex) + 1} of {AI_CONTROL_TOUR_STEPS.length}</p><h2 className="mt-1 text-base font-semibold">{step.title}</h2></div><button type="button" aria-label="Close guided tour" title="Close tour" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"><X size={17} /></button></div>
        <p className="mt-3 text-sm font-medium text-slate-200">{step.description}</p>
        <p className="mt-1 text-sm leading-6 text-slate-400">{step.detail}</p>
        <div className="mt-4 flex items-center gap-1" aria-hidden="true">{AI_CONTROL_TOUR_STEPS.map((item, index) => <span key={item.id} className={`h-1.5 rounded-full transition-all ${index === stepIndex ? 'w-6 bg-blue-400' : index < Number(stepIndex) ? 'w-2 bg-emerald-400' : 'w-2 bg-slate-700'}`} />)}</div>
        <div className="mt-4 flex items-center justify-between gap-3"><button type="button" onClick={onClose} className="text-xs font-semibold text-slate-400 hover:text-white">Skip tour</button><div className="flex gap-2"><button type="button" onClick={onBack} disabled={stepIndex === 0} aria-label="Previous tour step" title="Previous" className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft size={16} /></button><button type="button" onClick={onNext} className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-500">{isLast ? 'Finish' : 'Next'}{isLast ? <Check size={15} /> : <ArrowRight size={15} />}</button></div></div>
      </div>
    </div>
  );
};

export const AIControlHelpButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" aria-label="Open AI Control manual" title="AI Control help and guided tour" onClick={onClick} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-300">
    <CircleHelp size={19} />
  </button>
);
