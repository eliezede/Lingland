import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    AlertCircle,
    ArrowLeft,
    Building2,
    CalendarDays,
    Check,
    ChevronRight,
    CircleDot,
    Clock,
    CreditCard,
    FileText,
    Globe2,
    Hash,
    Info,
    Mail,
    MapPin,
    MessageSquareText,
    Phone,
    Save,
    Search,
    SlidersHorizontal,
    UserCheck,
    UserPlus,
    Video,
    X,
    Zap,
} from 'lucide-react';
import { BookingService, InterpreterService } from '../../../services/api';
import { Booking, BookingStatus, Client, Interpreter, ServiceType } from '../../../types';
import { useClients } from '../../../context/ClientContext';
import { useToast } from '../../../context/ToastContext';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge } from '../../../components/StatusBadge';
import { useAuth } from '../../../context/AuthContext';
import { UkAddress } from '../../../services/addressService';
import { PostcodeLookup } from '../../../components/ui/PostcodeLookup';

type ClientSource = 'EXISTING' | 'GUEST';

const panelClass = 'rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900';
const labelClass = 'mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';
const inputClass = 'h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900';
const textareaClass = 'min-h-32 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-6 text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-800 dark:bg-slate-950 dark:text-white';

const serviceOptions = Object.values(ServiceType);
const genderOptions: Array<'None' | 'Male' | 'Female'> = ['None', 'Male', 'Female'];
const translationFormats = ['Only Word', 'PDF', 'Certified', 'Other'];

const serviceIcons: Record<string, React.ElementType> = {
    [ServiceType.FACE_TO_FACE]: MapPin,
    [ServiceType.VIDEO]: Video,
    [ServiceType.TELEPHONE]: Phone,
    [ServiceType.TRANSLATION]: FileText,
    [ServiceType.BSL]: Globe2,
};

const Section = ({ title, icon: Icon, children, action }: { title: string; icon: React.ElementType; children: React.ReactNode; action?: React.ReactNode }) => (
    <section className={panelClass}>
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
            <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <Icon size={15} />
                </div>
                <h2 className="truncate text-sm font-semibold text-slate-950 dark:text-white">{title}</h2>
            </div>
            {action}
        </div>
        <div className="p-3">{children}</div>
    </section>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="min-w-0">
        <label className={labelClass}>{label}</label>
        {children}
    </div>
);

const MetricCell = ({ icon: Icon, label, value, tone = 'default' }: { icon: React.ElementType; label: string; value: string; tone?: 'default' | 'warning' | 'success' }) => {
    const toneClass = tone === 'warning'
        ? 'text-amber-700 dark:text-amber-300'
        : tone === 'success'
            ? 'text-emerald-700 dark:text-emerald-300'
            : 'text-slate-950 dark:text-white';

    return (
        <div className="min-w-0 border-b border-slate-200 p-3 dark:border-slate-800 sm:border-b-0 sm:border-r last:sm:border-r-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Icon size={13} />
                <span>{label}</span>
            </div>
            <p className={`mt-1 truncate text-sm font-semibold ${toneClass}`}>{value || '-'}</p>
        </div>
    );
};

const SegmentedButton = ({ active, children, icon: Icon, onClick, disabled = false }: { active: boolean; children: React.ReactNode; icon?: React.ElementType; onClick: () => void; disabled?: boolean }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex h-9 min-w-0 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
            active
                ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
    >
        {Icon && <Icon size={14} className="shrink-0" />}
        <span className="truncate">{children}</span>
    </button>
);

const ChecklistItem = ({ done, label, value }: { done: boolean; label: string; value: string }) => (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">
        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
            {done ? <Check size={13} /> : <AlertCircle size={13} />}
        </div>
        <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-950 dark:text-white">{label}</p>
            <p className="truncate text-xs text-slate-500">{value}</p>
        </div>
    </div>
);

export const AdminNewBooking = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const { id } = useParams<{ id: string }>();
    const isEditMode = Boolean(id);
    const { clientsMap } = useClients();

    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(isEditMode);
    const clients = Object.values(clientsMap);
    const [interpreters, setInterpreters] = useState<Interpreter[]>([]);
    const [searchingInterpreter, setSearchingInterpreter] = useState('');
    const [originalBooking, setOriginalBooking] = useState<Booking | null>(null);
    const [organizationId, setOrganizationId] = useState('');
    const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
    const [clientModalOpen, setClientModalOpen] = useState(false);
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [clientSource, setClientSource] = useState<ClientSource>('GUEST');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [selectedInterpreter, setSelectedInterpreter] = useState<Interpreter | null>(null);

    const [formData, setFormData] = useState({
        costCode: '',
        serviceType: ServiceType.FACE_TO_FACE,
        languageFrom: 'English',
        languageTo: '',
        date: '',
        startTime: '',
        durationMinutes: 60,
        locationType: 'ONSITE' as 'ONSITE' | 'ONLINE',
        address: '',
        postcode: '',
        houseNumber: '',
        onlineLink: '',
        notes: '',
        genderPreference: 'None' as 'Male' | 'Female' | 'None',
        organization: '',
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        translationFormat: 'Only Word',
        translationFormatOther: '',
        quoteRequested: false,
        sourceFiles: [] as Array<string | { name?: string; url?: string }>,
        deliveryEmail: '',
        lat: undefined as number | undefined,
        lng: undefined as number | undefined,
    });

    const isTranslation = formData.serviceType === ServiceType.TRANSLATION;
    const isRemoteService = formData.serviceType === ServiceType.VIDEO || formData.serviceType === ServiceType.TELEPHONE || isTranslation;
    const effectiveLocationType = isRemoteService ? 'ONLINE' : formData.locationType;

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (isEditMode) loadBookingData();
    }, [id]);

    useEffect(() => {
        if (!originalBooking?.clientId || selectedClient) return;
        const client = clientsMap[originalBooking.clientId];
        if (client) setSelectedClient(client);
    }, [clientsMap, originalBooking?.clientId, selectedClient]);

    const loadInitialData = async () => {
        try {
            const allInterpreters = await InterpreterService.getAll();
            const activeInterpreters = allInterpreters.filter(int => int.status === 'ACTIVE');
            setInterpreters(activeInterpreters);
            setAvailableLanguages(Array.from(new Set(activeInterpreters.flatMap(int => int.languages || []))).sort());
        } catch (error) {
            console.error('Failed to load booking editor data', error);
        }
    };

    const loadBookingData = async () => {
        if (!id) return;
        setInitialLoading(true);
        try {
            const booking = await BookingService.getById(id);
            if (!booking) {
                showToast('Booking not found', 'error');
                navigate('/admin/bookings');
                return;
            }

            setOriginalBooking(booking);
            setOrganizationId(booking.organizationId || '');
            setFormData({
                costCode: booking.costCode || '',
                serviceType: booking.serviceType as ServiceType,
                languageFrom: booking.languageFrom || 'English',
                languageTo: booking.languageTo || '',
                date: booking.date || '',
                startTime: booking.startTime || '',
                durationMinutes: booking.durationMinutes || 60,
                locationType: booking.locationType || 'ONSITE',
                address: booking.address || '',
                postcode: booking.postcode || '',
                houseNumber: (booking as any).houseNumber || '',
                onlineLink: booking.onlineLink || '',
                notes: booking.notes || '',
                genderPreference: booking.genderPreference || 'None',
                organization: booking.guestContact?.organisation || booking.clientName || '',
                contactName: booking.guestContact?.name || '',
                contactEmail: booking.guestContact?.email || '',
                contactPhone: booking.guestContact?.phone || '',
                translationFormat: booking.translationFormat || 'Only Word',
                translationFormatOther: booking.translationFormatOther || '',
                quoteRequested: Boolean(booking.quoteRequested),
                sourceFiles: booking.sourceFiles || [],
                deliveryEmail: booking.deliveryEmail || booking.guestContact?.email || '',
                lat: booking.lat,
                lng: booking.lng,
            });

            if (booking.clientId) setClientSource('EXISTING');
            else setClientSource('GUEST');

            if (booking.interpreterId) {
                const interpreter = await InterpreterService.getById(booking.interpreterId);
                if (interpreter) setSelectedInterpreter(interpreter);
            }
        } catch {
            showToast('Failed to load booking data', 'error');
        } finally {
            setInitialLoading(false);
        }
    };

    const filteredClientsForModal = useMemo(() => {
        const query = clientSearchQuery.toLowerCase();
        return clients.filter(c =>
            (c.companyName || '').toLowerCase().includes(query) ||
            (c.contactPerson || '').toLowerCase().includes(query) ||
            (c.email || '').toLowerCase().includes(query)
        );
    }, [clients, clientSearchQuery]);

    const matchingInterpreters = useMemo(() => {
        if (!formData.languageTo) return interpreters;
        const language = formData.languageTo.toLowerCase();
        return interpreters.filter(i => (i.languages || []).some(l => l.toLowerCase() === language));
    }, [interpreters, formData.languageTo]);

    const filteredInterpreters = useMemo(() => {
        const query = searchingInterpreter.toLowerCase();
        return interpreters
            .filter(i =>
                i.name.toLowerCase().includes(query) ||
                (i.languages || []).some(l => l.toLowerCase().includes(query)) ||
                !query
            )
            .sort((a, b) => {
                if (formData.languageTo) {
                    const aExact = (a.languages || []).some(l => l.toLowerCase() === formData.languageTo.toLowerCase()) ? 0 : 1;
                    const bExact = (b.languages || []).some(l => l.toLowerCase() === formData.languageTo.toLowerCase()) ? 0 : 1;
                    if (aExact !== bExact) return aExact - bExact;
                    const aPriority = a.languageProficiencies?.find(p => p.language === formData.languageTo)?.l1 || 18;
                    const bPriority = b.languageProficiencies?.find(p => p.language === formData.languageTo)?.l1 || 18;
                    if (aPriority !== bPriority) return aPriority - bPriority;
                }
                return a.name.localeCompare(b.name);
            })
            .slice(0, 14);
    }, [interpreters, searchingInterpreter, formData.languageTo]);

    const selectedClientLabel = selectedClient?.companyName || formData.organization || 'No client selected';
    const hasClient = Boolean(selectedClient || formData.organization || formData.contactName);
    const hasContact = Boolean(formData.contactEmail || formData.contactPhone);
    const hasLanguage = Boolean(formData.languageTo);
    const hasSchedule = Boolean(formData.date && (isTranslation || formData.startTime));
    const hasLocation = isTranslation || effectiveLocationType === 'ONLINE' || Boolean(formData.address || formData.postcode);
    const requiredMissing = !hasLanguage || !hasSchedule;

    const scheduleLabel = formData.date
        ? `${formData.date}${formData.startTime ? `, ${formData.startTime}` : ''}`
        : 'No date';

    const locationLabel = isTranslation
        ? 'Document delivery'
        : effectiveLocationType === 'ONLINE'
            ? formData.onlineLink || 'Online'
            : formData.postcode || formData.address || 'On-site';

    const updateLocationFromAddress = (address: UkAddress) => {
        setFormData(prev => ({
            ...prev,
            address: address.formattedAddress || [address.line1, address.townOrCity].filter(Boolean).join(', '),
            postcode: address.postcode,
            houseNumber: address.houseNumber || prev.houseNumber,
            lat: address.lat,
            lng: address.lng,
        }));
    };

    const selectServiceType = (serviceType: ServiceType) => {
        setFormData(prev => ({
            ...prev,
            serviceType,
            locationType: serviceType === ServiceType.VIDEO || serviceType === ServiceType.TELEPHONE || serviceType === ServiceType.TRANSLATION ? 'ONLINE' : prev.locationType,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (requiredMissing) {
            showToast(isTranslation ? 'Fill language and date before saving' : 'Fill language, date and time before saving', 'error');
            return;
        }

        setLoading(true);
        try {
            const bookingData: any = {
                costCode: formData.costCode,
                serviceType: formData.serviceType,
                languageFrom: formData.languageFrom,
                languageTo: formData.languageTo,
                date: formData.date,
                startTime: formData.startTime,
                durationMinutes: Number(formData.durationMinutes) || 60,
                locationType: effectiveLocationType,
                address: formData.address,
                postcode: formData.postcode,
                houseNumber: formData.houseNumber,
                onlineLink: formData.onlineLink,
                notes: formData.notes,
                genderPreference: formData.genderPreference,
                organizationId: organizationId || (user as any)?.organizationId || 'lingland-main',
                status: isEditMode ? originalBooking?.status || BookingStatus.INCOMING : selectedInterpreter ? BookingStatus.ASSIGNMENT_PENDING : BookingStatus.INCOMING,
                requestedByUserId: originalBooking?.requestedByUserId || user?.id || 'admin',
                updatedAt: new Date().toISOString(),
                translationFormat: formData.translationFormat,
                translationFormatOther: formData.translationFormatOther,
                quoteRequested: formData.quoteRequested,
                sourceFiles: formData.sourceFiles,
                deliveryEmail: formData.deliveryEmail || formData.contactEmail,
                lat: formData.lat,
                lng: formData.lng,
            };

            if (clientSource === 'EXISTING' && (selectedClient || originalBooking?.clientId)) {
                bookingData.clientId = selectedClient?.id || originalBooking?.clientId;
                bookingData.clientName = selectedClient?.companyName || originalBooking?.clientName || formData.organization || 'Registered Client';
                bookingData.guestContact = {
                    name: formData.contactName || selectedClient?.contactPerson || originalBooking?.guestContact?.name || '',
                    email: formData.contactEmail || selectedClient?.email || originalBooking?.guestContact?.email || '',
                    phone: formData.contactPhone,
                    organisation: selectedClient?.companyName || originalBooking?.clientName || formData.organization,
                };
            } else {
                bookingData.clientName = formData.organization || 'Guest Client';
                bookingData.clientId = '';
                bookingData.guestContact = {
                    name: formData.contactName,
                    email: formData.contactEmail,
                    phone: formData.contactPhone,
                    organisation: formData.organization,
                };
            }

            if (selectedInterpreter) {
                bookingData.interpreterId = selectedInterpreter.id;
                bookingData.interpreterName = selectedInterpreter.name;
            } else if (isEditMode && originalBooking?.interpreterId) {
                bookingData.interpreterId = null;
                bookingData.interpreterName = null;
            }

            if (isEditMode) {
                await BookingService.update(id!, bookingData);
                showToast('Booking updated successfully', 'success');
                navigate(`/admin/bookings/${id}`);
            } else {
                bookingData.bookingRef = `LL-${Math.floor(1000 + Math.random() * 9000)}`;
                bookingData.createdAt = new Date().toISOString();
                const createdBooking = await BookingService.create(bookingData);
                if (selectedInterpreter) {
                    await BookingService.createAssignment(createdBooking.id, selectedInterpreter.id);
                }
                showToast('Booking created successfully', 'success');
                navigate('/admin/bookings');
            }
        } catch {
            showToast(isEditMode ? 'Failed to update booking' : 'Failed to create booking', 'error');
        } finally {
            setLoading(false);
        }
    };

    if (initialLoading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="-m-3 min-h-full bg-slate-100 pb-20 dark:bg-slate-950 sm:-m-5 lg:-m-6">
            <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-5 lg:px-6">
                <div className="mx-auto flex max-w-[1600px] flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <button
                            type="button"
                            onClick={() => navigate(isEditMode && id ? `/admin/bookings/${id}` : '/admin/bookings')}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                            aria-label="Back"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="truncate text-lg font-semibold text-slate-950 dark:text-white">
                                    {isEditMode ? 'Edit booking record' : 'New booking record'}
                                </h1>
                                {originalBooking && <StatusBadge status={originalBooking.status} />}
                                <span className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 dark:border-slate-800">
                                    {originalBooking?.bookingRef || 'Draft'}
                                </span>
                            </div>
                            <p className="truncate text-xs text-slate-500">{selectedClientLabel}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                        <Button type="button" variant="secondary" onClick={() => navigate(isEditMode && id ? `/admin/bookings/${id}` : '/admin/bookings')}>Cancel</Button>
                        <Button type="submit" icon={Save} isLoading={loading} disabled={loading || requiredMissing}>
                            {isEditMode ? 'Save changes' : 'Create booking'}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-[1600px] space-y-4 p-3 sm:p-5 lg:p-6">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-5">
                        <MetricCell icon={Building2} label="Requester" value={selectedClientLabel} tone={hasClient ? 'default' : 'warning'} />
                        <MetricCell icon={Globe2} label="Language" value={formData.languageTo ? `${formData.languageFrom} to ${formData.languageTo}` : 'Missing language'} tone={hasLanguage ? 'default' : 'warning'} />
                        <MetricCell icon={CalendarDays} label="Schedule" value={scheduleLabel} tone={hasSchedule ? 'default' : 'warning'} />
                        <MetricCell icon={MapPin} label="Location" value={locationLabel} tone={hasLocation ? 'default' : 'warning'} />
                        <MetricCell icon={UserCheck} label="Assignment" value={selectedInterpreter?.name || `${matchingInterpreters.length} possible`} tone={selectedInterpreter ? 'success' : 'default'} />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
                    <main className="space-y-4">
                        <Section
                            title="Requester"
                            icon={Building2}
                            action={
                                <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-950">
                                    <SegmentedButton active={clientSource === 'GUEST'} onClick={() => { setClientSource('GUEST'); setSelectedClient(null); }}>
                                        Guest
                                    </SegmentedButton>
                                    <SegmentedButton active={clientSource === 'EXISTING'} onClick={() => setClientSource('EXISTING')}>
                                        Client
                                    </SegmentedButton>
                                </div>
                            }
                        >
                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                                <div className="space-y-3">
                                    {clientSource === 'EXISTING' ? (
                                        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                                            {selectedClient ? (
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{selectedClient.companyName}</p>
                                                        <p className="truncate text-xs text-slate-500">{selectedClient.contactPerson} - {selectedClient.email}</p>
                                                    </div>
                                                    <Button type="button" size="sm" variant="outline" onClick={() => setClientModalOpen(true)}>Change</Button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setClientModalOpen(true)}
                                                    className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                                >
                                                    <Search size={16} /> Select client
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <Field label="Organisation">
                                            <input className={inputClass} value={formData.organization} onChange={e => setFormData({ ...formData, organization: e.target.value })} placeholder="Organisation or requester" />
                                        </Field>
                                    )}

                                    <div className="grid gap-3 md:grid-cols-3">
                                        <Field label="Contact name">
                                            <input className={inputClass} value={formData.contactName} onChange={e => setFormData({ ...formData, contactName: e.target.value })} placeholder="Requester" />
                                        </Field>
                                        <Field label="Email">
                                            <div className="relative">
                                                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input type="email" className={`${inputClass} pl-8`} value={formData.contactEmail} onChange={e => setFormData({ ...formData, contactEmail: e.target.value })} placeholder="name@example.com" />
                                            </div>
                                        </Field>
                                        <Field label="Phone">
                                            <div className="relative">
                                                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input className={`${inputClass} pl-8`} value={formData.contactPhone} onChange={e => setFormData({ ...formData, contactPhone: e.target.value })} placeholder="+44..." />
                                            </div>
                                        </Field>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Field label="PO / cost code">
                                        <div className="relative">
                                            <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input className={`${inputClass} pl-8 font-mono`} value={formData.costCode} onChange={e => setFormData({ ...formData, costCode: e.target.value })} placeholder="PO / CC" />
                                        </div>
                                    </Field>
                                    {selectedClient?.defaultCostCodeType && (
                                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                                            Default: {selectedClient.defaultCostCodeType}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Section>

                        <Section title="Service and schedule" icon={SlidersHorizontal}>
                            <div className="space-y-3">
                                <Field label="Service type">
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                                        {serviceOptions.map(option => {
                                            const Icon = serviceIcons[option] || CircleDot;
                                            return (
                                                <SegmentedButton key={option} active={formData.serviceType === option} icon={Icon} onClick={() => selectServiceType(option)}>
                                                    {option}
                                                </SegmentedButton>
                                            );
                                        })}
                                    </div>
                                </Field>

                                <div className="grid gap-3 md:grid-cols-4">
                                    <Field label="From">
                                        <input className={inputClass} value={formData.languageFrom} onChange={e => setFormData({ ...formData, languageFrom: e.target.value })} />
                                    </Field>
                                    <Field label="To">
                                        <input list="availableLanguages" className={inputClass} value={formData.languageTo} onChange={e => setFormData({ ...formData, languageTo: e.target.value })} placeholder="Required" />
                                        <datalist id="availableLanguages">
                                            {availableLanguages.map(language => <option key={language} value={language} />)}
                                        </datalist>
                                    </Field>
                                    <Field label="Gender">
                                        <select className={inputClass} value={formData.genderPreference} onChange={e => setFormData({ ...formData, genderPreference: e.target.value as any })}>
                                            {genderOptions.map(option => <option key={option} value={option}>{option}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Matches">
                                        <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                            {formData.languageTo ? `${matchingInterpreters.length} active` : 'Choose language'}
                                        </div>
                                    </Field>
                                </div>

                                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                                    <div className="grid gap-3 md:grid-cols-3">
                                        <Field label="Date">
                                            <input type="date" className={inputClass} value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                                        </Field>
                                        <Field label="Start">
                                            <div className="relative">
                                                <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                <input type="time" className={`${inputClass} pl-8`} value={formData.startTime} disabled={isTranslation} onChange={e => setFormData({ ...formData, startTime: e.target.value })} />
                                            </div>
                                        </Field>
                                        <Field label="Duration">
                                            <input type="number" min={15} step={15} className={inputClass} value={formData.durationMinutes} disabled={isTranslation} onChange={e => setFormData({ ...formData, durationMinutes: Number(e.target.value) })} />
                                        </Field>
                                    </div>

                                    <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-950">
                                        <SegmentedButton active={effectiveLocationType === 'ONSITE'} disabled={isRemoteService} icon={MapPin} onClick={() => setFormData({ ...formData, locationType: 'ONSITE' })}>
                                            On-site
                                        </SegmentedButton>
                                        <SegmentedButton active={effectiveLocationType === 'ONLINE'} icon={Video} onClick={() => setFormData({ ...formData, locationType: 'ONLINE' })}>
                                            Remote
                                        </SegmentedButton>
                                    </div>
                                </div>

                                {effectiveLocationType === 'ONLINE' ? (
                                    <Field label="Remote connection">
                                        <input className={inputClass} value={formData.onlineLink} onChange={e => setFormData({ ...formData, onlineLink: e.target.value })} placeholder="Teams, Zoom, telephone bridge or joining notes" />
                                    </Field>
                                ) : (
                                    <div className="space-y-3">
                                        <PostcodeLookup onAddressSelected={updateLocationFromAddress} />
                                        <div className="grid gap-3 md:grid-cols-[120px_1fr_150px]">
                                            <Field label="House no.">
                                                <input className={inputClass} value={formData.houseNumber} onChange={e => setFormData({ ...formData, houseNumber: e.target.value })} />
                                            </Field>
                                            <Field label="Address">
                                                <input className={inputClass} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                                            </Field>
                                            <Field label="Postcode">
                                                <input className={`${inputClass} uppercase`} value={formData.postcode} onChange={e => setFormData({ ...formData, postcode: e.target.value.toUpperCase() })} />
                                            </Field>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Section>

                        {isTranslation && (
                            <Section title="Translation delivery" icon={FileText}>
                                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_220px]">
                                    <Field label="Format">
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            {translationFormats.map(format => (
                                                <SegmentedButton key={format} active={formData.translationFormat === format} onClick={() => setFormData({ ...formData, translationFormat: format })}>
                                                    {format}
                                                </SegmentedButton>
                                            ))}
                                        </div>
                                    </Field>
                                    <Field label="Delivery email">
                                        <input type="email" className={inputClass} value={formData.deliveryEmail} onChange={e => setFormData({ ...formData, deliveryEmail: e.target.value })} placeholder="delivery@example.com" />
                                    </Field>
                                    <label className="flex h-full min-h-16 items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                                        <span className="text-sm font-semibold text-slate-950 dark:text-white">Quote first</span>
                                        <input type="checkbox" checked={formData.quoteRequested} onChange={e => setFormData({ ...formData, quoteRequested: e.target.checked })} className="h-5 w-5 rounded border-slate-300 text-blue-600" />
                                    </label>
                                    {formData.translationFormat === 'Other' && (
                                        <Field label="Specify format">
                                            <input className={inputClass} value={formData.translationFormatOther} onChange={e => setFormData({ ...formData, translationFormatOther: e.target.value })} />
                                        </Field>
                                    )}
                                </div>
                            </Section>
                        )}
                    </main>

                    <aside className="space-y-4 xl:sticky xl:top-32 xl:self-start">
                        <Section title="Save readiness" icon={Info}>
                            <div className="space-y-2">
                                <ChecklistItem done={hasClient} label="Requester" value={selectedClientLabel} />
                                <ChecklistItem done={hasContact} label="Contact" value={formData.contactEmail || formData.contactPhone || 'No contact channel'} />
                                <ChecklistItem done={hasLanguage} label="Language" value={formData.languageTo || 'Missing target language'} />
                                <ChecklistItem done={hasSchedule} label="Schedule" value={scheduleLabel} />
                                <ChecklistItem done={hasLocation} label="Location" value={locationLabel} />
                            </div>
                        </Section>

                        <Section title="Interpreter assignment" icon={UserPlus}>
                            <div className="space-y-3">
                                {selectedInterpreter ? (
                                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-emerald-950 dark:text-emerald-100">{selectedInterpreter.name}</p>
                                                <p className="truncate text-xs text-emerald-700 dark:text-emerald-300">{(selectedInterpreter.languages || []).slice(0, 4).join(', ')}</p>
                                            </div>
                                            <button type="button" onClick={() => setSelectedInterpreter(null)} className="rounded-md p-1 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40" aria-label="Remove interpreter">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                                        Assignment pool: {matchingInterpreters.length} active matches
                                    </div>
                                )}

                                <div className="relative">
                                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input className={`${inputClass} pl-9`} value={searchingInterpreter} onChange={e => setSearchingInterpreter(e.target.value)} placeholder="Search interpreter or language" />
                                </div>

                                <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                                    {filteredInterpreters.map(interpreter => {
                                        const exactLanguage = formData.languageTo && (interpreter.languages || []).some(l => l.toLowerCase() === formData.languageTo.toLowerCase());
                                        return (
                                            <button
                                                key={interpreter.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedInterpreter(interpreter);
                                                    setSearchingInterpreter('');
                                                }}
                                                className="flex w-full items-center justify-between gap-3 bg-white px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{interpreter.name}</p>
                                                    <p className="truncate text-xs text-slate-500">{(interpreter.languages || []).slice(0, 4).join(', ')}</p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    {exactLanguage && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">MATCH</span>}
                                                    {interpreter.acceptsDirectAssignment ? <Zap size={14} className="text-amber-500" /> : <ChevronRight size={14} className="text-slate-300" />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </Section>

                        <Section title="Admin notes" icon={MessageSquareText}>
                            <textarea className={textareaClass} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Operational notes, access instructions, risks, case context..." />
                        </Section>

                        <Section title="Billing snapshot" icon={CreditCard}>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                                    <p className="text-slate-500">Cost code</p>
                                    <p className="mt-1 truncate font-semibold text-slate-950 dark:text-white">{formData.costCode || '-'}</p>
                                </div>
                                <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                                    <p className="text-slate-500">Status</p>
                                    <p className="mt-1 truncate font-semibold text-slate-950 dark:text-white">{originalBooking?.status || 'Draft'}</p>
                                </div>
                            </div>
                        </Section>
                    </aside>
                </div>
            </div>

            <Modal
                isOpen={clientModalOpen}
                onClose={() => {
                    setClientModalOpen(false);
                    setClientSearchQuery('');
                }}
                title="Select client"
                maxWidth="2xl"
            >
                <div className="space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            className={`${inputClass} pl-9`}
                            placeholder="Search company, contact or email"
                            value={clientSearchQuery}
                            onChange={(e) => setClientSearchQuery(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
                        {filteredClientsForModal.map(client => (
                            <button
                                key={client.id}
                                type="button"
                                onClick={() => {
                                    setSelectedClient(client);
                                    setFormData(prev => ({
                                        ...prev,
                                        organization: client.companyName,
                                        contactName: prev.contactName || client.contactPerson,
                                        contactEmail: prev.contactEmail || client.email,
                                    }));
                                    setClientModalOpen(false);
                                    setClientSearchQuery('');
                                }}
                                className="grid w-full grid-cols-[32px_minmax(0,1fr)_24px] items-center gap-3 border-b border-slate-100 bg-white px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                            >
                                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800">
                                    <Building2 size={16} />
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{client.companyName}</p>
                                    <p className="truncate text-xs text-slate-500">{client.contactPerson} - {client.email}</p>
                                </div>
                                <ChevronRight size={16} className="text-slate-400" />
                            </button>
                        ))}
                        {filteredClientsForModal.length === 0 && (
                            <div className="p-8 text-center text-sm text-slate-500">
                                No clients found.
                            </div>
                        )}
                    </div>
                </div>
            </Modal>
        </form>
    );
};
