import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  FileText,
  Receipt,
  RefreshCw,
  Search,
} from 'lucide-react';
import { BillingService } from '../../../services/billingService';
import { useBookings } from '../../../hooks/useBookings';
import {
  Booking,
  ClientInvoice,
  ReceivableStatus,
  ServiceCategory,
} from '../../../types';
import {
  getBookingServicePeriod,
  getInvoiceReceivableStatus,
  getReceivableStatus,
  matchesServiceCategory,
} from '../../../domains/finance/financeLifecycle';
import { PageHeader } from '../../../components/layout/PageHeader';
import { TableSkeleton } from '../../../components/ui/Skeleton';
import { WorkspacePagination } from '../../../components/operations/WorkspacePagination';
import { useToast } from '../../../context/ToastContext';

type ReceivableQueue = 'READY' | 'DRAFT' | 'ISSUED' | 'OVERDUE' | 'PAID';
type ServiceScope = 'all' | 'interpreting' | 'translations';

interface ReadyBatch {
  id: string;
  clientId: string;
  clientName: string;
  periodKey: string;
  jobCount: number;
  totalAmount: number;
  serviceCategories: ServiceCategory[];
  earliestDate: string;
  latestDate: string;
}

const QUEUES: Array<{ id: ReceivableQueue; label: string }> = [
  { id: 'READY', label: 'Ready' },
  { id: 'DRAFT', label: 'Drafts' },
  { id: 'ISSUED', label: 'Issued' },
  { id: 'OVERDUE', label: 'Overdue' },
  { id: 'PAID', label: 'Paid' },
];

const money = (value: number, currency = 'GBP') => (
  `${currency} ${Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
);

const serviceCategoryForScope = (scope: ServiceScope) => (
  scope === 'interpreting'
    ? ServiceCategory.INTERPRETATION
    : scope === 'translations'
      ? ServiceCategory.TRANSLATION
      : undefined
);

const serviceLabel = (categories: ServiceCategory[]) => {
  if (categories.length > 1) return 'Mixed services';
  return categories[0] === ServiceCategory.TRANSLATION ? 'Translations' : 'Interpreting';
};

const formatDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-GB');
};

const invoiceReference = (invoice: ClientInvoice) => (
  invoice.invoiceNumber || invoice.reference || invoice.id
);

const periodBounds = (periodKey: string) => {
  const [year, month] = periodKey.split('-').map(Number);
  if (!year || !month) return { start: '', end: '' };
  return {
    start: `${periodKey}-01`,
    end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  };
};

const jobAmount = (booking: Booking) => Number(
  booking.clientInvoiceTotal
  || booking.totalAmount
  || booking.finalQuote
  || 0,
);

const StatusPill = ({ status }: { status: ReceivableStatus }) => {
  const classes: Record<string, string> = {
    READY: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
    DRAFT: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
    ISSUED: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
    OVERDUE: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300',
    PAID: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-black uppercase ${classes[status] || classes.DRAFT}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export const AccountsReceivableWorkspace = () => {
  const { bookings, loading: bookingsLoading, refresh: refreshBookings } = useBookings();
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const queue = (QUEUES.some(item => item.id === searchParams.get('queue'))
    ? searchParams.get('queue')
    : 'READY') as ReceivableQueue;
  const serviceScope = (['all', 'interpreting', 'translations'].includes(searchParams.get('service') || '')
    ? searchParams.get('service')
    : 'all') as ServiceScope;
  const search = searchParams.get('q') || '';
  const requestedPage = Math.max(1, Number(searchParams.get('page') || 1));
  const serviceCategory = serviceCategoryForScope(serviceScope);

  const loadInvoices = async () => {
    setInvoicesLoading(true);
    try {
      setInvoices(await BillingService.getClientInvoices());
    } catch (error) {
      console.error('Failed to load accounts receivable documents', error);
      showToast('Accounts receivable documents could not be loaded.', 'error');
    } finally {
      setInvoicesLoading(false);
    }
  };

  useEffect(() => {
    void loadInvoices();
  }, []);

  const updateParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (!value) next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next, { replace: true });
  };

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([refreshBookings(), loadInvoices()]);
    setRefreshing(false);
  };

  const scopedBookings = useMemo(() => bookings.filter(booking => (
    !serviceCategory || booking.serviceCategory === serviceCategory
  )), [bookings, serviceCategory]);

  const scopedInvoices = useMemo(() => invoices.filter(invoice => (
    matchesServiceCategory(invoice, serviceCategory)
  )), [invoices, serviceCategory]);

  const readyBatches = useMemo(() => {
    const batches = new Map<string, ReadyBatch>();
    scopedBookings.filter(booking => getReceivableStatus(booking) === 'READY').forEach(booking => {
      const periodKey = getBookingServicePeriod(booking) || 'Unscheduled';
      const clientId = booking.clientId || 'unlinked';
      const id = `${clientId}_${periodKey}`;
      const category = booking.serviceCategory || ServiceCategory.INTERPRETATION;
      const current = batches.get(id) || {
        id,
        clientId,
        clientName: booking.clientName || 'Unlinked client',
        periodKey,
        jobCount: 0,
        totalAmount: 0,
        serviceCategories: [],
        earliestDate: booking.date,
        latestDate: booking.date,
      };
      current.jobCount += 1;
      current.totalAmount += jobAmount(booking);
      if (!current.serviceCategories.includes(category)) current.serviceCategories.push(category);
      if (booking.date && (!current.earliestDate || booking.date < current.earliestDate)) current.earliestDate = booking.date;
      if (booking.date && (!current.latestDate || booking.date > current.latestDate)) current.latestDate = booking.date;
      batches.set(id, current);
    });
    return Array.from(batches.values()).sort((a, b) => b.periodKey.localeCompare(a.periodKey) || a.clientName.localeCompare(b.clientName));
  }, [scopedBookings]);

  const queueCounts = useMemo(() => ({
    READY: readyBatches.length,
    DRAFT: scopedInvoices.filter(invoice => getInvoiceReceivableStatus(invoice) === 'DRAFT').length,
    ISSUED: scopedInvoices.filter(invoice => getInvoiceReceivableStatus(invoice) === 'ISSUED').length,
    OVERDUE: scopedInvoices.filter(invoice => getInvoiceReceivableStatus(invoice) === 'OVERDUE').length,
    PAID: scopedInvoices.filter(invoice => getInvoiceReceivableStatus(invoice) === 'PAID').length,
  }), [readyBatches, scopedInvoices]);

  const filteredBatches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return readyBatches.filter(batch => !needle || [batch.clientName, batch.periodKey, serviceLabel(batch.serviceCategories)]
      .some(value => value.toLowerCase().includes(needle)));
  }, [readyBatches, search]);

  const filteredInvoices = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return scopedInvoices.filter(invoice => {
      if (getInvoiceReceivableStatus(invoice) !== queue) return false;
      if (!needle) return true;
      return [invoiceReference(invoice), invoice.clientName, invoice.periodStart, invoice.periodEnd]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle));
    });
  }, [queue, scopedInvoices, search]);

  const activeRows = queue === 'READY' ? filteredBatches : filteredInvoices;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageStartIndex = (currentPage - 1) * pageSize;
  const pageEndIndex = Math.min(pageStartIndex + pageSize, activeRows.length);
  const pageBatches = filteredBatches.slice(pageStartIndex, pageEndIndex);
  const pageInvoices = filteredInvoices.slice(pageStartIndex, pageEndIndex);
  const openAmount = scopedInvoices
    .filter(invoice => ['ISSUED', 'OVERDUE'].includes(getInvoiceReceivableStatus(invoice)))
    .reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
  const overdueAmount = scopedInvoices
    .filter(invoice => getInvoiceReceivableStatus(invoice) === 'OVERDUE')
    .reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
  const loading = bookingsLoading || invoicesLoading;

  return (
    <div className="space-y-4">
      <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
        Finance <span className="px-1 text-slate-300">/</span> Accounts Receivable
      </div>
      <PageHeader
        title="Accounts Receivable"
        subtitle="Client billing and collections. Operational job status and interpreter payment remain independent."
      >
        <button
          type="button"
          onClick={refreshAll}
          disabled={refreshing}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
        <Link
          to="/admin/billing/client-invoices"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700"
        >
          <FileText size={15} /> Invoice documents
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-4">
        {[
          ['Ready batches', queueCounts.READY, 'Prepare invoices'],
          ['Open receivables', money(openAmount), `${queueCounts.ISSUED + queueCounts.OVERDUE} documents`],
          ['Overdue', money(overdueAmount), `${queueCounts.OVERDUE} documents`],
          ['Paid documents', queueCounts.PAID, 'Collection history'],
        ].map(([label, value, meta], index) => (
          <div key={String(label)} className={`px-4 py-3 ${index % 2 ? '' : 'border-r border-slate-200 dark:border-slate-800'} lg:border-r lg:last:border-r-0`}>
            <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
            <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">{value}</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{meta}</p>
          </div>
        ))}
      </div>

      <div className="border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-3 dark:border-slate-800 xl:flex-row xl:items-center">
          <div className="scrollbar-hide flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="Accounts receivable queue">
            {QUEUES.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => updateParams({ queue: item.id, page: null })}
                className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-bold ${queue === item.id ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                {item.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${queue === item.id ? 'bg-white/15 dark:bg-slate-900/10' : 'bg-slate-100 dark:bg-slate-800'}`}>{queueCounts[item.id]}</span>
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row xl:w-[440px] xl:shrink-0">
            <label className="sr-only" htmlFor="receivable-service-scope">Service scope</label>
            <select
              id="receivable-service-scope"
              value={serviceScope}
              onChange={event => updateParams({ service: event.target.value === 'all' ? null : event.target.value, page: null })}
              className="h-9 shrink-0 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 sm:w-36"
            >
              <option value="all">All services</option>
              <option value="interpreting">Interpreting</option>
              <option value="translations">Translations</option>
            </select>
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={event => updateParams({ q: event.target.value || null, page: null })}
                placeholder="Search client, period or invoice"
                className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-3"><TableSkeleton rows={8} /></div>
        ) : activeRows.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-4 py-10 text-center">
            <Receipt size={28} className="text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm font-black text-slate-900 dark:text-white">No records in this queue</p>
            <p className="mt-1 text-sm text-slate-500">Change the service scope or choose another receivable stage.</p>
          </div>
        ) : queue === 'READY' ? (
          <>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 md:hidden">
            {pageBatches.map(batch => {
              const bounds = periodBounds(batch.periodKey);
              const canGenerate = batch.clientId !== 'unlinked' && Boolean(bounds.start && bounds.end);
              const target = `/admin/billing/client-invoices?clientId=${encodeURIComponent(batch.clientId)}&start=${bounds.start}&end=${bounds.end}`;
              return (
                <div key={batch.id} className="space-y-3 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950 dark:text-white">{batch.clientName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{batch.periodKey} · {serviceLabel(batch.serviceCategories)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-slate-950 dark:text-white">{money(batch.totalAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>{batch.jobCount} job{batch.jobCount === 1 ? '' : 's'} · {formatDate(batch.earliestDate)} - {formatDate(batch.latestDate)}</span>
                    {canGenerate ? (
                      <Link to={target} className="shrink-0 font-bold text-blue-600 dark:text-blue-400">Prepare <ArrowUpRight size={12} className="inline" /></Link>
                    ) : (
                      <span className="shrink-0 font-bold text-amber-700 dark:text-amber-300">Resolve client</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[900px] w-full border-collapse text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 dark:bg-slate-950/60">
                <tr>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Service period</th>
                  <th className="px-4 py-3">Scope</th>
                  <th className="px-4 py-3 text-right">Jobs</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pageBatches.map(batch => {
                  const bounds = periodBounds(batch.periodKey);
                  const canGenerate = batch.clientId !== 'unlinked' && Boolean(bounds.start && bounds.end);
                  const target = `/admin/billing/client-invoices?clientId=${encodeURIComponent(batch.clientId)}&start=${bounds.start}&end=${bounds.end}`;
                  return (
                    <tr key={batch.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className="shrink-0 text-slate-400" />
                          <div className="min-w-0">
                            <p className="max-w-[300px] truncate text-sm font-bold text-slate-950 dark:text-white">{batch.clientName}</p>
                            <p className="text-xs text-slate-500">{formatDate(batch.earliestDate)} - {formatDate(batch.latestDate)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{batch.periodKey}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{serviceLabel(batch.serviceCategories)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-slate-700 dark:text-slate-200">{batch.jobCount}</td>
                      <td className="px-4 py-3 text-right text-sm font-black text-slate-950 dark:text-white">{money(batch.totalAmount)}</td>
                      <td className="px-4 py-3 text-right">
                        {canGenerate ? (
                          <Link to={target} className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-200 px-3 text-xs font-bold text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/40">
                            Prepare invoice <ArrowUpRight size={13} />
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-300"><AlertTriangle size={13} /> Resolve client</span>
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
            {pageInvoices.map(invoice => {
              const status = getInvoiceReceivableStatus(invoice);
              return (
                <Link key={invoice.id} to={`/admin/billing/client-invoices/${invoice.id}`} className="block space-y-2 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950 dark:text-white">{invoiceReference(invoice)}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-slate-600 dark:text-slate-300">{invoice.clientName}</p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-slate-950 dark:text-white">{money(invoice.totalAmount, invoice.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <StatusPill status={status} />
                    <span className="text-xs text-slate-500">Due {formatDate(invoice.dueDate)} <ArrowUpRight size={12} className="ml-1 inline" /></span>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[900px] w-full border-collapse text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 dark:bg-slate-950/60">
                <tr>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Invoice period</th>
                  <th className="px-4 py-3">Due date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {pageInvoices.map(invoice => {
                  const status = getInvoiceReceivableStatus(invoice);
                  return (
                    <tr key={invoice.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 text-sm font-black text-slate-950 dark:text-white">{invoiceReference(invoice)}</td>
                      <td className="max-w-[260px] truncate px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{invoice.clientName}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{formatDate(invoice.dueDate)}</td>
                      <td className="px-4 py-3"><StatusPill status={status} /></td>
                      <td className="px-4 py-3 text-right text-sm font-black text-slate-950 dark:text-white">{money(invoice.totalAmount, invoice.currency)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/admin/billing/client-invoices/${invoice.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400">
                          Open <ArrowUpRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
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
            entityLabel={queue === 'READY' ? 'batch' : 'invoice'}
          />
        )}
      </div>
    </div>
  );
};
