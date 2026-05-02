import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  InterpreterService, BookingService, BillingService, ChatService, NotificationService, EmailService, UserService
} from '../../../services/api';
import {
  Interpreter, Booking, InterpreterInvoice, BookingStatus, NotificationType
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
import { useAuth } from '../../../context/AuthContext';
import { useChat } from '../../../context/ChatContext';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import {
  ChevronLeft, Mail, Phone, MapPin, Languages,
  Award, ShieldCheck, ArrowUpRight, FileText, UserCircle2, Edit, Check, MessageSquare,
  Globe2, Zap, Clock, Banknote, Car, Info, AlertCircle, ExternalLink,
  User2, Home, Settings, Trash2
} from 'lucide-react';

type Tab = 'JOBS' | 'FINANCE' | 'COMPLIANCE' | 'RATES';
type EditModalTab = 'PERSONAL' | 'FINANCE' | 'COMPLIANCE' | 'QUALIFICATIONS' | 'LANGUAGES' | 'RATES' | 'NOTES';

export const AdminInterpreterDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openThread } = useChat();
  const { showToast } = useToast();
  const { settings } = useSettings();

  const [interpreter, setInterpreter] = useState<Interpreter | null>(null);
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<InterpreterInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('JOBS');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editModalTab, setEditModalTab] = useState<EditModalTab>('PERSONAL');
  const [formData, setFormData] = useState<Partial<Interpreter>>({});
  const [saving, setSaving] = useState(false);
  const [processingChat, setProcessingChat] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);

  // Deletion State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

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
          status: 'PENDING_ASSIGNMENT' as any
        } as Booking));

      const mergedJobs = [...schedule];
      offeredBookings.forEach(ob => {
        if (!mergedJobs.find(j => j.id === ob.id)) {
          mergedJobs.push(ob);
        }
      });

      setJobs(mergedJobs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setInvoices(financialHistory.filter(inv => inv.interpreterId === interpreterId));
    } finally {
      setLoading(false);
    }
  };

  const handleStartChat = async () => {
    if (!interpreter || !user) return;
    setProcessingChat(true);
    try {
      const names = {
        [user.id]: user.displayName || 'Admin',
        [interpreter.id]: interpreter.name
      };
      const photos = {
        [user.id]: user.photoUrl || '',
        [interpreter.id]: interpreter.photoUrl || ''
      };
      const threadId = await ChatService.getOrCreateThread(
        [user.id, interpreter.id],
        names,
        photos
      );
      openThread(threadId);
    } finally {
      setProcessingChat(false);
    }
  };

  const handleSendActivation = async () => {
    if (!interpreter) return;
    setSendingInvite(true);
    try {
      const now = new Date().toISOString();
      await UserService.sendActivationInvite(interpreter.email, interpreter.name);
      await InterpreterService.updateProfile(interpreter.id, { activationEmailSentAt: now });
      
      // Update local state
      setInterpreter({ ...interpreter, activationEmailSentAt: now });
      
      showToast(interpreter.activationEmailSentAt ? 'Activation email resent successfully' : 'Activation email queued successfully', 'success');
    } catch (error) {
      console.error('Failed to send activation email', error);
      showToast('Failed to queue activation email', 'error');
    } finally {
      setSendingInvite(false);
    }
  };

  const handleEdit = () => {
    if (interpreter) {
      setFormData({ 
        ...interpreter,
        bankDetails: interpreter.bankDetails || { accountName: '', accountNumber: '', sortCode: '' },
        languageProficiencies: interpreter.languageProficiencies || []
      });
      setEditModalTab('PERSONAL');
      setIsEditModalOpen(true);
    }
  };

  const toggleChecklist = (field: 'workChecksCompleted' | 'inductionsCompleted' | 'workFormsSigned' | 'otherPaperwork', item: string) => {
    const current = (formData[field] as string[]) || [];
    const updated = current.includes(item) ? current.filter(i => i !== item) : [...current, item];
    setFormData(prev => ({ ...prev, [field]: updated }));
  };

  const toggleQualification = (qual: string) => {
    const current = formData.qualifications || [];
    const updated = current.includes(qual) ? current.filter(q => q !== qual) : [...current, qual];
    setFormData(prev => ({ ...prev, qualifications: updated }));
  };

  const getStatusBadgeClass = (status: string) => {
    if (status === 'ACTIVE') return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (status === 'ONBOARDING') return 'bg-blue-50 text-blue-700 border border-blue-200';
    if (status === 'SUSPENDED') return 'bg-amber-50 text-amber-700 border border-amber-200';
    return 'bg-red-50 text-red-700 border border-red-200';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !formData) return;

    setSaving(true);
    try {
      // Sync simple legacy 'languages' array before saving
      const syncData = {
        ...formData,
        languages: (formData.languageProficiencies || []).map(p => p.language)
      };

      await InterpreterService.updateProfile(id, syncData);
      showToast('Profile updated successfully', 'success');
      await loadData(id);
      setIsEditModalOpen(false);
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

  const handleApproveDoc = async (docKey: string) => {
    if (!id || !interpreter || !interpreter.onboarding) return;
    
    const updatedOnboarding = { ...interpreter.onboarding };
    (updatedOnboarding[docKey as keyof typeof updatedOnboarding] as any).status = 'VERIFIED';
    
    // Check if everything is now verified
    const keys = ['dbs', 'idCheck', 'certifications', 'rightToWork'];
    const allVerified = keys.every(k => {
      const doc = (updatedOnboarding as any)[k];
      return doc && doc.status === 'VERIFIED';
    });
    
    if (allVerified) {
      updatedOnboarding.overallStatus = 'COMPLETED';
    }

    try {
      await InterpreterService.updateProfile(id, { onboarding: updatedOnboarding });
      showToast(`${docKey.toUpperCase()} verified`, 'success');
      
      await NotificationService.notify(
        interpreter.id,
        'Document Verified',
        `Your ${docKey.toUpperCase()} has been approved.`,
        NotificationType.SUCCESS
      );

      await EmailService.sendApplicationEmail(
        interpreter as any,
        allVerified ? 'ONBOARDING_COMPLETED' : 'ONBOARDING_APPROVED',
        'admin@lingland.com',
        { 
          applicantName: interpreter.name, 
          documentName: docKey.toUpperCase() 
        }
      );

      loadData(id);
    } catch (e) {
      showToast('Failed to verify document', 'error');
    }
  };

  const handleRejectDoc = async (docKey: string) => {
    if (!id || !interpreter || !interpreter.onboarding) return;
    
    const reason = window.prompt(`Enter rejection reason for ${docKey.toUpperCase()}:`);
    if (reason === null) return;

    const updatedOnboarding = { ...interpreter.onboarding };
    (updatedOnboarding[docKey as keyof typeof updatedOnboarding] as any).status = 'REJECTED';
    (updatedOnboarding[docKey as keyof typeof updatedOnboarding] as any).notes = reason;
    updatedOnboarding.overallStatus = 'DOCUMENTS_PENDING';

    try {
      await InterpreterService.updateProfile(id, { onboarding: updatedOnboarding });
      showToast(`${docKey.toUpperCase()} rejected`, 'info');
      
      await NotificationService.notify(
        interpreter.id,
        'Document Action Required',
        `Your ${docKey.toUpperCase()} was rejected: ${reason}`,
        NotificationType.WARNING
      );
      
      await EmailService.sendApplicationEmail(
        interpreter as any,
        'ONBOARDING_REJECTED',
        'admin@lingland.com',
        { 
          applicantName: interpreter.name,
          documentName: docKey.toUpperCase(),
          rejectionReason: reason
        }
      );

      loadData(id);
    } catch (e) {
      showToast('Failed to reject document', 'error');
    }
  };

  if (loading) return <div className="p-12 flex justify-center"><Spinner size="lg" /></div>;
  if (!interpreter) return <div className="p-12 text-center text-red-500 font-bold">Interpreter not found.</div>;

  const earningsTotal = invoices.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0);
  const upcomingJobsCount = jobs.filter(j => new Date(j.date) >= new Date() && ['BOOKED', 'PENDING_ASSIGNMENT'].includes(String(j.status))).length;
  const completedJobsCount = jobs.filter(j => ['TIMESHEET_SUBMITTED', 'VERIFIED', 'INVOICING', 'INVOICED', 'PAID'].includes(String(j.status))).length;
  return (
    <>
      <div className="space-y-4 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center">
          <button onClick={() => navigate('/admin/interpreters')} className="mr-3 p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center">
            <UserAvatar src={interpreter.photoUrl} name={interpreter.name} size="lg" className="mr-3" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">{interpreter.name}</h1>
                <StatusBadge status={interpreter.status} />
              </div>
              <p className="text-slate-500 text-xs font-medium">ID: {interpreter.id.toUpperCase()} • Joined: {interpreter.joinedDate ? new Date(interpreter.joinedDate).toLocaleDateString() : 'N/A'}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {interpreter.status === 'IMPORTED' && (
            <div className="flex flex-col items-end gap-1">
              <Button 
                variant="outline" 
                className={interpreter.activationEmailSentAt ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"}
                icon={interpreter.activationEmailSentAt ? Check : Mail} 
                isLoading={sendingInvite} 
                onClick={handleSendActivation}
              >
                {interpreter.activationEmailSentAt ? 'Resend Activation' : 'Send Activation'}
              </Button>
              {interpreter.activationEmailSentAt && (
                <span className="text-[9px] font-bold text-slate-400 uppercase">
                  Last sent: {new Date(interpreter.activationEmailSentAt).toLocaleString()}
                </span>
              )}
            </div>
          )}
          <Button variant="outline" icon={MessageSquare} isLoading={processingChat} onClick={handleStartChat}>Message</Button>
          <Button variant="primary" icon={Edit} onClick={handleEdit}>Edit Profile</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="flex flex-col justify-center items-center py-4" padding="none">
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-0.5">Total Jobs</p>
          <p className="text-2xl font-bold text-slate-900">{jobs.length}</p>
        </Card>
        <Card className="flex flex-col justify-center items-center py-4" padding="none">
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-0.5">Total Earnings</p>
          <p className="text-2xl font-bold text-slate-900">£{earningsTotal.toFixed(2)}</p>
        </Card>
        <Card className="flex flex-col justify-center items-center py-4 border-blue-100 bg-blue-50/50" padding="none">
          <p className="text-blue-500 text-[10px] font-bold uppercase tracking-widest mb-0.5">Open Schedule</p>
          <p className="text-2xl font-bold text-blue-600">{upcomingJobsCount}</p>
        </Card>
        <Card className="flex flex-col justify-center items-center py-4" padding="none">
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-0.5">Rating</p>
          <p className="text-2xl font-bold text-slate-900">4.9 ★</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-4">
          <Card className="space-y-4" padding="sm">
            <h3 className="font-bold text-slate-900 flex items-center uppercase text-[10px] tracking-widest">
              <UserCircle2 size={14} className="mr-1.5 text-slate-400" />
              Professional Profile
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Contacts</label>
                <div className="mt-1.5 space-y-1.5">
                  <div className="flex items-center text-xs font-semibold text-slate-700">
                    <Mail size={12} className="mr-1.5 text-slate-400" /> {interpreter.email}
                  </div>
                  <div className="flex items-center text-xs font-semibold text-slate-700">
                    <Phone size={12} className="mr-1.5 text-slate-400" /> {interpreter.phone}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Home size={10} className="text-slate-400" /> Residential Address
                </label>
                <div className="mt-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <p className="text-xs font-bold text-slate-800">{interpreter.address.street || 'No street'}</p>
                  <p className="text-[10px] text-slate-500 font-medium">
                    {interpreter.address.town}{interpreter.address.county ? `, ${interpreter.address.county}` : ''}
                  </p>
                  <p className="text-[10px] text-blue-600 font-black tracking-widest">{interpreter.address.postcode}</p>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Call Priority (L1 Order)</label>
                <div className="mt-1.5 space-y-1.5">
                  {(interpreter.languageProficiencies || []).length > 0 ? (
                    (interpreter.languageProficiencies || []).map(p => (
                      <div key={p.language} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-2">
                          <Globe2 size={12} className="text-blue-500" />
                          <span className="text-[10px] font-bold text-slate-700 uppercase">{p.language}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="bg-white px-2 py-0.5 rounded text-[8px] font-black border text-indigo-600 shadow-sm">PRIO {p.l1 || 18}</span>
                          {p.translateOrder !== 'no' && (
                            <span className="bg-white px-2 py-0.5 rounded text-[8px] font-black border text-emerald-600 shadow-sm">{p.translateOrder}</span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center">
                      <p className="text-[10px] text-slate-400 font-medium">No priority assigned yet</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Qualifications</label>
                <div className="mt-1.5 space-y-1.5">
                  {interpreter.qualifications.map(qual => (
                    <div key={qual} className="text-[11px] font-semibold text-slate-700 flex items-center">
                      <Award size={12} className="mr-1.5 text-yellow-600" /> {qual}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="bg-orange-50 border-orange-100" padding="sm">
            <h3 className="font-bold text-orange-900 flex items-center mb-3 uppercase text-[10px] tracking-widest">
              <ShieldCheck size={14} className="mr-1.5 text-orange-500" />
              Compliance Snapshot
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-[9px] text-orange-700 uppercase font-bold tracking-widest">DBS Level / Expiry</p>
                <p className={`text-xs font-bold mt-0.5 ${interpreter.dbs?.renewDate && new Date(interpreter.dbs.renewDate) < new Date() ? 'text-red-600' : 'text-slate-900'}`}>
                  {interpreter.dbs?.level || 'N/A'} • {interpreter.dbs?.renewDate ? new Date(interpreter.dbs.renewDate).toLocaleDateString() : 'No date'}
                  {interpreter.dbs?.renewDate && new Date(interpreter.dbs.renewDate) < new Date() && ' (EXPIRED)'}
                </p>
              </div>
              <div className="pt-2 border-t border-orange-100 flex justify-between items-center text-[10px] text-orange-700 font-bold">
                <span>Cert: {interpreter.dbs?.number || 'Pending'}</span>
                <button className="text-blue-600 hover:underline">View Docs</button>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex border-b border-slate-200 bg-slate-50/50">
              <button
                onClick={() => setActiveTab('JOBS')}
                className={`px-8 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'JOBS' ? 'border-b-4 border-blue-600 text-blue-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Jobs ({jobs.length})
              </button>
              <button
                onClick={() => setActiveTab('COMPLIANCE')}
                className={`px-8 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'COMPLIANCE' ? 'border-b-4 border-blue-600 text-blue-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Compliance
              </button>
              <button
                onClick={() => setActiveTab('RATES')}
                className={`px-8 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'RATES' ? 'border-b-4 border-blue-600 text-blue-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Rates
              </button>
            </div>

            <div className="p-0">
              {activeTab === 'JOBS' && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Client</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="px-6 py-4 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {jobs.length === 0 ? (
                        <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-medium">No assigned jobs.</td></tr>
                      ) : (
                        jobs.map(job => (
                          <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="text-sm font-black text-slate-900">{new Date(job.date).toLocaleDateString()}</div>
                              <div className="text-[10px] text-slate-500 font-bold uppercase">{job.startTime}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm font-bold text-slate-700">{job.clientName}</div>
                              <div className="text-[10px] text-blue-600 font-black uppercase tracking-tighter">{job.languageTo}</div>
                            </td>
                            <td className="px-6 py-4">
                              <StatusBadge status={job.status} />
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button onClick={() => navigate(`/admin/bookings/${job.id}`)} className="p-2 text-slate-400 hover:text-blue-600 transition-all"><ArrowUpRight size={18} /></button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'COMPLIANCE' && (
                <div className="p-8 space-y-8 animate-in fade-in duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Identification & Badge */}
                    <div className="space-y-6">
                      <div className="section">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <UserCircle2 size={14} /> Identification & Badge
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="text-xs font-bold text-slate-600">Badge Status</span>
                            <span className="text-xs font-black text-slate-900 uppercase">{interpreter.badge?.idStatus || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="text-xs font-bold text-slate-600">ID Issued</span>
                            <span className="text-xs font-black text-slate-900">{interpreter.badge?.issuedDate || 'Pending'}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="text-xs font-bold text-slate-600">Registration Date</span>
                            <span className="text-xs font-black text-slate-900">{interpreter.registrationDate || 'N/A'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="section">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <ShieldCheck size={14} /> DBS Details
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="text-xs font-bold text-slate-600">DBS Level</span>
                            <span className="text-xs font-black text-slate-900">{interpreter.dbs?.level || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="text-xs font-bold text-slate-600">DBS Number</span>
                            <span className="text-xs font-black text-slate-900 tracking-wider">{interpreter.dbs?.number || 'Pending'}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="text-xs font-bold text-slate-600">Auto-Renew</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${interpreter.dbs?.autoRenew ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                              {interpreter.dbs?.autoRenew ? 'Enrolled' : 'Manual'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Vetting Checklists */}
                    <div className="space-y-6">
                      <div className="section">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Check size={14} /> Work Vetting
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {['CV', 'Interviewed', 'Passport checked', 'Reference 1', 'Reference 2', 'Right to work UK'].map(check => {
                            const done = interpreter.workChecksCompleted?.includes(check);
                            return (
                              <div key={check} className={`flex items-center gap-2 p-2 rounded-lg border text-[10px] font-bold ${done ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                {done ? <Check size={12} strokeWidth={4} /> : <div className="w-3 h-3 rounded-full border border-slate-200" />}
                                {check}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="section">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Zap size={14} /> Inductions & Training
                        </h4>
                         <div className="grid grid-cols-1 gap-2">
                          {['MS Teams', 'Skype', 'Other Staff Training'].map(check => {
                            const done = interpreter.inductionsCompleted?.includes(check);
                            return (
                              <div key={check} className={`flex items-center justify-between p-3 rounded-xl border text-[11px] font-bold ${done ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                <span>{check}</span>
                                {done ? <Check size={14} strokeWidth={4} /> : <span className="text-[9px] font-black opacity-50">SHEDUALED?</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

              {/* Onboarding Documents Review Section */}
              {interpreter.onboarding && (
                <div className="mt-8 pt-8 border-t border-slate-200">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Onboarding Document Verification</h4>
                          <p className="text-xs text-slate-500 font-medium">Verify documents uploaded by the interpreter during onboarding.</p>
                        </div>
                        <Badge variant={interpreter.onboarding.overallStatus === 'COMPLETED' ? 'success' : 'warning'}>
                          {interpreter.onboarding.overallStatus.replace(/_/g, ' ')}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { key: 'dbs', title: 'DBS Certificate', doc: interpreter.onboarding.dbs },
                          { key: 'idCheck', title: 'Identity Proof', doc: interpreter.onboarding.idCheck },
                          { key: 'certifications', title: 'Qualifications', doc: interpreter.onboarding.certifications },
                          { key: 'rightToWork', title: 'Right to Work UK', doc: interpreter.onboarding.rightToWork }
                        ].map(({ key, title, doc }) => (
                          <div key={key} className={`p-4 rounded-2xl border-2 transition-all ${doc.status === 'IN_REVIEW' ? 'border-blue-100 bg-blue-50/20' : 'border-slate-100'}`}>
                            <div className="flex justify-between items-start mb-3">
                              <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-wider">{title}</h5>
                              <StatusBadge status={doc.status} size="sm" />
                            </div>
                            
                            {doc.status === 'MISSING' ? (
                              <p className="text-[10px] text-slate-400 font-medium italic py-4 text-center">Not uploaded yet</p>
                            ) : (
                              <div className="space-y-3">
                                {key === 'rightToWork' && (doc as any).type === 'SHARE_CODE' ? (
                                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                                    <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1 leading-none">Share Code</div>
                                    <div className="text-sm font-black text-slate-900 tracking-[0.2em]">{(doc as any).shareCode}</div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100 mb-2">
                                    <FileText size={14} className="text-slate-400" />
                                    <span className="text-[10px] font-bold text-slate-700 truncate flex-1">
                                      {key === 'certifications' ? `${(doc as any).urls?.length || 0} files` : 
                                       (key === 'rightToWork' ? 'BRP Document' : 'Document Uploaded')}
                                    </span>
                                    <a 
                                      href={key === 'certifications' ? (doc as any).urls?.[0] : (doc as any).url} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                    >
                                      <ExternalLink size={14} />
                                    </a>
                                  </div>
                                )}

                                {doc.notes && doc.status === 'REJECTED' && (
                                  <div className="p-2 bg-red-50 rounded-lg text-[10px] text-red-700 font-medium border border-red-100">
                                    Reason: {doc.notes}
                                  </div>
                                )}

                                {doc.status === 'IN_REVIEW' && (
                                  <div className="flex gap-2">
                                    <button 
                                      type="button"
                                      onClick={() => handleApproveDoc(key)}
                                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black py-2 rounded-lg transition-all uppercase tracking-widest"
                                    >
                                      Approve
                                    </button>
                                    <button 
                                      type="button"
                                      onClick={() => handleRejectDoc(key)}
                                      className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10px] font-black py-2 rounded-lg transition-all uppercase tracking-widest"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'RATES' && (
                <div className="p-8 animate-in fade-in duration-300">
                   <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm border border-slate-100">
                        <Banknote size={24} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Active Rate Configuration</h4>
                        <p className="text-xs text-slate-500 font-medium">Pricing Model: <span className="text-blue-600 font-bold">{interpreter.rates?.ratesType || 'Standard'}</span></p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Last Updated</p>
                      <p className="text-xs font-bold text-slate-700">22 Mar 2024</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Core Service Rates (ph)</h5>
                      <div className="space-y-2">
                        {[
                          { label: 'Standard F2F', value: interpreter.rates?.stF2F },
                          { label: 'Standard Video', value: interpreter.rates?.stVideo },
                          { label: 'Standard Phone', value: interpreter.rates?.stPhone },
                          { label: 'OOH F2F', value: interpreter.rates?.oohF2F },
                          { label: 'OOH Video', value: interpreter.rates?.oohVideo },
                          { label: 'OOH Phone', value: interpreter.rates?.oohPhone },
                        ].map(r => (
                          <div key={r.label} className="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                            <span className="text-xs font-bold text-slate-600">{r.label}</span>
                            <span className="text-sm font-black text-slate-900 italic">£{Number(r.value || 0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Travel & Expenses</h5>
                      <div className="space-y-2">
                         {[
                          { label: 'Travel Time (ph)', value: interpreter.rates?.travelTimeST },
                          { label: 'Mileage (p/m)', value: interpreter.rates?.mileageST },
                          { label: 'Special Rates Int.', value: interpreter.rates?.spRatesInt },
                        ].map(r => (
                          <div key={r.label} className="flex justify-between items-center p-4 bg-blue-50/30 rounded-xl border border-blue-100 shadow-sm">
                            <span className="text-xs font-bold text-slate-700">{r.label}</span>
                            <span className="text-sm font-black text-blue-600 italic">£{Number(r.value || 0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      
                      <div className="mt-8 p-6 bg-slate-900 rounded-3xl text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Info size={48} /></div>
                        <h6 className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">Admin Notes</h6>
                        <p className="text-xs font-medium leading-relaxed opacity-90">{interpreter.notes || 'No specific financial notes for this interpreter.'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'FINANCE' && (
                <div className="p-8 animate-in fade-in duration-300">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm border border-slate-100">
                        <Banknote size={24} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Bank Details (UK BACS)</h4>
                        {interpreter.bankDetails ? (
                           <p className="text-xs text-slate-500 font-medium tracking-widest uppercase">
                             {interpreter.bankDetails.sortCode} • <span className="font-bold text-slate-800 tracking-[0.2em]">{interpreter.bankDetails.accountNumber}</span>
                           </p>
                        ) : (
                           <p className="text-xs text-red-500 font-bold uppercase tracking-widest">Bank Details Missing</p>
                        )}
                      </div>
                    </div>
                    {interpreter.bankDetails && (
                      <div className="text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Account Name</p>
                        <p className="text-xs font-bold text-slate-700">{interpreter.bankDetails.accountName}</p>
                      </div>
                    )}
                  </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Ref</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="px-6 py-4 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoices.length === 0 ? (
                        <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-medium">No financial history.</td></tr>
                      ) : (
                        invoices.map(inv => (
                          <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="text-sm font-black text-slate-900 flex items-center">
                                <FileText size={14} className="mr-2 text-slate-300" />
                                {inv.externalInvoiceReference || inv.id.substring(0, 8)}
                              </div>
                              <div className="text-[10px] text-slate-500 font-bold uppercase">{new Date(inv.issueDate).toLocaleDateString()}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-slate-900">£{inv.totalAmount.toFixed(2)}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <InvoiceStatusBadge status={inv.status} />
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button onClick={() => navigate(`/admin/billing/interpreter-invoices/${inv.id}`)} className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-800">Manage</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* ─────────────────────────── EDIT MODAL ─────────────────────────── */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Interpreter Profile" maxWidth="4xl">
        <form onSubmit={handleSave}>
          {/* Avatar + Name header strip */}
          <div className="flex items-center gap-4 px-1 mt-1 mb-4 pb-4 border-b border-slate-100">
            <UserAvatar src={formData.photoUrl} name={formData.name || ''} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{formData.name || 'Loading…'}</p>
              <p className="text-xs text-slate-400 font-medium">{formData.email || ''}</p>
            </div>
            <span className={`shrink-0 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wide ${getStatusBadgeClass(formData.status || '')}`}>{formData.status}</span>
          </div>

          <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
            {(['PERSONAL', 'FINANCE', 'COMPLIANCE', 'QUALIFICATIONS', 'LANGUAGES', 'RATES', 'NOTES'] as EditModalTab[]).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setEditModalTab(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all ${editModalTab === tab ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
              >
                {tab === 'QUALIFICATIONS' ? 'Qualifications' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {/* ── Tab: PERSONAL ── */}
          {editModalTab === 'PERSONAL' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Basic Info Group */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                  <User2 size={14} className="text-blue-500" /> Identity & Contact
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-2 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Full Name</label>
                        <input type="text" required
                          className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all shadow-sm"
                          value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Short Name</label>
                        <input type="text"
                          className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all shadow-sm"
                          placeholder="Display name for emails"
                          value={formData.shortName || ''} onChange={e => setFormData({ ...formData, shortName: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Email Address</label>
                        <input type="email" required
                          className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all shadow-sm"
                          value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Gender</label>
                        <select
                          className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all shadow-sm appearance-none"
                          value={formData.gender || 'M'} onChange={e => setFormData({ ...formData, gender: e.target.value as any })}>
                          <option value="M">Male</option>
                          <option value="F">Female</option>
                          <option value="O">Other</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Mobile Phone</label>
                      <input type="tel"
                        className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all shadow-sm"
                        value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Home Phone</label>
                      <input type="tel"
                        className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all shadow-sm"
                        value={formData.homePhone || ''} onChange={e => setFormData({ ...formData, homePhone: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Address Group */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                    <Home size={14} className="text-blue-500" /> Residential Address
                  </p>
                  <div className="space-y-3">
                    <input type="text" placeholder="Street Address"
                      className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
                      value={formData.address?.street || ''}
                      onChange={e => setFormData({ ...formData, address: { ...formData.address!, street: e.target.value } })} />
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" placeholder="Town"
                        className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
                        value={formData.address?.town || ''}
                        onChange={e => setFormData({ ...formData, address: { ...formData.address!, town: e.target.value } })} />
                      <input type="text" placeholder="County"
                        className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
                        value={formData.address?.county || ''}
                        onChange={e => setFormData({ ...formData, address: { ...formData.address!, county: e.target.value } })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" placeholder="Postcode"
                        className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm uppercase tracking-wider"
                        value={formData.address?.postcode || ''}
                        onChange={e => setFormData({ ...formData, address: { ...formData.address!, postcode: e.target.value } })} />
                      <input type="text" placeholder="Country"
                        className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
                        value={formData.address?.country || 'United Kingdom'}
                        onChange={e => setFormData({ ...formData, address: { ...formData.address!, country: e.target.value } })} />
                    </div>
                  </div>
                </div>

                {/* Configuration Group */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                    <Settings size={14} className="text-blue-500" /> Status & Controls
                  </p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Operational Status</label>
                        <select
                          className="w-full px-4 py-2.5 text-sm font-black text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
                          value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as any })}>
                          <option value="ACTIVE">Active</option>
                          <option value="INACTIVE">Inactive</option>
                          <option value="ONBOARDING">Onboarding</option>
                          <option value="APPLICANT">Applicant</option>
                          <option value="ON_LEAVE">On Leave</option>
                          <option value="UNRELIABLE">Unreliable</option>
                          <option value="ONLY_TRANSL">Only Translation</option>
                          <option value="SUSPENDED">Suspended</option>
                          <option value="BLOCKED">Blocked</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Registration Date</label>
                        <input type="date"
                          className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
                          value={formData.registrationDate || ''} onChange={e => setFormData({ ...formData, registrationDate: e.target.value })} />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">NHS Level</label>
                        <select
                          className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
                          value={formData.nhsLevel || ''} onChange={e => setFormData({ ...formData, nhsLevel: e.target.value as any })}>
                          <option value="">None</option>
                          <option value="Level 1">Level 1</option>
                          <option value="Level 2">Level 2</option>
                          <option value="Level 3">Level 3</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Badge Status</label>
                        <select
                          className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
                          value={formData.badge?.idStatus || 'Not made yet'}
                          onChange={e => setFormData({ ...formData, badge: { ...formData.badge!, idStatus: e.target.value as any } })}>
                          <option value="In use">In Use</option>
                          <option value="Being made">Being Made</option>
                          <option value="Not made yet">Not Made Yet</option>
                          <option value="Not needed/Other">Not Needed / Other</option>
                          <option value="collected/returned">Collected / Returned</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-1">
                      <label className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 transition-all shadow-sm">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${formData.hasCar ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>
                          {formData.hasCar && <Check size={10} className="text-white" strokeWidth={4} />}
                        </div>
                        <input type="checkbox" className="hidden" checked={!!formData.hasCar} onChange={e => setFormData({ ...formData, hasCar: e.target.checked })} />
                        <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider">Owns a Car</span>
                      </label>
                      <label className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 transition-all shadow-sm">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${formData.keyInterpreter ? 'bg-amber-500 border-amber-500' : 'bg-white border-slate-300'}`}>
                          {formData.keyInterpreter && <Check size={10} className="text-white" strokeWidth={4} />}
                        </div>
                        <input type="checkbox" className="hidden" checked={!!formData.keyInterpreter} onChange={e => setFormData({ ...formData, keyInterpreter: e.target.checked })} />
                        <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider">Key Interpreter</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: FINANCE ── */}
          {editModalTab === 'FINANCE' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-50">
                    <Banknote size={24} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">UK BACS Payment Details</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Automated Self-Billing Settlement</p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Account Holder Name</label>
                    <input type="text"
                      className="w-full px-4 py-3 text-sm font-black text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm transition-all"
                      placeholder="e.g. MR JOHN DOE"
                      value={formData.bankDetails?.accountName || ''}
                      onChange={e => setFormData({ ...formData, bankDetails: { ...formData.bankDetails!, accountName: e.target.value.toUpperCase() } })} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Account Number (8 Digits)</label>
                      <input type="text" maxLength={8}
                        className="w-full px-4 py-3 text-sm font-black text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm transition-all tracking-[0.2em]"
                        placeholder="00000000"
                        value={formData.bankDetails?.accountNumber || ''}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '').substring(0, 8);
                          setFormData({ ...formData, bankDetails: { ...formData.bankDetails!, accountNumber: val } });
                        }} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Sort Code (HH-HH-HH)</label>
                      <input type="text" maxLength={8}
                        className="w-full px-4 py-3 text-sm font-black text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm transition-all tracking-[0.2em]"
                        placeholder="00-00-00"
                        value={formData.bankDetails?.sortCode || ''}
                        onChange={e => {
                          let val = e.target.value.replace(/\D/g, '');
                          if (val.length > 2) val = val.substring(0, 2) + '-' + val.substring(2);
                          if (val.length > 5) val = val.substring(0, 5) + '-' + val.substring(5, 7);
                          setFormData({ ...formData, bankDetails: { ...formData.bankDetails!, sortCode: val.substring(0, 8) } });
                        }} />
                    </div>
                  </div>
                </div>

                <div className="mt-8 p-4 bg-white/60 border border-blue-50 rounded-2xl flex gap-3 items-start">
                  <Info size={16} className="text-blue-500 mt-0.5" />
                  <p className="text-[10px] font-bold text-slate-500 leading-relaxed uppercase tracking-tight">
                    Ensuring BACS data accuracy is critical. These details are used to generate self-billing invoices and process payouts every 15 days.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: COMPLIANCE ── */}
          {editModalTab === 'COMPLIANCE' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Security Clearance Group */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                    <ShieldCheck size={14} className="text-emerald-500" /> DBS / Security Clearance
                  </p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">DBS Level</label>
                        <select
                          className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
                          value={formData.dbs?.level || 'N/A'}
                          onChange={e => setFormData({ ...formData, dbs: { ...formData.dbs!, level: e.target.value as any } })}>
                          <option value="N/A">N/A</option>
                          <option value="DBS">DBS</option>
                          <option value="S-DBS">S-DBS (Enhanced)</option>
                          <option value="CRB">CRB</option>
                          <option value="FAILED">FAILED</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Certificate Number</label>
                        <input type="text"
                          className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
                          value={formData.dbs?.number || ''}
                          onChange={e => setFormData({ ...formData, dbs: { ...formData.dbs!, number: e.target.value } })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Issued Date</label>
                        <input type="date"
                          className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
                          value={formData.dbs?.issuedDate || ''}
                          onChange={e => setFormData({ ...formData, dbs: { ...formData.dbs!, issuedDate: e.target.value } })} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Renew Date</label>
                        <input type="date"
                          className="w-full px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
                          value={formData.dbs?.renewDate || ''}
                          onChange={e => setFormData({ ...formData, dbs: { ...formData.dbs!, renewDate: e.target.value } })} />
                      </div>
                    </div>
                    <label className="flex items-center gap-3 p-3.5 bg-white border border-slate-100 rounded-xl cursor-pointer hover:bg-emerald-50/50 transition-all shadow-sm">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${formData.dbs?.autoRenew ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'}`}>
                        {formData.dbs?.autoRenew && <Check size={10} className="text-white" strokeWidth={4} />}
                      </div>
                      <input type="checkbox" className="hidden" checked={!!formData.dbs?.autoRenew} onChange={e => setFormData({ ...formData, dbs: { ...formData.dbs!, autoRenew: e.target.checked } })} />
                      <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider">Auto-Renew DBS Subscription</span>
                    </label>
                  </div>
                </div>

                {/* Vetting Group */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                    <Award size={14} className="text-emerald-500" /> Work Vetting Checks
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {['CV', 'Interviewed', 'Passport checked', 'Reference 1', 'Reference 2', 'Right to work UK'].map(check => {
                      const done = (formData.workChecksCompleted || []).includes(check);
                      return (
                        <button
                          key={check}
                          type="button"
                          onClick={() => toggleChecklist('workChecksCompleted', check)}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-[11px] font-black uppercase tracking-tight transition-all cursor-pointer ${
                            done ? 'bg-white border-emerald-200 text-emerald-800 shadow-sm border-l-4 border-l-emerald-500' : 'bg-white/50 border-slate-100 text-slate-400 hover:border-slate-300'
                          }`}>
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${done ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-200'}`}>
                            {done && <Check size={8} className="text-white" strokeWidth={4} />}
                          </div>
                          {check}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Training & Paperwork Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                    <Zap size={14} className="text-blue-500" /> Inductions & Training
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {['MS Teams', 'Skype', 'Other Staff Training'].map(check => {
                      const done = (formData.inductionsCompleted || []).includes(check);
                      return (
                        <button
                          key={check}
                          type="button"
                          onClick={() => toggleChecklist('inductionsCompleted', check)}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all ${
                            done ? 'bg-white border-blue-200 text-blue-800 shadow-sm border-l-4 border-l-blue-500' : 'bg-white/50 border-slate-100 text-slate-400 hover:border-slate-300'
                          }`}>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${done ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-200'}`}>
                            {done && <Check size={8} className="text-white" strokeWidth={4} />}
                          </div>
                          {check}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                    <FileText size={14} className="text-indigo-500" /> Signed Paperwork
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {['Code of Conduct', 'IR Disclaimer', 'Added mobile to office', 'Sent welcome letter'].map(item => {
                      const field = ['Code of Conduct', 'IR Disclaimer'].includes(item) ? 'workFormsSigned' : 'otherPaperwork';
                      const done = ((formData as any)[field] || []).includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => toggleChecklist(field as any, item)}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all ${
                            done ? 'bg-white border-indigo-200 text-indigo-800 shadow-sm border-l-4 border-l-indigo-500' : 'bg-white/50 border-slate-100 text-slate-400 hover:border-slate-300'
                          }`}>
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${done ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-slate-200'}`}>
                            {done && <Check size={8} className="text-white" strokeWidth={4} />}
                          </div>
                          {item}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: QUALIFICATIONS ── */}
          {editModalTab === 'QUALIFICATIONS' && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* NRPSI */}
                <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">NRPSI Registration</p>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${formData.nrpsi?.registered ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>
                      {formData.nrpsi?.registered && <Check size={10} className="text-white" strokeWidth={4} />}
                    </div>
                    <input type="checkbox" className="hidden" checked={!!formData.nrpsi?.registered}
                      onChange={e => setFormData({ ...formData, nrpsi: { ...formData.nrpsi!, registered: e.target.checked } })} />
                    <span className="text-sm font-bold text-slate-700">Registered with NRPSI</span>
                  </label>
                  {formData.nrpsi?.registered && (
                    <input type="text" placeholder="NRPSI Number"
                      className="w-full px-3 py-2 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      value={formData.nrpsi?.number || ''}
                      onChange={e => setFormData({ ...formData, nrpsi: { ...formData.nrpsi!, number: e.target.value } })} />
                  )}
                </div>

                {/* DPSI */}
                <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">DPSI Qualification</p>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${formData.dpsi ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>
                      {formData.dpsi && <Check size={10} className="text-white" strokeWidth={4} />}
                    </div>
                    <input type="checkbox" className="hidden" checked={!!formData.dpsi}
                      onChange={e => setFormData({ ...formData, dpsi: e.target.checked })} />
                    <span className="text-sm font-bold text-slate-700">Holds DPSI Certificate</span>
                  </label>
                  <p className="text-xs text-slate-400 font-medium">Diploma in Public Service Interpreting</p>
                </div>
              </div>

              {/* Qualifications Multi-select */}
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Other Certifications & Qualifications</p>
                <div className="flex flex-wrap gap-2">
                  {['Met Police Test', 'Community Interpreting L3', 'BSL Level 6', 'Health & Safety', 'Legal Expertise', 'MITI Member', 'ITI Member', 'CIoL Member', 'Healthcare Interpreting L3', 'Legal Interpreting L3'].map(qual => {
                    const selected = (formData.qualifications || []).includes(qual);
                    return (
                      <button key={qual} type="button" onClick={() => toggleQualification(qual)}
                        className={`px-4 py-2 rounded-full text-sm font-bold transition-all border ${
                          selected ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-400'
                        }`}>
                        {selected && <span className="mr-1.5">✓</span>}{qual}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Experience */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Professional Experience Summary</label>
                <textarea
                  className="w-full px-3 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none min-h-[100px]"
                  placeholder="Years of experience, specialisations, sectors..."
                  value={formData.experience || ''}
                  onChange={e => setFormData({ ...formData, experience: e.target.value })} />
              </div>
            </div>
          )}

          {/* ── Tab: RATES ── */}
          {editModalTab === 'RATES' && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Rate Type</label>
                <select
                  className="w-full px-3 py-2 text-sm font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  value={formData.rates?.ratesType || 'Lingland Rates'}
                  onChange={e => setFormData({ ...formData, rates: { ...formData.rates!, ratesType: e.target.value as any } })}>
                  <option value="Lingland Rates">Lingland Rates (Standard)</option>
                  <option value="Special Rates">Special Rates (Override)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-3">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Core Service Rates (£/hr)</p>
                  {([
                    { label: 'Standard F2F', key: 'stF2F' },
                    { label: 'Standard Video', key: 'stVideo' },
                    { label: 'Standard Phone', key: 'stPhone' },
                    { label: 'Out-of-Hours F2F', key: 'oohF2F' },
                    { label: 'Out-of-Hours Video', key: 'oohVideo' },
                    { label: 'Out-of-Hours Phone', key: 'oohPhone' },
                  ] as { label: string; key: keyof typeof formData.rates }[]).map(r => (
                    <div key={r.key} className="flex items-center gap-3">
                      <label className="text-sm font-semibold text-slate-600 w-40 shrink-0">{r.label}</label>
                      <div className="flex items-center gap-1 flex-1">
                        <span className="text-sm text-slate-400 font-bold">£</span>
                        <input type="number" step="0.01" min="0"
                          className="flex-1 px-3 py-2 text-sm font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                          value={(formData.rates as any)?.[r.key] ?? ''}
                          onChange={e => setFormData({ ...formData, rates: { ...formData.rates!, [r.key]: parseFloat(e.target.value) || 0 } })} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Travel & Expenses</p>
                  {([
                    { label: 'Travel Time (£/hr)', key: 'travelTimeST' },
                    { label: 'Mileage (p/mile)', key: 'mileageST' },
                    { label: 'Special Rates Int.', key: 'spRatesInt' },
                    { label: 'F2F Minimum', key: 'f2fRate' },
                  ] as { label: string; key: keyof typeof formData.rates }[]).map(r => (
                    <div key={r.key} className="flex items-center gap-3">
                      <label className="text-sm font-semibold text-slate-600 w-40 shrink-0">{r.label}</label>
                      <div className="flex items-center gap-1 flex-1">
                        <span className="text-sm text-slate-400 font-bold">£</span>
                        <input type="number" step="0.01" min="0"
                          className="flex-1 px-3 py-2 text-sm font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                          value={(formData.rates as any)?.[r.key] ?? ''}
                          onChange={e => setFormData({ ...formData, rates: { ...formData.rates!, [r.key]: parseFloat(e.target.value) || 0 } })} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: NOTES ── */}
          {editModalTab === 'NOTES' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Admin Notes</label>
                <textarea
                  className="w-full px-3 py-3 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none min-h-[160px]"
                  placeholder="Internal notes, observations, flags..."
                  value={formData.notes || ''}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">DBS Notes</label>
                <textarea
                  className="w-full px-3 py-3 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none min-h-[100px]"
                  placeholder="DBS-specific log or admin observations..."
                  value={formData.dbs?.notes || ''}
                  onChange={e => setFormData({ ...formData, dbs: { ...formData.dbs!, notes: e.target.value } })} />
              </div>
            </div>
          )}

          {/* ── Tab: LANGUAGES ── */}
          {editModalTab === 'LANGUAGES' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                       <Globe2 size={16} className="text-blue-500" /> Call Priority
                    </h4>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tight">Select languages and configure priority levels (L1) for each.</p>
                  </div>
                  <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">{formData.languageProficiencies?.length || 0} CONFIGURED</span>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Selection List */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Available Languages</p>
                    <div className="flex flex-wrap gap-2 p-4 bg-white border border-slate-100 rounded-xl shadow-inner max-h-[300px] overflow-y-auto">
                      {Array.from(new Set(settings.masterData.priorityLanguages)).map(lang => {
                        const isConfigured = formData.languageProficiencies?.some(p => p.language?.toLowerCase() === lang?.toLowerCase());
                        return (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => {
                              const current = formData.languageProficiencies || [];
                              if (isConfigured) {
                                setFormData({ ...formData, languageProficiencies: current.filter(p => p.language?.toLowerCase() !== lang?.toLowerCase()) });
                              } else {
                                setFormData({ ...formData, languageProficiencies: [...current, { language: lang, l1: 18, translateOrder: 'no' }] });
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${isConfigured
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                              : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600 hover:bg-white'
                              }`}
                          >
                            {isConfigured && <Check size={10} className="inline mr-1" strokeWidth={4} />}{lang}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Configuration Area */}
                  <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Active Proficiencies</p>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                      {formData.languageProficiencies?.length === 0 ? (
                        <div className="p-8 text-center bg-white/50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 font-medium">
                          No languages configured. Select from the left.
                        </div>
                      ) : (
                        formData.languageProficiencies?.map((p, idx) => (
                          <div key={p.language} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm space-y-3 relative group">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5">
                                <Globe2 size={12} className="text-blue-500" /> {p.language}
                              </span>
                              <button 
                                type="button"
                                onClick={() => {
                                  const updated = [...(formData.languageProficiencies || [])];
                                  updated.splice(idx, 1);
                                  setFormData({ ...formData, languageProficiencies: updated });
                                }}
                                className="text-slate-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Priority (L1-18)</label>
                                <select 
                                  className="w-full px-2 py-1.5 text-[10px] font-bold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg focus:outline-none"
                                  value={p.l1}
                                  onChange={e => {
                                    const updated = [...(formData.languageProficiencies || [])];
                                    updated[idx].l1 = parseInt(e.target.value);
                                    setFormData({ ...formData, languageProficiencies: updated });
                                  }}
                                >
                                  {Array.from({ length: 18 }, (_, i) => i + 1).map(l => (
                                    <option key={l} value={l}>P{l} {l === 1 ? '(First Call)' : ''}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">T-Order (T1-7)</label>
                                <select 
                                  className="w-full px-2 py-1.5 text-[10px] font-bold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg focus:outline-none"
                                  value={p.translateOrder}
                                  onChange={e => {
                                    const updated = [...(formData.languageProficiencies || [])];
                                    updated[idx].translateOrder = e.target.value as any;
                                    setFormData({ ...formData, languageProficiencies: updated });
                                  }}
                                >
                                  {['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'no'].map(t => (
                                    <option key={t} value={t}>{t === 'no' ? 'Disabled' : t}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* ── Footer ── */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              type="button"
              className="text-[10px] font-bold text-red-400 hover:text-red-600 uppercase tracking-wider transition-colors px-1 py-1"
              onClick={() => setIsDeleteModalOpen(true)}
            >
              Delete Interpreter
            </button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)} className="text-xs font-semibold text-slate-500">
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={saving}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-md shadow-blue-200 transition-all"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Permanent Deletion"
        maxWidth="md"
      >
        <div className="space-y-6 py-4">
          <div className="bg-red-50 p-6 rounded-lg border border-red-100 flex flex-col items-center text-center gap-4">
            <div className="p-3 bg-white rounded-md text-red-500 shadow-sm border border-red-50"><ShieldCheck size={24} /></div>
            <div>
              <h4 className="font-bold text-red-900 uppercase text-xs tracking-widest mb-2">Critical Action</h4>
              <p className="text-red-700/80 text-xs font-medium leading-relaxed max-w-[280px]">
                Type the security term below to confirm permanent removal.
              </p>
            </div>
          </div>

          <div className="space-y-4 px-2">
            <div className="flex justify-between items-center ml-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type "DELETE" to confirm</p>
            </div>
            <input
              type="text"
              className={`w-full h-10 px-3 bg-slate-50 border rounded focus:outline-none transition-all text-slate-900 font-bold text-sm tracking-wider uppercase ${deleteConfirmText.toUpperCase() === 'DELETE' ? 'border-emerald-500 bg-emerald-50/10' : 'border-slate-200 focus:border-red-500'}`}
              placeholder="Confirmation"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
            />
          </div>

          <div className="flex gap-4">
            <Button variant="ghost" className="flex-1 rounded-2xl font-black uppercase text-[10px] tracking-widest" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
            <Button
              className={`flex-[1.5] rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl transition-all ${deleteConfirmText.toUpperCase() === 'DELETE' ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-slate-100 text-slate-300'}`}
              disabled={deleteConfirmText.toUpperCase() !== 'DELETE' || deleting}
              isLoading={deleting}
              onClick={async () => {
                if (id) {
                  setDeleting(true);
                  try {
                    await InterpreterService.delete(id);
                    showToast('Interpreter deleted successfully', 'success');
                    navigate('/admin/interpreters');
                  } catch (e) { showToast('Deletion failed', 'error'); }
                  finally { setDeleting(false); }
                }
              }}
            >Delete Permanently</Button>
          </div>
        </div>
      </Modal>
    </>
  );
};