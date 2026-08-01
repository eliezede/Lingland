import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  FileCheck2,
  FileText,
  LockKeyhole,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { BillingService } from '../../../services/billingService';
import { FinanceWorkspaceService } from '../../../services/financeWorkspaceService';
import {
  InterpreterInvoice,
  ServiceCategory,
  SettlementCycle,
  SettlementCycleStatus,
  SettlementPayeeSummary,
} from '../../../types';
import { getLondonPeriodKey, getServiceLabel, matchesServiceCategory } from '../../../domains/finance/financeLifecycle';
import { PageHeader } from '../../../components/layout/PageHeader';
import { TableSkeleton } from '../../../components/ui/Skeleton';
import { WorkspacePagination } from '../../../components/operations/WorkspacePagination';
import { useToast } from '../../../context/ToastContext';

interface AccountsPayableWorkspaceProps {
  serviceCategory: ServiceCategory;
}

type PayablesView = 'cycle' | 'documents';

const money = (value: number, currency = 'GBP') => (
  `${currency} ${Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
);

const formatDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-GB');
};

const referenceFor = (invoice: InterpreterInvoice) => (
  invoice.externalInvoiceReference || (invoice as InterpreterInvoice & { invoiceNumber?: string }).invoiceNumber || invoice.id
);

const CYCLE_STATUS_STYLES: Record<SettlementCycleStatus, string> = {
  PREPARING: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  OPEN: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  REVIEW: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  POSTED: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300',
  CLOSED: 'border-slate-300 bg-slate-200 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
};

const CycleStatus = ({ status }: { status: SettlementCycleStatus }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${CYCLE_STATUS_STYLES[status]}`}>
    {status}
  </span>
);

export const AccountsPayableWorkspace: React.FC<AccountsPayableWorkspaceProps> = ({ serviceCategory }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [cycle, setCycle] = useState<SettlementCycle | null>(null);
  const [payees, setPayees] = useState<SettlementPayeeSummary[]>([]);
  const [invoices, setInvoices] = useState<InterpreterInvoice[]>([]);
  const [loadingCycle, setLoadingCycle] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [cycleLoadError, setCycleLoadError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const { showToast } = useToast();

  const currentPeriod = getLondonPeriodKey(new Date());
  const periodKey = /^20\d{2}-(0[1-9]|1[0-2])$/.test(searchParams.get('period') || '')
    ? searchParams.get('period')!
    : currentPeriod;
  const view = (searchParams.get('view') === 'documents' ? 'documents' : 'cycle') as PayablesView;
  const search = searchParams.get('q') || '';
  const requestedPage = Math.max(1, Number(searchParams.get('page') || 1));
  const serviceLabel = getServiceLabel(serviceCategory);

  const updateParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (!value) next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next, { replace: true });
  };

  const loadCycle = useCallback(async () => {
    setLoadingCycle(true);
    try {
      const result = await FinanceWorkspaceService.getSettlementCycle(periodKey, serviceCategory);
      setCycle(result.cycle);
      setPayees(result.payees || []);
      setCycleLoadError(null);
    } catch (error) {
      console.error('Failed to load settlement cycle', error);
      setCycle(null);
      setPayees([]);
      setCycleLoadError('Monthly settlement data is temporarily unavailable. No cycle changes were made.');
    } finally {
      setLoadingCycle(false);
    }
  }, [periodKey, serviceCategory]);

  const loadInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      setInvoices(await BillingService.getInterpreterInvoices());
    } catch (error) {
      console.error('Failed to load payable documents', error);
      showToast('Payable documents could not be loaded.', 'error');
    } finally {
      setLoadingInvoices(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadCycle();
  }, [loadCycle]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const prepareCycle = async () => {
    setAction('prepare');
    try {
      await FinanceWorkspaceService.prepareSettlementCycle(periodKey, serviceCategory);
      await loadCycle();
      showToast(`${serviceLabel} settlement cycle prepared for review.`, 'success');
    } catch (error: any) {
      console.error('Settlement preparation failed', error);
      showToast(error?.message || 'Settlement cycle could not be prepared.', 'error');
    } finally {
      setAction(null);
    }
  };

  const transitionCycle = async (status: SettlementCycleStatus) => {
    if (!cycle) return;
    setAction(status);
    try {
      await FinanceWorkspaceService.transitionSettlementCycle(cycle.id, status);
      await loadCycle();
      showToast(`Settlement cycle moved to ${status.toLowerCase()}.`, 'success');
    } catch (error: any) {
      console.error('Settlement transition failed', error);
      showToast(error?.message || 'Settlement status could not be changed.', 'error');
    } finally {
      setAction(null);
    }
  };

  const generateStatement = async (payee: SettlementPayeeSummary) => {
    if (!cycle || cycle.status !== 'APPROVED') return;
    setAction(`generate_${payee.interpreterId}`);
    try {
      const result = await FinanceWorkspaceService.generateProfessionalStatement({
        interpreterId: payee.interpreterId,
        periodStart: cycle.periodStart,
        periodEnd: cycle.periodEnd,
        serviceCategory,
        settlementCycleId: cycle.id,
      });
      if (!result.success) {
        showToast(result.message || 'No eligible payable lines were found.', 'info');
      } else {
        showToast(`${result.invoiceNumber || 'Payable document'} created successfully.`, 'success');
      }
      await Promise.all([loadCycle(), loadInvoices()]);
    } catch (error: any) {
      console.error('Payable document generation failed', error);
      showToast(error?.message || 'Payable document could not be generated.', 'error');
    } finally {
      setAction(null);
    }
  };

  const cycleDocuments = useMemo(() => invoices.filter(invoice => {
    if (!matchesServiceCategory(invoice, serviceCategory)) return false;
    const periods = invoice.settlementPeriods || (invoice.settlementPeriod ? [invoice.settlementPeriod] : []);
    return invoice.settlementCycleId === cycle?.id || periods.includes(periodKey);
  }), [cycle?.id, invoices, periodKey, serviceCategory]);

  const unclassifiedDocuments = useMemo(() => invoices.filter(invoice => (
    !invoice.primaryServiceCategory && (!invoice.serviceCategories || invoice.serviceCategories.length === 0)
  )).length, [invoices]);

  const filteredPayees = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return payees.filter(payee => !needle || [payee.interpreterName, payee.interpreterId]
      .some(value => value.toLowerCase().includes(needle)));
  }, [payees, search]);

  const filteredDocuments = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return cycleDocuments.filter(invoice => !needle || [
      referenceFor(invoice),
      invoice.interpreterName,
      invoice.status,
    ].some(value => String(value || '').toLowerCase().includes(needle)));
  }, [cycleDocuments, search]);

  const activeRows = view === 'cycle' ? filteredPayees : filteredDocuments;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageStartIndex = (currentPage - 1) * pageSize;
  const pageEndIndex = Math.min(pageStartIndex + pageSize, activeRows.length);
  const pagePayees = filteredPayees.slice(pageStartIndex, pageEndIndex);
  const pageDocuments = filteredDocuments.slice(pageStartIndex, pageEndIndex);
  const summary = cycle?.summary || {
    jobCount: 0,
    professionalCount: 0,
    readyCount: 0,
    exceptionCount: 0,
    totalAmount: 0,
    invoicedCount: 0,
  };
  const loading = view === 'cycle' ? loadingCycle : loadingInvoices;
  const otherServicePath = serviceCategory === ServiceCategory.INTERPRETATION
    ? `/admin/finance/payables/translations?period=${periodKey}`
    : `/admin/finance/payables/interpreting?period=${periodKey}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
        <div>
          Finance <span className="px-1 text-slate-300">/</span> Accounts Payable <span className="px-1 text-slate-300">/</span> {serviceLabel}
        </div>
        <Link to={otherServicePath} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400">
          Switch to {serviceCategory === ServiceCategory.INTERPRETATION ? 'Translations' : 'Interpreting'} <ArrowUpRight size={13} />
        </Link>
      </div>

      <PageHeader
        title={`Accounts Payable - ${serviceLabel}`}
        subtitle="Monthly professional settlement cycle. Client collections are managed separately in Accounts Receivable."
      >
        <label className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-black uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Period
          <input
            type="month"
            value={periodKey}
            onChange={event => updateParams({ period: event.target.value, page: null })}
            className="bg-transparent text-sm font-bold normal-case text-slate-900 outline-none dark:text-white"
          />
        </label>
        <Link
          to={`/admin/billing/interpreter-invoices?service=${serviceCategory.toLowerCase()}&period=${periodKey}`}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <FileText size={15} /> Full registry
        </Link>
      </PageHeader>

      {cycleLoadError && (
        <div className="flex flex-col gap-3 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-start gap-2"><AlertTriangle size={17} className="mt-0.5 shrink-0" /> {cycleLoadError}</span>
          <button type="button" onClick={loadCycle} className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-md border border-rose-300 px-3 text-xs font-bold hover:bg-rose-100 dark:border-rose-800 dark:hover:bg-rose-950/60">
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      <div className="flex flex-col border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 grid-cols-2 lg:grid-cols-5">
          {[
            ['Cycle status', cycleLoadError ? 'Unavailable' : cycle?.status || 'Not prepared'],
            ['Jobs', summary.jobCount],
            ['Professionals', summary.professionalCount],
            ['Exceptions', summary.exceptionCount],
            ['Gross payable', money(summary.totalAmount, cycle?.currency)],
          ].map(([label, value], index) => (
            <div key={String(label)} className={`border-r border-slate-200 px-4 py-3 last:border-r-0 dark:border-slate-800 ${index === 4 ? 'col-span-2 lg:col-span-1' : ''}`}>
              <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
              <div className="mt-1 min-h-6 text-lg font-black text-slate-950 dark:text-white">
                {label === 'Cycle status' && cycle ? <CycleStatus status={cycle.status} /> : value}
              </div>
            </div>
          ))}
        </div>
        <div className="flex min-h-16 flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800 lg:border-l lg:border-t-0">
          {!cycle && !cycleLoadError && (
            <button type="button" onClick={prepareCycle} disabled={Boolean(action)} className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              <FileCheck2 size={15} /> Prepare cycle
            </button>
          )}
          {cycle?.status === 'OPEN' && (
            <>
              <button type="button" onClick={prepareCycle} disabled={Boolean(action)} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                <RefreshCw size={15} className={action === 'prepare' ? 'animate-spin' : ''} /> Refresh snapshot
              </button>
              <button type="button" onClick={() => transitionCycle('REVIEW')} disabled={Boolean(action)} className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950">
                <LockKeyhole size={15} /> Send to review
              </button>
            </>
          )}
          {cycle?.status === 'REVIEW' && (
            <>
              <button type="button" onClick={() => transitionCycle('OPEN')} disabled={Boolean(action)} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                <ArrowLeft size={15} /> Return to open
              </button>
              <button
                type="button"
                onClick={() => transitionCycle('APPROVED')}
                disabled={Boolean(action) || summary.exceptionCount > 0}
                title={summary.exceptionCount > 0 ? 'Resolve every exception before approval' : undefined}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 size={15} /> Approve cycle
              </button>
            </>
          )}
          {cycle && ['APPROVED', 'POSTED', 'CLOSED'].includes(cycle.status) && (
            <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-300">
              <LockKeyhole size={14} /> Snapshot locked
            </span>
          )}
        </div>
      </div>

      {cycle?.status === 'REVIEW' && summary.exceptionCount > 0 && (
        <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div><strong>{summary.exceptionCount} exceptions block approval.</strong> Return the cycle to open, resolve missing timesheets, links or amounts, and refresh the snapshot.</div>
        </div>
      )}

      {unclassifiedDocuments > 0 && (
        <div className="flex items-center justify-between gap-3 border border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300"><AlertTriangle size={15} className="text-amber-500" /> {unclassifiedDocuments} legacy documents still need service classification.</span>
          <Link to="/admin/billing/interpreter-invoices" className="shrink-0 text-xs font-bold text-blue-600 dark:text-blue-400">Review registry</Link>
        </div>
      )}

      <div className="border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-3 dark:border-slate-800 sm:flex-row sm:items-center">
          <div className="flex rounded-md border border-slate-200 p-0.5 dark:border-slate-700">
            {([
              ['cycle', `Cycle (${payees.length})`],
              ['documents', `Documents (${cycleDocuments.length})`],
            ] as Array<[PayablesView, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => updateParams({ view: value === 'cycle' ? null : value, page: null })}
                className={`h-8 rounded px-3 text-xs font-bold ${view === value ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={event => updateParams({ q: event.target.value || null, page: null })}
              placeholder={view === 'cycle' ? 'Search professional' : 'Search professional or document'}
              className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-3"><TableSkeleton rows={8} /></div>
        ) : activeRows.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-4 py-10 text-center">
            {view === 'cycle' ? <Users size={28} className="text-slate-300 dark:text-slate-600" /> : <FileText size={28} className="text-slate-300 dark:text-slate-600" />}
            <p className="mt-3 text-sm font-black text-slate-900 dark:text-white">{cycleLoadError ? 'Cycle data unavailable' : cycle ? 'No matching records' : 'This cycle has not been prepared'}</p>
            <p className="mt-1 max-w-lg text-sm text-slate-500">{cycleLoadError ? 'Retry the read operation above. No financial data has been changed.' : cycle ? 'Change the search or inspect another period.' : 'Prepare a read-only snapshot to inspect eligible work and exceptions before approval.'}</p>
          </div>
        ) : view === 'cycle' ? (
          <>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 md:hidden">
            {pagePayees.map(payee => {
              const canGenerate = cycle?.status === 'APPROVED' && payee.readyCount > 0 && payee.exceptionCount === 0 && payee.interpreterId !== 'unassigned';
              return (
                <div key={payee.interpreterId} className="space-y-3 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {payee.interpreterId !== 'unassigned' ? (
                        <Link to={`/admin/interpreters/${payee.interpreterId}`} className="truncate text-sm font-black text-slate-950 dark:text-white">{payee.interpreterName}</Link>
                      ) : (
                        <p className="text-sm font-black text-rose-700 dark:text-rose-300">Unassigned professional</p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-500">{payee.jobCount} jobs · {payee.readyCount} ready · {payee.exceptionCount} exceptions</p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-slate-950 dark:text-white">{money(payee.totalAmount, cycle?.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    {payee.exceptionCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 dark:text-rose-300"><AlertTriangle size={13} /> Review required</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={13} /> Ready</span>
                    )}
                    {canGenerate && (
                      <button type="button" onClick={() => generateStatement(payee)} disabled={Boolean(action)} className="text-xs font-bold text-blue-600 disabled:opacity-50 dark:text-blue-400">Generate document</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[920px] w-full border-collapse text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 dark:bg-slate-950/60">
                <tr>
                  <th className="px-4 py-3">Professional</th>
                  <th className="px-4 py-3 text-right">Jobs</th>
                  <th className="px-4 py-3 text-right">Ready</th>
                  <th className="px-4 py-3 text-right">Exceptions</th>
                  <th className="px-4 py-3 text-right">Gross payable</th>
                  <th className="px-4 py-3">Readiness</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pagePayees.map(payee => {
                  const canGenerate = cycle?.status === 'APPROVED' && payee.readyCount > 0 && payee.exceptionCount === 0 && payee.interpreterId !== 'unassigned';
                  return (
                    <tr key={payee.interpreterId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        {payee.interpreterId !== 'unassigned' ? (
                          <Link to={`/admin/interpreters/${payee.interpreterId}`} className="font-bold text-slate-950 hover:text-blue-600 dark:text-white dark:hover:text-blue-400">{payee.interpreterName}</Link>
                        ) : (
                          <span className="font-bold text-rose-700 dark:text-rose-300">Unassigned professional</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700 dark:text-slate-200">{payee.jobCount}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700 dark:text-slate-200">{payee.readyCount}</td>
                      <td className={`px-4 py-3 text-right text-sm font-black ${payee.exceptionCount ? 'text-rose-600' : 'text-slate-400'}`}>{payee.exceptionCount}</td>
                      <td className="px-4 py-3 text-right text-sm font-black text-slate-950 dark:text-white">{money(payee.totalAmount, cycle?.currency)}</td>
                      <td className="px-4 py-3">
                        {payee.exceptionCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 dark:text-rose-300"><AlertTriangle size={13} /> Review required</span>
                        ) : payee.readyCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={13} /> Ready</span>
                        ) : (
                          <span className="text-xs font-bold text-slate-500">Document created</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canGenerate ? (
                          <button
                            type="button"
                            onClick={() => generateStatement(payee)}
                            disabled={Boolean(action)}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 px-3 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/40"
                          >
                            <FileText size={13} /> Generate document
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">{cycle?.status === 'APPROVED' ? '-' : 'Approve cycle first'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 md:hidden">
            {pageDocuments.map(invoice => (
              <Link key={invoice.id} to={`/admin/billing/interpreter-invoices/${invoice.id}`} className="block space-y-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950 dark:text-white">{referenceFor(invoice)}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-600 dark:text-slate-300">{invoice.interpreterName}</p>
                  </div>
                  <span className="shrink-0 text-sm font-black text-slate-950 dark:text-white">{money(invoice.totalAmount, invoice.currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>{invoice.model === 'SELF_BILL' ? 'Self-bill' : 'Uploaded invoice'} · {invoice.status.replace(/_/g, ' ')}</span>
                  <span>{formatDate(invoice.issueDate)} <ArrowUpRight size={12} className="ml-1 inline" /></span>
                </div>
              </Link>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[920px] w-full border-collapse text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 dark:bg-slate-950/60">
                <tr>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Professional</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Issue date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pageDocuments.map(invoice => (
                  <tr key={invoice.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-sm font-black text-slate-950 dark:text-white">{referenceFor(invoice)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{invoice.interpreterName}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-500">{invoice.model === 'SELF_BILL' ? 'Self-bill' : 'Uploaded invoice'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatDate(invoice.issueDate)}</td>
                    <td className="px-4 py-3 text-xs font-black text-slate-700 dark:text-slate-200">{invoice.status.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-right text-sm font-black text-slate-950 dark:text-white">{money(invoice.totalAmount, invoice.currency)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/admin/billing/interpreter-invoices/${invoice.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400">
                        Open <ArrowUpRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        {!loading && activeRows.length > 0 && (
          <WorkspacePagination
            totalCount={activeRows.length}
            pageStartIndex={pageStartIndex}
            pageEndIndex={pageEndIndex}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPreviousPage={() => updateParams({ page: String(Math.max(1, currentPage - 1)) })}
            onNextPage={() => updateParams({ page: String(Math.min(totalPages, currentPage + 1)) })}
            onPageSizeChange={size => {
              setPageSize(size);
              updateParams({ page: null });
            }}
            entityLabel={view === 'cycle' ? 'professional' : 'document'}
          />
        )}
      </div>
    </div>
  );
};
