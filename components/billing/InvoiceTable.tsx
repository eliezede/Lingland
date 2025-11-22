
import React from 'react';
import { ClientInvoice, InterpreterInvoice } from '../../types';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { Eye } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  invoices: (ClientInvoice | InterpreterInvoice)[];
  type: 'CLIENT' | 'INTERPRETER';
}

export const InvoiceTable: React.FC<Props> = ({ invoices, type }) => {
  const basePath = type === 'CLIENT' ? '/admin/billing/client-invoices' : '/admin/billing/interpreter-invoices';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {type === 'CLIENT' ? 'Client' : 'Interpreter'}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">No invoices found.</td>
              </tr>
            )}
            {invoices.map((inv: any) => (
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {type === 'CLIENT' ? inv.reference : (inv.externalInvoiceReference || 'Self-Bill')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {type === 'CLIENT' ? inv.clientName : inv.interpreterName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(inv.issueDate).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                  £{inv.totalAmount.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <InvoiceStatusBadge status={inv.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <Link to={`${basePath}/${inv.id}`} className="text-blue-600 hover:text-blue-800 inline-flex items-center">
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
