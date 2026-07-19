import React, { useEffect, useState } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { ClientService } from '../../../services/clientService';
import { BookingService } from '../../../services/bookingService';
import { BillingService } from '../../../services/billingService';
import { ChatService } from '../../../services/chatService';
import { ClientHierarchyService } from '../../../services/clientHierarchyService';
import {
    Client, Booking, BookingStatus, ClientInvoice, InvoiceStatus,
    ClientAgent, ClientDepartment, ClientMembership,
} from '../../../types';
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
    ArrowUpRight, FileText, CheckCircle2, Users, Network, MapPin, Inbox, UserRound, Plus
} from 'lucide-react';
import { formatLanguagePair } from '../../../utils/languageDisplay';

type Tab = 'ACTIVITY' | 'STRUCTURE' | 'FINANCE' | 'ACCOUNT';

type DepartmentForm = {
    id?: string;
    name: string;
    locationName: string;
    billingAddress: string;
    status: ClientDepartment['status'];
};

type AgentForm = {
    id?: string;
    displayName: string;
    email: string;
    agentType: ClientAgent['agentType'];
    accessLevel: ClientMembership['accessLevel'];
    roles: ClientAgent['roles'];
    departmentIds: string[];
};

const emptyDepartmentForm: DepartmentForm = {
    name: '',
    locationName: '',
    billingAddress: '',
    status: 'ACTIVE',
};

const emptyAgentForm: AgentForm = {
    displayName: '',
    email: '',
    agentType: 'PERSON',
    accessLevel: 'AGENT',
    roles: ['REQUESTER'],
    departmentIds: [],
};

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
    const [departments, setDepartments] = useState<ClientDepartment[]>([]);
    const [agents, setAgents] = useState<ClientAgent[]>([]);
    const [memberships, setMemberships] = useState<ClientMembership[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('ACTIVITY');
    const [isDepartmentModalOpen, setIsDepartmentModalOpen] = useState(false);
    const [departmentForm, setDepartmentForm] = useState<DepartmentForm>(emptyDepartmentForm);
    const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
    const [agentForm, setAgentForm] = useState<AgentForm>(emptyAgentForm);
    const [savingHierarchy, setSavingHierarchy] = useState(false);
    const [preparingAccount, setPreparingAccount] = useState(false);

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
            const clientData = await ClientService.getById(clientId);
            if (!clientData) {
                setClient(null);
                return;
            }
            const canonicalClientId = clientData.id;
            const [jobsData, invoiceData, hierarchy] = await Promise.all([
                BookingService.getByClientId(canonicalClientId),
                BillingService.getClientInvoices(canonicalClientId),
                ClientHierarchyService.getForClient(canonicalClientId),
            ]);
            setClient(clientData || null);
            setJobs(jobsData);
            setInvoices(invoiceData);
            setDepartments(hierarchy.departments);
            setAgents(hierarchy.agents);
            setMemberships(hierarchy.memberships);
            if (clientData) setFormData(clientData);
        } catch (error) {
            console.error("Failed to load client data", error);
            showToast('Error loading client profile', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleMessageAgent = async (agent: ClientAgent) => {
        if (!user) return;
        if (agent.portalAccountStatus !== 'ACTIVE') {
            showToast('This portal account is prepared but not active yet.', 'info');
            return;
        }
        try {
            const clientUser = agent.userId
                ? await ChatService.resolveUserById(agent.userId)
                : await ChatService.resolveUserByEmail(agent.email);
            if (!clientUser) {
                showToast('No portal account is linked to this agent', 'error');
                return;
            }
            const threadId = await ChatService.getOrCreateDirectThreadWithUser(
                user,
                { ...clientUser, displayName: agent.displayName, photoUrl: clientUser.photoUrl }
            );
            openThread(threadId);
        } catch (error) {
            showToast('Failed to start chat', 'error');
        }
    };

    const handleStartChat = async () => {
        if (!user || !client) return;
        const linkedAgents = agents.filter(agent => agent.agentType === 'PERSON' && agent.userId && agent.portalAccountStatus === 'ACTIVE');
        if (linkedAgents.length === 1) {
            await handleMessageAgent(linkedAgents[0]);
            return;
        }
        if (linkedAgents.length > 1) {
            setActiveTab('STRUCTURE');
            showToast('Choose the agent you want to message.', 'info');
            return;
        }
        try {
            const legacyUser = await ChatService.resolveUserByProfileId(client.id) || await ChatService.resolveUserByEmail(client.email);
            if (!legacyUser) {
                setActiveTab('STRUCTURE');
                showToast('Prepare an agent portal account before starting a conversation.', 'error');
                return;
            }
            const threadId = await ChatService.getOrCreateDirectThreadWithUser(user, legacyUser);
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
        { label: 'Structure', value: departments.length, detail: `${agents.length} agents`, tab: 'STRUCTURE', tone: 'text-violet-700 bg-violet-50 border-violet-100' },
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

    const refreshHierarchy = async (clientId: string) => {
        const hierarchy = await ClientHierarchyService.getForClient(clientId);
        setDepartments(hierarchy.departments);
        setAgents(hierarchy.agents);
        setMemberships(hierarchy.memberships);
    };

    const openDepartmentEditor = (department?: ClientDepartment) => {
        setDepartmentForm(department ? {
            id: department.id,
            name: department.name,
            locationName: department.locationName || '',
            billingAddress: department.billingAddress || '',
            status: department.status,
        } : emptyDepartmentForm);
        setIsDepartmentModalOpen(true);
    };

    const openAgentEditor = (agent?: ClientAgent) => {
        const membership = agent ? memberships.find(item => item.agentId === agent.id) : undefined;
        setAgentForm(agent ? {
            id: agent.id,
            displayName: agent.displayName,
            email: agent.email,
            agentType: agent.agentType,
            accessLevel: membership?.accessLevel || 'AGENT',
            roles: membership?.roles?.length ? membership.roles : agent.roles,
            departmentIds: membership?.departmentIds || [],
        } : emptyAgentForm);
        setIsAgentModalOpen(true);
    };

    const handleDepartmentSave = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!client) return;
        setSavingHierarchy(true);
        try {
            await ClientHierarchyService.saveDepartment({
                clientId: client.id,
                departmentId: departmentForm.id,
                name: departmentForm.name,
                locationName: departmentForm.locationName,
                billingAddress: departmentForm.billingAddress,
                status: departmentForm.status,
            });
            await refreshHierarchy(client.id);
            setIsDepartmentModalOpen(false);
            showToast(departmentForm.id ? 'Department updated' : 'Department created', 'success');
        } catch (error) {
            console.error(error);
            showToast('Could not save department', 'error');
        } finally {
            setSavingHierarchy(false);
        }
    };

    const handleAgentSave = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!client) return;
        setSavingHierarchy(true);
        try {
            await ClientHierarchyService.saveAgentMembership({
                clientId: client.id,
                agentId: agentForm.id,
                displayName: agentForm.displayName,
                email: agentForm.email,
                agentType: agentForm.agentType,
                accessLevel: agentForm.accessLevel,
                roles: agentForm.roles,
                departmentIds: agentForm.departmentIds,
            });
            await refreshHierarchy(client.id);
            setIsAgentModalOpen(false);
            showToast(agentForm.id ? 'Agent access updated' : 'Agent added to client', 'success');
        } catch (error) {
            console.error(error);
            showToast('Could not save agent access', 'error');
        } finally {
            setSavingHierarchy(false);
        }
    };

    const handlePrepareAgentAccount = async () => {
        if (!client || !agentForm.id) return;
        setPreparingAccount(true);
        try {
            await ClientHierarchyService.prepareAgentAccount(client.id, agentForm.id);
            await refreshHierarchy(client.id);
            showToast('Portal account prepared. No activation email was sent.', 'success');
        } catch (error) {
            console.error(error);
            showToast('Could not prepare this portal account', 'error');
        } finally {
            setPreparingAccount(false);
        }
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

    const departmentById = new Map(departments.map(department => [department.id, department]));
    const membershipByAgentId = new Map(memberships.map(membership => [membership.agentId, membership]));
    const selectedAgent = agentForm.id ? agents.find(agent => agent.id === agentForm.id) : undefined;
    const selectedMembership = agentForm.id ? membershipByAgentId.get(agentForm.id) : undefined;
    const selectedAgentHasAccount = Boolean(selectedAgent?.userId || selectedMembership?.userId);
    const selectedAgentAccountActive = selectedAgent?.portalAccountStatus === 'ACTIVE';
    const unassignedDepartmentJobs = jobs.filter(job => !job.clientDepartmentId).length;
    const unassignedRequesterJobs = jobs.filter(job => !job.requestedByAgentId).length;

    return (
        <div className="space-y-4 pb-20 text-slate-900 dark:text-slate-100">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                    <button
                        onClick={goBack}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-sm transition-all hover:text-slate-900 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:text-white"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{client.companyName}</h1>
                            <Badge variant="info" className="font-bold uppercase tracking-widest text-[9px] px-2">Corporate Account</Badge>
                        </div>
                        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            <Building2 size={12} className="text-blue-500" /> Organisation account
                            <span className="w-1 h-1 bg-slate-200 rounded-full mx-1" />
                            <span>{client.sageAccountRef ? `Sage ${client.sageAccountRef}` : client.airtableClientKey || 'Platform managed'}</span>
                            {client.email && (
                                <>
                                    <span className="w-1 h-1 bg-slate-200 rounded-full mx-1" />
                                    <Mail size={12} className="text-indigo-500" /> {client.email}
                                </>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {(agents.length === 0 || agents.some(agent => agent.agentType === 'PERSON' && agent.userId && agent.portalAccountStatus === 'ACTIVE')) && (
                        <Button
                            variant="ghost"
                            onClick={handleStartChat}
                            icon={MessageSquare}
                            className="rounded-lg font-bold uppercase text-[10px] tracking-widest h-9 px-4 border-slate-200 hover:bg-slate-50 shadow-sm"
                        >
                            Message
                        </Button>
                    )}
                    <Button
                        onClick={() => { setFormData(client); setIsEditModalOpen(true); }}
                        icon={Edit}
                        className="bg-slate-900 hover:bg-black text-white h-9 px-6 rounded-lg font-bold uppercase text-[10px] tracking-widest shadow-sm"
                    >
                        Manage Account
                    </Button>
                </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
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
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-b border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                            <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-900 dark:text-white">
                                <ShieldCheck size={14} className="text-emerald-500" />
                                Account Parameters
                            </h3>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Billing Structure</label>
                                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                                    <p className="text-[11px] font-medium italic leading-relaxed text-slate-600 dark:text-slate-300">
                                        {client.billingAddress || 'No primary address recorded. This account is missing critical billing data.'}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
                                    <div className="flex items-center gap-2">
                                        <Clock size={14} className="text-blue-500" />
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Payment Cycle</span>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase text-slate-900 dark:text-white">{client.paymentTermsDays || 30} Days</span>
                                </div>
                                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
                                    <div className="flex items-center gap-2">
                                        <BarChart3 size={14} className="text-indigo-500" />
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Requirement</span>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase text-slate-900 dark:text-white">{client.defaultCostCodeType || 'PO'} Required</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-b border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                            <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-900 dark:text-white">
                                <BarChart3 size={14} className="text-blue-500" />
                                Service Mix
                            </h3>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-bold text-slate-600">Interpreting</span>
                                <span className="font-black text-slate-900 dark:text-white">{Math.max(jobs.length - translationJobs.length, 0)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-bold text-slate-600">Translations</span>
                                <span className="font-black text-slate-900 dark:text-white">{translationJobs.length}</span>
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
                    <div className="grid w-full grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900 sm:flex sm:w-fit">
                        {(['ACTIVITY', 'STRUCTURE', 'FINANCE', 'ACCOUNT'] as Tab[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all ${activeTab === tab
                                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {tab === 'ACTIVITY'
                                    ? 'Recent activity'
                                    : tab === 'STRUCTURE'
                                        ? 'Departments & agents'
                                        : tab === 'FINANCE'
                                            ? 'Billing handoff'
                                            : 'Account data'}
                            </button>
                        ))}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
                                                            {job.serviceCategory || job.serviceType} <span className="w-1 h-1 bg-slate-300 rounded-full" /> {formatLanguagePair(job.languageFrom, job.languageTo)}
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

                        {activeTab === 'STRUCTURE' && (
                            <div className="space-y-5 p-4 sm:p-5">
                                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700 lg:grid-cols-4">
                                    {[
                                        ['Departments', departments.length],
                                        ['Agents', agents.length],
                                        ['Jobs without department', unassignedDepartmentJobs],
                                        ['Jobs without requester', unassignedRequesterJobs],
                                    ].map(([label, value]) => (
                                        <div key={String(label)} className="bg-slate-50 px-3 py-3 dark:bg-slate-900">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                                            <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">{value}</p>
                                        </div>
                                    ))}
                                </div>

                                <section aria-labelledby="client-departments-heading">
                                    <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
                                        <div>
                                            <h4 id="client-departments-heading" className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                                <Network size={15} className="text-blue-600" /> Departments
                                            </h4>
                                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Operational units, sites and billing scopes under this organisation.</p>
                                        </div>
                                        <Button size="sm" variant="secondary" icon={Plus} onClick={() => openDepartmentEditor()}>
                                            Department
                                        </Button>
                                    </div>
                                    {departments.length === 0 ? (
                                        <div className="py-8 text-center">
                                            <Network className="mx-auto text-slate-300 dark:text-slate-700" size={34} />
                                            <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">No departments mapped</p>
                                            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">This client still operates as a single organisation scope. Identity Audit can preserve departments found in source records.</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {departments.map(department => {
                                                const departmentJobs = jobs.filter(job => job.clientDepartmentId === department.id).length;
                                                const departmentMembers = memberships.filter(membership => membership.departmentIds?.includes(department.id)).length;
                                                return (
                                                    <div key={department.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-5">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{department.name}</p>
                                                            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                                                <MapPin size={12} /> {department.locationName || department.billingAddress || (department.sourceSystem === 'STAFF_MANUAL' ? 'Staff managed' : 'Imported identity')}
                                                            </p>
                                                        </div>
                                                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{departmentMembers} agent{departmentMembers === 1 ? '' : 's'}</p>
                                                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{departmentJobs} job{departmentJobs === 1 ? '' : 's'}</p>
                                                        <button type="button" onClick={() => openDepartmentEditor(department)} className="text-left text-xs font-bold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200 sm:text-right">Edit</button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>

                                <section aria-labelledby="client-agents-heading">
                                    <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
                                        <div>
                                            <h4 id="client-agents-heading" className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                                <Users size={15} className="text-blue-600" /> Agents and mailboxes
                                            </h4>
                                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">People and functional addresses retained independently from the organisation record.</p>
                                        </div>
                                        <Button size="sm" variant="secondary" icon={Plus} onClick={() => openAgentEditor()}>
                                            Agent
                                        </Button>
                                    </div>
                                    {agents.length === 0 ? (
                                        <div className="py-8 text-center">
                                            <UserRound className="mx-auto text-slate-300 dark:text-slate-700" size={34} />
                                            <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">No agent identities mapped</p>
                                            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">The legacy contact remains available under Account data until it is classified as a person or shared mailbox.</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {agents.map(agent => {
                                                const membership = membershipByAgentId.get(agent.id);
                                                const agentDepartments = (membership?.departmentIds || [])
                                                    .map(departmentId => departmentById.get(departmentId)?.name)
                                                    .filter(Boolean);
                                                const requesterJobs = jobs.filter(job => job.requestedByAgentId === agent.id).length;
                                                return (
                                                    <div key={agent.id} className="grid gap-2 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(140px,auto)_auto_auto] lg:items-center lg:gap-5">
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${agent.agentType === 'SHARED_MAILBOX' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'}`}>
                                                                {agent.agentType === 'SHARED_MAILBOX' ? <Inbox size={17} /> : <UserRound size={17} />}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{agent.displayName}</p>
                                                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{agent.email}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            <Badge variant={agent.agentType === 'SHARED_MAILBOX' ? 'warning' : 'info'} className="text-[9px] uppercase">{agent.agentType === 'SHARED_MAILBOX' ? 'Shared mailbox' : membership?.accessLevel || 'Agent'}</Badge>
                                                            {agent.roles.map(role => <Badge key={role} variant="neutral" className="text-[9px] uppercase">{role}</Badge>)}
                                                            {(agent.userId || membership?.userId) && (
                                                                <Badge variant={agent.portalAccountStatus === 'ACTIVE' ? 'success' : 'neutral'} className="text-[9px] uppercase">
                                                                    {agent.portalAccountStatus === 'ACTIVE' ? 'Portal active' : 'Portal prepared'}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="text-left lg:text-right">
                                                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{requesterJobs} requested job{requesterJobs === 1 ? '' : 's'}</p>
                                                            <p className="mt-0.5 max-w-[240px] truncate text-[11px] text-slate-400">{agentDepartments.length ? agentDepartments.join(', ') : 'Organisation-wide'}</p>
                                                        </div>
                                                        <div className="flex items-center gap-3 lg:justify-end">
                                                            {agent.userId && agent.portalAccountStatus === 'ACTIVE' && (
                                                                <button type="button" onClick={() => handleMessageAgent(agent)} className="text-left text-xs font-bold text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">Message</button>
                                                            )}
                                                            <button type="button" onClick={() => openAgentEditor(agent)} className="text-left text-xs font-bold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200 lg:text-right">Edit</button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>

                                <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Identity changes remain controlled through preview, dependency counts and rollback manifests.</p>
                                    <Button variant="secondary" icon={ShieldCheck} onClick={() => navigate('/admin/clients/identity-audit')}>
                                        Open Identity Audit
                                    </Button>
                                </div>
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
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Legacy primary contact</p>
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
                                <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Airtable identity</p>
                                        <p className="mt-2 truncate text-sm font-black text-slate-900">{client.airtableClientKey || client.legacyRef || 'Not linked'}</p>
                                        <p className="text-xs font-semibold text-slate-500">{client.sourceTable || 'No source table'} / {client.sourceRecordId || 'No source record'}</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Finance identity</p>
                                        <p className="mt-2 text-sm font-black text-slate-900">{client.sageAccountRef || 'No Sage ref'}</p>
                                        <p className="text-xs font-semibold text-slate-500">{client.invoiceEmail || client.email || 'No invoice email'}</p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dedupe key</p>
                                        <p className="mt-2 truncate text-sm font-black text-slate-900">{client.normalizedCompanyName || client.companyName}</p>
                                        <p className="text-xs font-semibold text-slate-500">{client.snapshotHash ? `Snapshot ${client.snapshotHash}` : 'Awaiting source snapshot'}</p>
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

            <Modal isOpen={isDepartmentModalOpen} onClose={() => setIsDepartmentModalOpen(false)} title={departmentForm.id ? 'Edit department' : 'Add department'} maxWidth="lg">
                <form onSubmit={handleDepartmentSave} className="space-y-5 py-2">
                    <div>
                        <label htmlFor="client-department-name" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Department or unit name</label>
                        <input
                            id="client-department-name"
                            required
                            minLength={2}
                            maxLength={120}
                            value={departmentForm.name}
                            onChange={event => setDepartmentForm(current => ({ ...current, name: event.target.value }))}
                            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            placeholder="e.g. Marchwood, Cardiology, Criminal Department"
                        />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label htmlFor="client-department-location" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Location label</label>
                            <input
                                id="client-department-location"
                                value={departmentForm.locationName}
                                onChange={event => setDepartmentForm(current => ({ ...current, locationName: event.target.value }))}
                                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                placeholder="Site, ward or office"
                            />
                        </div>
                        <div>
                            <label htmlFor="client-department-status" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</label>
                            <select
                                id="client-department-status"
                                value={departmentForm.status}
                                onChange={event => setDepartmentForm(current => ({ ...current, status: event.target.value as ClientDepartment['status'] }))}
                                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            >
                                <option value="ACTIVE">Active</option>
                                <option value="ARCHIVED">Archived</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="client-department-billing-address" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Department billing address</label>
                        <textarea
                            id="client-department-billing-address"
                            value={departmentForm.billingAddress}
                            onChange={event => setDepartmentForm(current => ({ ...current, billingAddress: event.target.value }))}
                            className="min-h-20 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            placeholder="Optional. Organisation billing address remains the default."
                        />
                    </div>
                    <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                        <Button type="button" variant="ghost" onClick={() => setIsDepartmentModalOpen(false)}>Cancel</Button>
                        <Button type="submit" isLoading={savingHierarchy}>{departmentForm.id ? 'Save department' : 'Create department'}</Button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isAgentModalOpen} onClose={() => setIsAgentModalOpen(false)} title={agentForm.id ? 'Edit agent access' : 'Add agent or mailbox'} maxWidth="lg">
                <form onSubmit={handleAgentSave} className="space-y-5 py-2">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label htmlFor="client-agent-display-name" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Display name</label>
                            <input
                                id="client-agent-display-name"
                                required
                                minLength={2}
                                maxLength={120}
                                value={agentForm.displayName}
                                onChange={event => setAgentForm(current => ({ ...current, displayName: event.target.value }))}
                                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                placeholder="Person or mailbox name"
                            />
                        </div>
                        <div>
                            <label htmlFor="client-agent-email" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Email</label>
                            <input
                                id="client-agent-email"
                                required
                                type="email"
                                value={agentForm.email}
                                onChange={event => setAgentForm(current => ({ ...current, email: event.target.value }))}
                                disabled={selectedAgentHasAccount}
                                aria-describedby={selectedAgentHasAccount ? 'linked-agent-email-help' : undefined}
                                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800 dark:disabled:text-slate-400"
                                placeholder="name@organisation.org"
                            />
                            {selectedAgentHasAccount && (
                                <p id="linked-agent-email-help" className="mt-1.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                                    This email is linked to the portal account. Change the account identity through user administration.
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label htmlFor="client-agent-type" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Identity type</label>
                            <select
                                id="client-agent-type"
                                value={agentForm.agentType}
                                onChange={event => setAgentForm(current => ({ ...current, agentType: event.target.value as ClientAgent['agentType'] }))}
                                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            >
                                <option value="PERSON">Named person</option>
                                <option value="SHARED_MAILBOX">Shared mailbox</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="client-agent-access-scope" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Access scope</label>
                            <select
                                id="client-agent-access-scope"
                                value={agentForm.accessLevel}
                                onChange={event => setAgentForm(current => ({ ...current, accessLevel: event.target.value as ClientMembership['accessLevel'] }))}
                                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            >
                                <option value="AGENT">Own requests</option>
                                <option value="DEPARTMENT_MANAGER">Department manager</option>
                                <option value="CLIENT_FINANCE">Client finance</option>
                                <option value="CLIENT_MASTER">Client master</option>
                            </select>
                        </div>
                    </div>
                    <fieldset>
                        <legend className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Operational roles</legend>
                        <div className="flex flex-wrap gap-2">
                            {(['REQUESTER', 'FINANCE'] as ClientAgent['roles']).map(role => {
                                const checked = agentForm.roles.includes(role);
                                return (
                                    <label key={role} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs font-bold ${checked ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={event => setAgentForm(current => ({
                                                ...current,
                                                roles: event.target.checked
                                                    ? Array.from(new Set([...current.roles, role]))
                                                    : current.roles.filter(item => item !== role),
                                            }))}
                                        />
                                        {role === 'REQUESTER' ? 'Can request jobs' : 'Finance contact'}
                                    </label>
                                );
                            })}
                        </div>
                    </fieldset>
                    <fieldset>
                        <legend className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Department scope</legend>
                        {departments.length === 0 ? (
                            <p className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">No departments exist. This membership will apply organisation-wide.</p>
                        ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {departments.filter(department => department.status === 'ACTIVE').map(department => {
                                    const checked = agentForm.departmentIds.includes(department.id);
                                    return (
                                        <label key={department.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold ${checked ? 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={event => setAgentForm(current => ({
                                                    ...current,
                                                    departmentIds: event.target.checked
                                                        ? Array.from(new Set([...current.departmentIds, department.id]))
                                                        : current.departmentIds.filter(id => id !== department.id),
                                                }))}
                                            />
                                            <span className="truncate">{department.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </fieldset>
                    {agentForm.id && agentForm.agentType === 'PERSON' && (
                        <div className="flex flex-col gap-3 border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-900 dark:text-white">Portal account</p>
                                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                    {selectedAgentAccountActive
                                        ? 'Active and linked to this agent membership.'
                                        : selectedAgentHasAccount
                                            ? 'Prepared and linked. Activation is still pending.'
                                            : 'Prepare access without sending an activation email.'}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handlePrepareAgentAccount}
                                isLoading={preparingAccount}
                                disabled={selectedAgentHasAccount || savingHierarchy}
                            >
                                {selectedAgentAccountActive ? 'Account active' : selectedAgentHasAccount ? 'Account prepared' : 'Prepare account'}
                            </Button>
                        </div>
                    )}
                    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                        <Button type="button" variant="ghost" onClick={() => setIsAgentModalOpen(false)}>Cancel</Button>
                        <Button type="submit" isLoading={savingHierarchy} disabled={agentForm.roles.length === 0}>{agentForm.id ? 'Save access' : 'Add agent'}</Button>
                    </div>
                </form>
            </Modal>

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
