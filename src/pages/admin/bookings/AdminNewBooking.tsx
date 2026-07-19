import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
    AlertCircle,
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
    Trash2,
    Upload,
    UserCheck,
    UserPlus,
    Video,
    X,
    Zap,
} from 'lucide-react';
import { BookingService, InterpreterService, StorageService } from '../../../services/api';
import { Booking, BookingStatus, Client, Interpreter, ServiceType } from '../../../types';
import { useClients } from '../../../context/ClientContext';
import { useToast } from '../../../context/ToastContext';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useAuth } from '../../../context/AuthContext';
import { UkAddress } from '../../../services/addressService';
import { PostcodeLookup } from '../../../components/ui/PostcodeLookup';
import { useConfirm } from '../../../context/ConfirmContext';
import {
    BookingMetricCell as MetricCell,
    BookingMetricsBand,
    BookingNavigationState,
    BookingRecordHeader,
    BookingSection as Section,
    getBookingNavigationStateForReturn,
} from '../../../components/bookings/BookingRecordShell';
import { isInterpreterAvailableForStaffAssignment } from '../../../utils/interpreterFlow';
import { ClientHierarchyBundle, ClientHierarchyService } from '../../../services/clientHierarchyService';
import { ClientIdentityAuditService } from '../../../services/clientIdentityAuditService';
import { ClientService } from '../../../services/clientService';

type ClientSource = 'EXISTING' | 'GUEST';

const labelClass = 'mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';
const inputClass = 'h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900';
const textareaClass = 'min-h-32 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-6 text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-800 dark:bg-slate-950 dark:text-white';

const serviceOptions = Object.values(ServiceType);
const normalizeServiceType = (value?: string): ServiceType =>
    serviceOptions.includes(value as ServiceType) ? value as ServiceType : ServiceType.FACE_TO_FACE;
const genderOptions: Array<'None' | 'Male' | 'Female'> = ['None', 'Male', 'Female'];
const translationFormats = ['Only Word', 'PDF', 'Certified', 'Other'];

const serviceIcons: Record<string, React.ElementType> = {
    [ServiceType.FACE_TO_FACE]: MapPin,
    [ServiceType.VIDEO]: Video,
    [ServiceType.TELEPHONE]: Phone,
    [ServiceType.TRANSLATION]: FileText,
    [ServiceType.BSL]: Globe2,
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="min-w-0">
        <label className={labelClass}>{label}</label>
        {children}
    </div>
);

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
    const location = useLocation();
    const { user } = useAuth();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { id } = useParams<{ id: string }>();
    const isEditMode = Boolean(id);
    const routeState = location.state as BookingNavigationState | null;
    const { clientsMap } = useClients();

    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(isEditMode);
    const [clientOptions, setClientOptions] = useState<Client[]>([]);
    const clients = useMemo(() => {
        const byId = new Map<string, Client>();
        Object.values(clientsMap).forEach(client => byId.set(client.id, client));
        clientOptions.forEach(client => byId.set(client.id, client));
        return Array.from(byId.values()).sort((left, right) => left.companyName.localeCompare(right.companyName));
    }, [clientOptions, clientsMap]);
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
    const [clientHierarchy, setClientHierarchy] = useState<ClientHierarchyBundle | null>(null);
    const [clientHierarchyLoading, setClientHierarchyLoading] = useState(false);
    const [clientHierarchyError, setClientHierarchyError] = useState('');
    const [selectedClientDepartmentId, setSelectedClientDepartmentId] = useState('');
    const [selectedRequesterAgentId, setSelectedRequesterAgentId] = useState('');
    const [interpreterTouched, setInterpreterTouched] = useState(false);
    const [serviceTypeTouched, setServiceTypeTouched] = useState(false);
    const [uploadingFiles, setUploadingFiles] = useState(false);

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
        translationDeadline: '',
        quoteRequested: false,
        wordCount: 0,
        numberOfDocs: 0,
        finalQuote: 0,
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
        const client = clients.find(item => item.id === originalBooking.clientId);
        if (client) setSelectedClient(client);
    }, [clients, originalBooking?.clientId, selectedClient]);

    useEffect(() => {
        const clientId = selectedClient?.id;
        if (!clientId) {
            setClientHierarchy(null);
            setClientHierarchyError('');
            return;
        }
        let cancelled = false;
        setClientHierarchyLoading(true);
        setClientHierarchyError('');
        ClientHierarchyService.getForClient(clientId)
            .then(hierarchy => {
                if (cancelled) return;
                setClientHierarchy(hierarchy);
                setSelectedClientDepartmentId(current => hierarchy.departments.some(item => item.id === current && item.status === 'ACTIVE') ? current : '');
                setSelectedRequesterAgentId(current => {
                    const activeAgent = hierarchy.agents.some(item => item.id === current && item.status === 'ACTIVE' && item.agentType === 'PERSON');
                    const activeMembership = hierarchy.memberships.some(item => item.clientId === clientId && item.agentId === current && item.status === 'ACTIVE');
                    return activeAgent && activeMembership ? current : '';
                });
            })
            .catch(hierarchyError => {
                if (cancelled) return;
                console.error('Failed to load booking client hierarchy', hierarchyError);
                setClientHierarchy(null);
                setClientHierarchyError(hierarchyError instanceof Error ? hierarchyError.message : 'Departments and agents could not be loaded.');
            })
            .finally(() => {
                if (!cancelled) setClientHierarchyLoading(false);
            });
        return () => { cancelled = true; };
    }, [selectedClient?.id]);

    const loadInitialData = async () => {
        try {
            const [allInterpreters, allClients] = await Promise.all([
                InterpreterService.getAll(),
                ClientService.getAll(),
            ]);
            const workforceInterpreters = allInterpreters.filter(int =>
                ['ACTIVE', 'IMPORTED', 'ONLY_TRANSL'].includes(int.status)
            );
            setInterpreters(workforceInterpreters);
            setClientOptions(allClients);
            setAvailableLanguages(Array.from(new Set(workforceInterpreters.flatMap(int => int.languages || []))).sort());
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
            setInterpreterTouched(false);
            setServiceTypeTouched(false);
            setSelectedClientDepartmentId(booking.clientDepartmentId || '');
            setSelectedRequesterAgentId(booking.requestedByAgentId || '');
            setOrganizationId(booking.organizationId || '');
            setFormData({
                costCode: booking.costCode || '',
                serviceType: normalizeServiceType(booking.serviceType),
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
                translationDeadline: booking.translationDeadline || booking.date || '',
                quoteRequested: Boolean(booking.quoteRequested),
                wordCount: Number(booking.wordCount || 0),
                numberOfDocs: Number(booking.numberOfDocs || 0),
                finalQuote: Number(booking.finalQuote || booking.totalAmount || 0),
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

    const matchingClientsForModal = useMemo(() => {
        const query = clientSearchQuery.toLowerCase();
        return clients.filter(c =>
            (c.companyName || '').toLowerCase().includes(query) ||
            (c.contactPerson || '').toLowerCase().includes(query) ||
            (c.email || '').toLowerCase().includes(query)
        );
    }, [clients, clientSearchQuery]);
    const filteredClientsForModal = useMemo(() => matchingClientsForModal.slice(0, 80), [matchingClientsForModal]);

    const requesterAgentOptions = useMemo(() => {
        if (!clientHierarchy || !selectedClient) return [];
        const membershipByAgent = new Map(clientHierarchy.memberships
            .filter(membership => membership.clientId === selectedClient.id && membership.status === 'ACTIVE')
            .map(membership => [membership.agentId, membership]));
        return clientHierarchy.agents
            .filter(agent => agent.status === 'ACTIVE' && agent.agentType === 'PERSON')
            .filter(agent => {
                const membership = membershipByAgent.get(agent.id);
                if (!membership) return false;
                if (!selectedClientDepartmentId || !membership.departmentIds?.length || membership.accessLevel === 'CLIENT_MASTER') return true;
                return membership.departmentIds.includes(selectedClientDepartmentId);
            })
            .sort((left, right) => left.displayName.localeCompare(right.displayName));
    }, [clientHierarchy, selectedClient, selectedClientDepartmentId]);

    const selectedRequesterMembership = useMemo(() => clientHierarchy?.memberships.find(membership => (
        membership.clientId === selectedClient?.id
        && membership.agentId === selectedRequesterAgentId
        && membership.status === 'ACTIVE'
    )), [clientHierarchy, selectedClient?.id, selectedRequesterAgentId]);

    const matchingInterpreters = useMemo(() => {
        const available = interpreters.filter(i =>
            isInterpreterAvailableForStaffAssignment(i.status, isTranslation)
        );
        if (!formData.languageTo) return available;
        const language = formData.languageTo.toLowerCase();
        return available.filter(i => (i.languages || []).some(l => l.toLowerCase() === language));
    }, [interpreters, formData.languageTo, isTranslation]);

    const filteredInterpreters = useMemo(() => {
        const query = searchingInterpreter.toLowerCase();
        return interpreters
            .filter(i => isInterpreterAvailableForStaffAssignment(i.status, isTranslation))
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
    }, [interpreters, searchingInterpreter, formData.languageTo, isTranslation]);

    const selectedClientLabel = selectedClient?.companyName || formData.organization || 'No client selected';
    const hasClient = Boolean(selectedClient || formData.organization || formData.contactName);
    const hasContact = Boolean(formData.contactEmail || formData.contactPhone);
    const hasLanguage = Boolean(formData.languageTo);
    const hasSchedule = isTranslation
        ? Boolean(formData.translationDeadline || formData.date)
        : Boolean(formData.date && formData.startTime);
    const hasLocation = isTranslation || effectiveLocationType === 'ONLINE' || Boolean(formData.address || formData.postcode);
    const requiredMissing = !hasLanguage || !hasSchedule;
    const assignmentLocked = Boolean(isEditMode && originalBooking && [
        BookingStatus.CANCELLED,
        BookingStatus.TIMESHEET_SUBMITTED,
        BookingStatus.READY_FOR_INVOICE,
        BookingStatus.INVOICING,
        BookingStatus.INVOICED,
        BookingStatus.PAID,
    ].includes(originalBooking.status));

    const effectiveDate = isTranslation ? (formData.translationDeadline || formData.date) : formData.date;
    const scheduleLabel = effectiveDate
        ? `${effectiveDate}${!isTranslation && formData.startTime ? `, ${formData.startTime}` : ''}`
        : 'No date';

    const returnToEditOrigin = () => {
        if (routeState?.returnTo) {
            navigate(routeState.returnTo, { state: getBookingNavigationStateForReturn(routeState) });
            return;
        }
        navigate(isEditMode && id ? `/admin/bookings/${id}` : '/admin/bookings');
    };

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

    const handleSourceFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0 || !user?.id) return;

        setUploadingFiles(true);
        try {
            const uploadedFiles = await Promise.all(files.map(async file => {
                const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
                const path = `bookings/admin/${user.id}/${Date.now()}_${safeName}`;
                const url = await StorageService.uploadFile(file, path);
                return { name: file.name, url };
            }));
            setFormData(prev => ({ ...prev, sourceFiles: [...prev.sourceFiles, ...uploadedFiles] }));
            showToast(`${uploadedFiles.length} source document${uploadedFiles.length === 1 ? '' : 's'} uploaded`, 'success');
        } catch {
            showToast('Failed to upload one or more source documents', 'error');
        } finally {
            setUploadingFiles(false);
            event.target.value = '';
        }
    };

    const removeSourceFile = (index: number) => {
        setFormData(prev => ({
            ...prev,
            sourceFiles: prev.sourceFiles.filter((_, fileIndex) => fileIndex !== index),
        }));
    };

    const selectServiceType = (serviceType: ServiceType) => {
        setServiceTypeTouched(true);
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
            const shouldPreserveLegacyServiceType = Boolean(
                isEditMode &&
                originalBooking?.serviceType &&
                !serviceTypeTouched &&
                !serviceOptions.includes(originalBooking.serviceType as ServiceType)
            );
            const bookingData: any = {
                ...(isEditMode && originalBooking ? originalBooking : {}),
                costCode: formData.costCode,
                serviceType: shouldPreserveLegacyServiceType ? originalBooking?.serviceType : formData.serviceType,
                languageFrom: formData.languageFrom,
                languageTo: formData.languageTo,
                date: isTranslation ? (formData.translationDeadline || formData.date) : formData.date,
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
                translationDeadline: formData.translationDeadline || (isTranslation ? formData.date : ''),
                quoteRequested: formData.quoteRequested,
                wordCount: Math.max(0, Number(formData.wordCount) || 0),
                numberOfDocs: Math.max(0, Number(formData.numberOfDocs) || 0),
                finalQuote: Math.max(0, Number(formData.finalQuote) || 0),
                sourceFiles: formData.sourceFiles,
                deliveryEmail: formData.deliveryEmail || formData.contactEmail,
                lat: formData.lat,
                lng: formData.lng,
            };

            if (clientSource === 'EXISTING' && (selectedClient || originalBooking?.clientId)) {
                bookingData.clientId = selectedClient?.id || originalBooking?.clientId;
                bookingData.clientName = selectedClient?.companyName || originalBooking?.clientName || formData.organization || 'Registered Client';
                bookingData.clientDepartmentId = selectedClientDepartmentId || null;
                bookingData.clientDepartmentSource = selectedClientDepartmentId ? 'STAFF_MANUAL' : null;
                bookingData.requestedByAgentId = selectedRequesterAgentId || null;
                bookingData.requestedByAgentSource = selectedRequesterAgentId ? 'STAFF_MANUAL' : null;
                bookingData.requestedByUserId = selectedRequesterAgentId
                    ? selectedRequesterMembership?.userId || clientHierarchy?.agents.find(agent => agent.id === selectedRequesterAgentId)?.userId || null
                    : null;
                bookingData.guestContact = {
                    name: formData.contactName || selectedClient?.contactPerson || originalBooking?.guestContact?.name || '',
                    email: formData.contactEmail || selectedClient?.email || originalBooking?.guestContact?.email || '',
                    phone: formData.contactPhone,
                    organisation: selectedClient?.companyName || originalBooking?.clientName || formData.organization,
                };
            } else {
                bookingData.clientName = formData.organization || 'Guest Client';
                bookingData.clientId = '';
                bookingData.clientDepartmentId = null;
                bookingData.requestedByAgentId = null;
                bookingData.guestContact = {
                    name: formData.contactName,
                    email: formData.contactEmail,
                    phone: formData.contactPhone,
                    organisation: formData.organization,
                };
            }

            if (!isEditMode && selectedInterpreter) {
                bookingData.interpreterId = selectedInterpreter.id;
                bookingData.interpreterName = selectedInterpreter.name;
                bookingData.interpreterPhotoUrl = selectedInterpreter.photoUrl || originalBooking?.interpreterPhotoUrl || null;
            }

            if (isEditMode) {
                const targetClientId = clientSource === 'EXISTING'
                    ? selectedClient?.id || originalBooking?.clientId || ''
                    : '';
                const hierarchyChanged = targetClientId !== (originalBooking?.clientId || '')
                    || selectedClientDepartmentId !== (originalBooking?.clientDepartmentId || '')
                    || selectedRequesterAgentId !== (originalBooking?.requestedByAgentId || '');
                if (hierarchyChanged) {
                    if (!targetClientId) {
                        showToast('Existing bookings must be linked to a canonical client. Use the public intake workflow for guest requests.', 'error');
                        return;
                    }
                    const hierarchyPreview = await ClientIdentityAuditService.getClientBookingHierarchyRepairPreview(id!);
                    if (hierarchyPreview.requiresFinanceReview) {
                        showToast('This job is already linked to an invoice. Repair its client scope from Client Identity Audit so finance is revalidated.', 'error');
                        return;
                    }
                    await ClientIdentityAuditService.repairClientBookingHierarchy({
                        bookingId: id!,
                        clientId: targetClientId,
                        clientDepartmentId: selectedClientDepartmentId || undefined,
                        requestedByAgentId: selectedRequesterAgentId || undefined,
                        expectedBookingFingerprint: hierarchyPreview.hierarchyFingerprint,
                        reason: 'Staff updated the booking hierarchy in the booking editor.',
                    });
                }
                delete bookingData.id;
                delete bookingData.interpreterId;
                delete bookingData.interpreterName;
                delete bookingData.interpreterPhotoUrl;
                delete bookingData.offeredInterpreterIds;
                if (clientSource === 'EXISTING') {
                    delete bookingData.clientId;
                    delete bookingData.clientName;
                }
                delete bookingData.clientDepartmentId;
                delete bookingData.clientDepartmentSource;
                delete bookingData.requestedByAgentId;
                delete bookingData.requestedByAgentSource;
                delete bookingData.requestedByUserId;
                delete bookingData.clientSnapshot;
                delete bookingData.clientIdentityStatus;
                delete bookingData.requesterIdentityStatus;
                delete bookingData.lastHierarchyRepairManifestId;
                await BookingService.update(id!, bookingData);

                const previousInterpreterId = originalBooking?.interpreterId || null;
                const nextInterpreterId = selectedInterpreter?.id || null;
                if (interpreterTouched && previousInterpreterId !== nextInterpreterId) {
                    if (nextInterpreterId) {
                        await BookingService.assignInterpreterToBooking(id!, nextInterpreterId);
                    } else if (previousInterpreterId) {
                        await BookingService.unassignInterpreterFromBooking(id!, 'Removed in booking editor');
                    }
                }
                showToast('Booking updated successfully', 'success');
                returnToEditOrigin();
            } else {
                bookingData.createdAt = new Date().toISOString();
                bookingData.sourceSystem = 'STAFF_MANUAL';
                bookingData.syncStatus = 'LOCAL_ONLY';
                await BookingService.create(bookingData);
                showToast('Booking created successfully', 'success');
                navigate(routeState?.returnTo || '/admin/bookings');
            }
        } catch {
            showToast(isEditMode ? 'Failed to update booking' : 'Failed to create booking', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteBooking = async () => {
        if (!isEditMode || !id || !originalBooking) return;
        const reference = originalBooking.displayRef || originalBooking.jobNumber || originalBooking.bookingRef || id;
        const ok = await confirm({
            title: 'Delete Job Permanently',
            message: `This will permanently delete ${reference} and direct assignments, timesheets and job events. Use this only for mock/test records or imports created by mistake.`,
            confirmLabel: 'Delete Permanently',
            variant: 'danger',
        });
        if (!ok) return;

        setLoading(true);
        try {
            await BookingService.delete(id);
            showToast('Job deleted permanently', 'success');
            navigate(routeState?.parentReturnTo || routeState?.returnTo || '/admin/bookings');
        } catch {
            showToast('Failed to delete job', 'error');
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
            <BookingRecordHeader
                title={isEditMode ? 'Booking record' : 'New booking record'}
                reference={originalBooking?.displayRef || originalBooking?.jobNumber || originalBooking?.bookingRef || 'Draft'}
                subtitle={selectedClientLabel}
                status={originalBooking?.status}
                backLabel={routeState?.returnLabel || (isEditMode ? 'Booking record' : 'Job Centre')}
                onBack={returnToEditOrigin}
                actions={
                    <>
                        {isEditMode && (
                            <Button type="button" variant="ghost" icon={Trash2} onClick={handleDeleteBooking} disabled={loading} className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30">
                                Delete job
                            </Button>
                        )}
                        <Button type="button" variant="secondary" onClick={returnToEditOrigin}>Cancel</Button>
                        <Button type="submit" icon={Save} isLoading={loading} disabled={loading || requiredMissing}>
                            {isEditMode ? 'Save changes' : 'Create booking'}
                        </Button>
                    </>
                }
            />

            <div className="mx-auto max-w-[1600px] space-y-4 p-3 sm:p-5 lg:p-6">
                {isEditMode && originalBooking?.sourceSystem === 'AIRTABLE' && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
                        Airtable mirror job. Saving changes preserves the Airtable source record, legacy references and sync metadata while updating Lingland operational fields.
                    </div>
                )}

                <BookingMetricsBand>
                        <MetricCell icon={Building2} label="Requester" value={selectedClientLabel} tone={hasClient ? 'default' : 'warning'} />
                        <MetricCell icon={Globe2} label="Language" value={formData.languageTo ? `${formData.languageFrom} to ${formData.languageTo}` : 'Missing language'} tone={hasLanguage ? 'default' : 'warning'} />
                        <MetricCell icon={CalendarDays} label={isTranslation ? 'Deadline' : 'Schedule'} value={scheduleLabel} tone={hasSchedule ? 'default' : 'warning'} />
                        <MetricCell icon={MapPin} label="Location" value={locationLabel} tone={hasLocation ? 'default' : 'warning'} />
                        <MetricCell icon={UserCheck} label="Assignment" value={selectedInterpreter?.name || `${matchingInterpreters.length} possible`} tone={selectedInterpreter ? 'success' : 'default'} />
                </BookingMetricsBand>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
                    <main className="space-y-4">
                        <Section
                            title="Requester"
                            icon={Building2}
                            action={
                                <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-950">
                                    <SegmentedButton
                                        active={clientSource === 'GUEST'}
                                        disabled={isEditMode && Boolean(originalBooking?.clientId)}
                                        onClick={() => {
                                            setClientSource('GUEST');
                                            setSelectedClient(null);
                                            setSelectedClientDepartmentId('');
                                            setSelectedRequesterAgentId('');
                                        }}
                                    >
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
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{selectedClient.companyName}</p>
                                                            <p className="truncate text-xs text-slate-500">{selectedClient.contactPerson} - {selectedClient.email}</p>
                                                        </div>
                                                        <Button type="button" size="sm" variant="outline" onClick={() => setClientModalOpen(true)}>Change</Button>
                                                    </div>
                                                    {clientHierarchyError && <p className="text-xs font-semibold text-red-600 dark:text-red-300">{clientHierarchyError}</p>}
                                                    {clientHierarchyLoading && !clientHierarchy ? (
                                                        <div className="flex h-10 items-center gap-2 text-xs text-slate-500"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />Loading departments and agents...</div>
                                                    ) : clientHierarchy ? (
                                                        <div className="grid gap-3 border-t border-slate-200 pt-3 dark:border-slate-800 md:grid-cols-2">
                                                            <Field label="Department">
                                                                <select
                                                                    className={inputClass}
                                                                    value={selectedClientDepartmentId}
                                                                    onChange={event => {
                                                                        setSelectedClientDepartmentId(event.target.value);
                                                                        setSelectedRequesterAgentId('');
                                                                    }}
                                                                >
                                                                    <option value="">Organisation-wide / not established</option>
                                                                    {clientHierarchy.departments.filter(item => item.status === 'ACTIVE').map(department => (
                                                                        <option key={department.id} value={department.id}>{department.name}</option>
                                                                    ))}
                                                                </select>
                                                            </Field>
                                                            <Field label="Requesting agent">
                                                                <select
                                                                    className={inputClass}
                                                                    value={selectedRequesterAgentId}
                                                                    onChange={event => {
                                                                        const agentId = event.target.value;
                                                                        setSelectedRequesterAgentId(agentId);
                                                                        const agent = clientHierarchy.agents.find(item => item.id === agentId);
                                                                        if (agent) setFormData(previous => ({ ...previous, contactName: agent.displayName, contactEmail: agent.email }));
                                                                    }}
                                                                >
                                                                    <option value="">Unknown / not established</option>
                                                                    {requesterAgentOptions.map(agent => (
                                                                        <option key={agent.id} value={agent.id}>{agent.displayName} - {agent.email}</option>
                                                                    ))}
                                                                </select>
                                                            </Field>
                                                        </div>
                                                    ) : null}
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

                        <Section title={isTranslation ? 'Service' : 'Service and schedule'} icon={SlidersHorizontal}>
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

                                <div className={`grid gap-3 ${isTranslation ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
                                    <Field label="From">
                                        <input className={inputClass} value={formData.languageFrom} onChange={e => setFormData({ ...formData, languageFrom: e.target.value })} />
                                    </Field>
                                    <Field label="To">
                                        <input list="availableLanguages" className={inputClass} value={formData.languageTo} onChange={e => setFormData({ ...formData, languageTo: e.target.value })} placeholder="Required" />
                                        <datalist id="availableLanguages">
                                            {availableLanguages.map(language => <option key={language} value={language} />)}
                                        </datalist>
                                    </Field>
                                    {!isTranslation && (
                                        <Field label="Gender">
                                            <select className={inputClass} value={formData.genderPreference} onChange={e => setFormData({ ...formData, genderPreference: e.target.value as any })}>
                                                {genderOptions.map(option => <option key={option} value={option}>{option}</option>)}
                                            </select>
                                        </Field>
                                    )}
                                    <Field label="Matches">
                                        <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                            {formData.languageTo ? `${matchingInterpreters.length} active` : 'Choose language'}
                                        </div>
                                    </Field>
                                </div>

                                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                                    <div className={`grid gap-3 ${isTranslation ? '' : 'md:grid-cols-3'}`}>
                                        <Field label={isTranslation ? 'Delivery deadline' : 'Date'}>
                                            <input
                                                type="date"
                                                className={inputClass}
                                                value={isTranslation ? (formData.translationDeadline || formData.date) : formData.date}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    date: e.target.value,
                                                    ...(isTranslation ? { translationDeadline: e.target.value } : {}),
                                                })}
                                            />
                                        </Field>
                                        {!isTranslation && (
                                            <>
                                                <Field label="Start">
                                                    <div className="relative">
                                                        <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                        <input type="time" className={`${inputClass} pl-8`} value={formData.startTime} onChange={e => setFormData({ ...formData, startTime: e.target.value })} />
                                                    </div>
                                                </Field>
                                                <Field label="Duration">
                                                    <input type="number" min={15} step={15} className={inputClass} value={formData.durationMinutes} onChange={e => setFormData({ ...formData, durationMinutes: Number(e.target.value) })} />
                                                </Field>
                                            </>
                                        )}
                                    </div>

                                    {isTranslation ? (
                                        <div className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                            <FileText size={15} className="text-blue-600" /> Document delivery workflow
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-950">
                                            <SegmentedButton active={effectiveLocationType === 'ONSITE'} disabled={isRemoteService} icon={MapPin} onClick={() => setFormData({ ...formData, locationType: 'ONSITE' })}>
                                                On-site
                                            </SegmentedButton>
                                            <SegmentedButton active={effectiveLocationType === 'ONLINE'} icon={Video} onClick={() => setFormData({ ...formData, locationType: 'ONLINE' })}>
                                                Remote
                                            </SegmentedButton>
                                        </div>
                                    )}
                                </div>

                                {!isTranslation && (effectiveLocationType === 'ONLINE' ? (
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
                                ))}
                            </div>
                        </Section>

                        {isTranslation && (
                            <Section title="Translation delivery" icon={FileText}>
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <Field label="Word count">
                                        <input type="number" min={0} step={1} className={inputClass} value={formData.wordCount || ''} onChange={e => setFormData({ ...formData, wordCount: Number(e.target.value) || 0 })} placeholder="0" />
                                    </Field>
                                    <Field label="Number of documents">
                                        <input type="number" min={0} step={1} className={inputClass} value={formData.numberOfDocs || ''} onChange={e => setFormData({ ...formData, numberOfDocs: Number(e.target.value) || 0 })} placeholder="0" />
                                    </Field>
                                    <Field label="Final quote (GBP)">
                                        <input type="number" min={0} step="0.01" className={inputClass} value={formData.finalQuote || ''} onChange={e => setFormData({ ...formData, finalQuote: Number(e.target.value) || 0 })} placeholder="0.00" />
                                    </Field>
                                    <Field label="Delivery email">
                                        <input type="email" className={inputClass} value={formData.deliveryEmail} onChange={e => setFormData({ ...formData, deliveryEmail: e.target.value })} placeholder="delivery@example.com" />
                                    </Field>
                                    <div className="md:col-span-2 xl:col-span-3">
                                    <Field label="Format">
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            {translationFormats.map(format => (
                                                <SegmentedButton key={format} active={formData.translationFormat === format} onClick={() => setFormData({ ...formData, translationFormat: format })}>
                                                    {format}
                                                </SegmentedButton>
                                            ))}
                                        </div>
                                    </Field>
                                    </div>
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

                                <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="text-sm font-semibold text-slate-950 dark:text-white">Source documents</p>
                                            <p className="text-xs text-slate-500">PDF, Word, spreadsheet or image files supplied for translation.</p>
                                        </div>
                                        <label className={`inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 ${uploadingFiles ? 'pointer-events-none opacity-50' : ''}`}>
                                            <Upload size={14} />
                                            {uploadingFiles ? 'Uploading...' : 'Add documents'}
                                            <input
                                                type="file"
                                                multiple
                                                className="hidden"
                                                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,image/*"
                                                onChange={handleSourceFileUpload}
                                                disabled={uploadingFiles}
                                            />
                                        </label>
                                    </div>
                                    {formData.sourceFiles.length > 0 ? (
                                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                                            {formData.sourceFiles.map((file, index) => {
                                                const name = typeof file === 'string' ? `Document ${index + 1}` : file.name || `Document ${index + 1}`;
                                                const url = typeof file === 'string' ? file : file.url;
                                                return (
                                                    <div key={`${name}-${index}`} className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                                                        <FileText size={14} className="shrink-0 text-blue-600" />
                                                        {url ? (
                                                            <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs font-semibold text-blue-600 hover:underline">{name}</a>
                                                        ) : (
                                                            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{name}</span>
                                                        )}
                                                        <button type="button" onClick={() => removeSourceFile(index)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30" aria-label={`Remove ${name}`}>
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">No source documents attached.</p>
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
                                <ChecklistItem done={hasSchedule} label={isTranslation ? 'Deadline' : 'Schedule'} value={scheduleLabel} />
                                <ChecklistItem done={hasLocation} label="Location" value={locationLabel} />
                            </div>
                        </Section>

                        <Section
                            title={isTranslation ? 'Translator assignment' : 'Interpreter assignment'}
                            icon={UserPlus}
                            action={assignmentLocked ? (
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-300">Locked</span>
                            ) : undefined}
                        >
                            <div className="space-y-3">
                                {selectedInterpreter ? (
                                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-emerald-950 dark:text-emerald-100">{selectedInterpreter.name}</p>
                                                <p className="truncate text-xs text-emerald-700 dark:text-emerald-300">{(selectedInterpreter.languages || []).slice(0, 4).join(', ')}</p>
                                            </div>
                                            {!assignmentLocked && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedInterpreter(null);
                                                        setInterpreterTouched(true);
                                                    }}
                                                    className="rounded-md p-1 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                                                    aria-label={`Remove ${isTranslation ? 'translator' : 'interpreter'}`}
                                                >
                                                    <X size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                                        Assignment pool: {matchingInterpreters.length} active matches
                                    </div>
                                )}

                                {assignmentLocked ? (
                                    <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                                        Assignment is locked after the claim or finance handoff. Reopen the workflow before changing the professional.
                                    </p>
                                ) : (
                                    <>
                                        <div className="relative">
                                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input className={`${inputClass} pl-9`} value={searchingInterpreter} onChange={e => setSearchingInterpreter(e.target.value)} placeholder={`Search ${isTranslation ? 'translator' : 'interpreter'} or language`} />
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
                                                            setInterpreterTouched(true);
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
                                    </>
                                )}
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
                                    const clientChanged = selectedClient?.id !== client.id;
                                    setSelectedClient(client);
                                    if (clientChanged) {
                                        setSelectedClientDepartmentId('');
                                        setSelectedRequesterAgentId('');
                                    }
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
                    {matchingClientsForModal.length > filteredClientsForModal.length && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">Showing the first {filteredClientsForModal.length} of {matchingClientsForModal.length} clients. Refine the search to find a specific account.</p>
                    )}
                </div>
            </Modal>
        </form>
    );
};
