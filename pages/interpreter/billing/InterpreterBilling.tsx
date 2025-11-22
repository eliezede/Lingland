
import React, { useEffect, useState } from 'react';
import { BillingService } from '../../../services/api';
import { Timesheet, InterpreterInvoice } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { PoundSterling, Upload, FileText } from 'lucide-react';

export const InterpreterBilling = () => {
  const { user } = useAuth();
  const [pendingJobs, setPendingJobs] = useState<Timesheet[]>([]);
  const [history, setHistory] = useState<InterpreterInvoice[]>([]);
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  
  // Upload Form State
  const [invRef, setInvRef] = useState('');
  const [invTotal, setInvTotal] = useState(0);

  useEffect(() => {
    if (user?.profileId) {
      loadData(user.profileId);
    }
  }, [user]);

  const loadData = async (id: string) => {
    const jobs = await BillingService.getUninvoicedTimesheetsForInterpreter(id);
    const invoices = await BillingService.getInterpreterInvoices(id);
    setPendingJobs(jobs);
    setHistory(invoices);
    
    // Calculate expected total for validation
    setInvTotal(jobs.reduce((sum, j) => sum + (j.totalInterpreterAmount || 0), 0));
  };

  const toggleJob = (id: string) => {
    if (selectedJobs.includes(id)) setSelectedJobs(selectedJobs.filter(j => j !== id));
    else setSelectedJobs([...selectedJobs, id]);
  };

  const handleSubmitInvoice = async () => {
    if (!user?.profileId || selectedJobs.length === 0 || !invRef) return;
    
    const amount = pendingJobs
      .filter(j => selectedJobs.includes(j.id))
      .reduce((sum, j) => sum + (j.totalInterpreterAmount || 0), 0);

    await BillingService.createInterpreterInvoiceUpload(user.profileId, selectedJobs, invRef, amount);
    
    alert('Invoice Submitted!');
    setInvRef('');
    setSelectedJobs([]);
    loadData(user.profileId);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Billing</h1>

      {/* SECTION 1: UNINVOICED JOBS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <PoundSterling size={20} className="mr-2 text-blue-600" />
          Jobs Ready to Invoice
        </h2>
        
        {pendingJobs.length === 0 ? (
          <p className="text-gray-500 text-sm">No approved jobs pending invoicing.</p>
        ) : (
          <div className="space-y-4">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Select</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pendingJobs.map(job => (
                  <tr key={job.id}>
                    <td className="px-4 py-2">
                      <input 
                        type="checkbox" 
                        checked={selectedJobs.includes(job.id)}
                        onChange={() => toggleJob(job.id)}
                        className="rounded text-blue-600"
                      />
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">{new Date(job.actualStart).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{job.bookingId}</td>
                    <td className="px-4 py-2 text-sm font-medium text-right">£{job.totalInterpreterAmount?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Upload Form */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Upload Your Invoice</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Your Invoice Number</label>
                  <input 
                    type="text" 
                    value={invRef}
                    onChange={e => setInvRef(e.target.value)}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                    placeholder="e.g. INV-001"
                  />
                </div>
                <div>
                   <p className="text-xs text-gray-500 mb-1">Total Amount</p>
                   <p className="text-lg font-bold text-gray-900">
                     £{pendingJobs.filter(j => selectedJobs.includes(j.id)).reduce((s,j) => s + (j.totalInterpreterAmount || 0), 0).toFixed(2)}
                   </p>
                </div>
                <button 
                  onClick={handleSubmitInvoice}
                  disabled={selectedJobs.length === 0 || !invRef}
                  className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center"
                >
                  <Upload size={16} className="mr-2" /> Submit Invoice
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: HISTORY */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
          <FileText size={20} className="mr-2 text-gray-600" />
          Invoice History
        </h2>
        {history.length === 0 ? (
          <p className="text-gray-500 text-sm">No history yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {history.map(inv => (
                  <tr key={inv.id}>
                    <td className="px-4 py-2 text-sm text-gray-700">{new Date(inv.issueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{inv.externalInvoiceReference || inv.id}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{inv.model}</td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">{inv.status}</span>
                    </td>
                    <td className="px-4 py-2 text-sm font-bold text-right">£{inv.totalAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
