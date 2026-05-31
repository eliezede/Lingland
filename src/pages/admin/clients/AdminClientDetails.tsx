import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ClientService } from '../../../services/clientService';
import { BookingService } from '../../../services/bookingService';
import { ChatService } from '../../../services/chatService';
import { Client, Booking, BookingStatus } from '../../../types';
import { Spinner } from '../../../components/ui/Spinner';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import { useAuth } from '../../../context/AuthContext';
import { useChat } from '../../../context/ChatContext';
import { useToast } from '../../../context/ToastContext';
import {
    Building2, Mail, Phone, MapPin,
    Briefcase, Clock, Calendar, MessageSquare,
    ChevronLeft, Edit, Trash2, ShieldCheck,
    ExternalLink, BarChart3, CreditCard, ChevronRight, AlertCircle
} from 'lucide-react';

type Tab = 'JOBS' | 'FINANCE' | 'DOCS';

export const AdminClientDetails = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { openThread } = useChat();
    const { showToast } = useToast();

    const [client, setClient] = useState<Client | null>(null);
    const [jobs, setJobs] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('JOBS');

    // Edit State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<Client>>({});
    const [saving, setSaving] = useState(false);

    // Deletion State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (id) {
            loadData(id);
        }
    }, [id]);

    const loadData = async (clientId: string) => {
        setLoading(true);
        try {
            const [clientData, jobsData] = await Promise.all([
                ClientService.getById(clientId),
                BookingService.getByClientId(clientId)
            ]);
            setClient(clientData || null);
            setJobs(jobsData);
            if (clientData) setFormData(clientData);
        } catch (error) {
            console.error("Failed to load client data", error);
            showToast('Error loading client profile', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleStartChat = async () => {
        if (!user || !client) return;
        try {
            const clientUser = await ChatService.resolveUserByProfileId(client.id) || await ChatService.resolveUserByEmail(client.email);
            if (!clientUser) {
                showToast('No active user account found for this client', 'error');
                return;
            }
            const threadId = await ChatService.getOrCreateDirectThreadWithUser(
                user,
                { ...clientUser, displayName: client.companyName, photoUrl: client.photoUrl || clientUser.photoUrl }
            );
            openThread(threadId);
        } catch (error) {

            showToast('Failed to start chat', 'error');
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !formData) return;
        setSaving(true);
        try {
            await ClientService.update(id, formData);
            await loadData(id);
            setIsEditModalOpen(false);
            showToast('Account updated successfully', 'success');
        } catch (error) {
            showToast('Failed to update account', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="h-screen flex flex-col items-center justify-center gap-4 bg-slate-50/50">
                <Spinner size="lg" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Accessing Secure Records...</p>
            </div>
        );
    }

    if (!client) {
        return (
            <div className="p-8">
                <EmptyState
                    title="Account Not Found"
                    description="The requested client record does not exist or has been decommissioned."
                    actionLabel="Return to Database"
                    onAction={() => navigate('/admin/clients')}
                    icon={Building2}
                />
            </div>
        );
    }

    const stats = [
        { label: 'Total Volume', value: jobs.length, icon: Briefcase, color: 'blue' },
        { label: 'Active Service', value: jobs.filter(j => ['INCOMING', 'NEEDS_ASSIGNMENT', 'ASSIGNMENT_PENDING', 'PENDING_ASSIGNMENT', 'BOOKED'].includes(String(j.status))).length, icon: Clock, color: 'emerald' },
        { label: 'Net Terms', value: `${client.paymentTermsDays || 30} Days`, icon: CreditCard, color: 'indigo' }
    ];

    return (
        <div className="space-y-4 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/admin/clients')}
                        className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all hover:shadow-md"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <h1 className="text-xl font-bold text-slate-900 tracking-tight">{client.companyName}</h1>
                            <Badge variant="info" className="font-bold uppercase tracking-widest text-[9px] px-2">Corporate Account</Badge>
                        </div>
                        <p className="text-slate-500 text-xs font-semibold flex items-center gap-2">
                            <Mail size={12} className="text-blue-500" /> {client.email}
                            <span className="w-1 h-1 bg-slate-200 rounded-full mx-1" />
                            <Phone size={12} className="text-indigo-500" /> {client.contactPerson}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        onClick={handleStartChat}
                        icon={MessageSquare}
                        className="rounded-lg font-bold uppercase text-[10px] tracking-widest h-9 px-4 border-slate-200 hover:bg-slate-50 shadow-sm"
                    >
                        Message
                    </Button>
                    <Button
                        onClick={() => { setFormData(client); setIsEditModalOpen(true); }}
                        icon={Edit}
                        className="bg-slate-900 hover:bg-black text-white h-9 px-6 rounded-lg font-bold uppercase text-[10px] tracking-widest shadow-sm"
                    >
                        Manage Account
                    </Button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {stats.map((stat, i) => (
                    <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group flex items-center gap-4">
                        <div className={`w-12 h-12 bg-${stat.color}-50 text-${stat.color}-600 rounded-xl flex items-center justify-center`}>
                            <stat.icon size={20} />
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{stat.label}</p>
                            <p className="text-xl font-bold text-slate-900">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pb-12">
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                <ShieldCheck size={14} className="text-emerald-500" />
                                Account Parameters
                            </h3>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Billing Structure</label>
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <p className="text-[11px] font-medium text-slate-600 leading-relaxed italic">
                                        {client.billingAddress || 'No primary address recorded. This account is missing critical billing data.'}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                                <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <Clock size={14} className="text-blue-500" />
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Payment Cycle</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-900 uppercase">{client.paymentTermsDays || 30} Days</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <BarChart3 size={14} className="text-indigo-500" />
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Requirement</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-900 uppercase">{client.defaultCostCodeType || 'PO'} Required</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 space-y-4">
                    <div className="flex gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 w-fit">
                        {(['JOBS', 'FINANCE', 'DOCS'] as Tab[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all ${activeTab === tab
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {tab === 'JOBS' ? 'Historical Activity' : tab}
                            </button>
                        ))}
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-1">
                        {activeTab === 'JOBS' && (
                            <div className="p-3 space-y-2">
                                {jobs.length === 0 ? (
                                    <EmptyState
                                        title="Clean Slate"
                                        description="This account has no historical service orders associated yet."
                                        icon={Calendar}
                                    />
                                ) : (
                                    <div className="space-y-2">
                                        {jobs.map(job => (
                                            <div
                                                key={job.id}
                                                onClick={() => navigate(`/admin/bookings/${job.id}`)}
                                                className="group flex flex-col md:flex-row md:items-center justify-between p-4 bg-slate-50 hover:bg-white rounded-xl border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-white rounded-lg border border-slate-200 flex flex-col items-center justify-center group-hover:bg-blue-600 group-hover:border-blue-600 group-hover:text-white transition-all">
                                                        <span className="text-[8px] font-bold uppercase tracking-widest opacity-60">{job.date?.split(',')[0]}</span>
                                                        <span className="text-base font-bold leading-none">{job.date?.split(',')[1]?.trim()?.split(' ')[0]}</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-900 uppercase tracking-tight group-hover:text-blue-600 transition-colors">
                                                            {job.bookingRef || `#${job.id.slice(-6)}`}
                                                        </p>
                                                        <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5 flex items-center gap-1.5">
                                                            {job.serviceType} <span className="w-1 h-1 bg-slate-300 rounded-full" /> {job.languageTo}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="mt-2 md:mt-0 flex items-center gap-2">
                                                    <Badge variant={job.status === BookingStatus.PAID ? 'success' : 'info'} className="h-6 px-2 font-bold uppercase text-[8px] tracking-widest">
                                                        {job.status}
                                                    </Badge>
                                                    <ChevronRight size={16} className="text-slate-400 group-hover:text-blue-500 transition-all group-hover:translate-x-0.5" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'FINANCE' && (
                            <div className="p-8 text-center">
                                <CreditCard className="mx-auto text-slate-200 mb-4" size={48} />
                                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Ledger Integration</h4>
                                <p className="text-slate-500 font-medium max-w-xs mx-auto mt-1 text-xs">Financial invoices and settlement history will be visualized here.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Update Account Profile" maxWidth="lg">
                <form onSubmit={handleSave} className="space-y-6 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Organization Name</label>
                            <input type="text" required className="w-full p-2 text-sm bg-slate-50 border border-slate-200 rounded focus:ring-2 focus:ring-blue-500/20 outline-none font-medium transition-all" value={formData.companyName || ''} onChange={e => setFormData({ ...formData, companyName: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Primary Contact</label>
                            <input type="text" required className="w-full p-2 text-sm bg-slate-50 border border-slate-200 rounded focus:ring-2 focus:ring-blue-500/20 outline-none font-medium transition-all" value={formData.contactPerson || ''} onChange={e => setFormData({ ...formData, contactPerson: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Finance Email</label>
                            <input type="email" required className="w-full p-2 text-sm bg-slate-50 border border-slate-200 rounded focus:ring-2 focus:ring-blue-500/20 outline-none font-medium transition-all" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Billing Address</label>
                        <textarea className="w-full p-2 text-sm bg-slate-50 border border-slate-200 rounded focus:ring-2 focus:ring-blue-500/20 outline-none font-medium h-24 resize-none transition-all" value={formData.billingAddress || ''} onChange={e => setFormData({ ...formData, billingAddress: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50/50 rounded-xl border border-blue-100/50">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Payment Net Terms</label>
                            <select className="w-full p-2 text-sm bg-white border border-slate-200 rounded focus:ring-2 focus:ring-blue-500/20 outline-none font-medium transition-all" value={formData.paymentTermsDays || 30} onChange={e => setFormData({ ...formData, paymentTermsDays: parseInt(e.target.value) })}>
                                <option value={7}>7 Days Net</option>
                                <option value={14}>14 Days Net</option>
                                <option value={30}>30 Days Net</option>
                                <option value={60}>60 Days Net</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Requirement Mode</label>
                            <select className="w-full p-2 text-sm bg-white border border-slate-200 rounded focus:ring-2 focus:ring-blue-500/20 outline-none font-medium transition-all" value={formData.defaultCostCodeType || 'PO'} onChange={e => setFormData({ ...formData, defaultCostCodeType: e.target.value as any })}>
                                <option value="PO">PO Number</option>
                                <option value="Cost Code">Cost Code</option>
                                <option value="Client Name">Client Name</option>
                            </select>
                        </div>
                    </div>
                    <div className="pt-6 border-t flex justify-between items-center">
                        <Button type="button" variant="ghost" className="text-red-500 hover:bg-red-50 text-[10px] font-bold uppercase tracking-widest" onClick={() => setIsDeleteModalOpen(true)}>Decommission Record</Button>
                        <div className="flex gap-2">
                            <Button type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)}>Abort</Button>
                            <Button type="submit" isLoading={saving} className="px-6 shadow-sm shadow-blue-100">Commit Changes</Button>
                        </div>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Record Extermination" maxWidth="md">
                <div className="space-y-6 py-4">
                    <div className="bg-red-50 p-6 rounded-lg border border-red-100 text-center">
                        <div className="w-12 h-12 bg-white rounded-xl text-red-500 shadow-sm mx-auto flex items-center justify-center mb-3 border border-red-50"><AlertCircle size={24} /></div>
                        <h4 className="font-bold text-red-900 uppercase text-xs tracking-widest mb-1.5">Destructive Operation</h4>
                        <p className="text-red-700/80 text-xs font-medium leading-relaxed max-w-[280px] mx-auto">This will permanently remove <span className="text-red-900 font-bold">{client.companyName}</span> and all associated historical parameters.</p>
                    </div>
                    <div className="space-y-4 px-2">
                        <p className="text-[10px] font-bold text-slate-400 text-center uppercase tracking-widest">Type "DELETE" to verify</p>
                        <input type="text" className={`w-full h-10 px-3 bg-slate-50 border rounded focus:outline-none transition-all text-slate-900 font-bold text-sm text-center tracking-wider uppercase ${deleteConfirmText.toUpperCase() === 'DELETE' ? 'border-emerald-500 bg-emerald-50/10' : 'border-slate-200 focus:border-red-500'}`} placeholder="Verification" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} />
                    </div>
                    <div className="flex gap-3 mt-6">
                        <Button variant="ghost" className="flex-1 rounded-md font-bold uppercase text-[10px] tracking-widest" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
                        <Button className={`flex-[1.5] rounded-md font-bold uppercase text-[10px] tracking-widest transition-all ${deleteConfirmText.toUpperCase() === 'DELETE' ? 'bg-red-600 hover:bg-red-700 shadow-sm shadow-red-200' : 'bg-slate-100 text-slate-300'}`} disabled={deleteConfirmText.toUpperCase() !== 'DELETE' || deleting} isLoading={deleting} onClick={async () => {
                            if (id) {
                                setDeleting(true);
                                try {
                                    await ClientService.delete(id);
                                    showToast('Record decommissioned', 'success');
                                    navigate('/admin/clients');
                                } catch (e) { showToast('Operation failed', 'error'); }
                                finally { setDeleting(false); }
                            }
                        }}>Execute Deletion</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
