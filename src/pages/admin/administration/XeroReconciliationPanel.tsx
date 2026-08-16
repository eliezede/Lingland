import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useConfirm } from '../../../context/ConfirmContext';
import { useSettings } from '../../../context/SettingsContext';
import { useToast } from '../../../context/ToastContext';
import {
  XeroIntegrationService,
  XeroIntegrationStatus,
  XeroReconciliationIssue,
  XeroReconciliationRun,
} from '../../../services/xeroIntegrationService';

const localDate = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const currentFinancialYearStart = () => {
  const today = new Date();
  const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `${year}-04-01`;
};

const formatNumber = (value: number) => new Intl.NumberFormat('en-GB').format(value || 0);
const formatCurrency = (value?: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value || 0);
const formatDateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Not yet';

const issueLabel = (issue: XeroReconciliationIssue) => {
  if (issue.status === 'CONFLICT') return 'Conflict';
  if (issue.status === 'MISSING') return 'Not found';
  return 'Review';
};

const reasonLabels: Record<string, string> = {
  ACCOUNT_NUMBER_NOT_MATCHED: 'Account number did not match',
  EMAIL_EXACT_REQUIRES_REVIEW: 'Email candidate needs approval',
  NAME_EXACT_REQUIRES_REVIEW: 'Name candidate needs approval',
  MULTIPLE_FALLBACK_CANDIDATES: 'Several contact candidates',
  XERO_CONTACT_NOT_FOUND: 'No Xero contact found',
  TOTAL_MISMATCH: 'Total differs',
  DATE_MISMATCH: 'Date differs',
  CONTACT_MISMATCH: 'Contact differs',
  MULTIPLE_XERO_DOCUMENTS_SHARE_TYPE_AND_NUMBER: 'Duplicate type and number in Xero',
  EXTERNAL_NUMBER_NOT_FOUND: 'External number not found',
  EXTERNAL_NUMBER_MISSING: 'External number missing',
  FINGERPRINT_REQUIRES_REVIEW: 'Date, amount and contact candidate only',
  MULTIPLE_FINGERPRINT_CANDIDATES: 'Several document candidates',
  XERO_DOCUMENT_NOT_FOUND: 'No Xero document found',
};

const cleanError = (error: unknown) => {
  const message = (error instanceof Error ? error.message : 'Xero reconciliation failed.')
    .replace(/^Firebase:\s*/i, '')
    .replace(/^.*?\(functions\/[a-z-]+\)\.\s*/i, '')
    .slice(0, 300);
  return /^internal$/i.test(message.trim())
    ? 'The reconciliation service is temporarily unavailable.'
    : message;
};

export const XeroReconciliationPanel = () => {
  const [integration, setIntegration] = useState<XeroIntegrationStatus | null>(null);
  const [run, setRun] = useState<XeroReconciliationRun | null>(null);
  const [fromDate, setFromDate] = useState(currentFinancialYearStart);
  const [toDate, setToDate] = useState(() => localDate(new Date()));
  const [busy, setBusy] = useState<'load' | 'preview' | 'apply' | null>('load');
  const [error, setError] = useState('');
  const fromDateRef = useRef<HTMLInputElement>(null);
  const toDateRef = useRef<HTMLInputElement>(null);
  const { settings } = useSettings();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const communicationMode = settings.platformMode?.communicationMode || 'SUPPRESSED';

  const load = useCallback(async () => {
    setBusy(current => current || 'load');
    setError('');
    try {
      const status = await XeroIntegrationService.getStatus();
      setIntegration(status);
      try {
        const latestRun = await XeroIntegrationService.getReconciliationRun();
        setRun(latestRun);
        if (latestRun?.scope) {
          setFromDate(latestRun.scope.fromDate);
          setToDate(latestRun.scope.toDate);
        }
      } catch (caught) {
        setError(cleanError(caught));
      }
    } catch (caught) {
      setError(cleanError(caught));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runPreview = async () => {
    const requestedFromDate = fromDateRef.current?.value || fromDate;
    const requestedToDate = toDateRef.current?.value || toDate;
    setFromDate(requestedFromDate);
    setToDate(requestedToDate);
    setBusy('preview');
    setError('');
    try {
      const result = await XeroIntegrationService.previewReconciliation({
        fromDate: requestedFromDate,
        toDate: requestedToDate,
      });
      setRun(result);
      showToast('Read-only Xero preview completed. No accounting record was changed.', 'success');
    } catch (caught) {
      const message = cleanError(caught);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const applyLinks = async () => {
    if (!run?.runId || !run.previewHash || !run.summary) return;
    const accepted = await confirm({
      title: 'Link exact Xero matches',
      message: `Attach Xero IDs to ${formatNumber(run.summary.exactLinkCount)} deterministic platform records? This does not update Xero and does not change job, settlement or payment statuses.`,
      confirmLabel: 'Link exact matches',
      variant: 'warning',
    });
    if (!accepted) return;
    setBusy('apply');
    setError('');
    try {
      const result = await XeroIntegrationService.applyReconciliationLinks(run.runId, run.previewHash);
      setRun(result);
      showToast('Exact Xero links applied to the canonical accounting layer.', 'success');
    } catch (caught) {
      const message = cleanError(caught);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const applied = run?.status === 'APPLIED' || run?.status === 'APPLIED_WITH_CONFLICTS';
  const canApply = integration?.status === 'CONNECTED'
    && run?.status === 'PREVIEW_READY'
    && Boolean(run.summary?.exactLinkCount)
    && communicationMode === 'SUPPRESSED'
    && !busy;
  const statusEntries = useMemo(() => Object.entries(run?.summary?.xero.invoiceStatuses || {}), [run]);

  return (
    <section className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-4 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-black">4. Xero reconciliation</h2>
            <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Read only</span>
            <span className={`rounded px-2 py-1 text-xs font-black ${integration?.status === 'CONNECTED' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>
              {integration?.status === 'CONNECTED' ? 'Xero connected' : 'Connection required'}
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Compare the canonical Lingland ledger with Xero. Exact IDs can be linked locally; Xero, job workflow and Sage settlement evidence remain unchanged.
          </p>
        </div>
        <Link to="/admin/administration/integrations" className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
          <ExternalLink size={16} /> Connection settings
        </Link>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              From
              <input ref={fromDateRef} type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} disabled={Boolean(busy)} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            </label>
            <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              To
              <input ref={toDateRef} type="date" value={toDate} onChange={event => setToDate(event.target.value)} disabled={Boolean(busy)} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            </label>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => void load()} disabled={Boolean(busy)} title="Refresh latest reconciliation" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-black hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">
              <RefreshCw size={17} className={busy === 'load' ? 'animate-spin' : ''} /> Refresh
            </button>
            <button type="button" onClick={() => void runPreview()} disabled={integration?.status !== 'CONNECTED' || Boolean(busy) || !fromDate || !toDate} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">
              {busy === 'preview' ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />} Run read-only preview
            </button>
            <button type="button" onClick={() => void applyLinks()} disabled={!canApply} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {busy === 'apply' ? <Loader2 size={17} className="animate-spin" /> : <Link2 size={17} />} Link exact matches
            </button>
          </div>
        </div>

        {communicationMode !== 'SUPPRESSED' && (
          <div className="flex gap-2 border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle size={17} className="shrink-0" /> Preview remains available, but local linking requires Communication Mode SUPPRESSED.
          </div>
        )}
        {error && <div className="flex gap-2 border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"><AlertTriangle size={17} className="shrink-0" /> {error}</div>}

        {run?.summary && (
          <>
            <div className="grid border-y border-slate-200 dark:border-slate-800 sm:grid-cols-2 lg:grid-cols-4">
              {([
                { label: 'Contacts', value: run.summary.contacts.EXACT, total: run.summary.contacts.TOTAL },
                { label: 'Receivables', value: run.summary.receivables.EXACT, total: run.summary.receivables.TOTAL },
                { label: 'Payables', value: run.summary.payables.EXACT, total: run.summary.payables.TOTAL },
                { label: 'Needs review', value: run.summary.reviewCount, total: null },
              ] as Array<{ label: string; value: number; total: number | null }>).map((metric, index) => {
                return (
                  <div key={metric.label} className={`px-4 py-3 ${index ? 'border-t border-slate-200 dark:border-slate-800 sm:border-l sm:border-t-0' : ''}`}>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">{metric.label}</p>
                    <p className="mt-1 text-xl font-black">{formatNumber(metric.value)}{metric.total !== null && <span className="ml-1 text-sm font-bold text-slate-400">/ {formatNumber(metric.total)}</span>}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 text-sm dark:border-slate-800 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {statusEntries.map(([status, count]) => <span key={status} className="rounded bg-slate-100 px-2 py-1 font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{status} {formatNumber(count)}</span>)}
                {run.summary.xero.orphanInvoices > 0 && <span className="rounded bg-amber-50 px-2 py-1 font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Xero-only {formatNumber(run.summary.xero.orphanInvoices)}</span>}
              </div>
              <p className="text-slate-500 dark:text-slate-400">Canonical batch {run.scope.importRunId} | Preview {run.runId} | {formatDateTime(run.completedAt)}</p>
            </div>

            {applied && run.applySummary && (
              <div className="flex gap-3 border-l-4 border-emerald-500 bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                <CheckCircle2 size={19} className="shrink-0" />
                <div><p className="font-black">Local Xero links applied</p><p className="mt-1">{formatNumber(run.applySummary.applied)} linked, {formatNumber(run.applySummary.alreadyLinked)} already linked, {formatNumber(run.applySummary.localLinkConflicts)} conflicts. Xero records were not changed.</p></div>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
                <thead className="bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  <tr><th className="px-3 py-2">Finding</th><th className="px-3 py-2">Platform record</th><th className="px-3 py-2">Xero candidate</th><th className="px-3 py-2">Evidence</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {run.issues.length ? run.issues.map(issue => (
                    <tr key={`${issue.entityType}-${issue.localId}`}>
                      <td className="whitespace-nowrap px-3 py-3"><span className={`rounded px-2 py-1 text-xs font-black ${issue.status === 'CONFLICT' ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : issue.status === 'MISSING' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>{issueLabel(issue)}</span></td>
                      <td className="px-3 py-3"><p className="font-bold">{issue.local.reference || issue.localId}</p><p className="max-w-72 truncate text-slate-500 dark:text-slate-400">{issue.local.name}{issue.local.total !== undefined ? ` | ${formatCurrency(issue.local.total)}` : ''}</p></td>
                      <td className="px-3 py-3">{issue.xero ? <><p className="font-bold">{issue.xero.reference}</p><p className="max-w-72 truncate text-slate-500 dark:text-slate-400">{issue.xero.name}{issue.xero.total !== undefined ? ` | ${formatCurrency(issue.xero.total)}` : ''}</p></> : <span className="text-slate-400">No candidate</span>}</td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{issue.reasons.map(reason => reasonLabels[reason] || reason.replaceAll('_', ' ').toLowerCase()).join('; ')}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">No reconciliation exceptions in this scope.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {run.issuesTruncated && <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Showing the first 100 exceptions. The complete evidence remains stored in the reconciliation run.</p>}
          </>
        )}

        {!run?.summary && !busy && !error && (
          <p className="py-4 text-sm text-slate-500 dark:text-slate-400">No Xero reconciliation preview has been run yet.</p>
        )}
      </div>
    </section>
  );
};
