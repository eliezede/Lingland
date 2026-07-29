import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClientService } from '../../services/clientService';
import { BookingService } from '../../services/bookingService';
import { BillingService } from '../../services/billingService';
import { ChatService } from '../../services/chatService';
import {
  ClientHierarchyService,
  ClientHierarchySummary,
} from '../../services/clientHierarchyService';
import {
  Client,
  Booking,
  BookingStatus,
  ClientInvoice,
  InvoiceStatus,
  ServiceCategory,
} from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import {
  Search,
  Plus,
  Trash2,
  Briefcase,
  ExternalLink,
  MessageSquare,
  AlertCircle,
  Building,
  Check,
  CreditCard,
  ScanSearch,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Table } from '../../components/ui/Table';
import { BulkActionBar } from '../../components/ui/BulkActionBar';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';

type CohortFilter = 'CURRENT' | 'INCOMING' | 'ALL';
type StatusFilter = 'ALL' | 'ACTIVE' | 'GUEST' | 'SUSPENDED';
type WorkFilter = 'ALL' | 'SETUP_ISSUES';

interface ClientWithStats extends Client, ClientHierarchySummary {
  totalBookings: number;
  activeBookings: number;
  readyForInvoice: number;
  outstandingInvoices: number;
  outstandingTotal: number;
  paidTotal: number;
  translationBookings: number;
  lastBookingDate?: string;
  accountIssues: string[];
}

interface OrganizationForm {
  companyName: string;
  invoiceEmail: string;
  billingAddress: string;
  paymentTermsDays: number;
  defaultCostCodeType: string;
}

const PAGE_SIZE = 50;
const emptyHierarchy: ClientHierarchySummary = {
  departmentCount: 0,
  agentCount: 0,
  activeMembershipCount: 0,
  portalUserCount: 0,
};
const emptyOrganizationForm: OrganizationForm = {
  companyName: '',
  invoiceEmail: '',
  billingAddress: '',
  paymentTermsDays: 30,
  defaultCostCodeType: 'Client Name',
};

const isIncoming = (client: Client) => client.crmCohort === 'INCOMING';
const hasUsefulAddress = (address?: string) => {
  const normalized = String(address || '').trim().toLowerCase();
  return Boolean(normalized && !normalized.includes('pending update'));
};

export const AdminClients = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { openThread } = useChat();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [clients, setClients] = useState<ClientWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [cohortFilter, setCohortFilter] = useState<CohortFilter>('CURRENT');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [workFilter, setWorkFilter] = useState<WorkFilter>('ALL');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [organizationModalOpen, setOrganizationModalOpen] = useState(false);
  const [organizationForm, setOrganizationForm] = useState<OrganizationForm>(emptyOrganizationForm);
  const [savingOrganization, setSavingOrganization] = useState(false);
  const crmReturnState = { returnTo: `${location.pathname}${location.search}`, returnLabel: 'Client CRM' };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [cohortFilter, statusFilter, workFilter, filter]);

  useEffect(() => {
    setSelectedIds([]);
  }, [page]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [clientsData, bookingsData, invoicesData, hierarchyByClient] = await Promise.all([
        ClientService.getAll(),
        BookingService.getAll(),
        BillingService.getClientInvoices('ALL'),
        ClientHierarchyService.getSummaries(),
      ]);
      const bookingsByClient = new Map<string, Booking[]>();
      bookingsData.forEach(booking => {
        if (!booking.clientId) return;
        bookingsByClient.set(booking.clientId, [...(bookingsByClient.get(booking.clientId) || []), booking]);
      });
      const invoicesByClient = new Map<string, ClientInvoice[]>();
      invoicesData.forEach(invoice => {
        if (!invoice.clientId) return;
        invoicesByClient.set(invoice.clientId, [...(invoicesByClient.get(invoice.clientId) || []), invoice]);
      });
      const clientsWithStats = clientsData.map(client => ({
        ...client,
        ...(hierarchyByClient[client.id] || emptyHierarchy),
        ...buildClientStats(client, bookingsByClient.get(client.id) || [], invoicesByClient.get(client.id) || []),
      }));
      setClients(clientsWithStats.sort((left, right) => left.companyName.localeCompare(right.companyName)));
    } catch (error) {
      console.error(error);
      showToast('Client CRM could not be loaded', 'error');
    } finally {
      setLoading(false);
    }
  };

  const money = (amount?: number) => `GBP ${Number(amount || 0).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const buildClientStats = (client: Client, bookings: Booking[], invoices: ClientInvoice[]) => {
    const activeStatuses = new Set<string>([
      'INCOMING',
      'NEEDS_ASSIGNMENT',
      'ASSIGNMENT_PENDING',
      'PENDING_ASSIGNMENT',
      'OPENED',
      'BOOKED',
    ]);
    const readyForInvoice = bookings.filter(job => (
      job.status === BookingStatus.READY_FOR_INVOICE || job.paymentStatus === 'READY_FOR_INVOICE'
    )).length;
    const outstandingInvoices = invoices.filter(invoice => (
      [InvoiceStatus.DRAFT, InvoiceStatus.SENT].includes(invoice.status)
    ));
    const sortedDates = bookings
      .map(job => new Date([job.date, job.startTime].filter(Boolean).join(' ')))
      .filter(date => !Number.isNaN(date.getTime()))
      .sort((left, right) => right.getTime() - left.getTime());
    const accountIssues = [
      !hasUsefulAddress(client.billingAddress) ? 'Billing address' : null,
      !(client.invoiceEmail || client.email) ? 'Finance email' : null,
      !client.paymentTermsDays ? 'Payment terms' : null,
      !client.normalizedCompanyName ? 'Organisation identity' : null,
    ].filter(Boolean) as string[];
    return {
      totalBookings: bookings.length,
      activeBookings: bookings.filter(job => activeStatuses.has(String(job.status))).length,
      readyForInvoice,
      outstandingInvoices: outstandingInvoices.length,
      outstandingTotal: outstandingInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0),
      paidTotal: invoices
        .filter(invoice => invoice.status === InvoiceStatus.PAID)
        .reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0),
      translationBookings: bookings.filter(job => (
        job.serviceCategory === ServiceCategory.TRANSLATION
        || String(job.serviceType || '').toUpperCase().includes('TRANSLATION')
      )).length,
      lastBookingDate: sortedDates[0]?.toISOString(),
      accountIssues,
    };
  };

  const filteredClients = useMemo(() => clients.filter(client => {
    const query = filter.trim().toLowerCase();
    const matchesSearch = !query || [
      client.companyName,
      client.contactPerson,
      client.email,
      client.invoiceEmail,
      client.sageAccountRef,
      client.airtableClientKey,
    ].some(value => String(value || '').toLowerCase().includes(query));
    const matchesCohort = cohortFilter === 'ALL'
      || (cohortFilter === 'INCOMING' ? isIncoming(client) : !isIncoming(client));
    const matchesStatus = statusFilter === 'ALL'
      || client.status === statusFilter
      || (statusFilter === 'ACTIVE' && !client.status);
    const matchesWork = workFilter === 'ALL' || client.accountIssues.length > 0;
    return matchesSearch && matchesCohort && matchesStatus && matchesWork;
  }), [clients, cohortFilter, filter, statusFilter, workFilter]);

  const currentCount = clients.filter(client => !isIncoming(client)).length;
  const incomingCount = clients.filter(isIncoming).length;
  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedClients = filteredClients.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const firstVisibleRow = filteredClients.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const lastVisibleRow = Math.min(currentPage * PAGE_SIZE, filteredClients.length);
  const summary = {
    setupIssues: clients.filter(client => (
      (cohortFilter === 'ALL' || (cohortFilter === 'INCOMING' ? isIncoming(client) : !isIncoming(client)))
      && client.accountIssues.length > 0
    )).length,
    readyForInvoice: filteredClients.reduce((sum, client) => sum + client.readyForInvoice, 0),
    outstanding: filteredClients.reduce((sum, client) => sum + client.outstandingTotal, 0),
  };

  const handleStartChat = async (
    event: React.MouseEvent | undefined,
    clientId: string,
    clientName: string,
    clientPhoto?: string,
  ) => {
    event?.stopPropagation();
    if (!user) return;
    try {
      const clientRecord = clients.find(client => client.id === clientId);
      const clientUser = await ChatService.resolveUserByProfileId(clientId)
        || await ChatService.resolveUserByEmail(clientRecord?.email || '');
      if (!clientUser) {
        showToast('No active user account found for this organisation', 'error');
        return;
      }
      const threadId = await ChatService.getOrCreateDirectThreadWithUser(
        user,
        {
          ...clientUser,
          displayName: clientName || clientUser.displayName,
          photoUrl: clientPhoto || clientUser.photoUrl,
        },
      );
      openThread(threadId);
    } catch (error) {
      console.error('Failed to start client chat', error);
      showToast('Client chat could not be opened', 'error');
    }
  };

  const handleBulkStatusChange = async (status: Client['status']) => {
    let updated = 0;
    let failed = 0;
    for (const id of selectedIds) {
      try {
        await ClientService.update(id, { status });
        updated += 1;
      } catch {
        failed += 1;
      }
    }
    showToast(
      failed ? `${updated} updated; ${failed} could not be changed` : `${updated} organisations updated`,
      failed ? 'error' : 'success',
    );
    setSelectedIds([]);
    await loadData();
  };

  const handleBulkDelete = async () => {
    const approved = await confirm({
      title: 'Delete empty client records',
      message: `Delete ${selectedIds.length} selected records? Any record with jobs, invoices, departments, memberships or account access will be rejected.`,
      confirmLabel: 'Delete empty records',
      variant: 'danger',
    });
    if (!approved) return;
    let deleted = 0;
    let protectedCount = 0;
    for (const id of selectedIds) {
      try {
        await ClientService.delete(id);
        deleted += 1;
      } catch {
        protectedCount += 1;
      }
    }
    showToast(
      protectedCount
        ? `${deleted} empty records deleted; ${protectedCount} protected records kept`
        : `${deleted} empty records deleted`,
      protectedCount ? 'error' : 'success',
    );
    setSelectedIds([]);
    await loadData();
  };

  const handlePromoteIncoming = async (client: ClientWithStats) => {
    const approved = await confirm({
      title: 'Add to Current CRM',
      message: `Mark ${client.companyName} as a reviewed canonical organisation? A duplicate identity will be blocked and must be resolved in Identity Audit.`,
      confirmLabel: 'Add to Current CRM',
    });
    if (!approved) return;
    try {
      await ClientService.promoteIncomingOrganization(client.id);
      showToast(`${client.companyName} added to Current CRM`, 'success');
      await loadData();
    } catch (error: any) {
      showToast(error?.message || 'This incoming organisation could not be promoted', 'error');
    }
  };

  const handleCreateOrganization = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingOrganization(true);
    try {
      const created = await ClientService.createOrganizationAccount(organizationForm);
      setOrganizationModalOpen(false);
      setOrganizationForm(emptyOrganizationForm);
      showToast(`${created.companyName} created in Current CRM`, 'success');
      navigate(`/admin/clients/${created.id}`, { state: crmReturnState });
    } catch (error: any) {
      showToast(error?.message || 'The organisation could not be created', 'error');
    } finally {
      setSavingOrganization(false);
    }
  };

  const clientColumns = [
    {
      header: 'Organization',
      accessor: (client: ClientWithStats) => (
        <div className="flex min-w-[190px] max-w-[240px] items-center gap-2">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-sm font-bold ${
            isIncoming(client)
              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
              : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300'
          }`}>
            {client.companyName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-900 dark:text-white">{client.companyName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge
                variant={client.status === 'SUSPENDED' ? 'danger' : client.status === 'GUEST' ? 'warning' : 'success'}
                className="px-1.5 py-0 text-[9px]"
              >
                {client.status || 'ACTIVE'}
              </Badge>
              {isIncoming(client) && (
                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">New intake</span>
              )}
              {client.accountIssues.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
                  <AlertCircle size={11} />
                  {client.accountIssues.length} issue{client.accountIssues.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Structure',
      accessor: (client: ClientWithStats) => (
        <div className="min-w-[170px]">
          <p className="font-semibold text-slate-800 dark:text-slate-100">
            {client.departmentCount} department{client.departmentCount === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {client.agentCount} agent{client.agentCount === 1 ? '' : 's'}
            {client.portalUserCount > 0 ? ` / ${client.portalUserCount} portal` : ''}
          </p>
        </div>
      ),
    },
    {
      header: 'Operations',
      accessor: (client: ClientWithStats) => (
        <div className="min-w-[145px]">
          <div className="flex items-center gap-2">
            <Badge variant="info" className="px-1.5 py-0 text-[10px]">{client.activeBookings} active</Badge>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{client.totalBookings} total</span>
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">
            {client.translationBookings} translations
          </p>
        </div>
      ),
    },
    {
      header: 'Finance',
      accessor: (client: ClientWithStats) => (
        <div className="min-w-[170px]">
          <div className="flex items-center gap-2">
            <Badge variant={client.readyForInvoice > 0 ? 'warning' : 'neutral'} className="px-1.5 py-0 text-[10px]">
              {client.readyForInvoice} ready
            </Badge>
            <span className="text-xs font-bold text-slate-900 dark:text-white">{money(client.outstandingTotal)}</span>
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">
            {client.outstandingInvoices} open invoices
          </p>
        </div>
      ),
    },
    {
      header: 'Last activity',
      accessor: (client: ClientWithStats) => (
        <div className="min-w-[130px]">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {client.lastBookingDate
              ? new Date(client.lastBookingDate).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })
              : 'No jobs'}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">
            {client.defaultCostCodeType || 'PO'} / {client.paymentTermsDays || 30}d
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-full flex-1 flex-col bg-slate-50 transition-colors dark:bg-slate-950">
      <PageHeader
        title="Client CRM"
        subtitle="Canonical organisations, departments and agent access. New source records stay in intake until reviewed."
        stats={{ label: 'Rows', value: filteredClients.length }}
      >
        <Button
          variant="secondary"
          icon={ScanSearch}
          size="sm"
          onClick={() => navigate('/admin/clients/identity-audit')}
        >
          Identity audit
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 lg:px-5 lg:pb-5">
        <div className="border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 p-2 dark:border-slate-800">
            {([
              ['CURRENT', 'Current CRM', currentCount],
              ['INCOMING', 'New intake', incomingCount],
              ['ALL', 'All records', clients.length],
            ] as Array<[CohortFilter, string, number]>).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setCohortFilter(value)}
                className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-bold transition-colors ${
                  cohortFilter === value
                    ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  cohortFilter === value
                    ? 'bg-white/15 text-white dark:bg-slate-950/10 dark:text-slate-950'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 p-2 lg:flex-row lg:items-center">
            <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
              {([
                ['ALL', 'All', filteredClients.length],
                ['ACTIVE', 'Active', clients.filter(client => (
                  (cohortFilter === 'ALL' || (cohortFilter === 'INCOMING' ? isIncoming(client) : !isIncoming(client)))
                  && (client.status === 'ACTIVE' || !client.status)
                )).length],
                ['GUEST', 'Guest', clients.filter(client => (
                  (cohortFilter === 'ALL' || (cohortFilter === 'INCOMING' ? isIncoming(client) : !isIncoming(client)))
                  && client.status === 'GUEST'
                )).length],
              ] as Array<[StatusFilter, string, number]>).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setStatusFilter(value);
                    if (value !== 'ALL') setWorkFilter('ALL');
                  }}
                  className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors ${
                    statusFilter === value && workFilter === 'ALL'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {label}
                  <span className="text-[10px] opacity-75">{count}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setWorkFilter(workFilter === 'SETUP_ISSUES' ? 'ALL' : 'SETUP_ISSUES');
                  setStatusFilter('ALL');
                }}
                className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors ${
                  workFilter === 'SETUP_ISSUES'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                Setup issues <span className="text-[10px] opacity-75">{summary.setupIssues}</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/billing?view=fin-ready-client-invoice&lane=clientBilling', { state: crmReturnState })}
                className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Invoice ready <span className="text-[10px] opacity-75">{summary.readyForInvoice}</span>
              </button>
            </div>
            <div className="relative h-10 min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="search"
                placeholder="Search organisation, Sage code, contact or email"
                className="h-full w-full rounded-md border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                value={filter}
                onChange={event => setFilter(event.target.value)}
              />
            </div>
            <Button
              icon={Plus}
              onClick={() => setOrganizationModalOpen(true)}
              size="sm"
              className="h-9 shrink-0"
            >
              New organization
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <Spinner size="lg" />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Loading Client CRM</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <EmptyState
            title={cohortFilter === 'INCOMING' ? 'No new client intake' : 'No organizations match'}
            description={cohortFilter === 'INCOMING'
              ? 'New source records will wait here instead of changing the current CRM.'
              : 'Change the search or filters to see other organisations.'}
            onAction={() => {
              setFilter('');
              setStatusFilter('ALL');
              setWorkFilter('ALL');
            }}
            actionLabel="Clear filters"
            icon={Building}
          />
        ) : (
          <div className="relative mt-3 min-h-0 flex-1 overflow-auto">
            <Table
              data={pagedClients}
              columns={clientColumns}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onRowClick={client => navigate(`/admin/clients/${client.id}`, { state: crmReturnState })}
              renderContextMenu={client => [
                { label: 'Open profile', icon: ExternalLink, onClick: () => navigate(`/admin/clients/${client.id}`, { state: crmReturnState }) },
                ...(isIncoming(client) ? [{
                  label: 'Add to Current CRM',
                  icon: ShieldCheck,
                  onClick: () => void handlePromoteIncoming(client),
                }] : []),
                { label: 'Open client jobs', icon: Briefcase, onClick: () => navigate(`/admin/bookings?clientId=${client.id}`, { state: crmReturnState }) },
                { label: 'Open finance board', icon: CreditCard, onClick: () => navigate(`/admin/billing?view=fin-ready-client-invoice&lane=clientBilling&clientId=${encodeURIComponent(client.id)}`, { state: crmReturnState }) },
                { label: 'Message active agent', icon: MessageSquare, onClick: () => void handleStartChat(undefined, client.id, client.companyName, client.photoUrl) },
              ]}
            />

            <BulkActionBar
              selectedIds={selectedIds}
              selectedCount={selectedIds.length}
              totalCount={pagedClients.length}
              onClearSelection={() => setSelectedIds([])}
              entityLabel="organization"
              actions={[
                { label: 'Activate', icon: Check, onClick: () => void handleBulkStatusChange('ACTIVE'), variant: 'success' },
                { label: 'Suspend', icon: AlertCircle, onClick: () => void handleBulkStatusChange('SUSPENDED'), variant: 'warning' },
                { label: 'Delete empty', icon: Trash2, onClick: () => void handleBulkDelete(), variant: 'danger' },
              ]}
            />
          </div>
        )}

        {!loading && filteredClients.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <span>{firstVisibleRow}-{lastVisibleRow} of {filteredClients.length} organisations</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold">Page {currentPage} of {totalPages}</span>
              <button
                type="button"
                aria-label="Previous page"
                disabled={currentPage <= 1}
                onClick={() => setPage(value => Math.max(1, value - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                aria-label="Next page"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(value => Math.min(totalPages, value + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={organizationModalOpen}
        onClose={() => {
          if (!savingOrganization) setOrganizationModalOpen(false);
        }}
        title="New organization"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateOrganization} className="space-y-4">
          <div className="border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
            Create the legal or operational organisation first. Departments and agents are added from its profile.
          </div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Organization name
            <input
              autoFocus
              required
              minLength={2}
              maxLength={160}
              value={organizationForm.companyName}
              onChange={event => setOrganizationForm(current => ({ ...current, companyName: event.target.value }))}
              className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Finance email <span className="font-normal text-slate-400">(optional)</span>
            <input
              type="email"
              value={organizationForm.invoiceEmail}
              onChange={event => setOrganizationForm(current => ({ ...current, invoiceEmail: event.target.value }))}
              className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Billing address <span className="font-normal text-slate-400">(optional)</span>
            <textarea
              rows={3}
              value={organizationForm.billingAddress}
              onChange={event => setOrganizationForm(current => ({ ...current, billingAddress: event.target.value }))}
              className="mt-1.5 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Payment terms
              <select
                value={organizationForm.paymentTermsDays}
                onChange={event => setOrganizationForm(current => ({
                  ...current,
                  paymentTermsDays: Number(event.target.value),
                }))}
                className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {[7, 14, 30, 60].map(days => <option key={days} value={days}>{days} days</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Reference requirement
              <select
                value={organizationForm.defaultCostCodeType}
                onChange={event => setOrganizationForm(current => ({
                  ...current,
                  defaultCostCodeType: event.target.value,
                }))}
                className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="Client Name">Client name</option>
                <option value="PO">PO</option>
                <option value="Cost Code">Cost code</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button
              type="button"
              variant="secondary"
              disabled={savingOrganization}
              onClick={() => setOrganizationModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" icon={Plus} isLoading={savingOrganization}>
              Create organization
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
