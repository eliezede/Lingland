
import React from 'react';
import { ClientInvoice, InterpreterInvoice } from '../../types';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { UserAvatar } from '../ui/UserAvatar';

interface Props {
  invoices: (ClientInvoice | InterpreterInvoice)[];
  type: 'CLIENT' | 'INTERPRETER';
}

export const InvoiceTable: React.FC<Props> = ({ invoices, type }) => {
  const basePath = type === 'CLIENT' ? '/admin/billing/client-invoices' : '/admin/billing/interpreter-invoices';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden transition-colors">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
          <thead className="bg-gray-50 dark:bg-slate-800/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-tight">Reference</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-tight">
                {type === 'CLIENT' ? 'Client' : 'Interpreter'}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-tight">Issue Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-tight">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-tight">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-tight">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500 dark:text-slate-400">No invoices found.</td>
              </tr>
            )}
            {invoices.map((inv: any) => (
              <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                  {type === 'CLIENT' ? inv.reference : (inv.externalInvoiceReference || 'Self-Bill')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <UserAvatar 
                      name={type === 'CLIENT' ? inv.clientName : inv.interpreterName} 
                      src={type === 'CLIENT' ? inv.clientPhotoUrl : inv.interpreterPhotoUrl}
                      size="xs"
                      className="border border-slate-100 dark:border-slate-800"
                    />
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[150px]">
                      {type === 'CLIENT' ? inv.clientName : inv.interpreterName}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">
                  {new Date(inv.issueDate).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                  £{inv.totalAmount.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <InvoiceStatusBadge status={inv.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <Link to={`${basePath}/${inv.id}`} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 inline-flex items-center">
                    <Eye size={16} className="mr-1" /> View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
