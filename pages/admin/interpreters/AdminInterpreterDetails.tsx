import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  InterpreterService, BookingService, BillingService 
} from '../../../services/api';
import { 
  Interpreter, Booking, InterpreterInvoice, BookingStatus 
} from '../../../types';
import { Spinner } from '../../../components/ui/Spinner';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge } from '../../../components/StatusBadge';
import { InvoiceStatusBadge } from '../../../components/billing/InvoiceStatusBadge';
import { useSettings } from '../../../context/SettingsContext';
import { useToast } from '../../../context/ToastContext';
import { 
  ChevronLeft, Mail, Phone, MapPin, Languages, 
  Award, ShieldCheck, CalendarDays, PoundSterling, Clock, 
  ArrowUpRight, FileText, UserCircle2, Edit, Check
} from 'lucide-react';

type Tab = 'JOBS' | 'FINANCE' | 'COMPLIANCE';

export const AdminInterpreterDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { settings } = useSettings();
  
  const [interpreter, setInterpreter] = useState<Interpreter | null>(null);
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<InterpreterInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('JOBS');

  // Edit State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Interpreter>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id]);

  const loadData = async (interpreterId: string) => {
    setLoading(true);
    try {
      const [profile, schedule, financialHistory, offers] = await Promise.all([
        InterpreterService.getById(interpreterId),
        BookingService.getInterpreterSchedule(interpreterId),
        BillingService.getInterpreterInvoices(),
        BookingService.getInterpreterOffers(interpreterId)
      ]);

      setInterpreter(profile || null);

      const offeredBookings = offers
        .filter(o => o.bookingSnapshot && Object.keys(o.bookingSnapshot).length > 0)
        .map(o => ({ 
          ...o.bookingSnapshot, 
          id: o.bookingId,
          status: BookingStatus.OFFERED
        } as Booking));
      
      const mergedJobs = [...schedule];
      offeredBookings.forEach(ob => {
        if (!mergedJobs.find(j => j.id === ob.id)) {
          mergedJobs.push(ob);
        }
      });

      setJobs(mergedJobs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setInvoices(financialHistory.filter(inv => inv.interpreterId === interpreterId));
    } catch (error) {
      console.error("Failed to load interpreter details:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    if (interpreter) {
      setFormData({ ...interpreter });
      setIsEditModalOpen(true);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !formData) return;
    
    setSaving(true);
    try {
      await InterpreterService.updateProfile(id, formData);
      showToast('Profile updated successfully', 'success');
      await loadData(id);
      setIsEditModalOpen(false);
    } catch (error) {
      showToast('Error saving profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleLanguage = (lang: string) => {
    const current = formData.languages || [];
    const updated = current.includes(lang)
      ? current.filter(l => l !== lang)
      : [...current, lang];
    setFormData({ ...formData, languages: updated });
  };

  if (loading) return <div className="p-12 flex justify-center"><Spinner size="lg" /></div>;
  if (!interpreter) return <div className="p-12 text-center text-red-500 font-bold">Interpreter not found.</div>;

  const earningsTotal = invoices.reduce((acc, inv) => acc + inv.totalAmount, 0);
  const upcomingJobs = jobs.filter(j => new Date(j.date) >= new Date() && (j.status === BookingStatus.CONFIRMED || j.status === BookingStatus.OFFERED)).length;

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center">
          <button 
            onClick={() => navigate('/admin/interpreters')} 
            className="mr-4 p-2 rounded-full hover:bg-gray-200 transition-colors text-gray-500"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center">
            <div className="w-16 h-16 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-2xl font-bold mr-4 border-4 border-white shadow-sm">
              {interpreter.name.charAt(0)}
            </div>
            <div>
               <div className="flex items-center gap-3">
                 <h1 className="text-2xl font-bold text-gray-900">{interpreter.name}</h1>
                 <Badge variant={interpreter.status === 'ACTIVE' ? 'success' : 'warning'}>{interpreter.status}</Badge>
               </div>
               <p className="text-gray-500 text-sm mt-0.5">ID: {interpreter.id.toUpperCase()}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
           <Button variant="secondary" icon={Mail} onClick={() => window.location.href = `mailto:${interpreter.email}`}>Contact</Button>
           <Button variant="primary" icon={Edit} onClick={handleEdit}>Edit Profile</Button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="flex flex-col justify-center items-center py-6">
           <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Total Jobs</p>
           <p className="text-3xl font-bold text-gray-900">{jobs.length}</p>
        </Card>
        <Card className="flex flex-col justify-center items-center py-6">
           <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Total Earnings</p>
           <p className="text-3xl font-bold text-gray-900">£{earningsTotal.toFixed(2)}</p>
        </Card>
        <Card className="flex flex-col justify-center items-center py-6 border-blue-100 bg-blue-50/30">
           <p className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">Upcoming / Offered</p>
           <p className="text-3xl font-bold text-blue-600">{upcomingJobs}</p>
        </Card>
        <Card className="flex flex-col justify-center items-center py-6">
           <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Ratings</p>
           <p className="text-3xl font-bold text-gray-900">4.9 ★</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Sidebar */}
        <div className="space-y-6">
          <Card className="space-y-6">
            <h3 className="font-bold text-gray-900 flex items-center">
              <UserCircle2 size={18} className="mr-2 text-gray-400" />
              Professional Profile
            </h3>
            
            <div className="space-y-4">
               <div>
                 <label className="text-xs font-bold text-gray-400 uppercase">Contact Information</label>
                 <div className="mt-2 space-y-2">
                    <div className="flex items-center text-sm text-gray-600">
                       <Mail size={14} className="mr-2 text-gray-400" /> {interpreter.email}
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                       <Phone size={14} className="mr-2 text-gray-400" /> {interpreter.phone}
                    </div>
                 </div>
               </div>

               <div>
                 <label className="text-xs font-bold text-gray-400 uppercase">Languages</label>
                 <div className="mt-2 flex flex-wrap gap-2">
                    {interpreter.languages.map(lang => (
                      <span key={lang} className="px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-700 flex items-center">
                        <Languages size={12} className="mr-1 text-gray-400" /> {lang}
                      </span>
                    ))}
                 </div>
               </div>

               <div>
                 <label className="text-xs font-bold text-gray-400 uppercase">Operating Regions</label>
                 <div className="mt-2 flex flex-wrap gap-2">
                    {interpreter.regions.map(region => (
                      <span key={region} className="px-2 py-1 bg-blue-50 rounded text-xs font-medium text-blue-700 flex items-center">
                        <MapPin size={12} className="mr-1 text-blue-400" /> {region}
                      </span>
                    ))}
                 </div>
               </div>

               <div>
                 <label className="text-xs font-bold text-gray-400 uppercase">Qualifications</label>
                 <div className="mt-2 space-y-2">
                    {interpreter.qualifications.map(qual => (
                      <div key={qual} className="text-sm text-gray-600 flex items-center">
                         <Award size={14} className="mr-2 text-yellow-600" /> {qual}
                      </div>
                    ))}
                 </div>
               </div>
            </div>
          </Card>

          <Card className="bg-orange-50 border-orange-100">
             <h3 className="font-bold text-gray-900 flex items-center mb-4">
              <ShieldCheck size={18} className="mr-2 text-orange-500" />
              Compliance
            </h3>
            <div className="space-y-4">
               <div>
                  <p className="text-xs text-gray-500 uppercase font-bold">DBS Check Expiry</p>
                  <p className={`text-sm font-medium mt-1 ${new Date(interpreter.dbsExpiry) < new Date() ? 'text-red-600' : 'text-gray-900'}`}>
                    {new Date(interpreter.dbsExpiry).toLocaleDateString()}
                    {new Date(interpreter.dbsExpiry) < new Date() && ' (EXPIRED)'}
                  </p>
               </div>
               <div className="pt-2 border-t border-orange-100 flex justify-between items-center text-xs text-orange-700 font-medium">
                  <span>Certificate ID: ...8921</span>
                  <button className="text-blue-600 hover:underline">View Doc</button>
               </div>
            </div>
          </Card>
        </div>

        {/* Tabs & Content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
             {/* Tab Header */}
             <div className="flex border-b border-gray-200">
                <button 
                  onClick={() => setActiveTab('JOBS')}
                  className={`px-8 py-4 text-sm font-bold transition-all ${activeTab === 'JOBS' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Jobs List ({jobs.length})
                </button>
                <button 
                  onClick={() => setActiveTab('FINANCE')}
                  className={`px-8 py-4 text-sm font-bold transition-all ${activeTab === 'FINANCE' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Claims & Money ({invoices.length})
                </button>
             </div>

             {/* Tab Content */}
             <div className="p-0">
                {activeTab === 'JOBS' && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                       <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Client</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Language</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-right"></th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-200">
                          {jobs.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No jobs assigned or offered yet.</td></tr>
                          ) : (
                            jobs.map(job => (
                              <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                                 <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{new Date(job.date).toLocaleDateString()}</div>
                                    <div className="text-xs text-gray-500">{job.startTime}</div>
                                 </td>
                                 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{job.clientName}</td>
                                 <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-xs font-bold text-gray-400 uppercase tracking-tighter">{job.languageFrom} &rarr;</div>
                                    <div className="text-sm font-bold text-blue-700">{job.languageTo}</div>
                                 </td>
                                 <td className="px-6 py-4 whitespace-nowrap">
                                    <StatusBadge status={job.status} />
                                 </td>
                                 <td className="px-6 py-4 text-right">
                                    <button 
                                      onClick={() => navigate(`/admin/bookings/${job.id}`)}
                                      className="p-1 text-gray-400 hover:text-blue-600"
                                    >
                                       <ArrowUpRight size={18} />
                                    </button>
                                 </td>
                              </tr>
                            ))
                          )}
                       </tbody>
                    </table>
                  </div>
                )}

                {activeTab === 'FINANCE' && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                       <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Claim Ref</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Issued</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-right"></th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-200">
                          {invoices.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No financial history available.</td></tr>
                          ) : (
                            invoices.map(inv => (
                              <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                                 <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-bold text-gray-900 flex items-center">
                                       <FileText size={14} className="mr-2 text-gray-400" />
                                       {inv.externalInvoiceReference || inv.id.substring(0,8)}
                                    </div>
                                 </td>
                                 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{new Date(inv.issueDate).toLocaleDateString()}</td>
                                 <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">£{inv.totalAmount.toFixed(2)}</td>
                                 <td className="px-6 py-4 whitespace-nowrap">
                                    <InvoiceStatusBadge status={inv.status} />
                                 </td>
                                 <td className="px-6 py-4 text-right">
                                    <button 
                                      onClick={() => navigate(`/admin/billing/interpreter-invoices/${inv.id}`)}
                                      className="text-blue-600 hover:text-blue-800 text-xs font-bold uppercase"
                                    >
                                       Manage
                                    </button>
                                 </td>
                              </tr>
                            ))
                          )}
                       </tbody>
                    </table>
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Interpreter Profile"
        maxWidth="lg"
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
               <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label>
               <input 
                 type="text" 
                 required
                 className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                 value={formData.name || ''}
                 onChange={e => setFormData({...formData, name: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-xs font-bold text-gray-500 uppercase mb-1">System Status</label>
               <select 
                 className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                 value={formData.status}
                 onChange={e => setFormData({...formData, status: e.target.value as any})}
               >
                 <option value="ACTIVE">Active</option>
                 <option value="ONBOARDING">Onboarding</option>
                 <option value="SUSPENDED">Suspended</option>
               </select>
             </div>
             <div>
               <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number</label>
               <input 
                 type="tel" 
                 className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                 value={formData.phone || ''}
                 onChange={e => setFormData({...formData, phone: e.target.value})}
               />
             </div>
             <div>
               <label className="block text-xs font-bold text-gray-500 uppercase mb-1">DBS Expiry</label>
               <input 
                 type="date" 
                 className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                 value={formData.dbsExpiry || ''}
                 onChange={e => setFormData({...formData, dbsExpiry: e.target.value})}
               />
             </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Qualifications (Universal List)</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-3 border rounded-lg bg-gray-50">
              {settings.masterData.priorityLanguages.map(lang => (
                <label key={lang} className={`flex items-center p-2 rounded-md border cursor-pointer transition-colors ${
                  formData.languages?.includes(lang) ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                  <input 
                    type="checkbox" 
                    className="hidden"
                    checked={formData.languages?.includes(lang)}
                    onChange={() => toggleLanguage(lang)}
                  />
                  <div className={`w-4 h-4 rounded border mr-2 flex items-center justify-center ${
                    formData.languages?.includes(lang) ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                  }`}>
                    {formData.languages?.includes(lang) && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-xs font-medium">{lang}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t">
             <Button type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
             <Button type="submit" isLoading={saving}>Save Profile Changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
