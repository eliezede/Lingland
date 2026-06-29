import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  Filter,
  Receipt,
  Search,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useBookings } from '../../../hooks/useBookings';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { BulkActionBar } from '../../../components/ui/BulkActionBar';
import { Booking, BookingStatus, ServiceCategory, Timesheet } from '../../../types';
import { BillingService } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { UserAvatar } from '../../../components/ui/UserAvatar';

type ClaimStage = 'NEEDS_CLAIM' | 'SUBMITTED' | 'APPROVED' | 'CLIENT_INVOICED' | 'PAID' | 'ISSUE';

type ClaimRow = {
  id: string;
  stage: ClaimStage;
  job: Booking;
  timesheet?: Timesheet;
  source: 'INTERPRETER_APP' | 'STAFF_MANUAL' | 'AIRTABLE_MIRROR' | 'MISSING';
};

const money = (amount?: number) =>
  `GBP ${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value?: string) => {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
};

const formatTime = (value?: string) => {
  if (!value) return '--:--';
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const getJobRef = (job: Booking) => job.displayRef || job.jobNumber || job.bookingRef || job.legacyAirtableRef || job.id.slice(0, 8).toUpperCase();

const getStageLabel = (stage: ClaimStage) => ({
  NEEDS_CLAIM: 'Needs claim',
  SUBMITTED: 'Review',
  APPROVED: 'Ready for invoice',
  CLIENT_INVOICED: 'Invoiced',
  PAID: 'Paid',
  ISSUE: 'Issue',
}[stage]);

const getStageClass = (stage: ClaimStage) => ({
  NEEDS_CLAIM: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
  SUBMITTED: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  CLIENT_INVOICED: 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200',
  PAID: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  ISSUE: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
}[stage]);

const getTimesheetStage = (timesheet: Timesheet, job?: Booking): ClaimStage => {
  if (job?.billingIssueFlag || job?.paymentStatus === 'ISSUE') return 'ISSUE';
  if (job?.status === BookingStatus.PAID || job?.paymentStatus === 'PAID') return 'PAID';
  if (job?.status === BookingStatus.INVOICED || job?.paymentStatus === 'INVOICED' || timesheet.clientInvoiceId) return 'CLIENT_INVOICED';
  if (timesheet.adminApproved || ['APPROVED', 'INVOICING', 'INVOICED'].includes(String(timesheet.status))) return 'APPROVED';
  return 'SUBMITTED';
};

export const TimesheetQueue = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const { bookings = [], loading: bookingsLoading, refresh } = useBookings();
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loadingTimesheets, setLoadingTimesheets] = useState(true);
  const [selectedRow, setSelectedRow] = useState<ClaimRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<'ALL' | ClaimStage>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | ClaimRow['source']>('ALL');
  const scopedJobId = searchParams.get('jobId') || '';
  const scopedInterpreterId = searchParams.get('interpreterId') || '';
  const routeState = location.state as { returnTo?: string; returnLabel?: string } | null;
  const claimsReturnState = routeState?.returnTo
    ? routeState
    : { returnTo: `${location.pathname}${location.search}`, returnLabel: 'Claims Workbench' };

  const loadTimesheets = async () => {
    setLoadingTimesheets(true);
    try {
      setTimesheets(await BillingService.getAllTimesheets());
    } finally {
      setLoadingTimesheets(false);
    }
  };

  useEffect(() => {
    loadTimesheets();
  }, []);

  const rows = useMemo<ClaimRow[]>(() => {
    const bookingById = new Map(bookings.map(job => [job.id, job]));
    const timesheetRows = timesheets.map(timesheet => {
      const job = bookingById.get(timesheet.bookingId);
      if (!job) return null;
      const source = String(timesheet.source || '').toUpperCase();
      const manual = Boolean(timesheet.recordedByStaff || source === 'STAFF_MANUAL' || source === 'MANUAL_STAFF');
      const mirrored = source === 'AIRTABLE_MIRROR' || job.sourceSystem === 'AIRTABLE' || Boolean(job.legacyAirtableRef);
      return {
        id: timesheet.id,
        stage: getTimesheetStage(timesheet, job),
        job,
        timesheet,
        source: manual ? 'STAFF_MANUAL' : mirrored ? 'AIRTABLE_MIRROR' : 'INTERPRETER_APP',
      } as ClaimRow;
    }).filter(Boolean) as ClaimRow[];

    const bookingsWithTimesheet = new Set(timesheets.map(ts => ts.bookingId));
    const missingClaimRows: ClaimRow[] = bookings
      .filter(job => job.status === BookingStatus.SESSION_COMPLETED && !bookingsWithTimesheet.has(job.id))
      .map(job => ({
        id: `missing-${job.id}`,
        stage: 'NEEDS_CLAIM' as ClaimStage,
        job,
        source: 'MISSING' as const,
      }));

    const scopedRows = [...missingClaimRows, ...timesheetRows].filter(row => {
      if (scopedJobId && row.job.id !== scopedJobId && row.timesheet?.bookingId !== scopedJobId) return false;
      if (scopedInterpreterId && row.job.interpreterId !== scopedInterpreterId && row.timesheet?.interpreterId !== scopedInterpreterId) return false;
      return true;
    });

    return scopedRows.sort((a, b) => {
      const aDate = a.timesheet?.submittedAt || `${a.job.date}T${a.job.startTime || '00:00'}:00`;
      const bDate = b.timesheet?.submittedAt || `${b.job.date}T${b.job.startTime || '00:00'}:00`;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
  }, [bookings, scopedInterpreterId, scopedJobId, timesheets]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(row => {
      if (stageFilter !== 'ALL' && row.stage !== stageFilter) return false;
      if (sourceFilter !== 'ALL' && row.source !== sourceFilter) return false;
      if (!needle) return true;
      return [
        getJobRef(row.job),
        row.job.id,
        row.job.clientName,
        row.job.interpreterName,
        row.job.languageFrom,
        row.job.languageTo,
        row.job.postcode,
        row.timesheet?.id,
      ].filter(Boolean).some(value => String(value).toLowerCase().includes(needle));
    });
  }, [query, rows, sourceFilter, stageFilter]);

  const selectedActionableIds = useMemo(
    () => selectedIds.filter(id => {
      const row = rows.find(item => item.id === id);
      return row?.stage === 'SUBMITTED' && row.timesheet;
    }),
    [rows, selectedIds]
  );

  const summary = useMemo(() => ({
    total: rows.length,
    needsClaim: rows.filter(row => row.stage === 'NEEDS_CLAIM').length,
    review: rows.filter(row => row.stage === 'SUBMITTED').length,
    ready: rows.filter(row => row.stage === 'APPROVED').length,
    invoiced: rows.filter(row => row.stage === 'CLIENT_INVOICED').length,
    paid: rows.filter(row => row.stage === 'PAID').length,
    issue: rows.filter(row => row.stage === 'ISSUE').length,
    clientReadyAmount: rows
      .filter(row => row.stage === 'APPROVED')
      .reduce((sum, row) => sum + Number(row.timesheet?.clientAmountCalculated || row.job.totalAmount || 0), 0),
    interpreterPayable: rows
      .filter(row => ['SUBMITTED', 'APPROVED'].includes(row.stage))
      .reduce((sum, row) => sum + Number(row.timesheet?.interpreterAmountCalculated || row.timesheet?.totalToPay || 0), 0),
  }), [rows]);

  const refreshAll = async () => {
    await Promise.all([loadTimesheets(), refresh()]);
  };

  const handleRecordManualTimesheet = async (row: ClaimRow) => {
    try {
      await BillingService.recordManualTimesheetReceived(row.job.id);
      showToast('Manual claim recorded for finance review', 'success');
      await refreshAll();
    } catch (error: any) {
      showToast(error?.message || 'Failed to record manual claim', 'error');
    }
  };

  const handleVerify = async (row: ClaimRow) => {
    if (!row.timesheet) return;
    try {
      await BillingService.approveTimesheet(row.timesheet.id);
      showToast('Claim authorized for billing', 'success');
      setSelectedRow(current => current?.id === row.id ? null : current);
      await refreshAll();
    } catch (error: any) {
      showToast(error?.message || 'Failed to authorize claim', 'error');
    }
  };

  const handleBulkVerify = async (ids: string[]) => {
    setIsBulkLoading(true);
    let done = 0;
    await Promise.allSettled(ids.map(async id => {
      const row = rows.find(item => item.id === id);
      if (!row?.timesheet || row.stage !== 'SUBMITTED') return;
      await BillingService.approveTimesheet(row.timesheet.id);
      done++;
    }));
    setIsBulkLoading(false);
    setSelectedIds([]);
    await refreshAll();
    showToast(`${done} claim${done !== 1 ? 's' : ''} authorized for billing`, 'success');
  };

  const isLoading = bookingsLoading || loadingTimesheets;

  return (
    <div className="space-y-5 pb-20">
      <PageHeader
        title="Claims Workbench"
        subtitle={scopedJobId
          ? 'Claims filtered from a booking record.'
          : scopedInterpreterId
            ? 'Claims filtered from an interpreter profile.'
            : 'Hybrid control for interpreter app submissions, manual staff claims and Airtable mirrored timesheets.'}
      >
        <div className="flex flex-wrap items-center gap-2">
          {(scopedJobId || scopedInterpreterId) && (
            <Button onClick={() => navigate('/admin/operations/timesheets')} variant="outline" size="sm">
              Clear scope
            </Button>
          )}
          <Button onClick={() => navigate(`/admin/billing?view=fin-timesheets&lane=interpreterPayables${scopedInterpreterId ? `&interpreterId=${encodeURIComponent(scopedInterpreterId)}` : ''}`)} icon={ArrowUpRight} variant="secondary" size="sm">
            Finance view
          </Button>
          <Button onClick={refreshAll} icon={FileCheck} variant="secondary" size="sm">
            Refresh
          </Button>
        </div>
      </PageHeader>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {[
          ['Missing claim', summary.needsClaim, 'Admin must record'],
          ['Review', summary.review, 'Awaiting approval'],
          ['Ready', summary.ready, money(summary.clientReadyAmount)],
          ['Invoiced', summary.invoiced, 'Client side'],
          ['Paid', summary.paid, 'Closed'],
          ['Issues', summary.issue, 'Blocked'],
        ].map(([label, value, meta]) => (
          <button
            key={label}
            onClick={() => setStageFilter(label === 'Missing claim' ? 'NEEDS_CLAIM' : label === 'Review' ? 'SUBMITTED' : label === 'Ready' ? 'APPROVED' : label === 'Invoiced' ? 'CLIENT_INVOICED' : label === 'Paid' ? 'PAID' : label === 'Issues' ? 'ISSUE' : 'ALL')}
            className="rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{meta}</p>
          </button>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search job, client, interpreter, language, postcode"
                className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/20"
              />
            </div>
            {(scopedJobId || scopedInterpreterId) && (
              <div className="flex h-10 items-center rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-black uppercase tracking-wide text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                {scopedJobId ? 'Job scoped' : 'Interpreter scoped'}
              </div>
            )}
            <select
              value={stageFilter}
              onChange={event => setStageFilter(event.target.value as 'ALL' | ClaimStage)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="ALL">All stages</option>
              <option value="NEEDS_CLAIM">Needs claim</option>
              <option value="SUBMITTED">Review</option>
              <option value="APPROVED">Ready for invoice</option>
              <option value="CLIENT_INVOICED">Invoiced</option>
              <option value="PAID">Paid</option>
              <option value="ISSUE">Issue</option>
            </select>
            <select
              value={sourceFilter}
              onChange={event => setSourceFilter(event.target.value as 'ALL' | ClaimRow['source'])}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="ALL">All sources</option>
              <option value="INTERPRETER_APP">Interpreter app</option>
              <option value="STAFF_MANUAL">Staff manual</option>
              <option value="AIRTABLE_MIRROR">Airtable mirror</option>
              <option value="MISSING">Missing</option>
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            <Filter size={14} />
            {filteredRows.length} of {rows.length} claims
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="w-12 px-4 py-3">
                  <button
                    onClick={() => setSelectedIds(selectedIds.length === filteredRows.length ? [] : filteredRows.map(row => row.id))}
                    className={`h-5 w-5 rounded border ${selectedIds.length === filteredRows.length && filteredRows.length ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
                    aria-label="Select all visible claims"
                  >
                    {selectedIds.length === filteredRows.length && filteredRows.length ? <CheckCircle2 size={13} className="m-auto text-white" /> : null}
                  </button>
                </th>
                {['Job', 'Stage', 'Schedule', 'Interpreter', 'Client billing', 'Interpreter pay', 'Source', 'Action'].map(header => (
                  <th key={header} className="px-4 py-3 text-[11px] font-black uppercase tracking-wide text-slate-400">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                [1, 2, 3, 4, 5].map(item => (
                  <tr key={item}>
                    <td colSpan={9} className="px-4 py-5">
                      <div className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                    </td>
                  </tr>
                ))
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                    No claims match this view.
                  </td>
                </tr>
              ) : filteredRows.map(row => {
                const selected = selectedIds.includes(row.id);
                const clientAmount = row.timesheet?.clientAmountCalculated || row.job.totalAmount || 0;
                const interpreterAmount = row.timesheet?.interpreterAmountCalculated || row.timesheet?.totalToPay || 0;

                return (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedRow(row)}
                    onDoubleClick={() => navigate(`/admin/bookings/${row.job.id}`, { state: claimsReturnState })}
                    className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${selected ? 'bg-blue-50/50 dark:bg-blue-500/10' : ''}`}
                  >
                    <td className="px-4 py-4" onClick={event => event.stopPropagation()}>
                      <button
                        onClick={() => setSelectedIds(current => current.includes(row.id) ? current.filter(id => id !== row.id) : [...current, row.id])}
                        className={`h-5 w-5 rounded border ${selected ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
                        aria-label="Select claim"
                      >
                        {selected ? <CheckCircle2 size={13} className="m-auto text-white" /> : null}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span className="font-black text-slate-950 dark:text-white">{getJobRef(row.job)}</span>
                        <span className="max-w-[220px] truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{row.job.clientName}</span>
                        {row.timesheet?.nonExecutionReason && (
                          <span className="mt-1 w-fit rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                            Exception
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${getStageClass(row.stage)}`}>
                        {getStageLabel(row.stage)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-black text-slate-900 dark:text-slate-100">{formatDate(row.job.date)}</p>
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-300">
                        {row.timesheet ? `${formatTime(row.timesheet.actualStart)} - ${formatTime(row.timesheet.actualEnd)}` : `${formatTime(row.job.startTime)} - ${row.job.durationMinutes || 0}m`}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <UserAvatar name={row.job.interpreterName || 'Unassigned'} src={row.job.interpreterPhotoUrl} size="sm" />
                        <span className="max-w-[180px] truncate text-sm font-bold text-slate-900 dark:text-slate-100">{row.job.interpreterName || 'Unassigned'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm font-black text-slate-900 dark:text-slate-100">{money(clientAmount)}</td>
                    <td className="px-4 py-4 text-sm font-black text-slate-900 dark:text-slate-100">{money(interpreterAmount)}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {row.source.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4" onClick={event => event.stopPropagation()}>
                      {row.stage === 'NEEDS_CLAIM' ? (
                        <Button size="sm" variant="secondary" icon={FileText} onClick={() => handleRecordManualTimesheet(row)}>Record</Button>
                      ) : row.stage === 'SUBMITTED' ? (
                        <Button size="sm" icon={ShieldCheck} onClick={() => handleVerify(row)}>Authorize</Button>
                      ) : (
                        <Button size="sm" variant="ghost" icon={ArrowUpRight} onClick={() => navigate(`/admin/bookings/${row.job.id}`, { state: claimsReturnState })}>Open</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <BulkActionBar
        selectedIds={selectedIds}
        selectedCount={selectedIds.length}
        totalCount={filteredRows.length}
        entityLabel="claim"
        isLoading={isBulkLoading}
        onClearSelection={() => setSelectedIds([])}
        actions={[
          {
            label: `Authorize ${selectedActionableIds.length || ''}`.trim(),
            icon: ShieldCheck,
            onClick: () => handleBulkVerify(selectedActionableIds),
            variant: 'success',
            disabled: selectedActionableIds.length === 0,
          },
        ]}
      />

      <Modal
        isOpen={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
        type="drawer"
        title={selectedRow ? `Claim ${getJobRef(selectedRow.job)}` : 'Claim'}
        maxWidth="4xl"
      >
        {selectedRow && (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Current stage</p>
                <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${getStageClass(selectedRow.stage)}`}>
                  {getStageLabel(selectedRow.stage)}
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Client billing</p>
                <p className="mt-2 text-xl font-black text-slate-950 dark:text-white">{money(selectedRow.timesheet?.clientAmountCalculated || selectedRow.job.totalAmount || 0)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Interpreter pay</p>
                <p className="mt-2 text-xl font-black text-slate-950 dark:text-white">{money(selectedRow.timesheet?.interpreterAmountCalculated || selectedRow.timesheet?.totalToPay || 0)}</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 flex items-center gap-2">
                  <Clock size={17} className="text-slate-400" />
                  <h3 className="text-sm font-black text-slate-950 dark:text-white">Original job</h3>
                </div>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4"><dt className="font-bold text-slate-400">Client</dt><dd className="text-right font-black text-slate-900 dark:text-white">{selectedRow.job.clientName}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="font-bold text-slate-400">Service</dt><dd className="text-right font-black text-slate-900 dark:text-white">{selectedRow.job.languageFrom} to {selectedRow.job.languageTo}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="font-bold text-slate-400">Booked</dt><dd className="text-right font-black text-slate-900 dark:text-white">{formatDate(selectedRow.job.date)} {formatTime(selectedRow.job.startTime)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="font-bold text-slate-400">Duration</dt><dd className="text-right font-black text-slate-900 dark:text-white">{selectedRow.job.durationMinutes || 0} min</dd></div>
                  <div className="flex justify-between gap-4"><dt className="font-bold text-slate-400">Category</dt><dd className="text-right font-black text-slate-900 dark:text-white">{selectedRow.job.serviceCategory}</dd></div>
                </dl>
              </section>

              <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
                <div className="mb-4 flex items-center gap-2">
                  <Receipt size={17} className="text-blue-600 dark:text-blue-300" />
                  <h3 className="text-sm font-black text-slate-950 dark:text-white">Claim record</h3>
                </div>
                {selectedRow.timesheet ? (
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between gap-4"><dt className="font-bold text-blue-500">Actual time</dt><dd className="text-right font-black text-slate-900 dark:text-white">{formatTime(selectedRow.timesheet.actualStart)} - {formatTime(selectedRow.timesheet.actualEnd)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="font-bold text-blue-500">Session</dt><dd className="text-right font-black text-slate-900 dark:text-white">{selectedRow.timesheet.sessionDurationMinutes || 0} min</dd></div>
                    <div className="flex justify-between gap-4"><dt className="font-bold text-blue-500">Travel</dt><dd className="text-right font-black text-slate-900 dark:text-white">{selectedRow.timesheet.travelTimeMinutes || 0} min - {money(selectedRow.timesheet.travelFees)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="font-bold text-blue-500">Expenses</dt><dd className="text-right font-black text-slate-900 dark:text-white">{money(Number(selectedRow.timesheet.parking || 0) + Number(selectedRow.timesheet.transport || 0))}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="font-bold text-blue-500">Submitted</dt><dd className="text-right font-black text-slate-900 dark:text-white">{formatDate(selectedRow.timesheet.submittedAt)}</dd></div>
                  </dl>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    No claim exists yet. Record a manual staff claim if the interpreter sent the timesheet outside the app.
                  </div>
                )}
              </section>
            </div>

            {selectedRow.timesheet?.supportingDocumentUrl ? (
              <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center gap-2">
                  <FileCheck size={17} className="text-emerald-600" />
                  <h3 className="text-sm font-black text-slate-950 dark:text-white">Supporting evidence</h3>
                </div>
                <a href={selectedRow.timesheet.supportingDocumentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-blue-600 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
                  Open attached document <ArrowUpRight size={14} />
                </a>
              </section>
            ) : (
              <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  <AlertCircle size={17} />
                  No digital evidence attached.
                </div>
              </section>
            )}

            <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end">
              <Button variant="secondary" icon={ArrowUpRight} onClick={() => navigate(`/admin/bookings/${selectedRow.job.id}`, { state: claimsReturnState })}>
                Open job
              </Button>
              {selectedRow.stage === 'NEEDS_CLAIM' && (
                <Button icon={FileText} onClick={() => handleRecordManualTimesheet(selectedRow)}>
                  Record manual claim
                </Button>
              )}
              {selectedRow.stage === 'SUBMITTED' && (
                <Button icon={ShieldCheck} onClick={() => handleVerify(selectedRow)}>
                  Authorize for billing
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <div className="flex items-start gap-3">
          <UserCheck size={18} className="mt-0.5 text-emerald-700 dark:text-emerald-300" />
          <div>
            <p className="text-sm font-black text-emerald-950 dark:text-emerald-100">Hybrid rule</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-emerald-800 dark:text-emerald-200">
              Interpreter app submissions and staff-recorded claims feed the same financial pipeline. Authorizing a claim moves the job to ready for invoice and marks both client billing and interpreter payable readiness.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
