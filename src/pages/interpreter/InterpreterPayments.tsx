import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useInterpreterInvoices } from '../../hooks/useInterpreterInvoices';
import { StorageService } from '../../services/api';
import { PoundSterling, Upload, FileText, Check, CalendarDays, ExternalLink, Calculator } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { getTimesheetInterpreterAmount } from '../../utils/interpreterFlow';

export const InterpreterPayments = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { readyToInvoice, invoiceHistory, loading, createInvoice } = useInterpreterInvoices(user?.profileId);
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [invRef, setInvRef] = useState('');

  // Upload State
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const toggleJob = (id: string) => {
    if (selectedJobs.includes(id)) setSelectedJobs(selectedJobs.filter(j => j !== id));
    else setSelectedJobs([...selectedJobs, id]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.profileId) return;

    setUploading(true);
    try {
      const path = `invoices/${user.profileId}/${Date.now()}_${file.name}`;
      const url = await StorageService.uploadFile(file, path);
      setUploadedUrl(url);
      showToast('Invoice uploaded successfully', 'success');
    } catch (error) {
      showToast('Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      await createInvoice(selectedJobs, invRef, uploadedUrl || undefined);
      showToast("Invoice created successfully!", "success");
      setSelectedJobs([]);
      setInvRef('');
      setUploadedUrl('');
    } catch (error) {
      showToast("Failed to create invoice", "error");
    }
  };

  const totalSelected = readyToInvoice
    .filter(t => selectedJobs.includes(t.id))
    .reduce((sum, t) => sum + getTimesheetInterpreterAmount(t), 0);

  return (
    <div className="flex-1 flex flex-col h-full min-h-[calc(100vh-4rem)] bg-slate-50 animate-in fade-in duration-700">
      <PageHeader
        title="Earnings"
        subtitle="Manage pending payables, combine sessions into invoices, and track settlements."
      >
        <Button onClick={() => window.print()} variant="secondary" icon={FileText} size="sm">Export Data</Button>
      </PageHeader>

      <div className="flex-1 flex flex-col lg:flex-row p-4 md:p-8 max-w-7xl mx-auto w-full gap-8">

        {/* Left Col: Invoice Builder */}
        <div className="flex-1 space-y-8 min-w-0 flex flex-col">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col flex-1">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <PoundSterling size={16} className="text-emerald-600" />
                <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-[0.2em]">Generate Invoice</h3>
              </div>
              <div className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                {readyToInvoice.length} Uninvoiced Sessions
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              {loading ? (
                <div className="py-20 flex-1 flex flex-col items-center justify-center text-[10px] uppercase tracking-widest font-black text-slate-400">Loading Accounts...</div>
              ) : readyToInvoice.length === 0 ? (
                <div className="py-20 flex-1 flex flex-col items-center justify-center text-center px-6">
                  <Calculator size={32} className="text-slate-300 mb-4" />
                  <h3 className="text-slate-900 font-black text-sm">No Pending Sessions</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">All approved timesheets have been invoiced.</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                  {/* Selection List */}
                  <div className="flex-1 p-6 space-y-2 overflow-y-auto">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4">Select sessions to bundle</p>
                    {readyToInvoice.map(job => (
                      <label key={job.id} className={`group flex items-center p-4 border rounded-2xl cursor-pointer transition-all ${selectedJobs.includes(job.id) ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/30'}`}>
                        <div className="mr-4 flex-shrink-0">
                          <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${selectedJobs.includes(job.id) ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-slate-50 border-slate-200 group-hover:border-emerald-400'}`}>
                            {selectedJobs.includes(job.id) && <Check size={12} strokeWidth={4} />}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-slate-900 mb-1">{new Date(job.actualStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 truncate">REF: {job.bookingId || 'CONFIDENTIAL'}</p>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-sm font-black text-slate-900">£{getTimesheetInterpreterAmount(job).toFixed(2)}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Builder Controls */}
                  <div className="w-full lg:w-72 shrink-0 bg-slate-50/50 p-6 flex flex-col">
                    <div className="mb-6 flex-1">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Invoice Reference</label>
                      <input
                        type="text"
                        placeholder="e.g. INV-2024-001"
                        className="w-full p-3 border border-slate-200 rounded-xl text-xs font-bold focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                        value={invRef}
                        onChange={e => setInvRef(e.target.value)}
                      />

                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 mt-6">Attach Document (Optional)</label>
                      <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${uploadedUrl ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:bg-white hover:border-blue-400 cursor-pointer relative group'}`}>
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          onChange={handleFileUpload}
                          disabled={uploading}
                        />
                        {uploading ? (
                          <div className="flex flex-col items-center">
                            <div className="w-5 h-5 border-2 border-emerald-500 border-t-emerald-200 rounded-full animate-spin mb-2" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Encrypting...</span>
                          </div>
                        ) : uploadedUrl ? (
                          <div className="flex flex-col items-center text-emerald-700">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
                              <Check size={16} className="text-emerald-600" />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest">Document Secured</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center text-slate-400 group-hover:text-blue-500 transition-colors">
                            <Upload size={20} className="mb-2" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Upload PDF/JPG</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-6 border-t border-slate-200">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Gross Total</span>
                        <span className="text-xl font-black text-slate-900">£{totalSelected.toFixed(2)}</span>
                      </div>
                      <Button
                        onClick={handleSubmit}
                        disabled={selectedJobs.length === 0 || !invRef}
                        size="lg"
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-600/20 disabled:opacity-50 disabled:shadow-none transition-all uppercase tracking-widest text-[10px]"
                      >
                        Submit Invoice
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Historical Statements */}
        <aside className="w-full lg:w-[320px] shrink-0 space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col h-full lg:max-h-[800px]">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-[0.2em]">Previous Statements</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {loading ? (
                <div className="py-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Loading...</div>
              ) : invoiceHistory.length === 0 ? (
                <div className="py-12 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">No historical records.</div>
              ) : invoiceHistory.map(inv => (
                <div key={inv.id} className="p-4 rounded-2xl border border-slate-100 hover:border-blue-200 bg-white transition-all shadow-sm group">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="text-xs font-black text-slate-900 group-hover:text-blue-700 transition-colors uppercase tracking-wider">{inv.externalInvoiceReference}</h4>
                    <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-sm ${inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {inv.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 mb-3 uppercase tracking-widest">
                    <CalendarDays size={12} /> {new Date(inv.issueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                  <div className="flex justify-between items-end border-t border-slate-50 pt-3">
                    <span className="text-xs font-black text-slate-900">£{inv.totalAmount.toFixed(2)}</span>
                    <Link to={`/interpreter/billing/invoice/${inv.id}`} className="text-[10px] font-black text-blue-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 hover:underline">
                      Details <ExternalLink size={10} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
};
