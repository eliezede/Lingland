import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Languages,
  MessageSquare,
  Search,
  ShieldCheck,
  Trash2,
  UserCircle2,
  WalletCards,
} from 'lucide-react';

interface InterpreterWithStats extends Interpreter {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  claimsInReview: number;
  approvedClaims: number;
  payablePending: number;
  openInvoices: number;
  paidInvoices: number;
  lastJobDate?: string;
  accountMode: string;
}

export const AdminInterpreters = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openThread } = useChat();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [interpreters, setInterpreters] = useState<InterpreterWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  const [textFilter, setTextFilter] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ONBOARDING' | 'SUSPENDED' | 'IMPORTED'>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
    const sortedDates = jobs
      .map(job => new Date([job.date, job.startTime].filter(Boolean).join(' ')))
      .filter(date => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());

    return {
      totalJobs: jobs.length,
      activeJobs: jobs.filter(job => activeStatuses.has(String(job.status))).length,
      completedJobs: jobs.filter(job => completedStatuses.has(String(job.status))).length,
      claimsInReview: timesheets.filter(ts => !ts.adminApproved && ts.status === 'SUBMITTED').length,
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
    return matchesText && matchesLang && matchesStatus;
  });

  const summary = {
    total: interpreters.length,
    active: interpreters.filter(i => i.status === 'ACTIVE').length,
    passive: interpreters.filter(i => i.status === 'IMPORTED').length,
    claims: interpreters.reduce((sum, i) => sum + i.claimsInReview, 0),
    payables: interpreters.reduce((sum, i) => sum + i.payablePending, 0),
  };

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
    navigate(`/admin/bookings?interpreterId=${interpreter.id}`);
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
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Interpreter CRM"
        subtitle="Operational control for active, passive and imported professionals."
        stats={{ label: 'Pool', value: interpreters.length }}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        {[
          { label: 'Pool', value: summary.total, detail: 'professionals', icon: UserCircle2, tone: 'bg-slate-50 text-slate-700 border-slate-200' },
          { label: 'Active', value: summary.active, detail: 'platform ready', icon: ShieldCheck, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
          { label: 'Passive import', value: summary.passive, detail: 'staff managed', icon: Languages, tone: 'bg-blue-50 text-blue-700 border-blue-100' },
          { label: 'Claims', value: summary.claims, detail: 'need review', icon: Briefcase, tone: summary.claims ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-slate-50 text-slate-700 border-slate-200' },
          { label: 'Payables', value: money(summary.payables), detail: 'approved not invoiced', icon: WalletCards, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg border ${card.tone}`}>
              <card.icon size={18} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{card.label}</p>
            <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">{card.value}</p>
            <p className="text-xs font-semibold text-slate-500">{card.detail}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900/50 lg:flex-row lg:items-center">
        <div className="relative h-10 w-full flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search name or email..."
            className="h-full w-full bg-transparent py-2 pl-10 pr-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
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
        <div className="relative">
          <Table
            data={filteredInterpreters}
            columns={interpreterColumns}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onRowClick={(interpreter) => navigate(`/admin/interpreters/${interpreter.id}`)}
            renderContextMenu={(interpreter) => [
              { label: 'Open profile', icon: ExternalLink, onClick: () => navigate(`/admin/interpreters/${interpreter.id}`) },
              { label: 'Open assigned jobs', icon: Briefcase, onClick: () => openInterpreterJobs(interpreter) },
              { label: 'Open payables board', icon: CreditCard, onClick: () => navigate('/admin/billing?view=fin-interpreter-invoices&lane=interpreterPayables') },
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
  );
};
