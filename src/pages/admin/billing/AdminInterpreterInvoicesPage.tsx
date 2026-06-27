import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Calculator, FileText, Loader2 } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { BillingService } from '../../../services/billingService';
import { functions } from '../../../services/firebaseConfig';
import { InterpreterInvoice, InvoiceStatus } from '../../../types';
import { InvoiceTable } from '../../../components/billing/InvoiceTable';
import { TableSkeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { useToast } from '../../../context/ToastContext';
import { PageHeader } from '../../../components/layout/PageHeader';

const money = (amount: number) => `GBP ${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const AdminInterpreterInvoicesPage = () => {
  const [invoices, setInvoices] = useState<InterpreterInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const { showToast } = useToast();

  const fetchInvoices = () => {
    setLoading(true);
    BillingService.getInterpreterInvoices().then(data => {
      setInvoices(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const summary = useMemo(() => {
    const submitted = invoices.filter(inv => inv.status === InvoiceStatus.SUBMITTED);
    const approved = invoices.filter(inv => inv.status === InvoiceStatus.APPROVED);
    const paid = invoices.filter(inv => inv.status === InvoiceStatus.PAID);
    const payable = invoices.filter(inv => [InvoiceStatus.SUBMITTED, InvoiceStatus.APPROVED].includes(inv.status));
    return {
      total: invoices.length,
      submitted: submitted.length,
      approved: approved.length,
      paid: paid.length,
      payableAmount: payable.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0),
    };
  }, [invoices]);

  const handleGenerateInvoices = async () => {
    setIsGenerating(true);
    showToast('Calculating settlements and generating invoices...', 'info');
    try {
      const processSettlements = httpsCallable(functions, 'generateInterpreterInvoices');
      const response = await processSettlements();
      const result = response.data as { success: boolean; count: number; error?: string };

      if (result.success) {
        showToast(`Generated ${result.count} new invoices successfully!`, 'success');
        fetchInvoices();
      } else {
        throw new Error(result.error || 'Failed to generate');
      }
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'Error executing billing bot.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Interpreter Invoices"
        subtitle="Payables and self-billed invoices connected to interpreter timesheets."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/admin/billing?view=fin-interpreter-invoices&lane=interpreterPayables" className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
            Payables queue <ArrowUpRight size={15} />
          </Link>
          <button
            onClick={handleGenerateInvoices}
            disabled={isGenerating || loading}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
            Process Settlements
          </button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Invoices', summary.total],
          ['Submitted', summary.submitted],
          ['Approved', summary.approved],
          ['Paid', summary.paid],
          ['Payable', money(summary.payableAmount)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 truncate text-xl font-black text-slate-950 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <TableSkeleton rows={8} />
      ) : invoices.length === 0 ? (
        <EmptyState title="No Interpreter Invoices" description="There are no interpreter invoices submitted yet." icon={FileText} />
      ) : (
        <InvoiceTable invoices={invoices} type="INTERPRETER" />
      )}
    </div>
  );
};
