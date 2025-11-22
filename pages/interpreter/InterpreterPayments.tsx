
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useInterpreterInvoices } from '../../hooks/useInterpreterInvoices';
import { PoundSterling, Upload, FileText } from 'lucide-react';

export const InterpreterPayments = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { readyToInvoice, invoiceHistory, loading, createInvoice } = useInterpreterInvoices(user?.profileId);
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [invRef, setInvRef] = useState('');

  const toggleJob = (id: string) => {
    if (selectedJobs.includes(id)) setSelectedJobs(selectedJobs.filter(j => j !== id));
    else setSelectedJobs([...selectedJobs, id]);
  };

  const handleSubmit = async () => {
    try {
      await createInvoice(selectedJobs, invRef);
      showToast("Invoice created successfully!", "success");
      setSelectedJobs([]);
      setInvRef('');
    } catch (error) {
      showToast("Failed to create invoice", "error");
    }
  };

  const totalSelected = readyToInvoice
    .filter(t => selectedJobs.includes(t.id))
    .reduce((sum, t) => sum + (t.totalInterpreterAmount || 0), 0);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6 pb-20">
      <h1 className="text-2xl font-bold text-gray-900">Money</h1>

      {/* Create Invoice Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <h2 className="font-bold text-gray-800 flex items-center">
            <PoundSterling size={18} className="mr-2 text-blue-600" />
            Ready to Invoice
          </h2>
        </div>
        
        {readyToInvoice.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No approved jobs pending invoicing.</div>
        ) : (
          <div className="p-4">
            <div className="space-y-2 mb-4">
              {readyToInvoice.map(job => (
                <label key={job.id} className="flex items-center p-3 border border-gray-200 rounded-lg bg-white active:bg-blue-50">
                  <input 
                    type="checkbox" 
                    checked={selectedJobs.includes(job.id)}
                    onChange={() => toggleJob(job.id)}
                    className="w-5 h-5 text-blue-600 rounded mr-3"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{new Date(job.actualStart).toLocaleDateString()}</p>
                    <p className="text-xs text-gray-500">Ref: {job.bookingId}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900">£{job.totalInterpreterAmount?.toFixed(2)}</p>
                </label>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-4">
               <input 
                 type="text" 
                 placeholder="Your Invoice Number (e.g. 001)"
                 className="w-full p-3 border border-gray-300 rounded-lg mb-3 text-sm"
                 value={invRef}
                 onChange={e => setInvRef(e.target.value)}
               />
               <button 
                 disabled={selectedJobs.length === 0 || !invRef}
                 onClick={handleSubmit}
                 className="w-full bg-green-600 text-white font-bold py-3 rounded-lg disabled:opacity-50 flex justify-center items-center"
               >
                 <Upload size={18} className="mr-2" />
                 Invoice £{totalSelected.toFixed(2)}
               </button>
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <h3 className="font-bold text-gray-900 mb-3 px-1">Invoice History</h3>
        <div className="space-y-3">
          {invoiceHistory.map(inv => (
            <div key={inv.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
               <div>
                 <p className="font-bold text-gray-900 text-sm">{inv.externalInvoiceReference}</p>
                 <p className="text-xs text-gray-500">{new Date(inv.issueDate).toLocaleDateString()}</p>
               </div>
               <div className="text-right">
                 <p className="font-bold text-gray-900">£{inv.totalAmount.toFixed(2)}</p>
                 <span className={`text-[10px] px-2 py-0.5 rounded-full ${inv.status === 'PAID' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                   {inv.status}
                 </span>
               </div>
            </div>
          ))}
          {invoiceHistory.length === 0 && <p className="text-center text-gray-400 text-sm py-4">No invoices yet.</p>}
        </div>
      </div>
    </div>
  );
};
