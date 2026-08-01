import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, FileText, Search } from 'lucide-react';
import { BillingService } from '../../../services/billingService';
import { InterpreterInvoice, InvoiceStatus, ServiceCategory } from '../../../types';
import { InvoiceTable } from '../../../components/billing/InvoiceTable';
import { TableSkeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { useToast } from '../../../context/ToastContext';
import { PageHeader } from '../../../components/layout/PageHeader';
import { WorkspacePagination } from '../../../components/operations/WorkspacePagination';
import { getServiceLabel, matchesServiceCategory } from '../../../domains/finance/financeLifecycle';

export const AdminInterpreterInvoicesPage = () => {
  const [invoices, setInvoices] = useState<InterpreterInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | InvoiceStatus>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const scopedInterpreterId = searchParams.get('interpreterId') || '';
  const serviceCategory = searchParams.get('service') === 'translation'
    ? ServiceCategory.TRANSLATION
    : searchParams.get('service') === 'interpretation'
      ? ServiceCategory.INTERPRETATION
      : undefined;
  const periodKey = searchParams.get('period') || '';
  const scopedInterpreterName = invoices.find(inv => inv.interpreterId === scopedInterpreterId)?.interpreterName || 'selected professional';
  const payablesBoardPath = serviceCategory === ServiceCategory.TRANSLATION
    ? `/admin/finance/payables/translations${periodKey ? `?period=${encodeURIComponent(periodKey)}&view=documents` : '?view=documents'}`
    : `/admin/finance/payables/interpreting${periodKey ? `?period=${encodeURIComponent(periodKey)}&view=documents` : '?view=documents'}`;

  const fetchInvoices = () => {
    setLoading(true);
    BillingService.getInterpreterInvoices(scopedInterpreterId || undefined)
      .then(setInvoices)
      .catch(error => {
        console.error('Failed to load interpreter invoice registry', error);
        showToast('Interpreter invoice registry could not be loaded.', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchInvoices();
  }, [scopedInterpreterId]);

  const filteredInvoices = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return invoices.filter(invoice => {
      if (!matchesServiceCategory(invoice, serviceCategory)) return false;
      if (periodKey) {
        const periods = invoice.settlementPeriods || (invoice.settlementPeriod ? [invoice.settlementPeriod] : []);
        if (!periods.includes(periodKey)) return false;
      }
      const matchesStatus = statusFilter === 'ALL' || invoice.status === statusFilter;
      if (!matchesStatus) return false;
      if (!query) return true;
      return [
        invoice.externalInvoiceReference,
        invoice.id,
        invoice.interpreterName,
        invoice.currency,
        invoice.status,
        invoice.model,
      ].filter(Boolean).some(value => String(value).toLowerCase().includes(query));
    });
  }, [invoices, periodKey, searchTerm, serviceCategory, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, scopedInterpreterId, serviceCategory, periodKey]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * pageSize;
  const pageEndIndex = Math.min(pageStartIndex + pageSize, filteredInvoices.length);
  const paginatedInvoices = filteredInvoices.slice(pageStartIndex, pageEndIndex);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${serviceCategory ? `${getServiceLabel(serviceCategory)} ` : ''}Payable Documents`}
        subtitle={scopedInterpreterId ? 'Payable documents filtered from a professional profile.' : 'Registry for uploaded invoices and self-billed documents. Monthly processing starts in Accounts Payable.'}
      >
        <div className="flex flex-wrap items-center gap-2">
          {scopedInterpreterId && (
            <Link to="/admin/billing/interpreter-invoices" className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
              Clear interpreter scope
            </Link>
          )}
          <Link to={payablesBoardPath} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
            Finance queue <ArrowUpRight size={15} />
          </Link>
          {!scopedInterpreterId && !serviceCategory && (
            <>
              <Link to="/admin/finance/payables/interpreting" className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                Interpreting cycles <ArrowUpRight size={15} />
              </Link>
              <Link to="/admin/finance/payables/translations" className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">
                Translation cycles <ArrowUpRight size={15} />
              </Link>
            </>
          )}
        </div>
      </PageHeader>

      {scopedInterpreterId && (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
          Showing payable documents for <span className="font-black">{scopedInterpreterName}</span>. Monthly settlement processing is controlled from the relevant Accounts Payable workspace.
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            placeholder="Search invoice, interpreter, reference"
          />
        </div>
        <select
          value={statusFilter}
          onChange={event => setStatusFilter(event.target.value as 'ALL' | InvoiceStatus)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
        >
          <option value="ALL">All statuses</option>
          {[InvoiceStatus.DRAFT, InvoiceStatus.SUBMITTED, InvoiceStatus.APPROVED, InvoiceStatus.PAID, InvoiceStatus.REJECTED, InvoiceStatus.CANCELLED].map(status => (
            <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <div className="shrink-0 rounded-md bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          {filteredInvoices.length} of {invoices.length}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={8} />
      ) : invoices.length === 0 ? (
        <EmptyState title="No Interpreter Invoices" description="There are no interpreter invoices submitted yet." icon={FileText} />
      ) : filteredInvoices.length === 0 ? (
        <EmptyState title="No Matching Documents" description="No interpreter invoices match the current search or status." icon={FileText} />
      ) : (
        <>
          <InvoiceTable invoices={paginatedInvoices} type="INTERPRETER" boardPath={payablesBoardPath} />
          <WorkspacePagination
            totalCount={filteredInvoices.length}
            pageStartIndex={pageStartIndex}
            pageEndIndex={pageEndIndex}
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPreviousPage={() => setCurrentPage(Math.max(1, safeCurrentPage - 1))}
            onNextPage={() => setCurrentPage(Math.min(totalPages, safeCurrentPage + 1))}
            onPageSizeChange={size => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            entityLabel="invoice"
          />
        </>
      )}
    </div>
  );
};
