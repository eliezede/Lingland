import React from 'react';
import { AlertCircle, Check, Circle } from 'lucide-react';
import { BookingWorkflowStep, BookingWorkflowStepId } from '../../utils/bookingWorkflow';

type BookingWorkflowSelectionProps = {
  steps: BookingWorkflowStep[];
  selectedStepId: BookingWorkflowStepId;
  onSelect: (stepId: BookingWorkflowStepId) => void;
};

type BookingWorkflowFocusProps = {
  steps: BookingWorkflowStep[];
  selectedStepId: BookingWorkflowStepId;
  title: string;
  detail: string;
  action?: React.ReactNode;
};

type BookingWorkflowTrackerProps = BookingWorkflowSelectionProps & BookingWorkflowFocusProps;

const isCompletedState = (state?: BookingWorkflowStep['state']) => (
  state === 'done' || state === 'attention'
);

export const BookingWorkflowFocus = ({
  steps,
  selectedStepId,
  title,
  detail,
  action,
}: BookingWorkflowFocusProps) => {
  const selectedStep = steps.find(step => step.id === selectedStepId) || steps[0];
  const tone = selectedStep.state;
  const focusToneClass = tone === 'attention'
    ? 'border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/10'
    : tone === 'done'
      ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10'
      : tone === 'todo'
        ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
        : 'border-blue-200 bg-blue-50/60 dark:border-blue-500/30 dark:bg-blue-500/10';
  const focusTextClass = tone === 'attention'
    ? 'text-amber-700 dark:text-amber-300'
    : tone === 'done'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'todo'
        ? 'text-slate-500 dark:text-slate-400'
        : 'text-blue-700 dark:text-blue-300';

  return (
    <section className={`flex flex-col gap-4 rounded-lg border border-l-4 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4 ${focusToneClass}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/80 dark:bg-slate-950/60 ${focusTextClass}`}>
          {tone === 'attention' ? <AlertCircle size={17} /> : tone === 'done' ? <Check size={17} /> : <Circle size={15} />}
        </span>
        <div className="min-w-0">
          <p className={`text-[10px] font-bold uppercase ${focusTextClass}`}>{selectedStep.label} stage</p>
          <h2 className="mt-0.5 text-base font-semibold text-slate-950 dark:text-white sm:text-lg">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">{detail}</p>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </section>
  );
};

export const BookingWorkflowStepper = ({
  steps,
  selectedStepId,
  onSelect,
}: BookingWorkflowSelectionProps) => (
  <nav aria-label="Booking workflow" className="overflow-x-auto bg-white dark:bg-slate-950">
    <ol className="flex min-w-[720px] px-2 pt-2">
      {steps.map((step, index) => {
        const selected = step.id === selectedStepId;
        const completed = step.state === 'done';
        const attention = step.state === 'attention';
        const current = step.state === 'current';
        const leftComplete = index > 0 && isCompletedState(steps[index - 1]?.state);
        const rightComplete = isCompletedState(step.state);
        const nodeClass = attention
          ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300'
          : completed
            ? 'border-emerald-600 bg-emerald-600 text-white'
            : current
              ? 'border-blue-600 bg-blue-600 text-white shadow-[0_0_0_3px_rgba(37,99,235,0.14)]'
              : 'border-slate-300 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500';

        return (
          <li key={step.id} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onSelect(step.id)}
              className={`relative w-full px-2 pb-3 pt-1 text-center transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-slate-800/70 ${selected ? 'bg-blue-50/50 dark:bg-blue-500/5' : ''}`}
              aria-current={selected ? 'step' : undefined}
            >
              <span className="relative flex h-7 items-center justify-center">
                {index > 0 && <span className={`absolute left-0 right-1/2 top-1/2 h-0.5 -translate-y-1/2 ${leftComplete ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />}
                {index < steps.length - 1 && <span className={`absolute left-1/2 right-0 top-1/2 h-0.5 -translate-y-1/2 ${rightComplete ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />}
                <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold ${nodeClass}`}>
                  {completed ? <Check size={12} /> : attention ? '!' : index + 1}
                </span>
              </span>
              <span className={`mt-1 block truncate text-[11px] font-bold uppercase ${selected ? 'text-slate-950 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                {step.label}
              </span>
              <span className={`mt-0.5 block truncate text-[10px] font-semibold ${
                attention
                  ? 'text-amber-700 dark:text-amber-300'
                  : completed
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : current
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-slate-400 dark:text-slate-500'
              }`}>
                {step.statusLabel}
              </span>
              {selected && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-t bg-blue-600" />}
            </button>
          </li>
        );
      })}
    </ol>
  </nav>
);

export const BookingWorkflowTracker = ({
  steps,
  selectedStepId,
  title,
  detail,
  action,
  onSelect,
}: BookingWorkflowTrackerProps) => (
  <div className="space-y-3">
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <BookingWorkflowStepper steps={steps} selectedStepId={selectedStepId} onSelect={onSelect} />
    </section>
    <BookingWorkflowFocus
      steps={steps}
      selectedStepId={selectedStepId}
      title={title}
      detail={detail}
      action={action}
    />
  </div>
);
