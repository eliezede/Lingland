import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BillingService } from '../../../services/billingService';
import { InterpreterInvoice, InvoiceStatus } from '../../../types';
import { InvoiceStatusBadge } from '../../../components/billing/InvoiceStatusBadge';
import { ChevronLeft, CheckCircle, XCircle, FileText, PoundSterling } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

export const AdminInterpreterInvoiceDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<InterpreterInvoice | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (id) BillingService.getInterpreterInvoiceById(id).then(setInvoice);
  }, [id]);

  const handleStatusUpdate = async (status: InvoiceStatus) => {
    if (invoice) {
      await BillingService.updateInterpreterInvoiceStatus(invoice.id, status);
      setInvoice({ ...invoice, status });
      showToast(`Invoice marked as ${status}`, 'success');
    }
  };

  if (!invoice) return <div className="p-8 text-center">Loading details...</div>;

  return (
    <div className="space-y-6">
       <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center text-gray-500 hover:text-gray-700">
          <ChevronLeft size={20} className="mr-1" /> Back
        </button>
        <div className="space-x-3">
           {invoice.status === InvoiceStatus.SUBMITTED && (
             <>
               <button onClick={() => handleStatusUpdate(InvoiceStatus.REJECTED)} className="px-4 py-2 border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 inline-flex items-center">
                 <XCircle size={16} className="mr-2" /> Reject
               </button>
               <button onClick={() => handleStatusUpdate(InvoiceStatus.APPROVED)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 inline-flex items-center">
                 <CheckCircle size={16} className="mr-2" /> Approve
               </button>
             </>
           )}
           {invoice.status === InvoiceStatus.APPROVED && (
             <button onClick={() => handleStatusUpdate(InvoiceStatus.PAID)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center">
               <PoundSterling size={16} className="mr-2" /> Mark Paid
             </button>
           )}
        </div>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-6">
        <div className="flex justify-between mb-6">
           <div>
             <h2 className="text-xl font-bold text-gray-900">{invoice.interpreterName}</h2>
             <p className="text-gray-500">Reference: {invoice.externalInvoiceReference || 'N/A'}</p>
           </div>
           <div className="text-right">
             <InvoiceStatusBadge status={invoice.status} />
             <p className="text-2xl font-bold text-gray-900 mt-2">£{invoice.totalAmount.toFixed(2)}</p>
           </div>
        </div>

        {invoice.uploadedPdfUrl ? (
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex items-center justify-between mb-6">
            <div className="flex items-center">
               <FileText className="text-red-500 mr-3" />
               <span className="text-sm font-medium text-gray-700">Uploaded Invoice PDF</span>
            </div>
            <a href={invoice.uploadedPdfUrl} target="_blank" rel="noreferrer" className="text-blue-600 text-sm hover:underline">
              Download
            </a>
          </div>
        ) : (
          <div className="mb-6 text-sm text-gray-500 italic">No PDF uploaded (Self-Billing or missing).</div>
        )}

        <h3 className="font-bold text-gray-900 mb-3">Line Items</h3>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {invoice.items?.map((item: any, idx: number) => (
              <tr key={idx}>
                <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">£{item.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};