import React, { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useInterpreterInvoices } from '../../hooks/useInterpreterInvoices';
import { StorageService } from '../../services/api';
import { AlertTriangle, CalendarDays, Check, ExternalLink, FileText, RefreshCw, Upload } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { getTimesheetInterpreterAmount } from '../../utils/interpreterFlow';
import { formatLondonDate } from '../../utils/londonDateTime';

const money = (amount: number) =>
  `GBP ${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatPeriod = (period?: string) => {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return 'Multiple periods';
  return formatLondonDate(`${period}-01`, { month: 'long', year: 'numeric' });
};

export const InterpreterPayments = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { readyToInvoice, invoiceHistory, loading, error, createInvoice, refresh } = useInterpreterInvoices(user?.profileId);
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [invoiceReference, setInvoiceReference] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const readyTotal = readyToInvoice.reduce((sum, timesheet) => sum + getTimesheetInterpreterAmount(timesheet), 0);
  const selectedTotal = readyToInvoice
    .filter(timesheet => selectedJobs.includes(timesheet.id))
    .reduce((sum, timesheet) => sum + getTimesheetInterpreterAmount(timesheet), 0);
  const paidTotal = invoiceHistory
    .filter(invoice => invoice.status === 'PAID' || invoice.paymentStatus === 'PAID' || invoice.paymentStatus === 'RECONCILED')
    .reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
  const inProgress = invoiceHistory.filter(invoice => !['PAID', 'REJECTED', 'CANCELLED'].includes(String(invoice.status))).length;
  const currentCycle = formatLondonDate(new Date(), { month: 'long', year: 'numeric' });

  const periods = useMemo(() => Array.from(new Set(
    readyToInvoice.map(timesheet => timesheet.interpreterSettlementPeriod || timesheet.servicePeriod).filter(Boolean)
  )), [readyToInvoice]);

  const toggleJob = (id: string) => {
    setSelectedJobs(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  };

  const toggleAll = () => {
    setSelectedJobs(current => current.length === readyToInvoice.length ? [] : readyToInvoice.map(item => item.id));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.profileId) return;
    setUploading(true);
    try {
      const path = `invoices/interpreters/${user.id}/${Date.now()}_${file.name}`;
      setUploadedUrl(await StorageService.uploadFile(file, path));
      showToast('Invoice document attached', 'success');
    } catch {
      showToast('The invoice document could not be uploaded', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedJobs.length || !invoiceReference.trim()) return;
    setSubmitting(true);
    try {
      await createInvoice(selectedJobs, invoiceReference.trim(), uploadedUrl || undefined);
      showToast('Invoice submitted for review', 'success');
      setSelectedJobs([]);
      setInvoiceReference('');
      setUploadedUrl('');
    } catch (error: any) {
      showToast(error?.message || 'The invoice could not be submitted', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950">
      <PageHeader
        title="Payments"
        subtitle="Create invoices from approved work and follow each payment."
      >
        <Button onClick={() => window.print()} variant="secondary" icon={FileText} size="sm">Print summary</Button>
      </PageHeader>

      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        {error && (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-bold text-amber-900 dark:text-amber-200">{error}</p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">No invoice or payment record was changed.</p>
              </div>
            </div>
            <Button onClick={() => void refresh()} variant="secondary" icon={RefreshCw} size="sm">Try again</Button>
          </div>
        )}
        <section className="grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-4" aria-label="Payment summary">
          {[
            { label: 'Current cycle', value: currentCycle, detail: 'Monthly interpreter cycle' },
            { label: 'Ready to invoice', value: error ? 'Unavailable' : money(readyTotal), detail: error ? 'Retry to refresh' : `${readyToInvoice.length} approved timesheet${readyToInvoice.length === 1 ? '' : 's'}` },
            { label: 'Invoices in progress', value: error ? 'Unavailable' : String(inProgress), detail: error ? 'Retry to refresh' : 'Submitted or approved' },
            { label: 'Paid total', value: error ? 'Unavailable' : money(paidTotal), detail: error ? 'Retry to refresh' : 'Recorded payment history' },
          ].map((item, index) => (
            <div key={item.label} className={`min-w-0 p-4 ${index > 0 ? 'border-t border-slate-100 dark:border-slate-800 sm:border-l sm:border-t-0' : ''}`}>
              <p className="text-[10px] font-bold uppercase text-slate-500">{item.label}</p>
              <p className="mt-1 truncate text-lg font-bold text-slate-950 dark:text-white">{item.value}</p>
              <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-950 dark:text-white">Approved work</h2>
              <p className="mt-1 text-xs text-slate-500">
                {periods.length ? periods.map(formatPeriod).join(', ') : 'No approved work is ready yet'}
              </p>
            </div>
            {readyToInvoice.length > 0 && (
              <button type="button" onClick={toggleAll} className="text-left text-xs font-semibold text-blue-600 hover:text-blue-700">
                {selectedJobs.length === readyToInvoice.length ? 'Clear selection' : 'Select all'}
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">Loading payment data...</div>
          ) : error ? (
            <div className="p-12 text-center text-sm font-semibold text-slate-500">Approved work will appear after the connection is restored.</div>
          ) : readyToInvoice.length === 0 ? (
            <div className="p-12 text-center">
              <Check className="mx-auto text-emerald-500" size={30} />
              <p className="mt-3 text-sm font-bold text-slate-950 dark:text-white">Nothing to invoice</p>
              <p className="mt-1 text-xs text-slate-500">Approved timesheets will appear here automatically.</p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {readyToInvoice.map(timesheet => {
                  const selected = selectedJobs.includes(timesheet.id);
                  return (
                    <label key={timesheet.id} className={`flex cursor-pointer items-center gap-3 p-4 transition-colors ${selected ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleJob(timesheet.id)}
                        className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">Job {timesheet.bookingId}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatLondonDate(timesheet.actualStart)} / {formatPeriod(timesheet.interpreterSettlementPeriod || timesheet.servicePeriod)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-slate-950 dark:text-white">{money(getTimesheetInterpreterAmount(timesheet))}</p>
                    </label>
                  );
                })}
              </div>

              <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 lg:border-l lg:border-t-0">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300" htmlFor="interpreter-invoice-reference">Invoice reference</label>
                <input
                  id="interpreter-invoice-reference"
                  type="text"
                  placeholder="e.g. INV-2026-08"
                  value={invoiceReference}
                  onChange={event => setInvoiceReference(event.target.value)}
                  className="mt-2 w-full rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-950 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />

                <label className="relative mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white p-4 text-xs font-semibold text-slate-600 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <input type="file" accept=".pdf,image/*" className="absolute inset-0 opacity-0" onChange={handleFileUpload} disabled={uploading} />
                  {uploadedUrl ? <Check size={16} className="text-emerald-600" /> : <Upload size={16} />}
                  {uploading ? 'Uploading...' : uploadedUrl ? 'Invoice attached' : 'Attach invoice (optional)'}
                </label>

                <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-500">Selected total</span>
                  <span className="text-lg font-bold text-slate-950 dark:text-white">{money(selectedTotal)}</span>
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={!selectedJobs.length || !invoiceReference.trim() || submitting}
                  className="mt-4 w-full justify-center bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {submitting ? 'Submitting...' : 'Submit invoice'}
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 p-4 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-950 dark:text-white">Invoice history</h2>
            <p className="mt-1 text-xs text-slate-500">Submitted, approved and paid invoices.</p>
          </div>
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading invoice history...</div>
          ) : error ? (
            <div className="p-10 text-center text-sm font-semibold text-slate-500">Invoice history is temporarily unavailable.</div>
          ) : invoiceHistory.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No invoices submitted yet.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {invoiceHistory.map(invoice => (
                <div key={invoice.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{invoice.externalInvoiceReference || invoice.id}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${invoice.status === 'PAID' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                        {invoice.paymentStatus === 'SCHEDULED' ? 'Payment scheduled' : invoice.status}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <CalendarDays size={13} /> {formatLondonDate(invoice.issueDate)} / {invoice.lineCount || invoice.items?.length || 0} jobs
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <p className="text-sm font-bold text-slate-950 dark:text-white">{money(invoice.totalAmount)}</p>
                    {invoice.uploadedPdfUrl && (
                      <a href={invoice.uploadedPdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
                        Document <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
