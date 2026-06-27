import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Eye, FileText } from 'lucide-react';
import { ClientInvoice, InterpreterInvoice } from '../../types';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { UserAvatar } from '../ui/UserAvatar';

interface Props {
  invoices: (ClientInvoice | InterpreterInvoice)[];
  type: 'CLIENT' | 'INTERPRETER';
}

const money = (amount: number, currency = 'GBP') => (
  `${currency} ${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
);

export const InvoiceTable: React.FC<Props> = ({ invoices, type }) => {
  const basePath = type === 'CLIENT' ? '/admin/billing/client-invoices' : '/admin/billing/interpreter-invoices';
  const boardPath = type === 'CLIENT'
    ? '/admin/billing?view=fin-awaiting-payment&lane=clientBilling'
    : '/admin/billing?view=fin-interpreter-invoices&lane=interpreterPayables';

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
              const reference = type === 'CLIENT'
                ? (inv.invoiceNumber || inv.reference || inv.id)
                : (inv.externalInvoiceReference || inv.reference || 'Self-Bill');
              const partyName = type === 'CLIENT' ? inv.clientName : inv.interpreterName;
              const partyPhoto = type === 'CLIENT' ? inv.clientPhotoUrl : inv.interpreterPhotoUrl;

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
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold dark:bg-slate-800">
                      {inv.items?.length || inv.lineCount || 0}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-black text-slate-950 dark:text-white">
                    {money(inv.totalAmount, inv.currency || 'GBP')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <InvoiceStatusBadge status={inv.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link to={boardPath} className="inline-flex items-center text-xs font-bold text-slate-500 hover:text-blue-600">
                        Board <ArrowUpRight size={13} className="ml-1" />
                      </Link>
                      <Link to={`${basePath}/${inv.id}`} className="inline-flex items-center text-sm font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
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
