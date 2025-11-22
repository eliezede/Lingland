import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BillingService } from '../../../services/billingService';
import { ClientInvoice, InvoiceStatus } from '../../../types';
import { InvoiceStatusBadge } from '../../../components/billing/InvoiceStatusBadge';
import { ChevronLeft, Send, CheckCircle } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

export const AdminClientInvoiceDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<ClientInvoice | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (id) BillingService.getClientInvoiceById(id).then(setInvoice);
  }, [id]);

  const handleStatusUpdate = async (status: InvoiceStatus) => {
    if (invoice) {
      await BillingService.updateClientInvoiceStatus(invoice.id, status);
      setInvoice({ ...invoice, status });
      showToast(`Invoice marked as ${status}`, 'success');
    }
  };

  if (!invoice) return <div className="p-8 text-center">Loading details...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center text-gray-500 hover:text-gray-700">
          <ChevronLeft size={20} className="mr-1" /> Back
        </button>
        <div className="space-x-3">
           {invoice.status === InvoiceStatus.DRAFT && (
             <button onClick={() => handleStatusUpdate(InvoiceStatus.SENT)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center">
               <Send size={16} className="mr-2" /> Mark Sent
             </button>
           )}
           {invoice.status === InvoiceStatus.SENT && (
             <button onClick={() => handleStatusUpdate(InvoiceStatus.PAID)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center">
               <CheckCircle size={16} className="mr-2" /> Mark Paid
             </button>
           )}
        </div>
      </div>

      {/* Invoice Paper */}
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-8 border-b border-gray-200">
          <div className="flex justify-between items-start">
             <div>
               <h1 className="text-3xl font-bold text-gray-900">{invoice.reference}</h1>
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
                  <td className="px-8 py-4 text-sm text-gray-500 text-right">{item.units}</td>
                  <td className="px-8 py-4 text-sm text-gray-500 text-right">£{item.rate.toFixed(2)}</td>
                  <td className="px-8 py-4 text-sm font-medium text-gray-900 text-right">£{item.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="p-8 bg-gray-50 border-t border-gray-200 text-right">
           <p className="text-lg font-bold text-gray-900">Total: £{invoice.totalAmount.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};