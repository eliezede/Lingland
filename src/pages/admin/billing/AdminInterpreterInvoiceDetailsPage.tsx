import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, CheckCircle, ChevronLeft, Download, FileText, PoundSterling, XCircle } from 'lucide-react';
import { BillingService } from '../../../services/billingService';
import { InterpreterInvoice, InvoiceStatus } from '../../../types';
import { InvoiceStatusBadge } from '../../../components/billing/InvoiceStatusBadge';
import { useToast } from '../../../context/ToastContext';
import { UserAvatar } from '../../../components/ui/UserAvatar';

type InterpreterInvoiceLine = InterpreterInvoice['items'][number] & {
  bookingId?: string;
  timesheetId?: string;
  bookingReference?: string;
  jobNumber?: string;
  sessionDate?: string;
};

const money = (amount?: number, currency = 'GBP') =>
  `${currency} ${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value?: string) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const uniqueCount = (values: Array<string | undefined>) => new Set(values.filter(Boolean)).size;

export const AdminInterpreterInvoiceDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [invoice, setInvoice] = useState<InterpreterInvoice | null>(null);
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
    navigate('/admin/billing/interpreter-invoices');
  };

  useEffect(() => {
    if (id) BillingService.getInterpreterInvoiceById(id).then(setInvoice);
  }, [id]);

  const lines = useMemo(() => (invoice?.items || []) as InterpreterInvoiceLine[], [invoice]);

  const summary = useMemo(() => ({
    lines: lines.length,
    jobs: uniqueCount(lines.map(line => line.bookingId)),
    timesheets: uniqueCount(lines.map(line => line.timesheetId)),
    total: lines.reduce((sum, line) => sum + Number(line.total || 0), 0),
  }), [lines]);

  const handleStatusUpdate = async (status: InvoiceStatus) => {
    if (!invoice) return;
    setIsUpdating(true);
    try {
      await BillingService.updateInterpreterInvoiceStatus(invoice.id, status);
      setInvoice({ ...invoice, status });
      showToast(`Invoice marked as ${status}`, 'success');
    } catch {
      showToast('Could not update invoice status', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!invoice) {
    return <div className="p-8 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Loading invoice details...</div>;
  }

  const total = invoice.totalAmount || summary.total;
  const currency = invoice.currency || 'GBP';
  const currentPath = `${location.pathname}${location.search}`;
  const payablesBoardPath = `/admin/billing?view=fin-interpreter-invoices&lane=interpreterPayables${invoice.interpreterId ? `&interpreterId=${encodeURIComponent(invoice.interpreterId)}` : ''}`;

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
          <div className="flex items-center gap-3">
            <UserAvatar name={invoice.interpreterName || ''} src={invoice.interpreterPhotoUrl} size="md" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                  {invoice.externalInvoiceReference || invoice.id}
                </h1>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
              <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                Payable invoice for {invoice.interpreterName || 'Unknown interpreter'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={payablesBoardPath}
            state={{ returnTo: currentPath, returnLabel: 'Interpreter Invoice' }}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Payables Board <ArrowUpRight size={15} />
          </Link>
          {invoice.uploadedPdfUrl && (
            <a
              href={invoice.uploadedPdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Download size={15} /> PDF
            </a>
          )}
          {invoice.status === InvoiceStatus.SUBMITTED && (
            <>
              <button
                onClick={() => handleStatusUpdate(InvoiceStatus.REJECTED)}
                disabled={isUpdating}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 bg-white px-3 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
              >
                <XCircle size={15} /> Reject
              </button>
              <button
                onClick={() => handleStatusUpdate(InvoiceStatus.APPROVED)}
                disabled={isUpdating}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <CheckCircle size={15} /> Approve
              </button>
            </>
          )}
          {invoice.status === InvoiceStatus.APPROVED && (
            <button
              onClick={() => handleStatusUpdate(InvoiceStatus.PAID)}
              disabled={isUpdating}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <PoundSterling size={15} /> Mark paid
            </button>
          )}
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Interpreter payable</p>
            <h2 className="mt-1 truncate text-lg font-black text-slate-950 dark:text-white">{invoice.interpreterName}</h2>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              {invoice.model === 'UPLOAD' ? 'Uploaded supplier invoice' : 'Self-billing invoice'} issued {formatDate(invoice.issueDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {[
              ['Total', money(total, currency)],
              ['Model', invoice.model.replace('_', ' ')],
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

      {!invoice.uploadedPdfUrl && invoice.model === 'UPLOAD' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          This upload invoice does not have a PDF attached yet.
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
              <FileText size={17} />
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-950 dark:text-white">Payable lines and linked work</h3>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Each payout line should trace back to a completed job or timesheet.</p>
            </div>
          </div>
          <p className="text-sm font-black text-slate-950 dark:text-white">{money(summary.total || total, currency)}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full divide-y divide-slate-200 dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-950">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Category</th>
                <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Description</th>
                <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Job</th>
                <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Timesheet</th>
                <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wide text-slate-400">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lines.map((item, idx) => (
                <tr key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full border border-indigo-100 bg-indigo-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                      {(item.category || 'PAYMENT').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[420px] text-sm font-semibold text-slate-900 dark:text-slate-100">{item.description || 'Payment line'}</p>
                    {item.sessionDate && <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{formatDate(item.sessionDate)}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {item.bookingId ? (
                      <Link
                        to={`/admin/bookings/${item.bookingId}`}
                        state={{ returnTo: currentPath, returnLabel: 'Interpreter Invoice' }}
                        className="inline-flex items-center gap-1 text-sm font-black text-blue-600 hover:text-blue-700 dark:text-blue-300"
                      >
                        {item.bookingReference || item.jobNumber || item.bookingId}
                        <ArrowUpRight size={13} />
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-slate-400">No job link</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300">{item.timesheetId || 'No timesheet'}</td>
                  <td className="px-4 py-3 text-right text-sm font-black text-slate-950 dark:text-white">{money(item.total, currency)}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                    No payable lines found for this invoice.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <FileText size={16} />
            Approve before marking the interpreter invoice as paid.
          </div>
          <div className="text-left sm:text-right">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Total payout</p>
            <p className="text-2xl font-black text-slate-950 dark:text-white">{money(total, currency)}</p>
          </div>
        </div>
      </section>
    </div>
  );
};
