import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, CheckCircle, ChevronLeft, Download, FileText, Receipt, Send } from 'lucide-react';
import { BillingService, PdfService } from '../../../services/api';
import { ClientInvoice, InvoiceStatus } from '../../../types';
import { InvoiceStatusBadge } from '../../../components/billing/InvoiceStatusBadge';
import { useToast } from '../../../context/ToastContext';

type InvoiceLine = ClientInvoice['items'][number] & {
  bookingId?: string;
  timesheetId?: string;
  bookingReference?: string;
  jobNumber?: string;
  serviceType?: string;
};

const money = (amount?: number, currency = 'GBP') =>
  `${currency} ${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value?: string) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const uniqueCount = (values: Array<string | undefined>) => new Set(values.filter(Boolean)).size;

export const AdminClientInvoiceDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [invoice, setInvoice] = useState<ClientInvoice | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const { showToast } = useToast();
  const routeState = location.state as { returnTo?: string; returnLabel?: string } | null;

  const goBackToContext = () => {
    if (routeState?.returnTo) {
      navigate(routeState.returnTo);
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/admin/billing/client-invoices');
  };

  useEffect(() => {
    if (id) BillingService.getClientInvoiceById(id).then(setInvoice);
  }, [id]);

  const lines = useMemo(() => (invoice?.items || []) as InvoiceLine[], [invoice]);

  const summary = useMemo(() => ({
    lines: lines.length,
    jobs: uniqueCount(lines.map(line => line.bookingId)),
    timesheets: uniqueCount(lines.map(line => line.timesheetId)),
    subtotal: lines.reduce((sum, line) => sum + Number(line.total || 0), 0),
  }), [lines]);

  const handleStatusUpdate = async (status: InvoiceStatus) => {
    if (!invoice) return;
    if (!canPerformFinancialActions) {
      showToast('Resolve the financial integrity issues before changing this invoice status.', 'error');
      return;
    }
    setIsUpdating(true);
    try {
      await BillingService.updateClientInvoiceStatus(invoice.id, status);
      setInvoice({ ...invoice, status });
      showToast(`Invoice marked as ${status}`, 'success');
    } catch {
      showToast('Could not update invoice status', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!invoice) return;
    if (!canPerformFinancialActions) {
      showToast('Resolve the financial integrity issues before generating a PDF.', 'error');
      return;
    }
    PdfService.generateClientInvoice(invoice);
    showToast('Downloading PDF...', 'info');
  };

  if (!invoice) {
    return <div className="p-8 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Loading invoice details...</div>;
  }

  const total = invoice.totalAmount || summary.subtotal;
  const currency = invoice.currency || 'GBP';
  const rawReference = invoice.reference || invoice.invoiceNumber || invoice.id;
  const referenceMissing = invoice.referenceIntegrityStatus === 'MISSING'
    || invoice.reference === 'Reference missing'
    || /^rec[a-z0-9]+$/i.test(String(rawReference || ''));
  const displayReference = referenceMissing ? 'Reference missing' : rawReference;
  const integrityIssues = [
    Math.abs(Number(total || 0)) < 0.005 || invoice.financialIntegrityStatus === 'AMOUNT_MISSING'
      ? 'The invoice amount is missing or zero.'
      : '',
    lines.length === 0 ? 'No persisted invoice lines were found.' : '',
    invoice.financialIntegrityStatus === 'LINK_MISSING' || (invoice.sourceSystem === 'AIRTABLE' && summary.jobs === 0)
      ? 'The Airtable document is not linked to a mirrored job.'
      : '',
    referenceMissing
      ? 'The external invoice reference is missing.'
      : '',
  ].filter(Boolean);
  const canPerformFinancialActions = integrityIssues.length === 0;
  const currentPath = `${location.pathname}${location.search}`;
  const financeBoardPath = `/admin/billing?view=fin-awaiting-payment&lane=clientBilling${invoice.clientId ? `&clientId=${encodeURIComponent(invoice.clientId)}` : ''}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <button
            onClick={goBackToContext}
            className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label={`Back to ${routeState?.returnLabel || 'previous page'}`}
            title={`Back to ${routeState?.returnLabel || 'previous page'}`}
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{displayReference}</h1>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
              Client receivable for {invoice.clientName || 'Unknown client'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={financeBoardPath}
            state={{ returnTo: currentPath, returnLabel: 'Client Invoice' }}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Finance Board <ArrowUpRight size={15} />
          </Link>
          <button
            onClick={handleDownloadPdf}
            disabled={!canPerformFinancialActions}
            title={!canPerformFinancialActions ? 'Resolve integrity issues before generating a PDF' : 'Download PDF'}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download size={15} /> PDF
          </button>
          {invoice.status === InvoiceStatus.DRAFT && (
            <button
              onClick={() => handleStatusUpdate(InvoiceStatus.SENT)}
              disabled={isUpdating || !canPerformFinancialActions}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Send size={15} /> Mark sent
            </button>
          )}
          {invoice.status === InvoiceStatus.SENT && (
            <button
              onClick={() => handleStatusUpdate(InvoiceStatus.PAID)}
              disabled={isUpdating || !canPerformFinancialActions}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <CheckCircle size={15} /> Mark paid
            </button>
          )}
        </div>
      </div>

      {!canPerformFinancialActions && (
        <section className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
          <div className="flex items-start gap-3">
            <AlertTriangle size={19} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-300" />
            <div>
              <h2 className="text-sm font-black text-rose-950 dark:text-rose-100">Financial review required</h2>
              <p className="mt-1 text-xs font-semibold text-rose-800 dark:text-rose-200">
                This document remains visible for audit, but PDF generation and status progression are blocked.
              </p>
              <ul className="mt-2 space-y-1 text-xs font-semibold text-rose-800 dark:text-rose-200">
                {integrityIssues.map(issue => <li key={issue}>- {issue}</li>)}
              </ul>
              {invoice.amountSourceField && (
                <p className="mt-2 text-[11px] font-bold text-rose-700 dark:text-rose-300">Amount source: {invoice.amountSourceField}</p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Bill to</p>
            <h2 className="mt-1 truncate text-lg font-black text-slate-950 dark:text-white">{invoice.clientName}</h2>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              Period {formatDate(invoice.periodStart)} to {formatDate(invoice.periodEnd)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {[
              ['Total', Math.abs(Number(total || 0)) < 0.005 ? 'Amount missing' : money(total, currency)],
              ['Due', formatDate(invoice.dueDate)],
              ['Lines', summary.lines],
              ['Jobs', summary.jobs],
              ['Timesheets', summary.timesheets],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-0.5 max-w-[140px] truncate text-sm font-black text-slate-950 dark:text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
              <Receipt size={17} />
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-950 dark:text-white">Invoice lines and linked work</h3>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Every billable line should trace back to a job or timesheet.</p>
            </div>
          </div>
          <p className="text-sm font-black text-slate-950 dark:text-white">
            {Math.abs(Number(summary.subtotal || total || 0)) < 0.005 ? 'Amount missing' : money(summary.subtotal || total, currency)}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full divide-y divide-slate-200 dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-950">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Category</th>
                <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Description</th>
                <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Job</th>
                <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wide text-slate-400">Units</th>
                <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wide text-slate-400">Rate</th>
                <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wide text-slate-400">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lines.map((item, idx) => (
                <tr key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                      {(item.category || 'SERVICE').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[360px] text-sm font-semibold text-slate-900 dark:text-slate-100">{item.description || 'Invoice line'}</p>
                    {item.timesheetId && <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Timesheet {item.timesheetId}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {item.bookingId ? (
                      <Link
                        to={`/admin/bookings/${item.bookingId}`}
                        state={{ returnTo: currentPath, returnLabel: 'Client Invoice' }}
                        className="inline-flex items-center gap-1 text-sm font-black text-blue-600 hover:text-blue-700 dark:text-blue-300"
                      >
                        {item.bookingReference || item.jobNumber || item.bookingId}
                        <ArrowUpRight size={13} />
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-slate-400">No job link</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-slate-600 dark:text-slate-300">{Number(item.units || 0).toLocaleString('en-GB')}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-slate-600 dark:text-slate-300">{Math.abs(Number(item.rate || 0)) < 0.005 ? '-' : money(item.rate, currency)}</td>
                  <td className="px-4 py-3 text-right text-sm font-black text-slate-950 dark:text-white">{Math.abs(Number(item.total || 0)) < 0.005 ? 'Amount missing' : money(item.total, currency)}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                    No invoice lines found for this document.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <FileText size={16} />
            Status changes update linked jobs when the invoice is paid.
          </div>
          <div className="text-left sm:text-right">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Total due</p>
            <p className="text-2xl font-black text-slate-950 dark:text-white">{Math.abs(Number(total || 0)) < 0.005 ? 'Amount missing' : money(total, currency)}</p>
          </div>
        </div>
      </section>
    </div>
  );
};
