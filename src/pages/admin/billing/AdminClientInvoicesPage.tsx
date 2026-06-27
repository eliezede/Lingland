import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Plus, Receipt } from 'lucide-react';
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
  const { showToast } = useToast();

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
    const data = await BillingService.getClientInvoices();
    setInvoices(data);
    setLoading(false);
  };

  const summary = useMemo(() => {
    const draft = invoices.filter(inv => inv.status === InvoiceStatus.DRAFT);
    const sent = invoices.filter(inv => inv.status === InvoiceStatus.SENT);
    const paid = invoices.filter(inv => inv.status === InvoiceStatus.PAID);
    const outstanding = invoices.filter(inv => [InvoiceStatus.DRAFT, InvoiceStatus.SENT].includes(inv.status));
    return {
      total: invoices.length,
      draft: draft.length,
      sent: sent.length,
      paid: paid.length,
      outstandingAmount: outstanding.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0),
    };
  }, [invoices]);

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
        title="Client Invoices"
        subtitle="Accounts receivable documents connected to Finance Board billing queues."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/admin/billing?view=fin-ready-client-invoice&lane=clientBilling" className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
            Ready queue <ArrowUpRight size={15} />
          </Link>
          <Button onClick={() => setShowGenerator(!showGenerator)} icon={Plus} size="sm">
            {showGenerator ? 'Close Generator' : 'Generate Invoice'}
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Invoices', summary.total],
          ['Draft', summary.draft],
          ['Sent', summary.sent],
          ['Paid', summary.paid],
          ['Outstanding', money(summary.outstandingAmount)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 truncate text-xl font-black text-slate-950 dark:text-white">{value}</p>
          </div>
        ))}
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
      ) : (
        <InvoiceTable invoices={invoices} type="CLIENT" />
      )}
    </div>
  );
};
