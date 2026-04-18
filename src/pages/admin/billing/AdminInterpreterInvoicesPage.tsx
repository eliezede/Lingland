
import React, { useEffect, useState } from 'react';
import { BillingService } from '../../../services/billingService';
import { InterpreterInvoice } from '../../../types';
import { InvoiceTable } from '../../../components/billing/InvoiceTable';

import { TableSkeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { FileText, Calculator, Loader2 } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../services/firebaseConfig';
import { PageHeader } from '../../../components/layout/PageHeader';

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
    <div className="space-y-6">
      <PageHeader
        title="Agent Settlements"
        subtitle="Manage interpreter payment cycles and self-billed invoices."
      >
        <button
          onClick={handleGenerateInvoices}
          disabled={isGenerating || loading}
          className="flex items-center gap-2 bg-slate-900 dark:bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 transition-all border border-transparent dark:border-slate-700"
        >
          {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
          Process Settlements
        </button>
      </PageHeader>

      {loading ? (
        <TableSkeleton rows={8} />
      ) : invoices.length === 0 ? (
        <EmptyState
          title="No Interpreter Invoices"
          description="There are no interpreter invoices submitted yet. Interpreters can submit invoices through their dashboard."
          icon={FileText}
        />
      ) : (
        <InvoiceTable invoices={invoices} type="INTERPRETER" />
      )}
    </div>
  );
};
