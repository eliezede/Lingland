import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { InterpreterService } from '../../services/interpreterService';
import { BookingService } from '../../services/bookingService';
import { BillingService } from '../../services/billingService';
import { ChatService } from '../../services/chatService';
import { Booking, BookingStatus, Interpreter, InterpreterInvoice, InvoiceStatus, Timesheet } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { PageHeader } from '../../components/layout/PageHeader';
import { Table } from '../../components/ui/Table';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { BulkActionBar } from '../../components/ui/BulkActionBar';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import {
  AlertCircle,
  Briefcase,
  Check,
  CreditCard,
  ExternalLink,
  FileText,
  MessageSquare,
  Search,
  Trash2,
  UserCircle2,
} from 'lucide-react';

interface InterpreterWithStats extends Interpreter {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  claimsInReview: number;
  missingClaims: number;
  approvedClaims: number;
  payablePending: number;
  openInvoices: number;
  paidInvoices: number;
  lastJobDate?: string;
  accountMode: string;
}

export const AdminInterpreters = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { openThread } = useChat();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [interpreters, setInterpreters] = useState<InterpreterWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  const [textFilter, setTextFilter] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ONBOARDING' | 'SUSPENDED' | 'IMPORTED'>('ALL');
  const [queueFilter, setQueueFilter] = useState<'ALL' | 'CLAIMS' | 'PAYABLES'>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const crmReturnState = { returnTo: `${location.pathname}${location.search}`, returnLabel: 'Interpreter CRM' };

  useEffect(() => {
    loadInterpreters();
  }, []);

  const money = (amount?: number) => `GBP ${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const loadInterpreters = async () => {
    setLoading(true);
    try {
      const [profiles, bookings, timesheets, invoices] = await Promise.all([
        InterpreterService.getAll(),
        BookingService.getAll(),
        BillingService.getAllTimesheets(),
        BillingService.getInterpreterInvoices('ALL'),
      ]);

      const bookingsByInterpreter = new Map<string, Booking[]>();
      bookings.forEach(job => {
        if (!job.interpreterId) return;
        bookingsByInterpreter.set(job.interpreterId, [...(bookingsByInterpreter.get(job.interpreterId) || []), job]);
      });

      const timesheetsByInterpreter = new Map<string, Timesheet[]>();
      timesheets.forEach(timesheet => {
        if (!timesheet.interpreterId) return;
        timesheetsByInterpreter.set(timesheet.interpreterId, [...(timesheetsByInterpreter.get(timesheet.interpreterId) || []), timesheet]);
      });

      const invoicesByInterpreter = new Map<string, InterpreterInvoice[]>();
      invoices.forEach(invoice => {
        if (!invoice.interpreterId) return;
        invoicesByInterpreter.set(invoice.interpreterId, [...(invoicesByInterpreter.get(invoice.interpreterId) || []), invoice]);
      });

      const rows = profiles
        .map(profile => ({
          ...profile,
          ...buildInterpreterStats(
            profile,
            bookingsByInterpreter.get(profile.id) || [],
            timesheetsByInterpreter.get(profile.id) || [],
            invoicesByInterpreter.get(profile.id) || []
          ),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setInterpreters(rows);
    } catch (error) {
      console.error('Error loading interpreters', error);
      showToast('Error loading interpreters', 'error');
    } finally {
      setLoading(false);
    }
  };

  const buildInterpreterStats = (
    interpreter: Interpreter,
    jobs: Booking[],
    timesheets: Timesheet[],
    invoices: InterpreterInvoice[]
  ) => {
    const activeStatuses = new Set<string>([
      BookingStatus.OPENED,
      BookingStatus.NEEDS_ASSIGNMENT,
      BookingStatus.ASSIGNMENT_PENDING,
      BookingStatus.BOOKED,
      BookingStatus.SESSION_COMPLETED,
      BookingStatus.ADMIN,
      BookingStatus.ADMIN_HOLD,
    ]);
    const completedStatuses = new Set<string>([
      BookingStatus.TIMESHEET_SUBMITTED,
      BookingStatus.READY_FOR_INVOICE,
      BookingStatus.INVOICING,
      BookingStatus.INVOICED,
      BookingStatus.PAID,
    ]);
    const payableTimesheets = timesheets.filter(ts => ts.adminApproved && !ts.interpreterInvoiceId);
    const bookingsWithTimesheet = new Set(timesheets.map(ts => ts.bookingId));
    const missingClaims = jobs.filter(job => job.status === BookingStatus.SESSION_COMPLETED && !bookingsWithTimesheet.has(job.id)).length;
    const sortedDates = jobs
      .map(job => new Date([job.date, job.startTime].filter(Boolean).join(' ')))
      .filter(date => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());

    return {
      totalJobs: jobs.length,
      activeJobs: jobs.filter(job => activeStatuses.has(String(job.status))).length,
      completedJobs: jobs.filter(job => completedStatuses.has(String(job.status))).length,
      claimsInReview: timesheets.filter(ts => !ts.adminApproved && ts.status === 'SUBMITTED').length,
      missingClaims,
      approvedClaims: timesheets.filter(ts => ts.adminApproved || ['INVOICING', 'INVOICED'].includes(String(ts.status))).length,
      payablePending: payableTimesheets.reduce((sum, ts) => sum + Number(ts.interpreterAmountCalculated || ts.totalToPay || 0), 0),
      openInvoices: invoices.filter(inv => inv.status !== InvoiceStatus.PAID && inv.status !== InvoiceStatus.CANCELLED).length,
      paidInvoices: invoices.filter(inv => inv.status === InvoiceStatus.PAID).length,
      lastJobDate: sortedDates[0]?.toISOString(),
      accountMode: interpreter.status === 'IMPORTED'
        ? (interpreter.activationEmailSentAt ? 'Activation sent' : 'Passive import')
        : 'Platform active',
    };
  };

  const filteredInterpreters = interpreters.filter(i => {
    const query = textFilter.toLowerCase();
    const matchesText = i.name.toLowerCase().includes(query) || i.email.toLowerCase().includes(query);
    const languageSource = i.languages?.length ? i.languages : i.languageProficiencies?.map(p => p.language) || [];
    const matchesLang = langFilter ? languageSource.some(l => l.toLowerCase().includes(langFilter.toLowerCase())) : true;
    const matchesStatus = statusFilter === 'ALL' ? true : i.status === statusFilter;
    const matchesQueue = queueFilter === 'ALL'
      ? true
      : queueFilter === 'CLAIMS'
        ? i.claimsInReview > 0 || i.missingClaims > 0
        : i.payablePending > 0 || i.openInvoices > 0;
    return matchesText && matchesLang && matchesStatus && matchesQueue;
  });

  const summary = {
    total: interpreters.length,
    active: interpreters.filter(i => i.status === 'ACTIVE').length,
    passive: interpreters.filter(i => i.status === 'IMPORTED').length,
    claims: interpreters.reduce((sum, i) => sum + i.claimsInReview + i.missingClaims, 0),
    payables: interpreters.reduce((sum, i) => sum + i.payablePending, 0),
  };

  const filterChips = [
    { label: 'All', value: summary.total, active: statusFilter === 'ALL' && queueFilter === 'ALL', onClick: () => { setStatusFilter('ALL'); setQueueFilter('ALL'); } },
    { label: 'Active', value: summary.active, active: statusFilter === 'ACTIVE' && queueFilter === 'ALL', onClick: () => { setStatusFilter('ACTIVE'); setQueueFilter('ALL'); } },
    { label: 'Passive', value: summary.passive, active: statusFilter === 'IMPORTED' && queueFilter === 'ALL', onClick: () => { setStatusFilter('IMPORTED'); setQueueFilter('ALL'); } },
    { label: 'Claims', value: summary.claims, active: queueFilter === 'CLAIMS', onClick: () => { setStatusFilter('ALL'); setQueueFilter('CLAIMS'); } },
    { label: 'Payables', value: money(summary.payables), active: queueFilter === 'PAYABLES', onClick: () => { setStatusFilter('ALL'); setQueueFilter('PAYABLES'); } },
  ];

  const handleStartChat = async (e: React.MouseEvent | undefined, interpreterId: string, interpreterName: string, interpreterPhoto?: string) => {
    if (e) e.stopPropagation();
    if (!user) return;

    try {
      const interpreterRecord = interpreters.find(i => i.id === interpreterId);
      const interpreterUser = await ChatService.resolveUserByProfileId(interpreterId) || await ChatService.resolveUserByEmail(interpreterRecord?.email || '');
      if (!interpreterUser) {
        showToast('No active user account found for this interpreter', 'error');
        return;
      }
      const threadId = await ChatService.getOrCreateDirectThreadWithUser(
        user,
        { ...interpreterUser, displayName: interpreterName || interpreterUser.displayName, photoUrl: interpreterPhoto || interpreterUser.photoUrl }
      );
      openThread(threadId);
    } catch (error) {
      console.error('Failed to start chat', error);
      showToast('Failed to start chat', 'error');
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    let done = 0;
    for (const id of selectedIds) {
      try {
        await InterpreterService.updateProfile(id, { status: status as any });
        done++;
      } catch (err) {
        // Keep processing the rest of the selected rows.
      }
    }
    showToast(`Updated ${done} interpreters to ${status}`, 'success');
    setSelectedIds([]);
    loadInterpreters();
  };

  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: 'Bulk Delete Interpreters',
      message: `Are you sure you want to permanently delete ${selectedIds.length} interpreters? This will remove their profile data and account access.`,
      confirmLabel: 'Delete Permanently',
      variant: 'danger',
    });
    if (!ok) return;

    let done = 0;
    for (const id of selectedIds) {
      try {
        await InterpreterService.delete(id);
        done++;
      } catch (err) {
        // Keep processing the rest of the selected rows.
      }
    }
    showToast(`Deleted ${done} interpreters`, 'success');
    setSelectedIds([]);
    loadInterpreters();
  };

  const openInterpreterJobs = (interpreter: InterpreterWithStats) => {
    navigate(`/admin/bookings?interpreterId=${interpreter.id}`, { state: crmReturnState });
  };

  const openInterpreterProfile = (interpreter: InterpreterWithStats) => {
    navigate(`/admin/interpreters/${interpreter.id}`, { state: crmReturnState });
  };

  const openInterpreterClaims = (interpreter: InterpreterWithStats) => {
    navigate(`/admin/operations/timesheets?interpreterId=${interpreter.id}`, { state: crmReturnState });
  };

  const openInterpreterPayables = (interpreter: InterpreterWithStats) => {
    navigate(`/admin/billing?view=fin-interpreter-invoices&lane=interpreterPayables&interpreterId=${interpreter.id}`, { state: crmReturnState });
  };

  const interpreterColumns = [
    {
      header: 'Professional',
      accessor: (i: InterpreterWithStats) => (
        <div className="flex min-w-[210px] max-w-[260px] items-center gap-3">
          <UserAvatar src={i.photoUrl} name={i.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-900 dark:text-white">{i.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{i.email}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{i.accountMode}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Languages',
      accessor: (i: InterpreterWithStats) => {
        const languageRows = i.languageProficiencies?.length
          ? i.languageProficiencies.map(p => ({ language: p.language, priority: p.l1 }))
          : (i.languages || []).map(language => ({ language, priority: undefined }));
        return (
          <div className="flex max-w-[220px] flex-wrap gap-1">
            {languageRows.slice(0, 3).map(p => (
              <span key={p.language} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {p.language}{p.priority ? <span className="ml-1 text-blue-600 dark:text-blue-400">P{p.priority}</span> : null}
              </span>
            ))}
            {languageRows.length > 3 && <span className="text-[10px] font-bold text-slate-400">+{languageRows.length - 3}</span>}
          </div>
        );
      },
    },
    {
      header: 'Work',
      accessor: (i: InterpreterWithStats) => (
        <div className="min-w-[145px]">
          <div className="flex items-center gap-2">
            <Badge variant="info" className="text-[10px] py-0 px-1.5">{i.activeJobs} active</Badge>
            <span className="text-xs font-semibold text-slate-500">{i.totalJobs} total</span>
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {i.completedJobs} delivered
          </p>
        </div>
      ),
    },
    {
      header: 'Claims & Pay',
      accessor: (i: InterpreterWithStats) => (
        <div className="min-w-[165px]">
          <div className="flex items-center gap-2">
            <Badge variant={i.claimsInReview > 0 ? 'warning' : 'neutral'} className="text-[10px] py-0 px-1.5">
              {i.claimsInReview} review
            </Badge>
            {i.missingClaims > 0 && (
              <Badge variant="danger" className="text-[10px] py-0 px-1.5">
                {i.missingClaims} missing
              </Badge>
            )}
            <span className="text-xs font-black text-slate-900 dark:text-white">{money(i.payablePending)}</span>
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {i.openInvoices} open invoices
          </p>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (i: InterpreterWithStats) => (
        <div className="min-w-[125px]">
          <Badge variant={i.status === 'ACTIVE' ? 'success' : i.status === 'SUSPENDED' ? 'danger' : i.status === 'IMPORTED' ? 'info' : 'warning'}>
            {i.status}
          </Badge>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {i.lastJobDate ? new Date(i.lastJobDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No jobs'}
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-full flex-1 flex-col bg-slate-50 transition-colors dark:bg-slate-950">
      <PageHeader
        title="Interpreter CRM"
        subtitle="Operational control for active, passive and imported professionals."
        stats={{ label: 'Rows', value: filteredInterpreters.length }}
      />

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 lg:px-5 lg:pb-5">
      <div className="flex flex-col gap-2 border border-slate-200 bg-white p-2 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center">
        <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
          {filterChips.map(chip => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.onClick}
              className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-black uppercase tracking-wide transition-colors ${
                chip.active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {chip.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${chip.active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                {chip.value}
              </span>
            </button>
          ))}
        </div>
        <div className="relative h-10 w-full flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search name or email..."
            className="h-full w-full rounded-md border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
            value={textFilter}
            onChange={e => setTextFilter(e.target.value)}
          />
        </div>
        <div className="h-10 w-full border-t border-slate-100 dark:border-slate-800 lg:w-64 lg:border-l lg:border-t-0">
          <input
            type="text"
            placeholder="Filter language..."
            className="h-full w-full bg-transparent px-4 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
            value={langFilter}
            onChange={e => setLangFilter(e.target.value)}
          />
        </div>
        <div className="h-10 w-full border-t border-slate-100 dark:border-slate-800 lg:w-52 lg:border-l lg:border-t-0">
          <select
            className="h-full w-full cursor-pointer appearance-none bg-transparent px-4 py-2 text-sm font-medium text-slate-900 outline-none focus:ring-0 dark:text-white"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
          >
            <option value="ALL" className="dark:bg-slate-900">All Statuses</option>
            <option value="ACTIVE" className="dark:bg-slate-900">Active</option>
            <option value="IMPORTED" className="dark:bg-slate-900">Imported</option>
            <option value="ONBOARDING" className="dark:bg-slate-900">Onboarding</option>
            <option value="SUSPENDED" className="dark:bg-slate-900">Suspended</option>
          </select>
        </div>
        {queueFilter !== 'ALL' && (
          <button
            type="button"
            onClick={() => setQueueFilter('ALL')}
            className="h-10 rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-black uppercase tracking-wide text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200"
          >
            {queueFilter === 'CLAIMS' ? 'Claims queue' : 'Payables queue'} x
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Spinner size="lg" />
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Synchronizing base...</p>
        </div>
      ) : filteredInterpreters.length === 0 ? (
        <EmptyState
          title="No matches found"
          description="We couldn't find any interpreter matching your search criteria."
          onAction={() => { setTextFilter(''); setLangFilter(''); setStatusFilter('ALL'); }}
          actionLabel="View All Interpreters"
          icon={UserCircle2}
        />
      ) : (
        <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
          <Table
            data={filteredInterpreters}
            columns={interpreterColumns}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onRowClick={openInterpreterProfile}
            renderContextMenu={(interpreter) => [
              { label: 'Open profile', icon: ExternalLink, onClick: () => openInterpreterProfile(interpreter) },
              { label: 'Open assigned jobs', icon: Briefcase, onClick: () => openInterpreterJobs(interpreter) },
              { label: 'Open claims', icon: FileText, onClick: () => openInterpreterClaims(interpreter) },
              { label: 'Open payables board', icon: CreditCard, onClick: () => openInterpreterPayables(interpreter) },
              { label: 'Message', icon: MessageSquare, onClick: () => handleStartChat(undefined, interpreter.id, interpreter.name, interpreter.photoUrl) },
            ]}
          />

          <BulkActionBar
            selectedIds={selectedIds}
            selectedCount={selectedIds.length}
            totalCount={filteredInterpreters.length}
            onClearSelection={() => setSelectedIds([])}
            entityLabel="interpreter"
            actions={[
              { label: 'Activate', icon: Check, onClick: () => handleBulkStatusChange('ACTIVE'), variant: 'success' },
              { label: 'Suspend', icon: AlertCircle, onClick: () => handleBulkStatusChange('SUSPENDED'), variant: 'warning' },
              { label: 'Delete', icon: Trash2, onClick: () => handleBulkDelete(), variant: 'danger' },
            ]}
          />
        </div>
      )}
      </div>
    </div>
  );
};
