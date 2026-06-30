import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClientService } from '../../services/clientService';
import { BookingService } from '../../services/bookingService';
import { BillingService } from '../../services/billingService';
import { ChatService } from '../../services/chatService';
import { Client, Booking, BookingStatus, ClientInvoice, InvoiceStatus, ServiceCategory } from '../../types';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import {
  Search, Plus, Trash2, Briefcase,
  ExternalLink, MessageSquare, AlertCircle,
  Building, Check, CreditCard
} from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Table } from '../../components/ui/Table';
import { BulkActionBar } from '../../components/ui/BulkActionBar';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';

interface ClientWithStats extends Client {
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
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'GUEST' | 'SUSPENDED'>('ALL');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const crmReturnState = { returnTo: `${location.pathname}${location.search}`, returnLabel: 'Client CRM' };

  // Fetch clients explicitly instead of relying on global lazy cache 
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [clientsData, bookingsData, invoicesData] = await Promise.all([
        ClientService.getAll(),
        BookingService.getAll(),
        BillingService.getClientInvoices('ALL')
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
        ...buildClientStats(client, bookingsByClient.get(client.id) || [], invoicesByClient.get(client.id) || [])
      }));
      setClients(clientsWithStats.sort((a, b) => a.companyName.localeCompare(b.companyName)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const money = (amount?: number) => `GBP ${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const buildClientStats = (client: Client, bookings: Booking[], invoices: ClientInvoice[]) => {
    const activeStatuses = new Set<string>(['INCOMING', 'NEEDS_ASSIGNMENT', 'ASSIGNMENT_PENDING', 'PENDING_ASSIGNMENT', 'OPENED', 'BOOKED']);
    const readyForInvoice = bookings.filter(job => job.status === BookingStatus.READY_FOR_INVOICE || job.paymentStatus === 'READY_FOR_INVOICE').length;
    const outstandingInvoices = invoices.filter(invoice => [InvoiceStatus.DRAFT, InvoiceStatus.SENT].includes(invoice.status));
    const sortedDates = bookings
      .map(job => new Date([job.date, job.startTime].filter(Boolean).join(' ')))
      .filter(date => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());
    const accountIssues = [
      !client.billingAddress ? 'Billing address' : null,
      !client.email ? 'Finance email' : null,
      !client.contactPerson ? 'Primary contact' : null,
      !client.paymentTermsDays ? 'Payment terms' : null,
    ].filter(Boolean) as string[];
    return {
      totalBookings: bookings.length,
      activeBookings: bookings.filter(job => activeStatuses.has(String(job.status))).length,
      readyForInvoice,
      outstandingInvoices: outstandingInvoices.length,
      outstandingTotal: outstandingInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0),
      paidTotal: invoices.filter(invoice => invoice.status === InvoiceStatus.PAID).reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0),
      translationBookings: bookings.filter(job => job.serviceCategory === ServiceCategory.TRANSLATION || String(job.serviceType || '').toUpperCase().includes('TRANSLATION')).length,
      lastBookingDate: sortedDates[0]?.toISOString(),
      accountIssues,
    };
  };

  const filteredClients = clients.filter(c => {
    const q = filter.toLowerCase();
    const matchesSearch = (
      c.companyName.toLowerCase().includes(q) ||
      (c.contactPerson?.toLowerCase().includes(q) ?? false) ||
      c.email.toLowerCase().includes(q)
    );
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter || (statusFilter === 'ACTIVE' && !c.status);
    return matchesSearch && matchesStatus;
  });

  const summary = {
    all: clients.length,
    readyIssues: clients.filter(c => c.accountIssues.length > 0).length,
    activeJobs: clients.reduce((sum, c) => sum + c.activeBookings, 0),
    readyForInvoice: clients.reduce((sum, c) => sum + c.readyForInvoice, 0),
    outstanding: clients.reduce((sum, c) => sum + c.outstandingTotal, 0),
  };

  const filterChips = [
    { label: 'All', value: summary.all, active: statusFilter === 'ALL', onClick: () => setStatusFilter('ALL') },
    { label: 'Active', value: clients.filter(c => c.status === 'ACTIVE' || !c.status).length, active: statusFilter === 'ACTIVE', onClick: () => setStatusFilter('ACTIVE') },
    { label: 'Guest', value: clients.filter(c => c.status === 'GUEST').length, active: statusFilter === 'GUEST', onClick: () => setStatusFilter('GUEST') },
    { label: 'Setup issues', value: summary.readyIssues, active: false, onClick: () => setFilter('') },
    { label: 'Ready invoice', value: summary.readyForInvoice, active: false, onClick: () => navigate('/admin/billing?view=fin-ready-client-invoice&lane=clientBilling', { state: crmReturnState }) },
    { label: 'Outstanding', value: money(summary.outstanding), active: false, onClick: () => navigate('/admin/billing?view=fin-awaiting-payment&lane=clientBilling', { state: crmReturnState }) },
  ];

  const handleStartChat = async (e: React.MouseEvent | undefined, clientId: string, clientName: string, clientPhoto?: string) => {
    if (e) e.stopPropagation();
    if (!user) return;

    try {
      const clientRecord = clients.find(c => c.id === clientId);
      const clientUser = await ChatService.resolveUserByProfileId(clientId) || await ChatService.resolveUserByEmail(clientRecord?.email || '');
      if (!clientUser) {
        showToast('No active user account found for this client', 'error');
        return;
      }
      const threadId = await ChatService.getOrCreateDirectThreadWithUser(
        user,
        { ...clientUser, displayName: clientName || clientUser.displayName, photoUrl: clientPhoto || clientUser.photoUrl }
      );
      openThread(threadId);

    } catch (error) {
      console.error("Failed to start chat", error);
      showToast('failed to start chat', 'error');
    }
  };

  const handleBulkStatusChange = async (status: string) => {
    let done = 0;
    for (const id of selectedIds) {
      try {
        await ClientService.update(id, { status: status as any });
        done++;
      } catch (err) { /* silent */ }
    }
    showToast(`Updated ${done} clients to ${status}`, 'success');
    setSelectedIds([]);
    loadData();
  };

  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: 'Bulk Delete Clients',
      message: `Are you sure you want to permanently delete ${selectedIds.length} clients? This will remove their company data and account access.`,
      confirmLabel: 'Delete Permanently',
      variant: 'danger'
    });
    if (!ok) return;
    let done = 0;
    for (const id of selectedIds) {
      try {
        await ClientService.delete(id);
        done++;
      } catch (err) { /* silent */ }
    }
    showToast(`Deleted ${done} clients`, 'success');
    setSelectedIds([]);
    loadData();
  };

  const clientColumns = [
    {
      header: 'Organization',
      accessor: (c: ClientWithStats) => (
        <div className="flex min-w-[180px] max-w-[220px] items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm border shadow-sm ${c.status === 'GUEST' 
            ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/30' 
            : 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/30'}`}>
            {c.companyName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-900 dark:text-white">{c.companyName}</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={c.status === 'SUSPENDED' ? 'danger' : c.status === 'GUEST' ? 'warning' : 'success'} className="text-[9px] py-0 px-1.5">
                {c.status || 'ACTIVE'}
              </Badge>
              {c.accountIssues.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
                  <AlertCircle size={11} />
                  {c.accountIssues.length} setup issue{c.accountIssues.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      )
    },
    {
      header: 'Primary Contact',
      accessor: (c: ClientWithStats) => (
        <div className="min-w-[160px] max-w-[210px]">
          <p className="truncate font-medium text-slate-700 dark:text-slate-200">{c.contactPerson}</p>
          <p className="truncate text-xs text-slate-400 dark:text-slate-500">{c.email}</p>
        </div>
      )
    },
    {
      header: 'Operations',
      accessor: (c: ClientWithStats) => (
        <div className="min-w-[145px]">
          <div className="flex items-center gap-2">
            <Badge variant="info" className="text-[10px] py-0 px-1.5">{c.activeBookings} Active</Badge>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{c.totalBookings} total</span>
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {c.translationBookings} translations
          </p>
        </div>
      )
    },
    {
      header: 'Finance',
      accessor: (c: ClientWithStats) => (
        <div className="min-w-[160px]">
          <div className="flex items-center gap-2">
            <Badge variant={c.readyForInvoice > 0 ? 'warning' : 'neutral'} className="text-[10px] py-0 px-1.5">
              {c.readyForInvoice} ready
            </Badge>
            <span className="text-xs font-black text-slate-900 dark:text-white">{money(c.outstandingTotal)}</span>
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {c.outstandingInvoices} open invoices
          </p>
        </div>
      )
    },
    {
      header: 'Last Activity',
      accessor: (c: ClientWithStats) => (
        <div className="min-w-[130px]">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {c.lastBookingDate ? new Date(c.lastBookingDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No jobs'}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {c.defaultCostCodeType || 'PO'} · {c.paymentTermsDays || 30}d
          </p>
        </div>
      )
    }
  ];

  return (
    <div className="flex h-full flex-1 flex-col bg-slate-50 transition-colors dark:bg-slate-950">
      <PageHeader
        title="Client CRM"
        subtitle="Account control for bookings, billing readiness and client data health."
        stats={{ label: "Rows", value: filteredClients.length }}
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
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search company, contact or email..."
            className="h-full w-full rounded-md border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <Button
          icon={Plus}
          onClick={() => navigate('/admin/bookings/new', { state: crmReturnState })}
          size="sm"
          className="h-9"
        >
          New
        </Button>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4">
          <Spinner size="lg" />
          <p className="text-slate-400 text-xs font-black uppercase tracking-[0.2em]">Synchronizing base...</p>
        </div>
      ) : filteredClients.length === 0 ? (
        <EmptyState
          title="No organizations matches"
          description="We couldn't find any client matching your current search criteria."
          onAction={() => setFilter('')}
          actionLabel="View All Entities"
          icon={Building}
        />
      ) : (
        <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
          <Table
            data={filteredClients}
            columns={clientColumns}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onRowClick={(client) => navigate(`/admin/clients/${client.id}`, { state: crmReturnState })}
            renderContextMenu={(client) => [
              { label: 'Open profile', icon: ExternalLink, onClick: () => navigate(`/admin/clients/${client.id}`, { state: crmReturnState }) },
              { label: 'Open client jobs', icon: Briefcase, onClick: () => navigate(`/admin/bookings?clientId=${client.id}`, { state: crmReturnState }) },
              { label: 'Open finance board', icon: CreditCard, onClick: () => navigate(`/admin/billing?view=fin-ready-client-invoice&lane=clientBilling&clientId=${encodeURIComponent(client.id)}`, { state: crmReturnState }) },
              { label: 'Message', icon: MessageSquare, onClick: () => handleStartChat(undefined, client.id, client.companyName, client.photoUrl) },
            ]}
          />

          <BulkActionBar
            selectedIds={selectedIds}
            selectedCount={selectedIds.length}
            totalCount={filteredClients.length}
            onClearSelection={() => setSelectedIds([])}
            entityLabel="client"
            actions={[
              { label: 'Activate', icon: Check, onClick: () => handleBulkStatusChange('ACTIVE'), variant: 'success' },
              { label: 'Suspend', icon: AlertCircle, onClick: () => handleBulkStatusChange('SUSPENDED'), variant: 'warning' },
              { label: 'Delete', icon: Trash2, onClick: () => handleBulkDelete(), variant: 'danger' }
            ]}
          />
        </div>
      )}
      </div>
    </div>
  );
};
