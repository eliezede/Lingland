import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  PoundSterling,
  Receipt,
  Users,
} from 'lucide-react';
import { BillingService } from '../../../services/billingService';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useBookings } from '../../../hooks/useBookings';
import { BookingStatus, ClientInvoice, ServiceCategory } from '../../../types';
import { getInvoiceReceivableStatus, getPayableStatus, getReceivableStatus } from '../../../domains/finance/financeLifecycle';

type FinanceTileTone = 'blue' | 'amber' | 'emerald' | 'rose' | 'slate';

interface FinanceTileProps {
  label: string;
  value: string | number;
  meta: string;
  to: string;
  icon: React.ElementType;
  tone?: FinanceTileTone;
  loading?: boolean;
}

const money = (value: number) => `GBP ${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const toneClasses: Record<FinanceTileTone, string> = {
  blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300',
  amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300',
  rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300',
  slate: 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
};

const FinanceTile: React.FC<FinanceTileProps> = ({ label, value, meta, to, icon: Icon, tone = 'slate', loading }) => (
  <Link
    to={to}
    className="group flex min-h-[78px] items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800 dark:hover:bg-blue-950/20"
  >
    <div className="flex min-w-0 items-center gap-3">
      <span className={`shrink-0 rounded-md border p-2 ${toneClasses[tone]}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
        {loading ? <Skeleton className="mt-2 h-6 w-20" /> : <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{value}</p>}
      </div>
    </div>
    <div className="flex min-w-[92px] items-center justify-end gap-2 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">
      <span className="truncate">{meta}</span>
      <ArrowUpRight size={14} className="shrink-0 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-blue-600" />
    </div>
  </Link>
);

const sumTotal = (records: Array<{ totalAmount?: number }>) => records.reduce((sum, record) => sum + (Number(record.totalAmount) || 0), 0);

export const AdminBillingDashboard = () => {
  const { bookings, loading: jobsLoading } = useBookings();
  const [stats, setStats] = useState<any>({
    pendingClientInvoices: 0,
    pendingClientAmount: 0,
    pendingInterpreterInvoices: 0,
    pendingTimesheets: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [clientInvoices, setClientInvoices] = useState<ClientInvoice[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsLoading(true);
        const [data, invoiceDocuments] = await Promise.all([
          BillingService.getDashboardStats(),
          BillingService.getClientInvoices(),
        ]);
        setStats(data || {
          pendingClientInvoices: 0,
          pendingClientAmount: 0,
          pendingInterpreterInvoices: 0,
          pendingTimesheets: 0,
        });
        setClientInvoices(invoiceDocuments);
      } catch (error) {
        console.error('Failed to fetch dashboard stats', error);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, []);

  const financeMetrics = useMemo(() => {
    const timesheetNeeded = bookings.filter(job => job.status === BookingStatus.SESSION_COMPLETED);
    const timesheetReview = bookings.filter(job => job.status === BookingStatus.TIMESHEET_SUBMITTED);
    const readyForClientInvoice = bookings.filter(job => getReceivableStatus(job) === 'READY');
    const awaitingPayment = clientInvoices.filter(invoice => ['ISSUED', 'OVERDUE', 'PARTIALLY_PAID'].includes(getInvoiceReceivableStatus(invoice)));
    const paid = clientInvoices.filter(invoice => getInvoiceReceivableStatus(invoice) === 'PAID');
    const interpretingPayables = bookings.filter(job => job.serviceCategory !== ServiceCategory.TRANSLATION && getPayableStatus(job) !== 'NOT_ELIGIBLE');
    const translationPayables = bookings.filter(job => job.serviceCategory === ServiceCategory.TRANSLATION && getPayableStatus(job) !== 'NOT_ELIGIBLE');
    const missingBillingData = bookings.filter(job => (
      [BookingStatus.SESSION_COMPLETED, BookingStatus.TIMESHEET_SUBMITTED, BookingStatus.TIMESHEET_VERIFIED, BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING].includes(job.status)
      && (!job.costCode || !job.totalAmount)
    ));
    const translationBilling = bookings.filter(job => (
      job.serviceCategory === ServiceCategory.TRANSLATION
      && [BookingStatus.SESSION_COMPLETED, BookingStatus.TIMESHEET_SUBMITTED, BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING, BookingStatus.INVOICED].includes(job.status)
    ));

    return {
      timesheetNeeded,
      timesheetReview,
      readyForClientInvoice,
      awaitingPayment,
      paid,
      interpretingPayables,
      translationPayables,
      missingBillingData,
      translationBilling,
      readyAmount: sumTotal(readyForClientInvoice),
      awaitingAmount: sumTotal(awaitingPayment),
      paidAmount: sumTotal(paid),
    };
  }, [bookings, clientInvoices]);

  const loading = jobsLoading || statsLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Finance / Overview</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">Finance control room</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            A clear handoff from delivered work to client collections and monthly professional settlements.
          </p>
        </div>
        <Link
          to="/admin/finance/receivables"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
        >
          <PoundSterling size={16} /> Open Accounts Receivable
        </Link>
      </div>

      <section className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <FinanceTile
          label="Ready for client invoice"
          value={financeMetrics.readyForClientInvoice.length}
          meta={money(financeMetrics.readyAmount)}
          to="/admin/finance/receivables?queue=READY"
          icon={Receipt}
          tone="blue"
          loading={loading}
        />
        <FinanceTile
          label="Outstanding invoices"
          value={financeMetrics.awaitingPayment.length}
          meta={money(financeMetrics.awaitingAmount)}
          to="/admin/finance/receivables?queue=ISSUED"
          icon={Clock}
          tone="amber"
          loading={loading}
        />
        <FinanceTile
          label="Timesheet review"
          value={financeMetrics.timesheetReview.length || stats.pendingTimesheets}
          meta={`${financeMetrics.timesheetNeeded.length} need manual timesheet`}
          to="/admin/operations/timesheets"
          icon={FileText}
          tone="emerald"
          loading={loading}
        />
        <FinanceTile
          label="Billing exceptions"
          value={financeMetrics.missingBillingData.length}
          meta="Missing PO, cost code or amount"
          to="/admin/finance/receivables?queue=READY"
          icon={AlertCircle}
          tone="rose"
          loading={loading}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-black text-slate-950 dark:text-white">Finance workspaces</h2>
              <p className="text-xs text-slate-500">Receivables and payables have independent states, owners and monthly controls.</p>
            </div>
            <BarChart3 size={18} className="text-slate-400" />
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[
              {
                label: 'Accounts Receivable',
                description: 'Client invoice preparation, issuance, collections and overdue work.',
                count: financeMetrics.readyForClientInvoice.length + financeMetrics.awaitingPayment.length,
                to: '/admin/finance/receivables',
                icon: Receipt,
              },
              {
                label: 'Accounts Payable - Interpreting',
                description: 'Monthly interpreter settlement cycles and payable documents.',
                count: financeMetrics.interpretingPayables.length,
                to: '/admin/finance/payables/interpreting',
                icon: Users,
              },
              {
                label: 'Accounts Payable - Translations',
                description: 'Monthly translator settlement cycles kept separate from interpreting.',
                count: financeMetrics.translationPayables.length,
                to: '/admin/finance/payables/translations',
                icon: FileText,
              },
              {
                label: 'Finance Reports',
                description: 'Revenue, cost, margin and operational-finance reporting.',
                count: `${clientInvoices.length} docs`,
                to: '/admin/reports?report=FINANCE_OVERVIEW',
                icon: BarChart3,
              },
            ].map(item => (
              <Link key={item.label} to={item.to} className="group flex items-center gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <item.icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-950 dark:text-white">{item.label}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item.count}</span>
                <ArrowUpRight size={14} className="text-slate-400 group-hover:text-blue-600" />
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-black text-slate-950 dark:text-white">Month pulse</h2>
            <p className="text-xs text-slate-500">Quick health indicators from the current platform data.</p>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Draft and issued amount</span>
              {loading ? <Skeleton className="h-5 w-20" /> : <span className="text-sm font-black text-slate-950 dark:text-white">{money(stats.pendingClientAmount || financeMetrics.readyAmount)}</span>}
            </div>
            <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Collected invoice value</span>
              {loading ? <Skeleton className="h-5 w-20" /> : <span className="text-sm font-black text-slate-950 dark:text-white">{money(financeMetrics.paidAmount)}</span>}
            </div>
            <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Exceptions blocking billing</span>
              {loading ? <Skeleton className="h-5 w-12" /> : <span className="text-sm font-black text-rose-600">{financeMetrics.missingBillingData.length}</span>}
            </div>
            <Link
              to="/admin/billing/client-invoices"
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Client invoice documents <CreditCard size={15} />
            </Link>
            <Link
              to="/admin/billing/interpreter-invoices"
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Interpreter invoice documents <CheckCircle2 size={15} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
