import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Plus, Receipt, Search } from 'lucide-react';
import { BillingService } from '../../../services/billingService';
import { ClientInvoice, InvoiceStatus } from '../../../types';
import { InvoiceTable } from '../../../components/billing/InvoiceTable';
import { ClientService } from '../../../services/clientService';
import { useToast } from '../../../context/ToastContext';
import { TableSkeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';

const money = (amount: number) => `GBP ${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const AdminClientInvoicesPage = () => {
  const [searchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerator, setShowGenerator] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | InvoiceStatus>('ALL');
  const { showToast } = useToast();
  const scopedClientId = searchParams.get('clientId') || '';
  const scopedClientName = clients.find(client => client.id === scopedClientId)?.companyName
    || invoices.find(invoice => invoice.clientId === scopedClientId)?.clientName
    || 'selected client';
  const readyQueuePath = `/admin/billing?view=fin-ready-client-invoice&lane=clientBilling${scopedClientId ? `&clientId=${encodeURIComponent(scopedClientId)}` : ''}`;

  useEffect(() => {
    loadData();
    ClientService.getAll().then(setClients);

    const clientId = searchParams.get('clientId');
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (clientId || start || end) {
      setShowGenerator(true);
      if (clientId) setSelectedClient(clientId);
      if (start || end) setDateRange({ start: start || '', end: end || '' });
    }
  }, [searchParams]);

  const loadData = async () => {
    setLoading(true);
    const data = await BillingService.getClientInvoices(scopedClientId || undefined);
    setInvoices(data);
    setLoading(false);
  };

  const filteredInvoices = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return invoices.filter(invoice => {
      const matchesStatus = statusFilter === 'ALL' || invoice.status === statusFilter;
      if (!matchesStatus) return false;
      if (!query) return true;
      return [
        invoice.invoiceNumber,
        invoice.reference,
        invoice.id,
        invoice.clientName,
        invoice.currency,
        invoice.status,
      ].filter(Boolean).some(value => String(value).toLowerCase().includes(query));
    });
  }, [invoices, searchTerm, statusFilter]);

  const handleGenerate = async () => {
    try {
      showToast('Generating invoice...', 'info');
      const result = await BillingService.generateClientInvoice(selectedClient, dateRange.start, dateRange.end);
      if (result.success) {
        showToast(`Invoice generated for ${money(result.total)}`, 'success');
        setShowGenerator(false);
        loadData();
      } else {
        showToast(result.message, 'error');
      }
    } catch {
      showToast('Failed to generate invoice', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Client Invoice Documents"
        subtitle="Document registry for issued and draft client invoices."
      >
        <div className="flex flex-wrap items-center gap-2">
          {scopedClientId && (
            <Link to="/admin/billing/client-invoices" className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
              Clear client scope
            </Link>
          )}
          <Link to={readyQueuePath} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
            Finance queue <ArrowUpRight size={15} />
          </Link>
          <Button onClick={() => setShowGenerator(!showGenerator)} icon={Plus} size="sm">
            {showGenerator ? 'Close Generator' : 'Generate Invoice'}
          </Button>
        </div>
      </PageHeader>

      {scopedClientId && (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
          Showing client invoices for <span className="font-black">{scopedClientName}</span>.
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            placeholder="Search invoice, client, reference"
          />
        </div>
        <select
          value={statusFilter}
          onChange={event => setStatusFilter(event.target.value as 'ALL' | InvoiceStatus)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
        >
          <option value="ALL">All statuses</option>
          {[InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.PAID, InvoiceStatus.CANCELLED].map(status => (
            <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <div className="shrink-0 rounded-md bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {filteredInvoices.length} of {invoices.length}
        </div>
      </div>

      {showGenerator && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <Receipt size={17} className="text-blue-600" />
            <h3 className="text-sm font-black text-slate-950 dark:text-white">Client invoice generator</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold outline-none dark:border-slate-800 dark:bg-slate-950" value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </select>
            <input type="date" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-800 dark:bg-slate-950" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} />
            <input type="date" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none dark:border-slate-800 dark:bg-slate-950" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} />
            <Button onClick={handleGenerate} className="h-10 justify-center">Run generator</Button>
          </div>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={8} />
      ) : invoices.length === 0 ? (
        <EmptyState title="No Invoices Found" description="There are no client invoices generated yet." onAction={() => setShowGenerator(true)} actionLabel="Generate Invoice" />
      ) : filteredInvoices.length === 0 ? (
        <EmptyState title="No Matching Documents" description="No client invoices match the current search or status." />
      ) : (
        <InvoiceTable invoices={filteredInvoices} type="CLIENT" boardPath={readyQueuePath} />
      )}
    </div>
  );
};
