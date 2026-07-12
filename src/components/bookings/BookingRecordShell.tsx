import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { StatusBadge } from '../StatusBadge';

export interface BookingNavigationState {
  returnTo?: string;
  returnLabel?: string;
  returnState?: unknown;
  parentReturnTo?: string;
  parentReturnLabel?: string;
  parentReturnState?: unknown;
}

interface BookingRecordHeaderProps {
  title: string;
  reference: string;
  subtitle: string;
  status?: string;
  backLabel: string;
  onBack: () => void;
  actions: React.ReactNode;
}

export const BookingRecordHeader = ({
  title,
  reference,
  subtitle,
  status,
  backLabel,
  onBack,
  actions,
}: BookingRecordHeaderProps) => (
  <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-5 lg:px-6">
    <div className="mx-auto flex max-w-[1600px] flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
          aria-label={`Back to ${backLabel}`}
          title={`Back to ${backLabel}`}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-slate-950 dark:text-white">{title}</h1>
            {status && <StatusBadge status={status as any} />}
            <span className="max-w-full truncate rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 dark:border-slate-800">
              {reference}
            </span>
          </div>
          <p className="truncate text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
        {actions}
      </div>
    </div>
  </header>
);

export const BookingSection = ({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Icon size={15} />
        </div>
        <h2 className="truncate text-sm font-semibold text-slate-950 dark:text-white">{title}</h2>
      </div>
      {action}
    </div>
    <div className="p-3">{children}</div>
  </section>
);

export const BookingMetricCell = ({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone?: 'default' | 'warning' | 'success';
}) => {
  const toneClass = tone === 'warning'
    ? 'text-amber-700 dark:text-amber-300'
    : tone === 'success'
      ? 'text-emerald-700 dark:text-emerald-300'
      : 'text-slate-950 dark:text-white';

  return (
    <div className="min-w-0 border-b border-slate-200 p-3 dark:border-slate-800 sm:border-b-0 sm:border-r last:sm:border-r-0">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
        <Icon size={13} />
        <span>{label}</span>
      </div>
      <p className={`mt-1 truncate text-sm font-semibold ${toneClass}`}>{value || '-'}</p>
    </div>
  );
};

export const BookingMetricsBand = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="grid sm:grid-cols-2 lg:grid-cols-5">{children}</div>
  </div>
);

export const getParentBookingNavigationState = (
  state?: BookingNavigationState | null,
): BookingNavigationState | undefined => (
  state?.parentReturnTo
    ? {
        returnTo: state.parentReturnTo,
        returnLabel: state.parentReturnLabel,
        ...(state.parentReturnState !== undefined ? { returnState: state.parentReturnState } : {}),
      }
    : undefined
);

export const getBookingNavigationStateForReturn = (
  state?: BookingNavigationState | null,
): unknown => (
  state?.parentReturnTo
    ? getParentBookingNavigationState(state)
    : state?.returnState
);

export const createBookingDetailNavigationState = (
  currentLocation: string,
  origin?: BookingNavigationState | null,
): BookingNavigationState => ({
  returnTo: currentLocation,
  returnLabel: 'Booking record',
  parentReturnTo: origin?.returnTo,
  parentReturnLabel: origin?.returnLabel,
  ...(origin?.returnState !== undefined ? { parentReturnState: origin.returnState } : {}),
});
