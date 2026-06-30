import React, { useEffect, useState } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { ClientService } from '../../../services/clientService';
import { BookingService } from '../../../services/bookingService';
import { BillingService } from '../../../services/billingService';
import { ChatService } from '../../../services/chatService';
import { Client, Booking, BookingStatus, ClientInvoice, InvoiceStatus } from '../../../types';
import { Spinner } from '../../../components/ui/Spinner';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import { InvoiceStatusBadge } from '../../../components/billing/InvoiceStatusBadge';
import { useAuth } from '../../../context/AuthContext';
import { useChat } from '../../../context/ChatContext';
import { useToast } from '../../../context/ToastContext';
import {
    Building2, Mail, Phone,
    Clock, Calendar, MessageSquare,
    ChevronLeft, Edit, Trash2, ShieldCheck,
    BarChart3, ChevronRight, AlertCircle,
    ArrowUpRight, FileText, CheckCircle2
} from 'lucide-react';

type Tab = 'ACTIVITY' | 'FINANCE' | 'ACCOUNT';

export const AdminClientDetails = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { openThread } = useChat();
    const { showToast } = useToast();

    const [client, setClient] = useState<Client | null>(null);
    const [jobs, setJobs] = useState<Booking[]>([]);
    const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('ACTIVITY');

    // Edit State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<Client>>({});
    const [saving, setSaving] = useState(false);

    // Deletion State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);
    const routeState = location.state as { returnTo?: string; returnLabel?: string } | null;
    const profileReturnState = { returnTo: `${location.pathname}${location.search}`, returnLabel: 'Client profile' };

    const goBack = () => {
        if (routeState?.returnTo) {
            navigate(routeState.returnTo);
            return;
        }
        navigate('/admin/clients');
    };

    useEffect(() => {
        if (id) {
            loadData(id);
        }
    }, [id]);

    const loadData = async (clientId: string) => {
        setLoading(true);
        try {
            const [clientData, jobsData, invoiceData] = await Promise.all([
                ClientService.getById(clientId),
                BookingService.getByClientId(clientId),
                BillingService.getClientInvoices(clientId)
            ]);
            setClient(clientData || null);
            setJobs(jobsData);
            setInvoices(invoiceData);
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

    const money = (amount?: number) => `GBP ${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const activeJobs = jobs.filter(j => ['INCOMING', 'NEEDS_ASSIGNMENT', 'ASSIGNMENT_PENDING', 'PENDING_ASSIGNMENT', 'BOOKED'].includes(String(j.status)));
    const billingReadyJobs = jobs.filter(j => j.status === BookingStatus.READY_FOR_INVOICE || j.paymentStatus === 'READY_FOR_INVOICE');
    const uninvoicedCompletedJobs = jobs.filter(j => ['TIMESHEET_SUBMITTED', 'VERIFIED', 'READY_FOR_INVOICE'].includes(String(j.status)) && !j.clientInvoiceId);
    const translationJobs = jobs.filter(j => String(j.serviceCategory || '').toUpperCase() === 'TRANSLATION' || String(j.serviceType || '').toUpperCase().includes('TRANSLATION'));
    const outstandingInvoices = invoices.filter(inv => [InvoiceStatus.DRAFT, InvoiceStatus.SENT].includes(inv.status));
    const outstandingTotal = outstandingInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
    const paidTotal = invoices.filter(inv => inv.status === InvoiceStatus.PAID).reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
    const accountIssues = [
        !client.billingAddress ? 'Billing address missing' : null,
        !client.email ? 'Finance email missing' : null,
        !client.contactPerson ? 'Primary contact missing' : null,
        !client.paymentTermsDays ? 'Payment terms missing' : null,
    ].filter(Boolean) as string[];

    const signals: Array<{ label: string; value: string | number; detail: string; tab: Tab; tone: string }> = [
        { label: 'Jobs', value: jobs.length, detail: `${activeJobs.length} active`, tab: 'ACTIVITY', tone: 'text-blue-700 bg-blue-50 border-blue-100' },
        { label: 'Billing queue', value: billingReadyJobs.length, detail: `${uninvoicedCompletedJobs.length} handoff`, tab: 'FINANCE', tone: 'text-amber-700 bg-amber-50 border-amber-100' },
        { label: 'Outstanding', value: money(outstandingTotal), detail: `${outstandingInvoices.length} open`, tab: 'FINANCE', tone: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
        { label: 'Health', value: accountIssues.length ? `${accountIssues.length} issue${accountIssues.length > 1 ? 's' : ''}` : 'Ready', detail: `${client.paymentTermsDays || 30} day terms`, tab: 'ACCOUNT', tone: accountIssues.length ? 'text-red-700 bg-red-50 border-red-100' : 'text-slate-700 bg-slate-50 border-slate-100' },
    ];

    const formatJobDate = (job: Booking) => {
        const raw = [job.date, job.startTime].filter(Boolean).join(' ');
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return { day: job.date || 'TBD', time: job.startTime || '' };
        return {
            day: parsed.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }),
            time: parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        };
    };

    const openJobDetails = (job: Booking) => {
        navigate(`/admin/bookings/${job.id}`, {
            state: profileReturnState,
        });
    };

    const openInvoiceDetails = (invoice: ClientInvoice) => {
        navigate(`/admin/billing/client-invoices/${invoice.id}`, {
            state: profileReturnState,
        });
    };

    return (
        <div className="space-y-4 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                    <button
                        onClick={goBack}
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

            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {signals.map((signal) => (
                    <button
                            key={signal.label}
                            type="button"
                            onClick={() => setActiveTab(signal.tab)}
                            className={`flex h-9 items-center gap-2 rounded-md border px-2.5 text-left transition-colors hover:bg-white ${signal.tone}`}
                    >
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{signal.label}</span>
                            <span className="text-sm font-black text-slate-950">{signal.value}</span>
                            <span className="hidden text-[10px] font-bold text-slate-500 sm:inline">{signal.detail}</span>
                    </button>
                ))}
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    {accountIssues.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} /> Ready for bookings and billing</span>
                    ) : (
                        <button type="button" onClick={() => setActiveTab('ACCOUNT')} className="inline-flex items-center gap-1 text-red-700 hover:text-red-800">
                            <AlertCircle size={13} /> Review account setup
                        </button>
                    )}
                </div>
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
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                <BarChart3 size={14} className="text-blue-500" />
                                Service Mix
                            </h3>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-bold text-slate-600">Interpreting</span>
                                <span className="font-black text-slate-900">{Math.max(jobs.length - translationJobs.length, 0)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-bold text-slate-600">Translations</span>
                                <span className="font-black text-slate-900">{translationJobs.length}</span>
                            </div>
                            <Button
                                variant="outline"
                                icon={ArrowUpRight}
                                onClick={() => navigate(`/admin/bookings?clientId=${client.id}`, { state: profileReturnState })}
                                className="w-full mt-2"
                            >
                                Open client jobs
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 space-y-4">
                    <div className="flex gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 w-fit">
                        {(['ACTIVITY', 'FINANCE', 'ACCOUNT'] as Tab[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all ${activeTab === tab
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {tab === 'ACTIVITY' ? 'Recent activity' : tab === 'FINANCE' ? 'Billing handoff' : 'Account data'}
                            </button>
                        ))}
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-1">
                        {activeTab === 'ACTIVITY' && (
                            <div className="p-3 space-y-2">
                                {jobs.length === 0 ? (
                                    <EmptyState
                                        title="Clean Slate"
                                        description="This account has no historical service orders associated yet."
                                        icon={Calendar}
                                    />
                                ) : (
                                    <div className="space-y-2">
                                        {jobs.slice(0, 10).map(job => {
                                            const schedule = formatJobDate(job);
                                            return (
                                            <div
                                                key={job.id}
                                                onClick={() => openJobDetails(job)}
                                                className="group flex flex-col md:flex-row md:items-center justify-between p-4 bg-slate-50 hover:bg-white rounded-xl border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-white rounded-lg border border-slate-200 flex flex-col items-center justify-center group-hover:bg-blue-600 group-hover:border-blue-600 group-hover:text-white transition-all">
                                                        <span className="text-[8px] font-bold uppercase tracking-widest opacity-60">{schedule.day}</span>
                                                        <span className="text-[10px] font-bold leading-none">{schedule.time}</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-900 uppercase tracking-tight group-hover:text-blue-600 transition-colors">
                                                            {job.displayRef || job.jobNumber || job.bookingRef || `#${job.id.slice(-6)}`}
                                                        </p>
                                                        <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5 flex items-center gap-1.5">
                                                            {job.serviceCategory || job.serviceType} <span className="w-1 h-1 bg-slate-300 rounded-full" /> {job.languageFrom} to {job.languageTo}
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
                                        )})}
                                        {jobs.length > 10 && (
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/admin/bookings?clientId=${client.id}`, { state: profileReturnState })}
                                                className="w-full rounded-xl border border-dashed border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500 hover:border-blue-200 hover:text-blue-600"
                                            >
                                                View all {jobs.length} jobs in Jobs Board
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'FINANCE' && (
                            <div className="p-5 space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ready to invoice</p>
                                        <p className="mt-2 text-2xl font-black text-slate-900">{billingReadyJobs.length}</p>
                                        <p className="text-xs font-semibold text-slate-500">Jobs waiting finance</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Outstanding</p>
                                        <p className="mt-2 text-2xl font-black text-slate-900">{money(outstandingTotal)}</p>
                                        <p className="text-xs font-semibold text-slate-500">{outstandingInvoices.length} draft/sent invoices</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Paid history</p>
                                        <p className="mt-2 text-2xl font-black text-slate-900">{money(paidTotal)}</p>
                                        <p className="text-xs font-semibold text-slate-500">{invoices.filter(inv => inv.status === InvoiceStatus.PAID).length} paid invoices</p>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-200 overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                                        <div>
                                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Recent client invoices</h4>
                                            <p className="text-xs font-semibold text-slate-500">Open invoice details for the complete ledger.</p>
                                        </div>
                                        <Button size="sm" variant="secondary" icon={ArrowUpRight} onClick={() => navigate(`/admin/billing/client-invoices?clientId=${encodeURIComponent(client.id)}`, { state: profileReturnState })}>
                                            Finance
                                        </Button>
                                    </div>
                                    {invoices.length === 0 ? (
                                        <div className="p-8 text-center">
                                            <FileText className="mx-auto text-slate-200 mb-3" size={42} />
                                            <p className="text-sm font-bold text-slate-500">No client invoices yet.</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-slate-100">
                                            {invoices.slice(0, 6).map(invoice => (
                                                <button
                                                    key={invoice.id}
                                                    onClick={() => openInvoiceDetails(invoice)}
                                                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-black text-slate-900">{invoice.invoiceNumber || invoice.reference || invoice.id.substring(0, 8)}</p>
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                            Due {new Date(invoice.dueDate).toLocaleDateString('en-GB')}
                                                        </p>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-3">
                                                        <span className="text-sm font-black text-slate-900">{money(invoice.totalAmount)}</span>
                                                        <InvoiceStatusBadge status={invoice.status} />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'ACCOUNT' && (
                            <div className="p-5 space-y-4">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-3">Operational readiness</h4>
                                    {accountIssues.length === 0 ? (
                                        <div className="flex items-center gap-3 text-emerald-700">
                                            <CheckCircle2 size={18} />
                                            <span className="text-sm font-black">Client account is ready for booking and billing.</span>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {accountIssues.map(issue => (
                                                <div key={issue} className="flex items-center gap-2 text-sm font-bold text-red-700">
                                                    <AlertCircle size={15} />
                                                    {issue}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-slate-200 p-4">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Primary contact</p>
                                        <p className="mt-2 text-sm font-black text-slate-900">{client.contactPerson || 'Not recorded'}</p>
                                        <p className="text-xs font-semibold text-slate-500">{client.email || 'No email'}</p>
                                        <p className="text-xs font-semibold text-slate-500">{client.phone || 'No phone'}</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 p-4">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Billing setup</p>
                                        <p className="mt-2 text-sm font-black text-slate-900">{client.defaultCostCodeType || 'PO'} required</p>
                                        <p className="text-xs font-semibold text-slate-500">{client.paymentTermsDays || 30} day payment terms</p>
                                    </div>
                                </div>
                                <Button
                                    variant="primary"
                                    icon={Edit}
                                    onClick={() => { setFormData(client); setIsEditModalOpen(true); }}
                                >
                                    Edit account data
                                </Button>
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
                        <Button type="button" variant="ghost" className="text-red-500 hover:bg-red-50 text-[10px] font-bold uppercase tracking-widest" onClick={() => setIsDeleteModalOpen(true)} icon={Trash2}>Delete client</Button>
                        <div className="flex gap-2">
                            <Button type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)}>Abort</Button>
                            <Button type="submit" isLoading={saving} className="px-6 shadow-sm shadow-blue-100">Commit Changes</Button>
                        </div>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm client deletion" maxWidth="md">
                <div className="space-y-6 py-4">
                    <div className="bg-red-50 p-6 rounded-lg border border-red-100 text-center">
                        <div className="w-12 h-12 bg-white rounded-xl text-red-500 shadow-sm mx-auto flex items-center justify-center mb-3 border border-red-50"><AlertCircle size={24} /></div>
                        <h4 className="font-bold text-red-900 uppercase text-xs tracking-widest mb-1.5">Permanent deletion</h4>
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
                        }}>Delete client</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
