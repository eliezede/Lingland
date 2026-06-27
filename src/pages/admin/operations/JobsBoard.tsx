import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    ArrowDownAZ,
    ArrowUpDown,
    ArrowUpRight,
    Building2,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    Copy,
    Eye,
    EyeOff,
    FileText,
    Filter,
    Globe2,
    GripVertical,
    Group,
    LayoutGrid,
    MapPin,
    Maximize2,
    MoreHorizontal,
    Pencil,
    Plus,
    RefreshCw,
    Receipt,
    Search,
    Settings,
    SlidersHorizontal,
    Trash2,
    UserCheck,
    UserPlus,
    Video,
    X,
    XCircle,
} from 'lucide-react';
import { useBookings } from '../../../hooks/useBookings';
import { useAuth } from '../../../context/AuthContext';
import { useClients } from '../../../context/ClientContext';
import { useBookingViews } from '../../../hooks/useBookingViews';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge } from '../../../components/StatusBadge';
import { BulkActionBar } from '../../../components/ui/BulkActionBar';
import { ContextMenu, ContextMenuItem } from '../../../components/ui/ContextMenu';
import { Booking, BookingStatus, ServiceCategory } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { BillingService, BookingService } from '../../../services/api';
import { createDependencies } from '../../../ui/actions';
import { InterpreterAllocationDrawer } from '../../../components/operations/InterpreterAllocationDrawer';
import { InterpreterPreviewDrawer } from '../../../components/operations/InterpreterPreviewDrawer';
import { filterBookings } from '../../../utils/bookingFilters';
import { ViewManagerDrawer } from '../../../components/operations/ViewManagerDrawer';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { useConfirm } from '../../../context/ConfirmContext';

type QuickFilter = 'ALL' | 'INTERPRETING' | 'TRANSLATIONS' | 'OVERDUE' | 'TODAY' | 'UNASSIGNED' | 'COMPLETED' | 'TIMESHEET' | 'INVOICE_READY' | 'AWAITING_PAYMENT' | 'CANCELLED';
type SortField = 'bookingRef' | 'status' | 'date' | 'client' | 'language' | 'interpreter' | 'serviceCategory';
type GroupField = 'none' | 'view' | 'status' | 'date' | 'client' | 'interpreter' | 'serviceCategory';
type ToolPanel = 'hide' | 'filter' | 'group' | 'sort' | null;

interface GridColumn {
    id: string;
    label: string;
    width: string;
    icon: React.ElementType;
    primary?: boolean;
    render: (job: Booking) => React.ReactNode;
    getSortValue?: (job: Booking) => string | number;
}

const terminalStatuses = new Set<string>([
    BookingStatus.CANCELLED,
    BookingStatus.INVOICED,
    BookingStatus.PAID,
]);

const invoiceWorkStatuses = [BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING];

const formatDate = (date?: string, options?: Intl.DateTimeFormatOptions) => {
    if (!date) return 'No date';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString('en-GB', options || { weekday: 'short', day: '2-digit', month: 'short' });
};

const getDayDiff = (date?: string) => {
    if (!date) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const jobDate = new Date(date);
    jobDate.setHours(0, 0, 0, 0);
    return Math.round((jobDate.getTime() - today.getTime()) / 86400000);
};

const getTimingMeta = (job: Booking) => {
    const diff = getDayDiff(job.date);
    const isOpen = !terminalStatuses.has(job.status);
    if (diff < 0 && isOpen) return { label: `${Math.abs(diff)}d overdue`, tone: 'danger', bar: 'bg-red-500' };
    if (diff === 0) return { label: 'Today', tone: 'warning', bar: 'bg-amber-500' };
    if (diff === 1) return { label: 'Tomorrow', tone: 'info', bar: 'bg-blue-500' };
    return { label: formatDate(job.date), tone: 'neutral', bar: 'bg-slate-300 dark:bg-slate-700' };
};

const getNextAction = (job: Booking) => {
    if ([BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT].includes(job.status)) return 'Assign interpreter';
    if ([BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(job.status) && !job.interpreterId) return 'Assign interpreter';
    if ([BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(job.status) && job.interpreterId) return 'Record response';
    if (job.status === BookingStatus.BOOKED) return 'Mark completed';
    if (job.status === BookingStatus.SESSION_COMPLETED) return 'Record timesheet';
    if (job.status === BookingStatus.TIMESHEET_SUBMITTED) return 'Verify timesheet';
    if (invoiceWorkStatuses.includes(job.status)) return 'Mark invoiced';
    if (job.status === BookingStatus.INVOICED) return 'Mark paid';
    if (job.status === BookingStatus.PAID) return 'Complete';
    if (job.status === BookingStatus.CANCELLED) return 'Cancelled';
    return 'Review';
};

const isTranslationJob = (job: Booking) => job.serviceCategory === ServiceCategory.TRANSLATION;

const getProfessionalLabel = (job: Booking) => isTranslationJob(job) ? 'Translator' : 'Interpreter';

const applyQuickFilter = (jobs: Booking[], filter: QuickFilter) => {
    switch (filter) {
        case 'INTERPRETING':
            return jobs.filter(job => job.serviceCategory !== ServiceCategory.TRANSLATION);
        case 'TRANSLATIONS':
            return jobs.filter(job => job.serviceCategory === ServiceCategory.TRANSLATION);
        case 'OVERDUE':
            return jobs.filter(job => getDayDiff(job.date) < 0 && !terminalStatuses.has(job.status));
        case 'TODAY':
            return jobs.filter(job => getDayDiff(job.date) === 0 && !terminalStatuses.has(job.status));
        case 'UNASSIGNED':
            return jobs.filter(job => [BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT, BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(job.status) && !job.interpreterId);
        case 'TIMESHEET':
            return jobs.filter(job => job.status === BookingStatus.TIMESHEET_SUBMITTED);
        case 'COMPLETED':
            return jobs.filter(job => job.status === BookingStatus.SESSION_COMPLETED);
        case 'INVOICE_READY':
            return jobs.filter(job => invoiceWorkStatuses.includes(job.status));
        case 'AWAITING_PAYMENT':
            return jobs.filter(job => job.status === BookingStatus.INVOICED);
        case 'CANCELLED':
            return jobs.filter(job => job.status === BookingStatus.CANCELLED);
        default:
            return jobs;
    }
};

const DetailLabel = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
        <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{value}</div>
    </div>
);

const ToolButton = ({
    icon: Icon,
    label,
    active,
    onClick,
}: {
    icon: React.ElementType;
    label: string;
    active?: boolean;
    onClick: () => void;
}) => (
    <button
        onClick={onClick}
        className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition-colors ${
            active
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                : 'border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
    >
        <Icon size={15} />
        <span className="hidden sm:inline">{label}</span>
    </button>
);

const FilterChip = ({
    label,
    count,
    active,
    onClick,
}: {
    label: string;
    count: number;
    active: boolean;
    onClick: () => void;
}) => (
    <button
        onClick={onClick}
        className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition-colors ${
            active
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/30'
        }`}
    >
        <span>{label}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
            {count}
        </span>
    </button>
);

export const JobsBoard = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { getClientCompany } = useClients();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { bookings = [], loading, refresh } = useBookings();
    const { views, activeView, setActiveViewId } = useBookingViews(user?.id || '');
    const actionsDeps = createDependencies((user as any)?.organizationId || 'lingland-main');

    const [selectedJob, setSelectedJob] = useState<Booking | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isBulkLoading, setIsBulkLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [quickFilter, setQuickFilter] = useState<QuickFilter>('ALL');
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [groupField, setGroupField] = useState<GroupField>('view');
    const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set(['contact']));
    const [activeToolPanel, setActiveToolPanel] = useState<ToolPanel>(null);
    const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null);
    const [isAllocationOpen, setIsAllocationOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [targetInterpreterId, setTargetInterpreterId] = useState<string | null>(null);
    const [isViewManagerOpen, setIsViewManagerOpen] = useState(false);
    const [editingViewId, setEditingViewId] = useState<string | null>(null);
    const [isViewsMenuOpen, setIsViewsMenuOpen] = useState(false);
    const [viewSearchQuery, setViewSearchQuery] = useState('');
    const viewsMenuRef = useRef<HTMLDivElement>(null);
    const toolsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (viewsMenuRef.current && !viewsMenuRef.current.contains(target)) setIsViewsMenuOpen(false);
            if (toolsRef.current && !toolsRef.current.contains(target)) {
                setActiveToolPanel(null);
                setActiveColumnMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getCompanyName = (job: Booking) => getClientCompany(job.clientId, job.guestContact?.organisation || job.clientName);

    const openJobDetails = (job: Booking) => {
        navigate(`/admin/bookings/${job.id}`, {
            state: { returnTo: '/admin/bookings', returnLabel: 'Jobs Board' },
        });
    };

    const openEditJob = (job: Booking) => {
        navigate(`/admin/bookings/edit/${job.id}`, {
            state: { returnTo: '/admin/bookings', returnLabel: 'Jobs Board' },
        });
    };

    const handleAssignClick = (e: React.MouseEvent, job: Booking) => {
        e.stopPropagation();
        setSelectedJob(job);
        setIsAllocationOpen(true);
    };

    const handleInterpreterPreview = (e: React.MouseEvent, job: Booking) => {
        e.stopPropagation();
        setSelectedJob(job);
        setTargetInterpreterId(job.interpreterId || null);
        setIsPreviewOpen(true);
    };

    const columns = useMemo<GridColumn[]>(() => [
        {
            id: 'jobNumber',
            label: 'Job Number',
            width: '132px',
            icon: FileText,
            primary: true,
            getSortValue: job => job.displayRef || job.jobNumber || job.bookingRef || job.id,
            render: job => {
                const timing = getTimingMeta(job);
                const reference = job.displayRef || job.jobNumber || job.bookingRef || job.id.slice(0, 8);
                return (
                    <div className="flex min-w-0 items-center gap-2">
                        <div className={`h-8 w-1 rounded-full ${timing.bar}`} />
                        <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-950 dark:text-white">{reference}</p>
                            {timing.tone !== 'neutral' && <p className="truncate text-[10px] font-semibold uppercase text-slate-500">{timing.label}</p>}
                        </div>
                    </div>
                );
            },
        },
        {
            id: 'status',
            label: 'Status',
            width: '178px',
            icon: CheckCircle2,
            getSortValue: job => job.status,
            render: job => (
                <div className="min-w-0 max-w-full overflow-hidden">
                    <StatusBadge status={job.status} />
                </div>
            ),
        },
        {
            id: 'bookedFor',
            label: 'Booked For',
            width: '152px',
            icon: Clock,
            getSortValue: job => `${job.date || ''} ${job.startTime || ''}`,
            render: job => (
                <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950 dark:text-white">{formatDate(job.date)}</p>
                    <p className="truncate text-xs font-semibold text-blue-600 dark:text-blue-400">{job.startTime || 'TBC'}</p>
                </div>
            ),
        },
        {
            id: 'client',
            label: 'Client',
            width: 'minmax(180px, 1.35fr)',
            icon: Building2,
            getSortValue: job => getCompanyName(job),
            render: job => (
                <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950 dark:text-white">{getCompanyName(job)}</p>
                    <p className="truncate text-xs text-slate-500">{job.guestContact?.name || (job as any).contactName || 'No contact'}</p>
                </div>
            ),
        },
        {
            id: 'language',
            label: 'Language',
            width: 'minmax(150px, .9fr)',
            icon: Globe2,
            getSortValue: job => `${job.languageFrom || ''} ${job.languageTo || ''}`,
            render: job => (
                <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{job.languageFrom} to {job.languageTo}</p>
                    <p className="truncate text-xs uppercase text-slate-500">{job.locationType || 'Session'}</p>
                </div>
            ),
        },
        {
            id: 'interpreter',
            label: 'Professional',
            width: 'minmax(150px, .9fr)',
            icon: UserCheck,
            getSortValue: job => job.interpreterName || '',
            render: job => (
                job.interpreterId ? (
                    <button
                        onClick={(e) => handleInterpreterPreview(e, job)}
                        className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    >
                        <UserAvatar name={job.interpreterName || 'Professional'} src={job.interpreterPhotoUrl} size="xs" />
                        <span className="truncate text-xs font-semibold text-blue-700 dark:text-blue-300">{job.interpreterName || 'Professional'}</span>
                    </button>
                ) : (
                    <button
                        onClick={(e) => handleAssignClick(e, job)}
                        className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold uppercase text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
                    >
                        <UserPlus size={12} className="mr-1.5" />
                        Assign {isTranslationJob(job) ? 'TR' : ''}
                    </button>
                )
            ),
        },
        {
            id: 'location',
            label: 'Location',
            width: 'minmax(150px, .8fr)',
            icon: MapPin,
            render: job => (
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center font-semibold text-slate-900 dark:text-slate-100">
                        {job.locationType === 'ONLINE' ? <Video size={14} className="mr-1.5 shrink-0 text-indigo-500" /> : <MapPin size={14} className="mr-1.5 shrink-0 text-red-500" />}
                        <span className="truncate">{job.locationType === 'ONLINE' ? 'Remote' : (job.postcode || 'TBD')}</span>
                    </div>
                    <p className="truncate text-xs text-slate-500">{job.locationType === 'ONLINE' ? job.onlineLink || 'Online' : job.address || job.location || 'On-site'}</p>
                </div>
            ),
        },
        {
            id: 'service',
            label: 'Service',
            width: '140px',
            icon: SlidersHorizontal,
            getSortValue: job => `${job.serviceCategory || ''} ${job.serviceType || ''}`,
            render: job => (
                <div className="min-w-0">
                    <span className={`inline-flex max-w-full rounded-full px-2 py-1 text-[10px] font-black uppercase ${isTranslationJob(job) ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'}`}>
                        <span className="truncate">{isTranslationJob(job) ? 'Translation' : 'Interpreting'}</span>
                    </span>
                    <p className="mt-1 truncate text-xs text-slate-500">{job.serviceType || '-'}</p>
                </div>
            ),
        },
        {
            id: 'duration',
            label: 'Volume',
            width: '120px',
            icon: Clock,
            getSortValue: job => isTranslationJob(job) ? ((job as any).wordCount || 0) : (job.durationMinutes || 0),
            render: job => (
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {isTranslationJob(job) ? `${(job as any).wordCount || '-'} words` : `${job.durationMinutes || '-'} min`}
                    </p>
                    {isTranslationJob(job) && <p className="truncate text-xs text-slate-500">{(job as any).numberOfDocs || '-'} docs</p>}
                </div>
            ),
        },
        {
            id: 'contact',
            label: 'Contact',
            width: 'minmax(150px, .8fr)',
            icon: Building2,
            getSortValue: job => job.guestContact?.name || (job as any).contactName || '',
            render: job => <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{job.guestContact?.name || (job as any).contactName || 'No contact'}</span>,
        },
        {
            id: 'action',
            label: 'Action',
            width: '116px',
            icon: ArrowUpRight,
            render: job => {
                if ([BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT].includes(job.status)) {
                    return <Button size="sm" variant="secondary" icon={UserPlus} onClick={(e) => handleAssignClick(e, job)}>Assign</Button>;
                }
                if (!job.interpreterId && [BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING, BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT].includes(job.status)) {
                    return <Button size="sm" variant="secondary" icon={UserPlus} onClick={(e) => handleAssignClick(e, job)}>Assign</Button>;
                }
                if (job.status === BookingStatus.TIMESHEET_SUBMITTED) {
                    return <Button size="sm" variant="secondary" icon={FileText} onClick={(e) => { e.stopPropagation(); handleVerifyTimesheet(job); }}>Verify</Button>;
                }
                if ([BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(job.status) && job.interpreterId) {
                    return <Button size="sm" variant="secondary" icon={CheckCircle2} onClick={(e) => { e.stopPropagation(); handleRecordInterpreterResponse(job, true); }}>Accepted</Button>;
                }
                if (job.status === BookingStatus.BOOKED) {
                    return <Button size="sm" variant="secondary" icon={CheckCircle2} onClick={(e) => { e.stopPropagation(); handleRecordSessionCompleted(job); }}>{isTranslationJob(job) ? 'Delivered' : 'Complete'}</Button>;
                }
                if (job.status === BookingStatus.SESSION_COMPLETED) {
                    return <Button size="sm" variant="secondary" icon={FileText} onClick={(e) => { e.stopPropagation(); handleRecordManualTimesheet(job); }}>Timesheet</Button>;
                }
                if (invoiceWorkStatuses.includes(job.status)) {
                    return <Button size="sm" variant="secondary" icon={Receipt} onClick={(e) => { e.stopPropagation(); handleRecordInvoiceIssued(job); }}>Invoice</Button>;
                }
                if (job.status === BookingStatus.INVOICED) {
                    return <Button size="sm" variant="secondary" icon={Receipt} onClick={(e) => { e.stopPropagation(); handleRecordPaymentReceived(job); }}>Paid</Button>;
                }
                return <Button size="sm" variant="ghost" icon={ArrowUpRight} onClick={(e) => { e.stopPropagation(); openJobDetails(job); }}>Open</Button>;
            },
        },
    ], [getClientCompany]);

    const visibleColumns = columns.filter(column => column.primary || !hiddenColumns.has(column.id));
    const gridTemplateColumns = `44px ${visibleColumns.map(column => column.width).join(' ')}`;

    const searchFilteredBookings = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return bookings;
        return bookings.filter(b => (
            b.bookingRef?.toLowerCase().includes(query) ||
            b.jobNumber?.toLowerCase().includes(query) ||
            b.displayRef?.toLowerCase().includes(query) ||
            b.legacyAirtableRef?.toLowerCase().includes(query) ||
            b.clientName?.toLowerCase().includes(query) ||
            b.guestContact?.organisation?.toLowerCase().includes(query) ||
            b.guestContact?.name?.toLowerCase().includes(query) ||
            b.languageTo?.toLowerCase().includes(query) ||
            b.languageFrom?.toLowerCase().includes(query) ||
            b.serviceCategory?.toLowerCase().includes(query) ||
            b.serviceType?.toLowerCase().includes(query) ||
            b.interpreterName?.toLowerCase().includes(query) ||
            b.postcode?.toLowerCase().includes(query)
        ));
    }, [bookings, searchQuery]);

    const viewFilteredBookings = useMemo(
        () => filterBookings(searchFilteredBookings, activeView),
        [searchFilteredBookings, activeView]
    );

    const quickCounts = useMemo(() => ({
        ALL: viewFilteredBookings.length,
        INTERPRETING: applyQuickFilter(viewFilteredBookings, 'INTERPRETING').length,
        TRANSLATIONS: applyQuickFilter(viewFilteredBookings, 'TRANSLATIONS').length,
        OVERDUE: applyQuickFilter(viewFilteredBookings, 'OVERDUE').length,
        TODAY: applyQuickFilter(viewFilteredBookings, 'TODAY').length,
        UNASSIGNED: applyQuickFilter(viewFilteredBookings, 'UNASSIGNED').length,
        COMPLETED: applyQuickFilter(viewFilteredBookings, 'COMPLETED').length,
        TIMESHEET: applyQuickFilter(viewFilteredBookings, 'TIMESHEET').length,
        INVOICE_READY: applyQuickFilter(viewFilteredBookings, 'INVOICE_READY').length,
        AWAITING_PAYMENT: applyQuickFilter(viewFilteredBookings, 'AWAITING_PAYMENT').length,
        CANCELLED: applyQuickFilter(viewFilteredBookings, 'CANCELLED').length,
    }), [viewFilteredBookings]);

    const filteredBookings = useMemo(
        () => applyQuickFilter(viewFilteredBookings, quickFilter),
        [viewFilteredBookings, quickFilter]
    );

    const sortedBookings = useMemo(() => {
        const column = columns.find(c => {
            if (sortField === 'bookingRef') return c.id === 'jobNumber';
            if (sortField === 'date') return c.id === 'bookedFor';
            if (sortField === 'client') return c.id === 'client';
            if (sortField === 'language') return c.id === 'language';
            if (sortField === 'interpreter') return c.id === 'interpreter';
            if (sortField === 'serviceCategory') return c.id === 'service';
            return c.id === sortField;
        });
        const getValue = column?.getSortValue || ((job: Booking) => String((job as any)[sortField] || ''));
        return [...filteredBookings].sort((a, b) => {
            const aValue = getValue(a);
            const bValue = getValue(b);
            const result = String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: 'base' });
            return sortDirection === 'asc' ? result : -result;
        });
    }, [filteredBookings, columns, sortField, sortDirection]);

    const totalPages = Math.max(1, Math.ceil(sortedBookings.length / pageSize));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const pageStartIndex = sortedBookings.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize;
    const pageEndIndex = Math.min(pageStartIndex + pageSize, sortedBookings.length);
    const paginatedBookings = useMemo(
        () => sortedBookings.slice(pageStartIndex, pageEndIndex),
        [sortedBookings, pageStartIndex, pageEndIndex]
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, quickFilter, sortField, sortDirection, groupField, activeView.id, pageSize]);

    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [currentPage, totalPages]);

    const groupedRows = useMemo(() => {
        const resolvedGroup = groupField === 'view' ? (activeView.groupBy || 'none') : groupField;
        if (resolvedGroup === 'none') return [{ key: '', rows: paginatedBookings }];
        const groups = new Map<string, Booking[]>();
        paginatedBookings.forEach(job => {
            let key = 'Other';
            if (resolvedGroup === 'status') key = job.status;
            if (resolvedGroup === 'date') key = formatDate(job.date, { weekday: 'long', day: 'numeric', month: 'long' });
            if (resolvedGroup === 'client') key = getCompanyName(job);
            if (resolvedGroup === 'interpreter') key = job.interpreterName || `No ${getProfessionalLabel(job).toLowerCase()} assigned`;
            if (resolvedGroup === 'serviceCategory') key = isTranslationJob(job) ? 'Translation' : 'Interpreting';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(job);
        });
        return Array.from(groups.entries()).map(([key, rows]) => ({ key, rows }));
    }, [paginatedBookings, groupField, activeView.groupBy]);

    const activeFilterCount = (searchQuery ? 1 : 0) + (quickFilter !== 'ALL' ? 1 : 0);

    const toggleColumn = (columnId: string) => {
        setHiddenColumns(prev => {
            const next = new Set(prev);
            if (next.has(columnId)) next.delete(columnId);
            else next.add(columnId);
            return next;
        });
    };

    const clearLocalFilters = () => {
        setSearchQuery('');
        setQuickFilter('ALL');
    };

    const handleRowClick = (job: Booking) => {
        setSelectedJob(job);
        setIsDrawerOpen(true);
    };

    const handleQuickStatusChange = async (job: Booking, status: BookingStatus) => {
        try {
            await BookingService.updateStatus(job.id, status);
            refresh();
            if (selectedJob?.id === job.id) setSelectedJob({ ...job, status });
        } catch {
            showToast('Failed to update job status', 'error');
        }
    };

    const handleVerifyTimesheet = async (job: Booking) => {
        try {
            await BillingService.approveTimesheetByBookingId(job.id);
            refresh();
            if (selectedJob?.id === job.id) setSelectedJob({ ...job, status: BookingStatus.READY_FOR_INVOICE });
            showToast('Timesheet verified and job moved to invoicing', 'success');
        } catch {
            showToast('Failed to verify timesheet', 'error');
        }
    };

    const handleMarkNotExecuted = async (job: Booking) => {
        const ok = await confirm({
            title: 'Mark Job Not Executed',
            message: 'This creates an exception claim for finance review. If the job falls inside the cancellation window it can still be charged and paid after verification.',
            confirmLabel: 'Create Exception',
            variant: 'warning',
        });
        if (!ok) return;

        try {
            await BillingService.createNonExecutedJobClaim(job.id, 'Marked as not executed by operations');
            refresh();
            if (selectedJob?.id === job.id) setSelectedJob({ ...job, status: BookingStatus.TIMESHEET_SUBMITTED });
            showToast('Exception claim created for review', 'success');
        } catch (e: any) {
            showToast(e?.message || 'Failed to create exception claim', 'error');
        }
    };

    const handleRecordInterpreterResponse = async (job: Booking, accepted: boolean) => {
        const ok = await confirm({
            title: accepted ? 'Record Interpreter Acceptance' : 'Record Interpreter Decline',
            message: accepted
                ? 'Use this when the interpreter accepted outside the app. The job will move to booked.'
                : 'Use this when the interpreter declined outside the app. The job will return to the assignment queue.',
            confirmLabel: accepted ? 'Record Accepted' : 'Record Declined',
            variant: accepted ? 'primary' : 'warning',
        });
        if (!ok) return;

        try {
            await BookingService.recordInterpreterResponseByStaff(job.id, accepted);
            refresh();
            if (selectedJob?.id === job.id) {
                setSelectedJob({
                    ...job,
                    status: accepted ? BookingStatus.BOOKED : BookingStatus.NEEDS_ASSIGNMENT,
                    ...(accepted ? {} : { interpreterId: undefined, interpreterName: undefined, interpreterPhotoUrl: undefined })
                });
            }
            showToast(accepted ? 'Interpreter acceptance recorded' : 'Interpreter decline recorded', 'success');
        } catch (e: any) {
            showToast(e?.message || 'Failed to record interpreter response', 'error');
        }
    };

    const handleRecordManualTimesheet = async (job: Booking) => {
        const ok = await confirm({
            title: 'Record Timesheet Received',
            message: 'Use this when the interpreter sent the timesheet outside the app. A claim will be created for finance review.',
            confirmLabel: 'Record Timesheet',
            variant: 'primary',
        });
        if (!ok) return;

        try {
            await BillingService.recordManualTimesheetReceived(job.id);
            refresh();
            if (selectedJob?.id === job.id) setSelectedJob({ ...job, status: BookingStatus.TIMESHEET_SUBMITTED });
            showToast('Timesheet recorded for review', 'success');
        } catch (e: any) {
            showToast(e?.message || 'Failed to record timesheet', 'error');
        }
    };

    const handleRecordSessionCompleted = async (job: Booking) => {
        const ok = await confirm({
            title: 'Record Session Completed',
            message: 'Use this when staff confirmed the session was delivered outside the interpreter app.',
            confirmLabel: 'Mark Completed',
            variant: 'primary',
        });
        if (!ok) return;

        try {
            await BookingService.recordSessionCompletedByStaff(job.id);
            refresh();
            if (selectedJob?.id === job.id) setSelectedJob({ ...job, status: BookingStatus.SESSION_COMPLETED });
            showToast('Session marked as completed', 'success');
        } catch (e: any) {
            showToast(e?.message || 'Failed to mark session completed', 'error');
        }
    };

    const handleRecordInvoiceIssued = async (job: Booking) => {
        const ok = await confirm({
            title: 'Record Invoice Issued',
            message: 'Use this when finance created or sent the invoice outside the platform.',
            confirmLabel: 'Mark Invoiced',
            variant: 'primary',
        });
        if (!ok) return;

        try {
            await BillingService.recordManualInvoiceIssued(job.id);
            refresh();
            if (selectedJob?.id === job.id) setSelectedJob({ ...job, status: BookingStatus.INVOICED });
            showToast('Invoice issued recorded', 'success');
        } catch (e: any) {
            showToast(e?.message || 'Failed to record invoice', 'error');
        }
    };

    const handleRecordPaymentReceived = async (job: Booking) => {
        const ok = await confirm({
            title: 'Record Payment Received',
            message: 'Use this when finance confirmed payment outside the platform.',
            confirmLabel: 'Mark Paid',
            variant: 'primary',
        });
        if (!ok) return;

        try {
            await BillingService.recordManualPaymentReceived(job.id);
            refresh();
            if (selectedJob?.id === job.id) setSelectedJob({ ...job, status: BookingStatus.PAID });
            showToast('Payment received recorded', 'success');
        } catch (e: any) {
            showToast(e?.message || 'Failed to record payment', 'error');
        }
    };

    const handleBulkStatus = async (ids: string[], status: BookingStatus) => {
        setIsBulkLoading(true);
        let done = 0;
        await Promise.allSettled(ids.map(async id => {
            try {
                await BookingService.updateStatus(id, status);
                done += 1;
            } catch {
                // Keep batch moving; the toast reports completed rows.
            }
        }));
        showToast(`${done} job${done !== 1 ? 's' : ''} updated to ${status}`, 'success');
        setSelectedIds([]);
        setIsBulkLoading(false);
        refresh();
    };

    const handleBulkManualStep = async (
        ids: string[],
        label: string,
        action: (job: Booking) => Promise<void>
    ) => {
        const ok = await confirm({
            title: `Bulk ${label}`,
            message: `Apply "${label}" to ${ids.length} selected job${ids.length !== 1 ? 's' : ''}? Jobs that are not in the correct stage will be skipped.`,
            confirmLabel: label,
            variant: 'primary',
        });
        if (!ok) return;

        setIsBulkLoading(true);
        let done = 0;
        const selectedJobs = sortedBookings.filter(job => ids.includes(job.id));
        await Promise.allSettled(selectedJobs.map(async job => {
            try {
                await action(job);
                done += 1;
            } catch {
                // Incorrect-stage jobs are skipped; the final toast reports successes.
            }
        }));
        setSelectedIds([]);
        setIsBulkLoading(false);
        refresh();
        showToast(`${done} job${done !== 1 ? 's' : ''} updated`, done > 0 ? 'success' : 'info');
    };

    const renderContextMenu = (job: Booking): ContextMenuItem[] => [
        { label: 'View Details', icon: Eye, onClick: () => openJobDetails(job) },
        { label: 'Edit Job', icon: Pencil, onClick: () => openEditJob(job) },
        { divider: true as const },
        ...(!job.interpreterId && [BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT, BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(job.status)
            ? [{ label: 'Assign Interpreter', icon: UserPlus, onClick: () => { setSelectedJob(job); setIsAllocationOpen(true); } }]
            : []),
        ...(job.status === BookingStatus.TIMESHEET_SUBMITTED
            ? [{ label: 'Verify Timesheet', icon: FileText, onClick: () => handleVerifyTimesheet(job) }]
            : []),
        ...([BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(job.status) && job.interpreterId
            ? [
                { label: 'Record Accepted', icon: CheckCircle2, onClick: () => handleRecordInterpreterResponse(job, true) },
                { label: 'Record Declined', icon: XCircle, onClick: () => handleRecordInterpreterResponse(job, false) },
            ]
            : []),
        ...(job.status === BookingStatus.BOOKED
            ? [
                { label: 'Mark Completed', icon: CheckCircle2, onClick: () => handleRecordSessionCompleted(job) },
                { label: 'Mark Not Executed', icon: AlertCircle, onClick: () => handleMarkNotExecuted(job) },
            ]
            : []),
        ...(job.status === BookingStatus.SESSION_COMPLETED
            ? [{ label: 'Record Timesheet', icon: FileText, onClick: () => handleRecordManualTimesheet(job) }]
            : []),
        ...(invoiceWorkStatuses.includes(job.status)
            ? [{ label: 'Mark Invoiced', icon: Receipt, onClick: () => handleRecordInvoiceIssued(job) }]
            : []),
        ...(job.status === BookingStatus.INVOICED
            ? [{ label: 'Mark Paid', icon: Receipt, onClick: () => handleRecordPaymentReceived(job) }]
            : []),
        { label: 'Copy Job URL', icon: Copy, onClick: () => navigator.clipboard?.writeText(`${window.location.origin}/#/admin/bookings/${job.id}`) },
        { label: 'Cancel Job', icon: Trash2, variant: 'danger' as const, onClick: () => handleQuickStatusChange(job, BookingStatus.CANCELLED) },
    ];

    const ColumnMenu = ({ column }: { column: GridColumn }) => (
        <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">
                <Pencil size={15} /> Edit field
            </button>
            <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">
                <Copy size={15} /> Duplicate field
            </button>
            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            <button
                onClick={() => { setSortField(column.id === 'jobNumber' ? 'bookingRef' : column.id === 'bookedFor' ? 'date' : column.id === 'service' ? 'serviceCategory' : column.id as SortField); setSortDirection('asc'); setActiveColumnMenu(null); }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                <ArrowDownAZ size={15} /> Sort A to Z
            </button>
            <button
                onClick={() => { setSortField(column.id === 'jobNumber' ? 'bookingRef' : column.id === 'bookedFor' ? 'date' : column.id === 'service' ? 'serviceCategory' : column.id as SortField); setSortDirection('desc'); setActiveColumnMenu(null); }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                <ArrowUpDown size={15} /> Sort Z to A
            </button>
            <button
                onClick={() => { setGroupField(column.id === 'bookedFor' ? 'date' : column.id === 'jobNumber' ? 'none' : column.id === 'service' ? 'serviceCategory' : column.id as GroupField); setActiveColumnMenu(null); }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                <Group size={15} /> Group by this field
            </button>
            <button
                onClick={() => { setQuickFilter(column.id === 'status' ? 'UNASSIGNED' : quickFilter); setActiveColumnMenu(null); }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                <Filter size={15} /> Filter by this field
            </button>
            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            {!column.primary && (
                <button
                    onClick={() => { toggleColumn(column.id); setActiveColumnMenu(null); }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                    <EyeOff size={15} /> Hide field
                </button>
            )}
        </div>
    );

    const ToolPanelContent = () => {
        if (!activeToolPanel) return null;

        if (activeToolPanel === 'hide') {
            return (
                <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                    <p className="mb-2 text-xs font-semibold text-slate-500">Visible fields</p>
                    <div className="space-y-1">
                        {columns.filter(c => !c.primary).map(column => (
                            <button
                                key={column.id}
                                onClick={() => toggleColumn(column.id)}
                                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                <span className="flex items-center gap-2"><column.icon size={14} /> {column.label}</span>
                                {!hiddenColumns.has(column.id) ? <Check size={14} className="text-blue-600" /> : <EyeOff size={14} className="text-slate-400" />}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        if (activeToolPanel === 'filter') {
            return (
                <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                    <p className="mb-2 text-xs font-semibold text-slate-500">Quick filters</p>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            ['ALL', 'All'],
                            ['OVERDUE', 'Overdue'],
                            ['TODAY', 'Today'],
                            ['UNASSIGNED', 'Unassigned'],
                            ['TIMESHEET', 'Timesheets'],
                            ['INVOICE_READY', 'Invoice ready'],
                            ['CANCELLED', 'Cancelled'],
                        ].map(([value, label]) => (
                            <button
                                key={value}
                                onClick={() => setQuickFilter(value as QuickFilter)}
                                className={`rounded-md border px-3 py-2 text-left text-sm font-semibold ${quickFilter === value ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        if (activeToolPanel === 'group') {
            const options: Array<[GroupField, string]> = [['none', 'No grouping'], ['view', 'Use view grouping'], ['status', 'Status'], ['date', 'Booked date'], ['client', 'Client'], ['interpreter', 'Interpreter']];
            return (
                <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                    <p className="mb-2 text-xs font-semibold text-slate-500">Group records</p>
                    <div className="space-y-1">
                        {options.map(([value, label]) => (
                            <button
                                key={value}
                                onClick={() => setGroupField(value)}
                                className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-sm font-semibold ${groupField === value ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                            >
                                {label}
                                {groupField === value && <Check size={14} />}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        const sortOptions: Array<[SortField, string]> = [['date', 'Booked date'], ['bookingRef', 'Job number'], ['status', 'Status'], ['client', 'Client'], ['language', 'Language'], ['interpreter', 'Interpreter']];
        return (
            <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                <p className="mb-2 text-xs font-semibold text-slate-500">Sort records</p>
                <div className="space-y-2">
                    <select
                        value={sortField}
                        onChange={(e) => setSortField(e.target.value as SortField)}
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-950"
                    >
                        {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setSortDirection('asc')} className={`rounded-md border px-3 py-2 text-sm font-semibold ${sortDirection === 'asc' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 dark:border-slate-800'}`}>Ascending</button>
                        <button onClick={() => setSortDirection('desc')} className={`rounded-md border px-3 py-2 text-sm font-semibold ${sortDirection === 'desc' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 dark:border-slate-800'}`}>Descending</button>
                    </div>
                </div>
            </div>
        );
    };

    const renderGridRow = (job: Booking, rowIndex: number) => {
        const selected = selectedIds.includes(job.id);
        const translation = isTranslationJob(job);
        const row = (
            <div
                className={`grid min-h-11 cursor-pointer border-b border-slate-200 text-sm transition-colors dark:border-slate-800 ${selected ? 'bg-blue-50 dark:bg-blue-950/30' : translation ? 'bg-violet-50/35 hover:bg-violet-50 dark:bg-violet-950/10 dark:hover:bg-violet-950/20' : 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60'}`}
                style={{ gridTemplateColumns }}
                onClick={() => handleRowClick(job)}
                onDoubleClick={() => openJobDetails(job)}
            >
                <div className="flex items-center justify-center border-r border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedIds(prev => prev.includes(job.id) ? prev.filter(id => id !== job.id) : [...prev, job.id]);
                        }}
                        className={`flex h-4 w-4 items-center justify-center rounded border ${selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
                        aria-label="Select row"
                    >
                        {selected ? <Check size={11} /> : null}
                    </button>
                    {!selected && <span className="ml-2">{rowIndex + 1}</span>}
                </div>
                {visibleColumns.map(column => (
                    <div key={column.id} className="flex min-w-0 items-center overflow-hidden border-r border-slate-200 px-3 py-2 dark:border-slate-800">
                        {column.render(job)}
                    </div>
                ))}
            </div>
        );

        return (
            <ContextMenu key={job.id} items={renderContextMenu(job)}>
                {row}
            </ContextMenu>
        );
    };

    return (
        <div className="flex min-h-[calc(100vh-8rem)] flex-col bg-slate-100 dark:bg-slate-950">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-100 pb-3 dark:border-slate-800 dark:bg-slate-950 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Jobs Board</h1>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            {sortedBookings.length} of {bookings.length}
                        </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">Grid workspace for requests, assignments, delivery and billing handoff.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={refresh} icon={RefreshCw} variant="secondary" size="sm">Refresh</Button>
                    <Button onClick={() => navigate('/admin/bookings/new')} icon={Plus} size="sm">New booking</Button>
                </div>
            </div>

            <div ref={toolsRef} className="relative mt-3 rounded-t-lg border border-b-0 border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-2 border-b border-slate-200 p-2 dark:border-slate-800 xl:flex-row xl:items-center">
                    <div className="relative" ref={viewsMenuRef}>
                        <button
                            onClick={() => setIsViewsMenuOpen(!isViewsMenuOpen)}
                            className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-800 sm:w-auto"
                        >
                            <LayoutGrid size={17} className="text-blue-500" />
                            <span className="max-w-[260px] truncate uppercase tracking-wide">{activeView?.name || 'All Bookings'}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{viewFilteredBookings.length}</span>
                            <ChevronDown size={14} className={`transition-transform ${isViewsMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isViewsMenuOpen && (
                            <div className="absolute left-0 top-full z-50 mt-2 flex h-[560px] w-[350px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3 dark:border-slate-800">
                                    <button
                                        onClick={() => { setEditingViewId(null); setIsViewManagerOpen(true); setIsViewsMenuOpen(false); }}
                                        className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                        <Plus size={16} /> Create new...
                                    </button>
                                    <button
                                        onClick={() => { setEditingViewId(activeView.id); setIsViewManagerOpen(true); setIsViewsMenuOpen(false); }}
                                        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                        aria-label="View settings"
                                    >
                                        <Settings size={16} />
                                    </button>
                                </div>
                                <div className="border-b border-slate-200 p-3 dark:border-slate-800">
                                    <div className="relative">
                                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Find a view"
                                            value={viewSearchQuery}
                                            onChange={(e) => setViewSearchQuery(e.target.value)}
                                            className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                                        />
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3">
                                    <p className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500"><span className="text-amber-500">★</span> My favorites</p>
                                    <div className="ml-3 border-l border-slate-200 pl-3 dark:border-slate-800">
                                        {views.filter(v => v.name.toLowerCase().includes(viewSearchQuery.toLowerCase())).slice(0, 5).map(view => {
                                            const count = filterBookings(searchFilteredBookings, view).length;
                                            return (
                                                <button
                                                    key={view.id}
                                                    onClick={() => { setActiveViewId(view.id); setIsViewsMenuOpen(false); }}
                                                    className={`group flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors ${activeView.id === view.id ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                                                >
                                                    <span className="flex min-w-0 items-center gap-2">
                                                        <LayoutGrid size={15} className="shrink-0 text-blue-500" />
                                                        <span className="truncate font-semibold">{view.name}</span>
                                                    </span>
                                                    <span className="ml-2 text-[10px] text-slate-400">{count}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <p className="mb-2 mt-5 flex items-center gap-2 text-xs font-bold text-slate-500"><ChevronDown size={13} /> Bookings</p>
                                    <div className="ml-3 border-l border-slate-200 pl-3 dark:border-slate-800">
                                        {views.filter(v => v.name.toLowerCase().includes(viewSearchQuery.toLowerCase())).map(view => (
                                            <button
                                                key={`booking-${view.id}`}
                                                onClick={() => { setActiveViewId(view.id); setIsViewsMenuOpen(false); }}
                                                className={`group flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition-colors ${activeView.id === view.id ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                                            >
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <LayoutGrid size={15} className="shrink-0 text-blue-500" />
                                                    <span className="truncate font-semibold">{view.name}</span>
                                                </span>
                                                <MoreHorizontal size={14} className="opacity-0 group-hover:opacity-100" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1 overflow-x-auto">
                        <ToolButton icon={EyeOff} label="Hide fields" active={activeToolPanel === 'hide'} onClick={() => setActiveToolPanel(activeToolPanel === 'hide' ? null : 'hide')} />
                        <ToolButton icon={Filter} label="Filter" active={activeToolPanel === 'filter' || quickFilter !== 'ALL'} onClick={() => setActiveToolPanel(activeToolPanel === 'filter' ? null : 'filter')} />
                        <ToolButton icon={Group} label="Group" active={activeToolPanel === 'group' || groupField !== 'view'} onClick={() => setActiveToolPanel(activeToolPanel === 'group' ? null : 'group')} />
                        <ToolButton icon={ArrowUpDown} label="Sort" active={activeToolPanel === 'sort'} onClick={() => setActiveToolPanel(activeToolPanel === 'sort' ? null : 'sort')} />
                        <ToolButton icon={Maximize2} label="Open" onClick={() => navigate('/admin/bookings')} />
                        <ToolPanelContent />
                    </div>

                    <div className="relative min-w-0 flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search ref, client, contact, language, interpreter, postcode"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-950 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                aria-label="Clear search"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 p-2 dark:border-slate-800">
                    <FilterChip label="All" count={quickCounts.ALL} active={quickFilter === 'ALL'} onClick={() => setQuickFilter('ALL')} />
                    <FilterChip label="Interpreting" count={quickCounts.INTERPRETING} active={quickFilter === 'INTERPRETING'} onClick={() => setQuickFilter('INTERPRETING')} />
                    <FilterChip label="Translations" count={quickCounts.TRANSLATIONS} active={quickFilter === 'TRANSLATIONS'} onClick={() => setQuickFilter('TRANSLATIONS')} />
                    <FilterChip label="Overdue" count={quickCounts.OVERDUE} active={quickFilter === 'OVERDUE'} onClick={() => setQuickFilter('OVERDUE')} />
                    <FilterChip label="Today" count={quickCounts.TODAY} active={quickFilter === 'TODAY'} onClick={() => setQuickFilter('TODAY')} />
                    <FilterChip label="Unassigned" count={quickCounts.UNASSIGNED} active={quickFilter === 'UNASSIGNED'} onClick={() => setQuickFilter('UNASSIGNED')} />
                    <FilterChip label="Completed" count={quickCounts.COMPLETED} active={quickFilter === 'COMPLETED'} onClick={() => setQuickFilter('COMPLETED')} />
                    <FilterChip label="Timesheets" count={quickCounts.TIMESHEET} active={quickFilter === 'TIMESHEET'} onClick={() => setQuickFilter('TIMESHEET')} />
                    <FilterChip label="Invoice ready" count={quickCounts.INVOICE_READY} active={quickFilter === 'INVOICE_READY'} onClick={() => setQuickFilter('INVOICE_READY')} />
                    <FilterChip label="Awaiting payment" count={quickCounts.AWAITING_PAYMENT} active={quickFilter === 'AWAITING_PAYMENT'} onClick={() => setQuickFilter('AWAITING_PAYMENT')} />
                    <FilterChip label="Cancelled" count={quickCounts.CANCELLED} active={quickFilter === 'CANCELLED'} onClick={() => setQuickFilter('CANCELLED')} />
                    {activeFilterCount > 0 && (
                        <Button size="sm" variant="ghost" icon={X} onClick={() => { setSearchQuery(''); setQuickFilter('ALL'); }}>Clear</Button>
                    )}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-b-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-x-auto">
                    <div className="min-w-full">
                        <div
                            className="grid h-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                            style={{ gridTemplateColumns }}
                        >
                            <div className="flex items-center justify-center border-r border-slate-200 dark:border-slate-800">
                                <button
                                    onClick={() => {
                                        const pageIds = paginatedBookings.map(job => job.id);
                                        const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.includes(id));
                                        setSelectedIds(prev => allPageSelected ? prev.filter(id => !pageIds.includes(id)) : Array.from(new Set([...prev, ...pageIds])));
                                    }}
                                    className={`flex h-4 w-4 items-center justify-center rounded border ${paginatedBookings.length > 0 && paginatedBookings.every(job => selectedIds.includes(job.id)) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
                                    aria-label="Select visible rows"
                                >
                                    {paginatedBookings.length > 0 && paginatedBookings.every(job => selectedIds.includes(job.id)) ? <Check size={11} /> : null}
                                </button>
                            </div>
                            {visibleColumns.map(column => (
                                <div key={column.id} className="relative flex min-w-0 items-center justify-between gap-2 overflow-hidden border-r border-slate-200 px-3 dark:border-slate-800">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <column.icon size={14} className="shrink-0 text-slate-400" />
                                        <span className="truncate">{column.label}</span>
                                    </div>
                                    <button
                                        onClick={() => setActiveColumnMenu(activeColumnMenu === column.id ? null : column.id)}
                                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                        aria-label={`Open ${column.label} menu`}
                                    >
                                        <ChevronDown size={13} />
                                    </button>
                                    {activeColumnMenu === column.id && <ColumnMenu column={column} />}
                                </div>
                            ))}
                        </div>

                        <div className="max-h-[calc(100vh-18rem)] overflow-y-auto">
                            {loading ? (
                                <div className="p-8 text-sm text-slate-500">Loading jobs...</div>
                            ) : sortedBookings.length === 0 ? (
                                <div className="p-8 text-sm text-slate-500">No jobs match the current view and filters.</div>
                            ) : (
                                groupedRows.map(group => (
                                    <React.Fragment key={group.key || 'ungrouped'}>
                                        {group.key && (
                                            <div className="flex h-9 items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                                                <ChevronDown size={14} />
                                                <span>{group.key}</span>
                                                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] dark:bg-slate-900">{group.rows.length}</span>
                                            </div>
                                        )}
                                        {group.rows.map(job => renderGridRow(job, pageStartIndex + Math.max(0, paginatedBookings.findIndex(pageJob => pageJob.id === job.id))))}
                                    </React.Fragment>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-3 border-x border-b border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-semibold">
                    {sortedBookings.length === 0 ? '0 jobs' : `${pageStartIndex + 1}-${pageEndIndex} of ${sortedBookings.length} jobs`}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                        disabled={safeCurrentPage === 1}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 disabled:opacity-40 dark:border-slate-800"
                        aria-label="Previous page"
                    >
                        <ChevronLeft size={15} />
                    </button>
                    <span className="rounded-md border border-slate-200 px-3 py-1.5 font-semibold dark:border-slate-800">
                        Page {safeCurrentPage} of {totalPages}
                    </span>
                    <button
                        type="button"
                        onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                        disabled={safeCurrentPage === totalPages}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 disabled:opacity-40 dark:border-slate-800"
                        aria-label="Next page"
                    >
                        <ChevronRight size={15} />
                    </button>
                    <select
                        value={pageSize}
                        onChange={(event) => setPageSize(Number(event.target.value))}
                        className="h-8 rounded-md border border-slate-200 bg-white px-2 font-semibold outline-none dark:border-slate-800 dark:bg-slate-950"
                        aria-label="Rows per page"
                    >
                        {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}/page</option>)}
                    </select>
                </div>
            </div>

            <BulkActionBar
                selectedIds={selectedIds}
                selectedCount={selectedIds.length}
                totalCount={sortedBookings.length}
                entityLabel="job"
                isLoading={isBulkLoading}
                onClearSelection={() => setSelectedIds([])}
                onSelectAll={() => setSelectedIds(sortedBookings.map(b => b.id))}
                actions={[
                    { label: 'Book', icon: UserCheck, onClick: () => handleBulkStatus(selectedIds, BookingStatus.BOOKED), variant: 'success' },
                    { label: 'Complete', icon: CheckCircle2, onClick: (ids) => handleBulkManualStep(ids, 'Complete', job => BookingService.recordSessionCompletedByStaff(job.id)), variant: 'success' },
                    { label: 'Timesheet', icon: FileText, onClick: (ids) => handleBulkManualStep(ids, 'Record Timesheet', async job => { await BillingService.recordManualTimesheetReceived(job.id); }) },
                    { label: 'Invoice', icon: Receipt, onClick: (ids) => handleBulkManualStep(ids, 'Mark Invoiced', job => BillingService.recordManualInvoiceIssued(job.id)) },
                    { label: 'Paid', icon: Receipt, onClick: (ids) => handleBulkManualStep(ids, 'Mark Paid', job => BillingService.recordManualPaymentReceived(job.id)), variant: 'success' },
                    { label: 'Cancel', icon: Trash2, onClick: () => handleBulkStatus(selectedIds, BookingStatus.CANCELLED), variant: 'danger' },
                ]}
            />

            <Modal
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                type="drawer"
                title={selectedJob ? `Job ${selectedJob.displayRef || selectedJob.jobNumber || selectedJob.bookingRef || selectedJob.id.slice(0, 8)}` : 'Job record'}
                footer={
                    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                        <Button variant="outline" size="sm" onClick={() => setIsDrawerOpen(false)}>Close</Button>
                        <Button variant="secondary" size="sm" onClick={() => selectedJob && openEditJob(selectedJob)} icon={Pencil}>Edit</Button>
                        <Button size="sm" onClick={() => selectedJob && openJobDetails(selectedJob)} icon={ArrowUpRight}>Full details</Button>
                    </div>
                }
            >
                {selectedJob && (
                    <div className="space-y-5">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                            <div className="mb-4 flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-xs font-semibold uppercase text-slate-400">Current stage</p>
                                    <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{getNextAction(selectedJob)}</h3>
                                </div>
                                <StatusBadge status={selectedJob.status} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {[BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT].includes(selectedJob.status) && (
                                     <Button size="sm" onClick={() => setIsAllocationOpen(true)} icon={UserPlus}>Assign interpreter</Button>
                                 )}
                                {[BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(selectedJob.status) && !selectedJob.interpreterId && (
                                     <Button size="sm" onClick={(e) => handleAssignClick(e, selectedJob)} icon={UserPlus}>Assign</Button>
                                 )}
                                {[BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(selectedJob.status) && selectedJob.interpreterId && (
                                    <>
                                        <Button size="sm" onClick={() => handleRecordInterpreterResponse(selectedJob, true)} icon={CheckCircle2}>Accepted</Button>
                                        <Button variant="outline" size="sm" onClick={() => handleRecordInterpreterResponse(selectedJob, false)} icon={XCircle}>Declined</Button>
                                    </>
                                )}
                                {selectedJob.status === BookingStatus.BOOKED && (
                                    <>
                                        <Button size="sm" onClick={() => handleRecordSessionCompleted(selectedJob)} icon={CheckCircle2}>Complete</Button>
                                        <Button variant="outline" size="sm" onClick={() => handleMarkNotExecuted(selectedJob)} icon={AlertCircle}>Not executed</Button>
                                    </>
                                )}
                                {selectedJob.status === BookingStatus.SESSION_COMPLETED && (
                                    <Button size="sm" onClick={() => handleRecordManualTimesheet(selectedJob)} icon={FileText} className="col-span-2">Record timesheet</Button>
                                )}
                                {selectedJob.status === BookingStatus.TIMESHEET_SUBMITTED && (
                                    <Button size="sm" onClick={() => handleVerifyTimesheet(selectedJob)} icon={FileText} className="col-span-2">Verify timesheet</Button>
                                )}
                                {invoiceWorkStatuses.includes(selectedJob.status) && (
                                    <Button size="sm" onClick={() => handleRecordInvoiceIssued(selectedJob)} icon={Receipt} className="col-span-2">Mark invoiced</Button>
                                )}
                                {selectedJob.status === BookingStatus.INVOICED && (
                                    <Button size="sm" onClick={() => handleRecordPaymentReceived(selectedJob)} icon={Receipt} className="col-span-2">Mark paid</Button>
                                )}
                                {selectedJob.status === BookingStatus.PAID && (
                                    <p className="col-span-2 rounded-md bg-emerald-50 p-2 text-center text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Completed and paid</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <DetailLabel label="Schedule" value={<>{formatDate(selectedJob.date, { weekday: 'long', day: 'numeric', month: 'long' })}<br /><span className="text-blue-600 dark:text-blue-400">{selectedJob.startTime || 'TBC'} {selectedJob.durationMinutes ? `(${selectedJob.durationMinutes}m)` : ''}</span></>} />
                            <DetailLabel label="Service" value={<>{selectedJob.languageFrom} to {selectedJob.languageTo}<br /><span className="text-slate-500">{selectedJob.serviceType || selectedJob.serviceCategory}</span></>} />
                            <DetailLabel label="Client" value={<>{getCompanyName(selectedJob)}<br /><span className="text-slate-500">{selectedJob.guestContact?.name || (selectedJob as any).contactName || 'No contact'}</span></>} />
                            <DetailLabel label="Location" value={<>{selectedJob.locationType === 'ONLINE' ? 'Remote / online' : (selectedJob.postcode || 'On-site')}<br /><span className="text-slate-500">{selectedJob.locationType === 'ONLINE' ? selectedJob.onlineLink || 'No link' : selectedJob.address || selectedJob.location || 'No address'}</span></>} />
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Interpreter assignment</p>
                            {selectedJob.interpreterId ? (
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <UserAvatar name={selectedJob.interpreterName || 'Professional'} src={selectedJob.interpreterPhotoUrl} size="md" />
                                        <div>
                                            <p className="text-sm font-semibold text-slate-950 dark:text-white">{selectedJob.interpreterName || 'Professional'}</p>
                                            <button onClick={(e) => handleInterpreterPreview(e, selectedJob)} className="text-xs font-semibold text-blue-600 dark:text-blue-400">Open interpreter preview</button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm text-slate-500">No interpreter assigned.</p>
                                    <Button size="sm" variant="secondary" onClick={(e) => handleAssignClick(e, selectedJob)} icon={UserPlus}>Assign</Button>
                                </div>
                            )}
                        </div>

                        {(selectedJob.notes || selectedJob.adminNotes) && (
                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
                                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Notes</p>
                                <p className="text-sm leading-6 text-blue-950 dark:text-blue-100">{selectedJob.adminNotes || selectedJob.notes}</p>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            <InterpreterAllocationDrawer
                isOpen={isAllocationOpen}
                onClose={() => setIsAllocationOpen(false)}
                job={selectedJob}
                onSuccess={refresh}
            />

            <InterpreterPreviewDrawer
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                interpreterId={targetInterpreterId}
                jobId={selectedJob?.id || null}
                onSuccess={refresh}
            />

            <ViewManagerDrawer
                isOpen={isViewManagerOpen}
                onClose={() => setIsViewManagerOpen(false)}
                viewId={editingViewId}
            />
        </div>
    );
};
