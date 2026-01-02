
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClientInvoiceById } from '../../../hooks/useClientHooks';
import { PdfService } from '../../../services/api';
import { InvoiceStatusBadge } from '../../../components/billing/InvoiceStatusBadge';
import { ChevronLeft, Download } from 'lucide-react';

export const ClientInvoiceDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { invoice, loading } = useClientInvoiceById(id);

  const handleDownload = () => {
    if (invoice) {
      PdfService.generateClientInvoice(invoice);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;
  if (!invoice) return <div className="p-8 text-red-500">Invoice not found.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
       <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center text-gray-500 hover:text-gray-700">
          <ChevronLeft size={20} className="mr-1" /> Back
        </button>
        <button 
          onClick={handleDownload}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Download size={16} className="mr-2" /> Download PDF
        </button>
      </div>

      <div className="bg-white shadow-lg border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-8 border-b border-gray-200">
          <div className="flex justify-between items-start">
             <div>
               <h1 className="text-3xl font-bold text-gray-900">{invoice.reference || invoice.id}</h1>
               <p className="text-gray-500 mt-1">Issued: {new Date(invoice.issueDate).toLocaleDateString()}</p>
             </div>
             <div className="text-right">
               <InvoiceStatusBadge status={invoice.status} />
               <p className="mt-2 font-bold text-xl">£{invoice.totalAmount.toFixed(2)}</p>
             </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-8">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase">Bill To</p>
              <p className="font-medium text-gray-900 text-lg">{invoice.clientName}</p>
              <p className="text-gray-500">Accounts Payable</p>
            </div>
            <div className="text-right">
               <p className="text-xs font-bold text-gray-400 uppercase">Due Date</p>
               <p className="font-medium text-gray-900">{new Date(invoice.dueDate).toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        <div className="p-0">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-8 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-8 py-3 text-right text-xs font-medium text-gray-500 uppercase">Units</th>
                <th className="px-8 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                <th className="px-8 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {invoice.items?.map((item: any, idx: number) => (
                <tr key={idx}>
                  <td className="px-8 py-4 text-sm text-gray-900">{item.description}</td>
                  <td className="px-8 py-4 text-sm text-gray-500 text-right">{item.quantity || item.units}</td>
                  <td className="px-8 py-4 text-sm text-gray-500 text-right">£{item.rate.toFixed(2)}</td>
                  <td className="px-8 py-4 text-sm font-medium text-gray-900 text-right">£{item.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="p-8 bg-gray-50 border-t border-gray-200 flex justify-end">
           <div className="w-64 space-y-2">
             <div className="flex justify-between text-sm text-gray-600">
               <span>Subtotal</span>
               <span>£{invoice.totalAmount.toFixed(2)}</span>
             </div>
             <div className="flex justify-between text-sm text-gray-600">
               <span>VAT (20%)</span>
               <span>£{(invoice.totalAmount * 0.2).toFixed(2)}</span>
             </div>
             <div className="flex justify-between text-lg font-bold text-gray-900 border-t pt-2">
               <span>Total</span>
               <span>£{(invoice.totalAmount * 1.2).toFixed(2)}</span>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
};
