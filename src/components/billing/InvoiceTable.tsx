import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Eye, FileText } from 'lucide-react';
import { ClientInvoice, InterpreterInvoice } from '../../types';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { UserAvatar } from '../ui/UserAvatar';

interface Props {
  invoices: (ClientInvoice | InterpreterInvoice)[];
  type: 'CLIENT' | 'INTERPRETER';
  boardPath?: string;
}

const money = (amount: number, currency = 'GBP') => (
  `${currency} ${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
);

export const InvoiceTable: React.FC<Props> = ({ invoices, type, boardPath }) => {
  const location = useLocation();
  const basePath = type === 'CLIENT' ? '/admin/billing/client-invoices' : '/admin/billing/interpreter-invoices';
  const defaultBoardPath = type === 'CLIENT'
    ? '/admin/billing?view=fin-awaiting-payment&lane=clientBilling'
    : '/admin/billing?view=fin-interpreter-invoices&lane=interpreterPayables';
  const returnState = {
    returnTo: `${location.pathname}${location.search}`,
    returnLabel: type === 'CLIENT' ? 'Client Invoices' : 'Interpreter Invoices',
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Reference</th>
              <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">
                {type === 'CLIENT' ? 'Client' : 'Interpreter'}
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Issue Date</th>
              <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Lines</th>
              <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Amount</th>
              <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Status</th>
              <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wide text-slate-400">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500 dark:text-slate-400">No invoices found.</td>
              </tr>
            )}
            {invoices.map((inv: any) => {
              const rawReference = type === 'CLIENT'
                ? (inv.invoiceNumber || inv.reference || inv.id)
                : (inv.externalInvoiceReference || inv.reference || 'Self-Bill');
              const referenceMissing = inv.referenceIntegrityStatus === 'MISSING'
                || inv.reference === 'Reference missing'
                || /^rec[a-z0-9]+$/i.test(String(rawReference || ''));
              const reference = referenceMissing ? 'Reference missing' : rawReference;
              const partyName = type === 'CLIENT' ? inv.clientName : inv.interpreterName;
              const partyPhoto = type === 'CLIENT' ? inv.clientPhotoUrl : inv.interpreterPhotoUrl;
              const lineCount = inv.items?.length || inv.lineCount;
              const amountMissing = inv.financialIntegrityStatus === 'AMOUNT_MISSING'
                || !Number.isFinite(Number(inv.totalAmount))
                || Math.abs(Number(inv.totalAmount || 0)) < 0.005;
              const linkNeedsReview = inv.financialIntegrityStatus === 'LINK_MISSING';

              return (
                <tr key={inv.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-black text-slate-950 dark:text-white">
                    <div className="flex items-center gap-2">
                      <FileText size={15} className="text-slate-400" />
                      <span>{reference}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        name={partyName || 'Unknown'}
                        src={partyPhoto}
                        size="xs"
                        className="border border-slate-100 dark:border-slate-800"
                      />
                      <span className="max-w-[190px] truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {partyName || 'Unknown'}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('en-GB') : '-'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold dark:bg-slate-800" title={!lineCount ? 'Line count will be indexed on the next sync' : undefined}>
                        {lineCount || 'Not indexed'}
                      </span>
                      {linkNeedsReview && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-300" title="Linked work requires review">
                          <AlertTriangle size={13} /> Link
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-black">
                    {amountMissing ? (
                      <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300" title="The Airtable amount field was not resolved">
                        <AlertTriangle size={14} /> Amount missing
                      </span>
                    ) : (
                      <span className="text-slate-950 dark:text-white" title={inv.amountSourceField ? `Imported from ${inv.amountSourceField}` : undefined}>
                        {money(inv.totalAmount, inv.currency || 'GBP')}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <InvoiceStatusBadge status={inv.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link to={boardPath || defaultBoardPath} state={returnState} className="inline-flex items-center text-xs font-bold text-slate-500 hover:text-blue-600">
                        Board <ArrowUpRight size={13} className="ml-1" />
                      </Link>
                      <Link to={`${basePath}/${inv.id}`} state={returnState} className="inline-flex items-center text-sm font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                        <Eye size={16} className="mr-1" /> View
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
