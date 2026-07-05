import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    ArrowDownAZ,
    ArrowUpDown,
    ArrowUpRight,
    BarChart3,
    Building2,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    Copy,
    CreditCard,
    Eye,
    EyeOff,
    FileText,
    Filter,
    Globe2,
    Group,
    LayoutGrid,
    List,
    MapPin,
    Maximize2,
    Pencil,
    Pin,
    PinOff,
    Plus,
    PoundSterling,
    RefreshCw,
    Receipt,
    Search,
    SlidersHorizontal,
    Trash2,
    User,
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
import { Booking, BookingStatus, BookingWorkspace, ServiceCategory } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { BillingService, BookingService } from '../../../services/api';
import { createDependencies } from '../../../ui/actions';
import { InterpreterAllocationDrawer } from '../../../components/operations/InterpreterAllocationDrawer';
import { InterpreterPreviewDrawer } from '../../../components/operations/InterpreterPreviewDrawer';
import { FinanceSummaryBar, FinanceLane } from '../../../components/operations/FinanceSummaryBar';
import { FinanceLaneToggle } from '../../../components/operations/FinanceLaneToggle';
import { WorkspacePagination } from '../../../components/operations/WorkspacePagination';
import { WorkspaceViewSidebar } from '../../../components/operations/WorkspaceViewSidebar';
import { WorkspaceViewMenu } from '../../../components/operations/WorkspaceViewMenu';
import { filterBookings } from '../../../utils/bookingFilters';
import { ViewManagerDrawer } from '../../../components/operations/ViewManagerDrawer';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { useConfirm } from '../../../context/ConfirmContext';
import { formatLanguagePair, formatLanguageSearchText } from '../../../utils/languageDisplay';

type QuickFilter = 'ALL' | 'INTERPRETING' | 'TRANSLATIONS' | 'OVERDUE' | 'TODAY' | 'UNASSIGNED' | 'COMPLETED' | 'TIMESHEET' | 'INVOICE_READY' | 'AWAITING_PAYMENT' | 'CANCELLED';
type SortField = 'operationalPriority' | 'financePriority' | 'bookingRef' | 'status' | 'date' | 'client' | 'language' | 'interpreter' | 'serviceCategory';
type GroupField = 'none' | 'view' | 'status' | 'date' | 'client' | 'interpreter' | 'serviceCategory';
type ToolPanel = 'hide' | 'filter' | 'group' | 'sort' | null;
type ColumnFilter = { columnId: string; value: string } | null;
type PopoverPosition = { top: number; left: number; width: number };
type BoardMode = 'table' | 'calendar';
type CalendarViewMode = 'month' | 'week';
type ServiceScope = 'all' | 'interpreting' | 'translation';

const OPERATIONS_DEFAULT_HIDDEN_COLUMNS = ['contact', 'service', 'duration', 'amount', 'professionalCost', 'margin', 'costCode', 'invoiceRef'];
const FINANCE_DEFAULT_HIDDEN_COLUMNS = ['language', 'location', 'contact', 'duration', 'margin'];
const FINANCE_COLUMN_ORDER = [
    'jobNumber',
    'billingState',
    'status',
    'bookedFor',
    'client',
    'interpreter',
    'service',
    'amount',
    'professionalCost',
    'costCode',
    'invoiceRef',
    'action',
];

const MIN_COLUMN_WIDTH = 72;
const MAX_COLUMN_WIDTH = 520;

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

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => {
    const next = new Date(date);
    next.setDate(date.getDate() + days);
    return next;
};
const getDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const getMonthGridStart = (date: Date) => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const mondayBasedDay = (first.getDay() + 6) % 7;
    return addDays(first, -mondayBasedDay);
};
const getWeekStart = (date: Date) => {
    const day = startOfLocalDay(date);
    const mondayBasedDay = (day.getDay() + 6) % 7;
    return addDays(day, -mondayBasedDay);
};
const getTimeLabel = (job: Booking) => {
    const raw = (job as any).time || (job as any).startTime || '';
    if (!raw) return '';
    const match = String(raw).match(/\d{1,2}:\d{2}/);
    return match ? match[0] : String(raw).slice(0, 5);
};
const getTimeMinutes = (job: Booking) => {
    const label = getTimeLabel(job);
    const [hours, minutes] = label.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 9 * 60;
    return (hours * 60) + minutes;
};
const getDurationForCalendar = (job: Booking) => {
    const duration = Number(job.durationMinutes || (job as any).duration || 0);
    return Number.isFinite(duration) && duration > 0 ? duration : 60;
};
const getCalendarDate = (job: Booking, workspace: BookingWorkspace) => {
    const financeDate = workspace === 'finance'
        ? ((job as any).invoiceDate || (job as any).invoicedAt || (job as any).paidAt || (job as any).timesheetSubmittedAt || (job as any).timesheetVerifiedAt || (job as any).billingReadyAt)
        : null;
    const parsed = new Date(financeDate || job.date || job.createdAt || '');
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const getCalendarTone = (job: Booking) => {
    if (job.status === BookingStatus.CANCELLED) return 'bg-fuchsia-700 text-white border-fuchsia-800';
    if (job.status === BookingStatus.PAID) return 'bg-emerald-700 text-white border-emerald-800';
    if (job.status === BookingStatus.INVOICED) return 'bg-green-100 text-green-900 border-green-300';
    if (invoiceWorkStatuses.includes(job.status)) return 'bg-amber-100 text-amber-950 border-amber-300';
    if ([BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT, BookingStatus.OPENED].includes(job.status)) return 'bg-orange-100 text-orange-950 border-orange-300';
    if (job.status === BookingStatus.BOOKED) return 'bg-green-700 text-white border-green-800';
    if (job.status === BookingStatus.TIMESHEET_SUBMITTED) return 'bg-sky-100 text-sky-950 border-sky-300';
    if (job.status === BookingStatus.SESSION_COMPLETED) return 'bg-slate-200 text-slate-950 border-slate-300';
    return 'bg-slate-100 text-slate-950 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700';
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

const getOperationalDateBucket = (job: Booking) => {
    const diff = getDayDiff(job.date);
    const isTerminal = terminalStatuses.has(job.status);
    if (isTerminal) return 90;
    if (diff === 0) return 0;
    if (diff === 1) return 1;
    if (diff > 1 && diff <= 7) return 2;
    if (diff < 0 && Math.abs(diff) <= 30) return 3;
    if (diff > 7) return 4;
    return 8;
};

const getOperationalStatusRank = (job: Booking) => {
    if ([BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT].includes(job.status)) return job.interpreterId ? 2 : 0;
    if (job.status === BookingStatus.ASSIGNMENT_PENDING) return 1;
    if (job.status === BookingStatus.OPENED) return job.interpreterId ? 2 : 0;
    if (job.status === BookingStatus.BOOKED) return 3;
    if (job.status === BookingStatus.SESSION_COMPLETED) return 4;
    if (job.status === BookingStatus.TIMESHEET_SUBMITTED) return 5;
    if (job.status === BookingStatus.TIMESHEET_VERIFIED) return 6;
    if (invoiceWorkStatuses.includes(job.status)) return 7;
    if (job.status === BookingStatus.INVOICED) return 8;
    if (job.status === BookingStatus.PAID) return 20;
    if (job.status === BookingStatus.CANCELLED) return 30;
    return 12;
};

const getFinanceStatusRank = (job: Booking) => {
    if (invoiceWorkStatuses.includes(job.status)) return 0;
    if ([BookingStatus.TIMESHEET_SUBMITTED, BookingStatus.TIMESHEET_VERIFIED].includes(job.status)) return 1;
    if (job.status === BookingStatus.SESSION_COMPLETED) return 2;
    if (job.status === BookingStatus.INVOICED) return 3;
    if (job.status === BookingStatus.PAID) return 8;
    if (job.status === BookingStatus.CANCELLED) return 9;
    return 5;
};

const getComparableDate = (value?: unknown) => {
    const raw = typeof value === 'string' ? value : '';
    const parsed = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(parsed) ? parsed : 0;
};

const getFinanceDate = (job: Booking) => (
    getComparableDate((job as any).invoiceDate)
    || getComparableDate((job as any).invoicedAt)
    || getComparableDate((job as any).paidAt)
    || getComparableDate((job as any).timesheetSubmittedAt)
    || getComparableDate((job as any).timesheetVerifiedAt)
    || getComparableDate((job as any).updatedAt)
    || getComparableDate(job.date)
);

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

const applyServiceScope = (jobs: Booking[], scope: ServiceScope) => {
    if (scope === 'translation') return jobs.filter(isTranslationJob);
    if (scope === 'interpreting') return jobs.filter(job => !isTranslationJob(job));
    return jobs;
};

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

const getDefaultSortForView = (workspace: BookingWorkspace, viewId: string, sortBy?: string): { field: SortField; direction: 'asc' | 'desc' } => {
    if (workspace === 'finance') {
        if (viewId === 'fin-paid-jobs' || viewId === 'fin-profit-review' || sortBy === 'dateDesc') {
            return { field: 'date', direction: 'desc' };
        }
        return { field: 'financePriority', direction: 'asc' };
    }

    if (viewId === 'sys-date-time' || viewId === 'sys-today-tomorrow') {
        return { field: 'date', direction: 'asc' };
    }

    if (viewId === 'sys-all' || viewId === 'sys-status-date') {
        return { field: 'operationalPriority', direction: 'asc' };
    }

    if (sortBy === 'dateDesc') return { field: 'date', direction: 'desc' };
    if (sortBy === 'client') return { field: 'client', direction: 'asc' };
    return { field: 'operationalPriority', direction: 'asc' };
};

const DetailLabel = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
        <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{value}</div>
    </div>
);

interface JobsCalendarProps {
    jobs: Booking[];
    workspace: BookingWorkspace;
    viewMode: CalendarViewMode;
    cursorDate: Date;
    onViewModeChange: (mode: CalendarViewMode) => void;
    onCursorChange: (date: Date) => void;
    onOpenJob: (job: Booking) => void;
    getCompanyName: (job: Booking) => string;
}

const JobsCalendar = ({
    jobs,
    workspace,
    viewMode,
    cursorDate,
    onViewModeChange,
    onCursorChange,
    onOpenJob,
    getCompanyName,
}: JobsCalendarProps) => {
    const [expandedDay, setExpandedDay] = useState<string | null>(null);
    const today = startOfLocalDay(new Date());
    const visibleStart = viewMode === 'month' ? getMonthGridStart(cursorDate) : getWeekStart(cursorDate);
    const visibleDays = Array.from({ length: viewMode === 'month' ? 42 : 7 }, (_, index) => addDays(visibleStart, index));
    const visibleDayKeys = new Set(visibleDays.map(getDateKey));
    const monthLabel = viewMode === 'month'
        ? cursorDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        : `${visibleDays[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${visibleDays[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    const jobsByDay = useMemo(() => {
        const groups = new Map<string, Booking[]>();
        jobs.forEach(job => {
            const date = getCalendarDate(job, workspace);
            if (!date) return;
            const key = getDateKey(startOfLocalDay(date));
            if (!visibleDayKeys.has(key)) return;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(job);
        });
        groups.forEach(rows => rows.sort((a, b) => getTimeLabel(a).localeCompare(getTimeLabel(b)) || String(a.displayRef || a.jobNumber || a.bookingRef || a.id).localeCompare(String(b.displayRef || b.jobNumber || b.bookingRef || b.id), undefined, { numeric: true })));
        return groups;
    }, [jobs, workspace, visibleDayKeys]);

    const statusSummary = useMemo(() => {
        const counts = new Map<string, number>();
        jobs.forEach(job => counts.set(job.status, (counts.get(job.status) || 0) + 1));
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    }, [jobs]);

    const weekScale = useMemo(() => {
        const weekJobs = visibleDays.flatMap(day => jobsByDay.get(getDateKey(day)) || []);
        if (weekJobs.length === 0) {
            return { startHour: 8, endHour: 18, hours: Array.from({ length: 11 }, (_, index) => 8 + index) };
        }
        const earliest = Math.min(...weekJobs.map(getTimeMinutes));
        const latest = Math.max(...weekJobs.map(job => getTimeMinutes(job) + getDurationForCalendar(job)));
        const startHour = Math.max(6, Math.min(8, Math.floor(earliest / 60)));
        const endHour = Math.min(23, Math.max(18, Math.ceil(latest / 60)));
        return {
            startHour,
            endHour,
            hours: Array.from({ length: Math.max(1, endHour - startHour + 1) }, (_, index) => startHour + index),
        };
    }, [jobsByDay, visibleDays]);

    const moveCalendar = (direction: -1 | 1) => {
        const next = new Date(cursorDate);
        if (viewMode === 'month') next.setMonth(cursorDate.getMonth() + direction);
        else next.setDate(cursorDate.getDate() + (direction * 7));
        onCursorChange(next);
        setExpandedDay(null);
    };

    const renderEvent = (job: Booking, compact = false) => {
        const reference = job.displayRef || job.jobNumber || job.bookingRef || job.id.slice(0, 8);
        const service = isTranslationJob(job) ? 'Translation' : 'Interpreting';
        return (
            <button
                key={job.id}
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onOpenJob(job);
                }}
                className={`w-full rounded border px-2 py-1 text-left text-xs shadow-sm transition hover:brightness-95 ${getCalendarTone(job)} ${compact ? 'h-full min-h-9' : ''}`}
                title={`${reference} - ${getCompanyName(job)} - ${service}`}
            >
                <span className="block truncate font-black">{getTimeLabel(job)} {reference}</span>
                {!compact && <span className="block truncate opacity-80">{getCompanyName(job)}</span>}
            </button>
        );
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-slate-950">
            <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-black text-slate-950 dark:text-white">{monthLabel}</h2>
                        <p className="text-xs font-semibold text-slate-500">{jobs.length.toLocaleString('en-GB')} filtered jobs on this calendar context</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="ghost" icon={ChevronLeft} onClick={() => moveCalendar(-1)} aria-label="Previous calendar period">Prev</Button>
                        <Button size="sm" variant="ghost" icon={ChevronRight} iconPosition="right" onClick={() => moveCalendar(1)} aria-label="Next calendar period">Next</Button>
                        <Button size="sm" variant="secondary" icon={CalendarDays} onClick={() => { onCursorChange(new Date()); setExpandedDay(null); }}>Today</Button>
                        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                            {(['month', 'week'] as CalendarViewMode[]).map(mode => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => {
                                        onViewModeChange(mode);
                                        setExpandedDay(null);
                                    }}
                                    className={`rounded px-3 py-1.5 text-xs font-black uppercase tracking-wide ${viewMode === mode ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                {statusSummary.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                        {statusSummary.map(([status, count]) => (
                            <span key={status} className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                                {status.replaceAll('_', ' ')} <span className="ml-1 text-slate-400">{count}</span>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {viewMode === 'month' ? (
                <div className="min-h-0 flex-1 overflow-auto">
                    <div className="grid min-w-[980px] grid-cols-7 border-b border-slate-200 bg-white text-xs font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="px-3 py-2 text-center">{day}</div>)}
                    </div>
                    <div className="grid min-w-[980px] grid-cols-7">
                        {visibleDays.map(day => {
                            const key = getDateKey(day);
                            const dayJobs = jobsByDay.get(key) || [];
                            const isCurrentMonth = day.getMonth() === cursorDate.getMonth();
                            const isToday = getDateKey(day) === getDateKey(today);
                            return (
                                <div
                                    key={key}
                                    className={`relative min-h-[118px] border-b border-r border-slate-200 p-2 dark:border-slate-800 ${isCurrentMonth ? 'bg-white dark:bg-slate-950' : 'bg-slate-50 text-slate-400 dark:bg-slate-900/60'} ${isToday ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                                >
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className={`text-sm font-bold ${isToday ? 'rounded-full bg-blue-600 px-2 py-0.5 text-white' : 'text-slate-700 dark:text-slate-200'}`}>{day.getDate()}</span>
                                        {dayJobs.length > 0 && <span className="text-[10px] font-black text-slate-400">{dayJobs.length}</span>}
                                    </div>
                                    <div className="space-y-1">
                                        {dayJobs.slice(0, 3).map(job => renderEvent(job))}
                                        {dayJobs.length > 3 && (
                                            <button
                                                type="button"
                                                onClick={() => setExpandedDay(key)}
                                                className="text-xs font-bold text-blue-700 hover:underline dark:text-blue-300"
                                            >
                                                +{dayJobs.length - 3} more
                                            </button>
                                        )}
                                    </div>
                                    {expandedDay === key && (
                                        <div className="absolute left-3 top-10 z-[70] w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                                            <div className="mb-2 flex items-center justify-between">
                                                <p className="font-black text-slate-900 dark:text-white">{day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                                                <button type="button" onClick={() => setExpandedDay(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={14} /></button>
                                            </div>
                                            <div className="max-h-72 space-y-1 overflow-auto pr-1">
                                                {dayJobs.map(job => renderEvent(job))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="min-h-0 flex-1 overflow-auto">
                    <div className="sticky top-0 z-30 grid min-w-[1180px] grid-cols-[64px_repeat(7,minmax(150px,1fr))] border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <div className="border-r border-slate-200 dark:border-slate-800" />
                        {visibleDays.map(day => (
                            <div key={getDateKey(day)} className={`border-r border-slate-200 px-3 py-3 text-center dark:border-slate-800 ${getDateKey(day) === getDateKey(today) ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}>
                                <p className="text-xs font-bold uppercase text-slate-400">{day.toLocaleDateString('en-GB', { weekday: 'short' })}</p>
                                <p className="text-xl font-black text-slate-900 dark:text-white">{day.getDate()}</p>
                            </div>
                        ))}
                    </div>
                    <div
                        className="grid min-w-[1180px] grid-cols-[64px_repeat(7,minmax(150px,1fr))]"
                        style={{ height: `${Math.max(560, (weekScale.endHour - weekScale.startHour) * 72)}px` }}
                    >
                        <div className="relative border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                            {weekScale.hours.slice(0, -1).map(hour => (
                                <div
                                    key={hour}
                                    className="absolute left-0 right-0 border-t border-slate-200 px-2 pt-1 text-right text-[10px] font-semibold text-slate-400 dark:border-slate-800"
                                    style={{ top: `${(hour - weekScale.startHour) * 72}px` }}
                                >
                                    {String(hour).padStart(2, '0')}:00
                                </div>
                            ))}
                        </div>
                        {visibleDays.map(day => {
                            const key = getDateKey(day);
                            const dayJobs = jobsByDay.get(key) || [];
                            const dayHeight = Math.max(560, (weekScale.endHour - weekScale.startHour) * 72);
                            return (
                                <div key={key} className={`relative border-r border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-950 ${getDateKey(day) === getDateKey(today) ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''}`}>
                                    {weekScale.hours.slice(0, -1).map(hour => (
                                        <div
                                            key={hour}
                                            className="absolute left-0 right-0 border-t border-slate-200 dark:border-slate-800"
                                            style={{ top: `${(hour - weekScale.startHour) * 72}px` }}
                                        />
                                    ))}
                                    {dayJobs.length === 0 && (
                                        <p className="absolute left-3 top-4 text-xs font-semibold text-slate-400">No jobs</p>
                                    )}
                                    {dayJobs.map((job, index) => {
                                        const startMinutes = getTimeMinutes(job);
                                        const top = Math.max(0, ((startMinutes - (weekScale.startHour * 60)) / 60) * 72);
                                        const height = Math.max(34, (getDurationForCalendar(job) / 60) * 72);
                                        const offset = (index % 3) * 6;
                                        return (
                                            <div
                                                key={job.id}
                                                className="absolute left-2 right-2"
                                                style={{
                                                    top: `${Math.min(top, Math.max(0, dayHeight - 40))}px`,
                                                    height: `${Math.min(height, Math.max(34, dayHeight - top - 4))}px`,
                                                    transform: `translateX(${offset}px)`,
                                                    zIndex: 10 + (index % 8),
                                                }}
                                            >
                                                {renderEvent(job, true)}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const ToolButton = ({
    icon: Icon,
    label,
    active,
    onClick,
}: {
    icon: React.ElementType;
    label: string;
    active?: boolean;
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) => (
    <button
        onClick={onClick}
        className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold transition-colors ${
            active
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                : 'border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
    >
        <Icon size={14} />
        <span className="hidden sm:inline">{label}</span>
    </button>
);

interface JobsBoardProps {
    workspace?: BookingWorkspace;
}

export const JobsBoard = ({ workspace = 'operations' }: JobsBoardProps) => {
    const isFinanceWorkspace = workspace === 'finance';
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { getClientCompany } = useClients();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { bookings = [], loading, refresh } = useBookings();
    const { views, activeView, setActiveViewId, updateCustomView, reorderViews, toggleViewFavorite } = useBookingViews(user?.id || '', workspace);
    const actionsDeps = createDependencies((user as any)?.organizationId || 'lingland-main');
    const activeViewId = activeView?.id || 'default';
    const gridLayoutStorageKey = `lingland:${workspace}:job-grid-layout:${activeViewId}`;

    const readStoredGridLayout = () => {
        if (activeView?.columnWidths || activeView?.columnOrder || activeView?.pinnedColumns || activeView?.hiddenColumns) {
            return {
                widths: activeView.columnWidths || {},
                order: activeView.columnOrder || [],
                pinned: activeView.pinnedColumns || [],
                hidden: activeView.hiddenColumns || [],
            };
        }

        try {
            const stored = localStorage.getItem(gridLayoutStorageKey);
            return stored ? JSON.parse(stored) as { widths?: Record<string, number>; order?: string[]; pinned?: string[]; hidden?: string[] } : {};
        } catch {
            return {};
        }
    };

    const [selectedJob, setSelectedJob] = useState<Booking | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isBulkLoading, setIsBulkLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [quickFilter, setQuickFilter] = useState<QuickFilter>('ALL');
    const [financeLane, setFinanceLane] = useState<FinanceLane>('clientBilling');
    const [boardMode, setBoardMode] = useState<BoardMode>('table');
    const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>('month');
    const [calendarCursorDate, setCalendarCursorDate] = useState(() => new Date());
    const [sortField, setSortField] = useState<SortField>(workspace === 'finance' ? 'financePriority' : 'operationalPriority');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [groupField, setGroupField] = useState<GroupField>('view');
    const [columnFilter, setColumnFilter] = useState<ColumnFilter>(null);
    const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
        new Set(readStoredGridLayout().hidden || (isFinanceWorkspace ? FINANCE_DEFAULT_HIDDEN_COLUMNS : OPERATIONS_DEFAULT_HIDDEN_COLUMNS))
    );
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
        const stored = readStoredGridLayout();
        return stored.widths || {};
    });
    const [columnOrder, setColumnOrder] = useState<string[]>(() => {
        const stored = readStoredGridLayout();
        return stored.order || [];
    });
    const [pinnedColumns, setPinnedColumns] = useState<string[]>(() => {
        const stored = readStoredGridLayout();
        return stored.pinned || [];
    });
    const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
    const [activeToolPanel, setActiveToolPanel] = useState<ToolPanel>(null);
    const [toolPanelPosition, setToolPanelPosition] = useState<PopoverPosition | null>(null);
    const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null);
    const [isAllocationOpen, setIsAllocationOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [targetInterpreterId, setTargetInterpreterId] = useState<string | null>(null);
    const [isViewManagerOpen, setIsViewManagerOpen] = useState(false);
    const [editingViewId, setEditingViewId] = useState<string | null>(null);
    const [isViewsMenuOpen, setIsViewsMenuOpen] = useState(false);
    const [isViewsSidebarCollapsed, setIsViewsSidebarCollapsed] = useState(false);
    const [viewSearchQuery, setViewSearchQuery] = useState('');
    const viewsMenuRef = useRef<HTMLDivElement>(null);
    const toolsRef = useRef<HTMLDivElement>(null);
    const toolPanelRef = useRef<HTMLDivElement>(null);
    const isApplyingStoredLayoutRef = useRef(false);

    useEffect(() => {
        isApplyingStoredLayoutRef.current = true;
        const stored = readStoredGridLayout();
        setColumnWidths(stored.widths || {});
        setColumnOrder(stored.order || []);
        setPinnedColumns(stored.pinned || []);
        setHiddenColumns(new Set(stored.hidden || (isFinanceWorkspace ? FINANCE_DEFAULT_HIDDEN_COLUMNS : OPERATIONS_DEFAULT_HIDDEN_COLUMNS)));
        window.setTimeout(() => {
            isApplyingStoredLayoutRef.current = false;
        }, 0);
    }, [gridLayoutStorageKey, activeView?.columnWidths, activeView?.columnOrder, activeView?.pinnedColumns, activeView?.hiddenColumns, isFinanceWorkspace]);

    useEffect(() => {
        if (isApplyingStoredLayoutRef.current) return;
        const hidden = Array.from(hiddenColumns);
        try {
            localStorage.setItem(gridLayoutStorageKey, JSON.stringify({ widths: columnWidths, order: columnOrder, pinned: pinnedColumns, hidden }));
        } catch {
            // Grid layout is an ergonomic preference; storage failure should not block the board.
        }
    }, [gridLayoutStorageKey, columnWidths, columnOrder, pinnedColumns, hiddenColumns]);

    const saveGridLayoutPreference = (widths: Record<string, number>, order: string[], pinned = pinnedColumns, hidden = Array.from(hiddenColumns)) => {
        try {
            localStorage.setItem(gridLayoutStorageKey, JSON.stringify({ widths, order, pinned, hidden }));
        } catch {
            // Preference sync is best-effort.
        }
        updateCustomView(activeViewId, {
            columnWidths: widths,
            columnOrder: order,
            pinnedColumns: pinned,
            hiddenColumns: hidden,
        });
    };

    const openToolPanel = (panel: ToolPanel, event: React.MouseEvent<HTMLButtonElement>, width = 288, forceOpen = false) => {
        if (activeToolPanel === panel && !forceOpen) {
            setActiveToolPanel(null);
            setToolPanelPosition(null);
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const margin = 12;
        const left = Math.min(
            Math.max(rect.left, margin),
            Math.max(margin, window.innerWidth - width - margin)
        );
        setToolPanelPosition({
            top: rect.bottom + 8,
            left,
            width,
        });
        setActiveToolPanel(panel);
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (viewsMenuRef.current && !viewsMenuRef.current.contains(target)) setIsViewsMenuOpen(false);
            if (
                toolsRef.current
                && !toolsRef.current.contains(target)
                && !toolPanelRef.current?.contains(target)
            ) {
                setActiveToolPanel(null);
                setToolPanelPosition(null);
            }
            if (target instanceof Element && activeColumnMenu) {
                const activeColumn = target.closest(`[data-column-id="${activeColumnMenu}"]`);
                const activeMenu = target.closest('[data-column-menu="true"]');
                if (!activeColumn && !activeMenu) setActiveColumnMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeColumnMenu]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setActiveColumnMenu(null);
                setActiveToolPanel(null);
                setToolPanelPosition(null);
                setIsViewsMenuOpen(false);
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const requestedView = params.get('view');
        const requestedLane = params.get('lane') as FinanceLane | null;
        const requestedMode = params.get('mode');
        const requestedCalendarView = params.get('calendar');
        const requestedClientId = params.get('clientId');
        const requestedInterpreterId = params.get('interpreterId');

        if (requestedView && views.some(view => view.id === requestedView)) {
            setActiveViewId(requestedView);
            setQuickFilter('ALL');
            setCurrentPage(1);
        }

        if (
            isFinanceWorkspace
            && (requestedLane === 'clientBilling' || requestedLane === 'interpreterPayables')
        ) {
            setFinanceLane(requestedLane);
            setCurrentPage(1);
        }

        setBoardMode(requestedMode === 'calendar' ? 'calendar' : 'table');
        if (requestedCalendarView === 'week' || requestedCalendarView === 'month') {
            setCalendarViewMode(requestedCalendarView);
        }

        if (requestedClientId || requestedInterpreterId) {
            setQuickFilter('ALL');
            setCurrentPage(1);
        }
    }, [location.search, views, setActiveViewId, isFinanceWorkspace]);

    useEffect(() => {
        const nextSort = getDefaultSortForView(workspace, activeView.id, activeView.sortBy);
        setSortField(nextSort.field);
        setSortDirection(nextSort.direction);
    }, [workspace, activeView.id, activeView.sortBy]);

    const getCompanyName = (job: Booking) => getClientCompany(job.clientId, job.guestContact?.organisation || job.clientName);
    const setWorkspaceBoardMode = (nextMode: BoardMode) => {
        const params = new URLSearchParams(location.search);
        if (nextMode === 'calendar') {
            params.set('mode', 'calendar');
            params.set('calendar', calendarViewMode);
        } else {
            params.delete('mode');
            params.delete('calendar');
        }
        navigate(`${workspacePath}${params.toString() ? `?${params.toString()}` : ''}`, { replace: true });
        setBoardMode(nextMode);
    };
    const setWorkspaceCalendarView = (nextView: CalendarViewMode) => {
        const params = new URLSearchParams(location.search);
        params.set('mode', 'calendar');
        params.set('calendar', nextView);
        navigate(`${workspacePath}?${params.toString()}`, { replace: true });
        setCalendarViewMode(nextView);
    };
    const getColumnFilterValue = (job: Booking, columnId: string) => {
        switch (columnId) {
            case 'jobNumber':
                return [job.displayRef, job.jobNumber, job.bookingRef, job.legacyAirtableRef, job.id].filter(Boolean).join(' ');
            case 'status':
                return String(job.status || '').replace(/_/g, ' ');
            case 'bookedFor':
                return `${formatDate(job.date)} ${job.date || ''} ${job.startTime || ''}`;
            case 'client':
                return `${getCompanyName(job)} ${job.guestContact?.name || (job as any).contactName || ''}`;
            case 'language':
                return formatLanguageSearchText(job.languageFrom, job.languageTo);
            case 'interpreter':
                return `${job.interpreterName || ''} ${job.interpreterId ? 'assigned' : 'unassigned'}`;
            case 'location':
                return `${job.locationType || ''} ${job.postcode || ''} ${job.address || ''} ${job.location || ''} ${job.onlineLink || ''}`;
            case 'service':
                return `${isTranslationJob(job) ? 'translation' : 'interpreting'} ${job.serviceCategory || ''} ${job.serviceType || ''}`;
            case 'duration':
                return `${job.durationMinutes || ''} ${(job as any).wordCount || ''} ${(job as any).numberOfDocs || ''}`;
            case 'contact':
                return `${job.guestContact?.name || ''} ${(job as any).contactName || ''}`;
            case 'amount':
                return `${job.totalAmount || ''} ${job.currency || 'GBP'}`;
            case 'professionalCost':
                return `${(job as any).interpreterAmountCalculated || ''} ${(job as any).professionalCost || ''}`;
            case 'margin': {
                const revenue = Number(job.totalAmount) || 0;
                const cost = Number((job as any).interpreterAmountCalculated || (job as any).professionalCost) || 0;
                return `${revenue - cost}`;
            }
            case 'costCode':
                return job.costCode || '';
            case 'billingState':
                return `${(job as any).paymentStatus || ''} ${job.status || ''} ${(job as any).billingIssueFlag ? 'billing issue' : ''}`;
            case 'invoiceRef':
                return `${(job as any).clientInvoiceNumber || ''} ${(job as any).invoiceNumber || ''} ${(job as any).clientInvoiceReference || ''} ${(job as any).interpreterInvoiceNumber || ''} ${(job as any).interpreterInvoiceReference || ''}`;
            default:
                return String((job as any)[columnId] || '');
        }
    };
    const workspacePath = isFinanceWorkspace ? '/admin/billing' : '/admin/bookings';
    const workspaceReturnPath = `${location.pathname}${location.search}`;
    const workspaceLabel = location.search
        ? (isFinanceWorkspace ? 'Filtered Finance Centre' : 'Filtered Job Centre')
        : (isFinanceWorkspace ? 'Finance Centre' : 'Job Centre');

    const openJobDetails = (job: Booking) => {
        navigate(`/admin/bookings/${job.id}`, {
            state: { returnTo: workspaceReturnPath, returnLabel: workspaceLabel },
        });
    };

    const openEditJob = (job: Booking) => {
        navigate(`/admin/bookings/edit/${job.id}`, {
            state: { returnTo: workspaceReturnPath, returnLabel: workspaceLabel },
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
            width: 'minmax(118px, .72fr)',
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
            width: 'minmax(122px, .68fr)',
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
            label: isFinanceWorkspace ? 'Delivery Date' : 'Booked For',
            width: 'minmax(128px, .72fr)',
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
            width: 'minmax(178px, 1.2fr)',
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
            width: 'minmax(164px, .95fr)',
            icon: Globe2,
            getSortValue: job => formatLanguageSearchText(job.languageFrom, job.languageTo),
            render: job => (
                <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{formatLanguagePair(job.languageFrom, job.languageTo)}</p>
                    <p className="truncate text-xs uppercase text-slate-500">{job.locationType || 'Session'}</p>
                </div>
            ),
        },
        {
            id: 'interpreter',
            label: 'Professional',
            width: 'minmax(168px, 1fr)',
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
            width: 'minmax(132px, .72fr)',
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
            id: 'amount',
            label: 'Client Charge',
            width: 'minmax(118px, .65fr)',
            icon: Receipt,
            getSortValue: job => job.totalAmount || 0,
            render: job => (
                <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                        {job.totalAmount ? `GBP ${job.totalAmount.toFixed(2)}` : 'TBC'}
                    </p>
                    <p className="truncate text-[10px] font-semibold uppercase text-slate-500">{job.currency || 'GBP'}</p>
                </div>
            ),
        },
        {
            id: 'professionalCost',
            label: 'Professional Cost',
            width: 'minmax(126px, .68fr)',
            icon: PoundSterling,
            getSortValue: job => (job as any).interpreterAmountCalculated || (job as any).professionalCost || 0,
            render: job => {
                const value = Number((job as any).interpreterAmountCalculated || (job as any).professionalCost || 0);
                return (
                    <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                            {value ? `GBP ${value.toFixed(2)}` : 'TBC'}
                        </p>
                        <p className="truncate text-[10px] font-semibold uppercase text-slate-500">Payable</p>
                    </div>
                );
            },
        },
        {
            id: 'margin',
            label: 'Margin',
            width: 'minmax(110px, .62fr)',
            icon: BarChart3,
            getSortValue: job => {
                const revenue = Number(job.totalAmount) || 0;
                const cost = Number((job as any).interpreterAmountCalculated || (job as any).professionalCost) || 0;
                return revenue - cost;
            },
            render: job => {
                const revenue = Number(job.totalAmount) || 0;
                const cost = Number((job as any).interpreterAmountCalculated || (job as any).professionalCost) || 0;
                const value = revenue - cost;
                const canCalculate = Boolean(revenue && cost);
                return (
                    <div className="min-w-0">
                        <p className={`truncate text-sm font-black ${canCalculate && value < 0 ? 'text-rose-600' : 'text-slate-950 dark:text-white'}`}>
                            {canCalculate ? `GBP ${value.toFixed(2)}` : 'TBC'}
                        </p>
                        <p className="truncate text-[10px] font-semibold uppercase text-slate-500">Profit</p>
                    </div>
                );
            },
        },
        {
            id: 'costCode',
            label: 'PO / Cost Code',
            width: 'minmax(130px, .75fr)',
            icon: CreditCard,
            getSortValue: job => job.costCode || '',
            render: job => (
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{job.costCode || 'Missing'}</p>
                    {!job.costCode && <p className="truncate text-[10px] font-bold uppercase text-amber-600">Finance check</p>}
                </div>
            ),
        },
        {
            id: 'billingState',
            label: 'Billing State',
            width: 'minmax(126px, .7fr)',
            icon: Receipt,
            getSortValue: job => (job as any).paymentStatus || job.status,
            render: job => {
                const paymentStatus = (job as any).paymentStatus;
                const paymentLabels: Record<string, string> = {
                    NOT_READY: 'Not ready',
                    READY_FOR_INVOICE: financeLane === 'interpreterPayables' ? 'Pay run ready' : 'Invoice ready',
                    INVOICED: financeLane === 'interpreterPayables' ? 'Awaiting payout' : 'Awaiting payment',
                    PAID: 'Paid',
                    ISSUE: 'Billing issue',
                };
                const label = (job as any).billingIssueFlag ? 'Billing issue' :
                    paymentStatus && paymentLabels[paymentStatus] ? paymentLabels[paymentStatus] :
                    financeLane === 'interpreterPayables' && ((job as any).interpreterInvoiceId || (job as any).interpreterInvoiceNumber || (job as any).interpreterInvoiceReference) ? 'Interpreter invoiced' :
                    job.clientInvoiceId || job.clientInvoiceNumber || job.clientInvoiceReference ? 'Awaiting payment' :
                    job.timesheetVerifiedAt || job.billingReadyAt || invoiceWorkStatuses.includes(job.status) ? (financeLane === 'interpreterPayables' ? 'Pay run ready' : 'Invoice ready') :
                    job.timesheetId || job.status === BookingStatus.TIMESHEET_SUBMITTED ? 'Timesheet review' :
                    job.status === BookingStatus.SESSION_COMPLETED ? 'Timesheet needed' :
                    'Not ready';
                return <span className="inline-flex max-w-full rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-300"><span className="truncate">{label}</span></span>;
            },
        },
        {
            id: 'invoiceRef',
            label: 'Invoice Ref',
            width: 'minmax(122px, .68fr)',
            icon: Receipt,
            getSortValue: job => financeLane === 'interpreterPayables'
                ? ((job as any).interpreterInvoiceNumber || (job as any).interpreterInvoiceReference || (job as any).interpreterInvoiceId || '')
                : ((job as any).clientInvoiceNumber || (job as any).invoiceNumber || (job as any).clientInvoiceId || ''),
            render: job => {
                const invoiceRef = (job as any).clientInvoiceNumber || (job as any).invoiceNumber || (job as any).clientInvoiceReference || (job as any).clientInvoiceId;
                const interpreterRef = (job as any).interpreterInvoiceNumber || (job as any).interpreterInvoiceReference || (job as any).interpreterInvoiceId;
                const primaryRef = financeLane === 'interpreterPayables' ? interpreterRef : invoiceRef;
                const secondaryRef = financeLane === 'interpreterPayables'
                    ? (invoiceRef ? `Client ${invoiceRef}` : 'Interpreter payable')
                    : (interpreterRef ? `INT ${interpreterRef}` : 'Client invoice');
                return (
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{primaryRef || 'Not issued'}</p>
                        <p className="truncate text-[10px] font-semibold uppercase text-slate-500">{secondaryRef}</p>
                    </div>
                );
            },
        },
        {
            id: 'action',
            label: 'Action',
            width: isFinanceWorkspace ? 'minmax(128px, .72fr)' : '92px',
            icon: ArrowUpRight,
            render: job => {
                if (isFinanceWorkspace) {
                    const hasBlockingBillingIssue = Boolean((job as any).billingIssueFlag || !job.costCode || !job.totalAmount);
                    if (hasBlockingBillingIssue && [BookingStatus.TIMESHEET_VERIFIED, BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING].includes(job.status)) {
                        return <Button size="sm" variant="secondary" icon={AlertCircle} onClick={(e) => { e.stopPropagation(); handleFlagBillingIssue(job); }}>Flag issue</Button>;
                    }
                    if (job.status === BookingStatus.SESSION_COMPLETED) {
                        return <Button size="sm" variant="secondary" icon={FileText} onClick={(e) => { e.stopPropagation(); handleRecordManualTimesheet(job); }}>Timesheet</Button>;
                    }
                    if (job.status === BookingStatus.TIMESHEET_SUBMITTED) {
                        return <Button size="sm" variant="secondary" icon={FileText} onClick={(e) => { e.stopPropagation(); handleVerifyTimesheet(job); }}>Verify</Button>;
                    }
                    if (financeLane === 'interpreterPayables' && (job as any).interpreterInvoiceId && (job as any).interpreterPaymentStatus !== 'PAID') {
                        return <Button size="sm" variant="secondary" icon={PoundSterling} onClick={(e) => { e.stopPropagation(); handleRecordInterpreterPaymentSent(job); }}>Paid</Button>;
                    }
                    if (invoiceWorkStatuses.includes(job.status)) {
                        return financeLane === 'interpreterPayables'
                            ? <Button size="sm" variant="secondary" icon={Receipt} onClick={(e) => { e.stopPropagation(); handleRecordInterpreterInvoiceReceived(job); }}>Payable</Button>
                            : <Button size="sm" variant="secondary" icon={Receipt} onClick={(e) => { e.stopPropagation(); handleRecordInvoiceIssued(job); }}>Invoice</Button>;
                    }
                    if (job.status === BookingStatus.INVOICED) {
                        return financeLane === 'interpreterPayables'
                            ? <Button size="sm" variant="secondary" icon={PoundSterling} onClick={(e) => { e.stopPropagation(); handleRecordInterpreterPaymentSent(job); }}>Paid</Button>
                            : <Button size="sm" variant="secondary" icon={PoundSterling} onClick={(e) => { e.stopPropagation(); handleRecordPaymentReceived(job); }}>Paid</Button>;
                    }
                    return <Button size="sm" variant="ghost" icon={ArrowUpRight} onClick={(e) => { e.stopPropagation(); openJobDetails(job); }}>Open</Button>;
                }
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
    ], [financeLane, getClientCompany, isFinanceWorkspace]);

    const defaultOrderedColumns = useMemo(() => {
        if (!isFinanceWorkspace) return columns;
        const columnById = new Map(columns.map(column => [column.id, column]));
        const ordered = FINANCE_COLUMN_ORDER
            .map(columnId => columnById.get(columnId))
            .filter(Boolean) as GridColumn[];
        const remaining = columns.filter(column => !FINANCE_COLUMN_ORDER.includes(column.id));
        return [...ordered, ...remaining];
    }, [columns, isFinanceWorkspace]);

    const orderedColumns = useMemo(() => {
        if (columnOrder.length === 0) return defaultOrderedColumns;
        const columnById = new Map(defaultOrderedColumns.map(column => [column.id, column]));
        const ordered = columnOrder
            .map(columnId => columnById.get(columnId))
            .filter(Boolean) as GridColumn[];
        const remaining = defaultOrderedColumns.filter(column => !columnOrder.includes(column.id));
        return [...ordered, ...remaining];
    }, [columnOrder, defaultOrderedColumns]);

    const visibleColumns = orderedColumns.filter(column => column.primary || !hiddenColumns.has(column.id));
    const displayColumns = useMemo(() => {
        const visibleIds = new Set(visibleColumns.map(column => column.id));
        const activePinned = pinnedColumns.filter(columnId => visibleIds.has(columnId));
        return [
            ...visibleColumns.filter(column => activePinned.includes(column.id)),
            ...visibleColumns.filter(column => !activePinned.includes(column.id)),
        ];
    }, [pinnedColumns, visibleColumns]);
    const getDefaultColumnWidthPx = (column: GridColumn) => {
        const match = column.width.match(/(\d+)px/);
        return match ? Number(match[1]) : 120;
    };
    const getColumnWidthPx = (column: GridColumn) => columnWidths[column.id] || getDefaultColumnWidthPx(column);
    const getColumnTrack = (column: GridColumn) => `${getColumnWidthPx(column)}px`;
    const gridTemplateColumns = `44px ${displayColumns.map(getColumnTrack).join(' ')}`;
    const gridRowStyle: React.CSSProperties = {
        gridTemplateColumns,
        width: 'max-content',
        minWidth: '100%',
    };
    const gridMinWidth = isFinanceWorkspace
        ? 'min-w-[1280px]'
        : hiddenColumns.has('location') ? 'min-w-[1040px]' : 'min-w-[1170px]';

    const freezeUpToColumn = (columnId: string) => {
        const columnIndex = visibleColumns.findIndex(column => column.id === columnId);
        if (columnIndex === -1) return;
        const nextPinned = visibleColumns.slice(0, columnIndex + 1).map(column => column.id);
        setPinnedColumns(nextPinned);
        setActiveColumnMenu(null);
        saveGridLayoutPreference(columnWidths, columnOrder, nextPinned);
        showToast(`Frozen through ${visibleColumns[columnIndex].label}`, 'success');
    };

    const unfreezeColumns = () => {
        setPinnedColumns([]);
        setActiveColumnMenu(null);
        saveGridLayoutPreference(columnWidths, columnOrder, []);
    };

    const getFrozenLeftOffset = (columnId: string) => {
        const columnIndex = displayColumns.findIndex(column => column.id === columnId);
        if (columnIndex === -1) return 44;
        return 44 + displayColumns
            .slice(0, columnIndex)
            .filter(column => pinnedColumns.includes(column.id))
            .reduce((sum, column) => sum + getColumnWidthPx(column), 0);
    };

    const getFrozenCellStyle = (columnId: string): React.CSSProperties => (
        pinnedColumns.includes(columnId)
            ? { position: 'sticky', left: `${getFrozenLeftOffset(columnId)}px` }
            : {}
    );

    const getFrozenIndexStyle = (): React.CSSProperties => ({
        position: 'sticky',
        left: 0,
    });

    const startColumnResize = (event: React.MouseEvent, column: GridColumn) => {
        event.preventDefault();
        event.stopPropagation();

        const headerCell = event.currentTarget.closest('[data-column-id]') as HTMLElement | null;
        const startX = event.clientX;
        const startWidth = columnWidths[column.id] || headerCell?.getBoundingClientRect().width || MIN_COLUMN_WIDTH;
        let latestWidths = { ...columnWidths, [column.id]: Math.round(startWidth) };

        const onMouseMove = (moveEvent: MouseEvent) => {
            const nextWidth = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + moveEvent.clientX - startX)));
            latestWidths = { ...latestWidths, [column.id]: nextWidth };
            setColumnWidths(prev => ({ ...prev, [column.id]: nextWidth }));
        };

        const onMouseUp = () => {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            saveGridLayoutPreference(latestWidths, columnOrder);
        };

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const resetColumnWidth = (event: React.MouseEvent, columnId: string) => {
        event.preventDefault();
        event.stopPropagation();
        let nextWidths: Record<string, number> = {};
        setColumnWidths(prev => {
            nextWidths = { ...prev };
            delete nextWidths[columnId];
            return nextWidths;
        });
        saveGridLayoutPreference(nextWidths, columnOrder);
    };

    const moveColumn = (sourceColumnId: string, targetColumnId: string) => {
        if (!sourceColumnId || sourceColumnId === targetColumnId) return;

        let persistedOrder: string[] = [];
        setColumnOrder(prev => {
            const currentOrder = prev.length > 0 ? prev : defaultOrderedColumns.map(column => column.id);
            const normalizedOrder = [
                ...currentOrder.filter(columnId => defaultOrderedColumns.some(column => column.id === columnId)),
                ...defaultOrderedColumns.map(column => column.id).filter(columnId => !currentOrder.includes(columnId)),
            ];
            const next = normalizedOrder.filter(columnId => columnId !== sourceColumnId);
            const targetIndex = next.indexOf(targetColumnId);
            if (targetIndex === -1) return normalizedOrder;
            next.splice(targetIndex, 0, sourceColumnId);
            persistedOrder = next;
            return next;
        });
        if (persistedOrder.length > 0) saveGridLayoutPreference(columnWidths, persistedOrder);
    };

    const startColumnReorder = (event: React.MouseEvent, column: GridColumn) => {
        if (event.button !== 0) return;
        const target = event.target as HTMLElement;
        if (target.closest('button')) return;

        event.preventDefault();
        event.stopPropagation();

        const startX = event.clientX;
        let didMove = false;
        setDraggedColumnId(column.id);

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (Math.abs(moveEvent.clientX - startX) > 6) didMove = true;
        };

        const onMouseUp = (upEvent: MouseEvent) => {
            const targetColumn = document
                .elementFromPoint(upEvent.clientX, upEvent.clientY)
                ?.closest('[data-column-id]') as HTMLElement | null;
            const targetColumnId = targetColumn?.dataset.columnId;

            if (didMove && targetColumnId) moveColumn(column.id, targetColumnId);

            setDraggedColumnId(null);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const resetColumnLayout = () => {
        const defaultHiddenColumns = isFinanceWorkspace ? FINANCE_DEFAULT_HIDDEN_COLUMNS : OPERATIONS_DEFAULT_HIDDEN_COLUMNS;
        setColumnOrder([]);
        setColumnWidths({});
        setPinnedColumns([]);
        setHiddenColumns(new Set(defaultHiddenColumns));
        setActiveColumnMenu(null);
        saveGridLayoutPreference({}, [], [], defaultHiddenColumns);
        showToast('Column layout reset for this view', 'success');
    };

    const clientScopeId = useMemo(() => new URLSearchParams(location.search).get('clientId'), [location.search]);
    const interpreterScopeId = useMemo(() => new URLSearchParams(location.search).get('interpreterId'), [location.search]);
    const serviceScope = useMemo<ServiceScope>(() => {
        const raw = new URLSearchParams(location.search).get('service');
        return raw === 'interpreting' || raw === 'translation' ? raw : 'all';
    }, [location.search]);

    const scopedBookings = useMemo(() => {
        const relationshipScoped = bookings.filter(b => {
            if (clientScopeId && b.clientId !== clientScopeId) return false;
            if (interpreterScopeId && b.interpreterId !== interpreterScopeId) return false;
            return true;
        });
        return applyServiceScope(relationshipScoped, serviceScope);
    }, [bookings, clientScopeId, interpreterScopeId, serviceScope]);

    const serviceScopeCounts = useMemo(() => {
        const relationshipScoped = bookings.filter(b => {
            if (clientScopeId && b.clientId !== clientScopeId) return false;
            if (interpreterScopeId && b.interpreterId !== interpreterScopeId) return false;
            return true;
        });
        return {
            all: relationshipScoped.length,
            interpreting: applyServiceScope(relationshipScoped, 'interpreting').length,
            translation: applyServiceScope(relationshipScoped, 'translation').length,
        };
    }, [bookings, clientScopeId, interpreterScopeId]);

    const searchFilteredBookings = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return scopedBookings;
        return scopedBookings.filter(b => (
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
    }, [scopedBookings, searchQuery]);

    const scopedClientName = useMemo(() => {
        if (!clientScopeId) return '';
        const matchingBooking = bookings.find(job => job.clientId === clientScopeId);
        return getClientCompany(clientScopeId, matchingBooking?.clientName || 'Client account');
    }, [bookings, clientScopeId, getClientCompany]);

    const scopedInterpreterName = useMemo(() => {
        if (!interpreterScopeId) return '';
        const matchingBooking = bookings.find(job => job.interpreterId === interpreterScopeId);
        return matchingBooking?.interpreterName || 'Professional';
    }, [bookings, interpreterScopeId]);

    const viewFilteredBookings = useMemo(
        () => filterBookings(searchFilteredBookings, activeView),
        [searchFilteredBookings, activeView]
    );

    const laneFilteredBookings = useMemo(() => {
        if (!isFinanceWorkspace) return viewFilteredBookings;
        if (financeLane === 'interpreterPayables') {
            return viewFilteredBookings.filter(job => [
                BookingStatus.SESSION_COMPLETED,
                BookingStatus.TIMESHEET_SUBMITTED,
                BookingStatus.TIMESHEET_VERIFIED,
                BookingStatus.READY_FOR_INVOICE,
                BookingStatus.INVOICING,
                BookingStatus.INVOICED,
                BookingStatus.PAID
            ].includes(job.status));
        }
        return viewFilteredBookings.filter(job => [
            BookingStatus.READY_FOR_INVOICE,
            BookingStatus.INVOICING,
            BookingStatus.INVOICED,
            BookingStatus.PAID,
            BookingStatus.SESSION_COMPLETED,
            BookingStatus.TIMESHEET_SUBMITTED,
            BookingStatus.TIMESHEET_VERIFIED
        ].includes(job.status));
    }, [viewFilteredBookings, isFinanceWorkspace, financeLane]);

    const quickCounts = useMemo(() => ({
        ALL: laneFilteredBookings.length,
        INTERPRETING: applyQuickFilter(laneFilteredBookings, 'INTERPRETING').length,
        TRANSLATIONS: applyQuickFilter(laneFilteredBookings, 'TRANSLATIONS').length,
        OVERDUE: applyQuickFilter(laneFilteredBookings, 'OVERDUE').length,
        TODAY: applyQuickFilter(laneFilteredBookings, 'TODAY').length,
        UNASSIGNED: applyQuickFilter(laneFilteredBookings, 'UNASSIGNED').length,
        COMPLETED: applyQuickFilter(laneFilteredBookings, 'COMPLETED').length,
        TIMESHEET: applyQuickFilter(laneFilteredBookings, 'TIMESHEET').length,
        INVOICE_READY: applyQuickFilter(laneFilteredBookings, 'INVOICE_READY').length,
        AWAITING_PAYMENT: applyQuickFilter(laneFilteredBookings, 'AWAITING_PAYMENT').length,
        CANCELLED: applyQuickFilter(laneFilteredBookings, 'CANCELLED').length,
    }), [laneFilteredBookings]);

    const quickFilterLabel = useMemo(() => {
        const labels: Record<QuickFilter, string> = {
            ALL: 'All',
            INTERPRETING: 'Interpreting',
            TRANSLATIONS: 'Translations',
            OVERDUE: 'Overdue',
            TODAY: 'Today',
            UNASSIGNED: 'Unassigned',
            COMPLETED: 'Completed',
            TIMESHEET: 'Timesheets',
            INVOICE_READY: 'Invoice ready',
            AWAITING_PAYMENT: 'Awaiting payment',
            CANCELLED: 'Cancelled',
        };
        return labels[quickFilter];
    }, [quickFilter]);

    const serviceScopeLabel = serviceScope === 'translation'
        ? 'Translation'
        : serviceScope === 'interpreting'
            ? 'Interpreting'
            : 'All services';

    const clearServiceScope = () => {
        const params = new URLSearchParams(location.search);
        params.delete('service');
        navigate(`${workspacePath}${params.toString() ? `?${params.toString()}` : ''}`, { replace: true });
    };

    const columnFilterColumn = useMemo(
        () => columnFilter ? orderedColumns.find(column => column.id === columnFilter.columnId) : null,
        [columnFilter, orderedColumns]
    );

    const hasActiveGridFilters = Boolean(searchQuery.trim() || quickFilter !== 'ALL' || columnFilter?.value.trim() || serviceScope !== 'all');

    const clearGridFilters = () => {
        setSearchQuery('');
        setQuickFilter('ALL');
        setColumnFilter(null);
        if (serviceScope !== 'all') {
            const params = new URLSearchParams(location.search);
            params.delete('service');
            navigate(`${workspacePath}${params.toString() ? `?${params.toString()}` : ''}`, { replace: true });
        }
        setCurrentPage(1);
    };

    const filteredBookings = useMemo(() => {
        const quickFiltered = applyQuickFilter(laneFilteredBookings, quickFilter);
        if (!columnFilter?.value.trim()) return quickFiltered;

        const needle = columnFilter.value.trim().toLowerCase();
        return quickFiltered.filter(job => getColumnFilterValue(job, columnFilter.columnId).toLowerCase().includes(needle));
    }, [laneFilteredBookings, quickFilter, columnFilter]);

    const sortedBookings = useMemo(() => {
        if (sortField === 'operationalPriority') {
            return [...filteredBookings].sort((a, b) => {
                const rank = getOperationalStatusRank(a) - getOperationalStatusRank(b);
                if (rank !== 0) return sortDirection === 'asc' ? rank : -rank;
                const bucket = getOperationalDateBucket(a) - getOperationalDateBucket(b);
                if (bucket !== 0) return sortDirection === 'asc' ? bucket : -bucket;
                const date = getComparableDate(a.date) - getComparableDate(b.date);
                if (date !== 0) return date;
                return String(a.displayRef || a.jobNumber || a.bookingRef || a.id).localeCompare(String(b.displayRef || b.jobNumber || b.bookingRef || b.id), undefined, { numeric: true, sensitivity: 'base' });
            });
        }

        if (sortField === 'financePriority') {
            return [...filteredBookings].sort((a, b) => {
                const rank = getFinanceStatusRank(a) - getFinanceStatusRank(b);
                if (rank !== 0) return sortDirection === 'asc' ? rank : -rank;
                const date = getFinanceDate(a) - getFinanceDate(b);
                if (date !== 0) return sortDirection === 'asc' ? date : -date;
                return getCompanyName(a).localeCompare(getCompanyName(b), undefined, { numeric: true, sensitivity: 'base' });
            });
        }

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
    }, [filteredBookings, columns, sortField, sortDirection, getClientCompany]);

    const financeSummary = useMemo(() => {
        const totalClientCharge = sortedBookings.reduce((sum, job) => sum + Number(job.totalAmount || 0), 0);
        const getProfessionalCost = (job: Booking) => Number((job as any).interpreterAmountCalculated || (job as any).professionalCost || 0);
        const totalProfessionalCost = sortedBookings.reduce((sum, job) => sum + getProfessionalCost(job), 0);
        const readyForInvoice = sortedBookings.filter(job => invoiceWorkStatuses.includes(job.status));
        const awaitingPayment = sortedBookings.filter(job => job.status === BookingStatus.INVOICED);
        const missingCostCode = sortedBookings.filter(job => !job.costCode);
        const timesheetNeeded = sortedBookings.filter(job => job.status === BookingStatus.SESSION_COMPLETED);
        const timesheetReview = sortedBookings.filter(job => job.status === BookingStatus.TIMESHEET_SUBMITTED);
        const uniqueProfessionals = new Set(sortedBookings.map(job => job.interpreterId || job.interpreterName).filter(Boolean));
        return {
            totalClientCharge,
            totalProfessionalCost,
            readyCount: readyForInvoice.length,
            readyAmount: readyForInvoice.reduce((sum, job) => sum + Number(job.totalAmount || 0), 0),
            payRunReadyAmount: readyForInvoice.reduce((sum, job) => sum + getProfessionalCost(job), 0),
            awaitingPaymentCount: awaitingPayment.length,
            awaitingPaymentAmount: awaitingPayment.reduce((sum, job) => sum + Number(job.totalAmount || 0), 0),
            missingCostCodeCount: missingCostCode.length,
            timesheetNeededCount: timesheetNeeded.length,
            timesheetReviewCount: timesheetReview.length,
            uniqueProfessionalCount: uniqueProfessionals.size,
        };
    }, [sortedBookings]);

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
    }, [searchQuery, quickFilter, sortField, sortDirection, groupField, activeView.id, pageSize, financeLane]);

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

    const toggleColumn = (columnId: string) => {
        let nextHidden: string[] = [];
        setHiddenColumns(prev => {
            const next = new Set(prev);
            if (next.has(columnId)) next.delete(columnId);
            else next.add(columnId);
            nextHidden = Array.from(next);
            return next;
        });
        saveGridLayoutPreference(columnWidths, columnOrder, pinnedColumns, nextHidden);
    };

    const clearLocalFilters = () => {
        setSearchQuery('');
        setQuickFilter('ALL');
        setColumnFilter(null);
        setCurrentPage(1);
    };

    const selectWorkspaceView = (viewId: string) => {
        setActiveViewId(viewId);
        setColumnFilter(null);
        setCurrentPage(1);
    };

    const openViewEditor = (viewId: string | null) => {
        setEditingViewId(viewId);
        setIsViewManagerOpen(true);
        setIsViewsMenuOpen(false);
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

    const handleRecordInterpreterInvoiceReceived = async (job: Booking) => {
        const ok = await confirm({
            title: 'Record Interpreter Invoice',
            message: 'Use this when Accounts received or created the interpreter payable outside the platform.',
            confirmLabel: 'Record Payable',
            variant: 'primary',
        });
        if (!ok) return;

        try {
            await BillingService.recordManualInterpreterInvoiceReceived(job.id);
            refresh();
            showToast('Interpreter invoice recorded', 'success');
        } catch (e: any) {
            showToast(e?.message || 'Failed to record interpreter invoice', 'error');
        }
    };

    const handleRecordInterpreterPaymentSent = async (job: Booking) => {
        const ok = await confirm({
            title: 'Record Interpreter Payment',
            message: 'Use this when Accounts confirmed the interpreter payable has been paid.',
            confirmLabel: 'Mark Paid',
            variant: 'primary',
        });
        if (!ok) return;

        try {
            await BillingService.recordManualInterpreterPaymentSent(job.id);
            refresh();
            showToast('Interpreter payment recorded', 'success');
        } catch (e: any) {
            showToast(e?.message || 'Failed to record interpreter payment', 'error');
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

    const handleFlagBillingIssue = async (job: Booking) => {
        const ok = await confirm({
            title: 'Flag Billing Issue',
            message: 'This keeps the job in its current stage but marks it for Accounts review. Use it for missing PO, amount mismatch, invoice discrepancy or payment query.',
            confirmLabel: 'Flag Issue',
            variant: 'warning',
        });
        if (!ok) return;

        try {
            const timestamp = new Date().toLocaleString('en-GB');
            const existingNotes = job.adminNotes || '';
            await BookingService.update(job.id, {
                ...({
                    billingIssueFlag: true,
                    billingIssueRaisedAt: new Date().toISOString(),
                    paymentStatus: 'ISSUE',
                    adminNotes: `${existingNotes}${existingNotes ? '\n' : ''}[${timestamp}] Finance issue flagged for Accounts review.`,
                } as any),
            });
            refresh();
            if (selectedJob?.id === job.id) {
                setSelectedJob({
                    ...job,
                    adminNotes: `${existingNotes}${existingNotes ? '\n' : ''}[${timestamp}] Finance issue flagged for Accounts review.`,
                });
            }
            showToast('Billing issue flagged for Accounts review', 'success');
        } catch (e: any) {
            showToast(e?.message || 'Failed to flag billing issue', 'error');
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
        ...(isFinanceWorkspace && financeLane === 'interpreterPayables' && (job as any).interpreterInvoiceId && (job as any).interpreterPaymentStatus !== 'PAID'
            ? [{ label: 'Mark Interpreter Paid', icon: PoundSterling, onClick: () => handleRecordInterpreterPaymentSent(job) }]
            : []),
        ...(invoiceWorkStatuses.includes(job.status)
            ? [{
                label: isFinanceWorkspace && financeLane === 'interpreterPayables' ? 'Record Interpreter Invoice' : 'Mark Invoiced',
                icon: Receipt,
                onClick: () => isFinanceWorkspace && financeLane === 'interpreterPayables'
                    ? handleRecordInterpreterInvoiceReceived(job)
                    : handleRecordInvoiceIssued(job)
            }]
            : []),
        ...(job.status === BookingStatus.INVOICED
            ? [{
                label: isFinanceWorkspace && financeLane === 'interpreterPayables' ? 'Mark Interpreter Paid' : 'Mark Paid',
                icon: isFinanceWorkspace && financeLane === 'interpreterPayables' ? PoundSterling : Receipt,
                onClick: () => isFinanceWorkspace && financeLane === 'interpreterPayables'
                    ? handleRecordInterpreterPaymentSent(job)
                    : handleRecordPaymentReceived(job)
            }]
            : []),
        ...(isFinanceWorkspace
            ? [{ label: 'Flag Billing Issue', icon: AlertCircle, onClick: () => handleFlagBillingIssue(job) }]
            : []),
        { label: 'Copy Job URL', icon: Copy, onClick: () => navigator.clipboard?.writeText(`${window.location.origin}/#/admin/bookings/${job.id}`) },
        { label: 'Cancel Job', icon: Trash2, variant: 'danger' as const, onClick: () => handleQuickStatusChange(job, BookingStatus.CANCELLED) },
    ];

    const ColumnMenu = ({ column }: { column: GridColumn }) => (
        <div data-column-menu="true" className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <button
                onClick={(event) => { openToolPanel('hide', event, 288, true); setActiveColumnMenu(null); }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                <Pencil size={15} /> Field settings
            </button>
            <button
                onClick={async () => {
                    await navigator.clipboard?.writeText(column.label);
                    showToast(`Copied "${column.label}"`, 'success');
                    setActiveColumnMenu(null);
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                <Copy size={15} /> Copy field name
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
                onClick={(event) => {
                    setColumnFilter(current => current?.columnId === column.id ? current : { columnId: column.id, value: '' });
                    openToolPanel('filter', event, 320, true);
                    setActiveColumnMenu(null);
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                <Filter size={15} /> Filter by this field
            </button>
            <button
                onClick={() => freezeUpToColumn(column.id)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                <Pin size={15} /> Freeze up to this field
            </button>
            {pinnedColumns.length > 0 && (
                <button
                    onClick={unfreezeColumns}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                    <PinOff size={15} /> Unfreeze fields
                </button>
            )}
            <button
                onClick={(event) => {
                    resetColumnWidth(event, column.id);
                    setActiveColumnMenu(null);
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                <Maximize2 size={15} /> Reset column width
            </button>
            <button
                onClick={resetColumnLayout}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
                <LayoutGrid size={15} /> Reset view layout
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

        const panelClassName = "rounded-lg border border-slate-200 bg-white p-3 shadow-2xl ring-1 ring-slate-950/5 dark:border-slate-800 dark:bg-slate-900 dark:ring-white/10";
        const renderPanel = (content: React.ReactNode, width = toolPanelPosition?.width || 288) => {
            if (!toolPanelPosition) return null;
            return createPortal(
                <div
                    ref={toolPanelRef}
                    data-tool-panel="true"
                    className={`${panelClassName} fixed z-[1000] max-h-[calc(100dvh-7rem)] overflow-auto`}
                    style={{
                        top: toolPanelPosition.top,
                        left: Math.min(toolPanelPosition.left, Math.max(12, window.innerWidth - width - 12)),
                        width,
                    }}
                >
                    {content}
                </div>,
                document.body
            );
        };

        if (activeToolPanel === 'hide') {
            return renderPanel(
                <>
                    <p className="mb-2 text-xs font-semibold text-slate-500">Visible fields</p>
                    <div className="space-y-1">
                        {orderedColumns.filter(c => !c.primary).map(column => (
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
                </>,
                288
            );
        }

        if (activeToolPanel === 'filter') {
            const filteredColumn = columnFilter ? orderedColumns.find(column => column.id === columnFilter.columnId) : null;
            const operationsQuickFilterOptions: Array<[QuickFilter, string, number]> = [
                ['ALL', 'All', quickCounts.ALL],
                ['INTERPRETING', 'Interpreting', quickCounts.INTERPRETING],
                ['TRANSLATIONS', 'Translations', quickCounts.TRANSLATIONS],
                ['OVERDUE', 'Overdue', quickCounts.OVERDUE],
                ['TODAY', 'Today', quickCounts.TODAY],
                ['UNASSIGNED', 'Unassigned', quickCounts.UNASSIGNED],
                ['COMPLETED', 'Completed', quickCounts.COMPLETED],
                ['TIMESHEET', 'Timesheets', quickCounts.TIMESHEET],
                ['INVOICE_READY', 'Invoice ready', quickCounts.INVOICE_READY],
                ['AWAITING_PAYMENT', 'Awaiting payment', quickCounts.AWAITING_PAYMENT],
                ['CANCELLED', 'Cancelled', quickCounts.CANCELLED],
            ];
            const financeQuickFilterOptions: Array<[QuickFilter, string, number]> = [
                ['ALL', 'All finance jobs', quickCounts.ALL],
                ['TIMESHEET', 'Timesheets', quickCounts.TIMESHEET],
                ['INVOICE_READY', 'Invoice ready', quickCounts.INVOICE_READY],
                ['AWAITING_PAYMENT', 'Awaiting payment', quickCounts.AWAITING_PAYMENT],
                ['COMPLETED', 'Completed', quickCounts.COMPLETED],
                ['INTERPRETING', 'Interpreting', quickCounts.INTERPRETING],
                ['TRANSLATIONS', 'Translations', quickCounts.TRANSLATIONS],
                ['CANCELLED', 'Cancelled', quickCounts.CANCELLED],
            ];
            const quickFilterOptions = (isFinanceWorkspace ? financeQuickFilterOptions : operationsQuickFilterOptions)
                .filter(([value]) => serviceScope === 'all' || (value !== 'INTERPRETING' && value !== 'TRANSLATIONS'));
            return renderPanel(
                <>
                    {filteredColumn && (
                        <div className="mb-3 rounded-md border border-blue-100 bg-blue-50 p-2 dark:border-blue-900/50 dark:bg-blue-950/30">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="truncate text-xs font-black uppercase tracking-wide text-blue-700 dark:text-blue-300">
                                    Filter: {filteredColumn.label}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setColumnFilter(null)}
                                    className="rounded px-1.5 py-1 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                                >
                                    Clear
                                </button>
                            </div>
                            <input
                                value={columnFilter?.value || ''}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setColumnFilter(current => current ? { ...current, value } : { columnId: filteredColumn.id, value });
                                    setCurrentPage(1);
                                }}
                                placeholder={`Contains ${filteredColumn.label.toLowerCase()}...`}
                                className="h-9 w-full rounded-md border border-blue-200 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-blue-900/60 dark:bg-slate-950 dark:text-white"
                                autoFocus
                            />
                        </div>
                    )}
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-500">Quick filters</p>
                        {(quickFilter !== 'ALL' || columnFilter) && (
                            <button
                                onClick={() => {
                                    setQuickFilter('ALL');
                                    setColumnFilter(null);
                                }}
                                className="rounded-md px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40"
                            >
                                Clear all
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {quickFilterOptions.map(([value, label, count]) => (
                            <button
                                key={value}
                                onClick={() => {
                                    setQuickFilter(value);
                                    setCurrentPage(1);
                                }}
                                className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-semibold ${quickFilter === value ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                            >
                                <span>{label}</span>
                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${quickFilter === value ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/70 dark:text-blue-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{count}</span>
                            </button>
                        ))}
                    </div>
                </>,
                320
            );
        }

        if (activeToolPanel === 'group') {
            const options: Array<[GroupField, string]> = [['none', 'No grouping'], ['view', 'Use view grouping'], ['status', 'Status'], ['date', 'Booked date'], ['client', 'Client'], ['interpreter', 'Interpreter']];
            return renderPanel(
                <>
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
                </>,
                288
            );
        }

        const sortOptions: Array<[SortField, string]> = [
            ...(isFinanceWorkspace
                ? [[ 'financePriority', 'Billing priority' ] as [SortField, string]]
                : [[ 'operationalPriority', 'Operational priority' ] as [SortField, string]]),
            ['date', 'Booked date'] as [SortField, string],
            ['bookingRef', 'Job number'] as [SortField, string],
            ['status', 'Status'] as [SortField, string],
            ['client', 'Client'] as [SortField, string],
            ['language', 'Language'] as [SortField, string],
            ['interpreter', 'Interpreter'] as [SortField, string]
        ];
        return renderPanel(
            <>
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
            </>,
            288
        );
    };

    const renderGridRow = (job: Booking, rowIndex: number) => {
        const selected = selectedIds.includes(job.id);
        const translation = isTranslationJob(job);
        const rowBgClass = selected
            ? 'bg-blue-50 dark:bg-blue-950/30'
            : translation
                ? 'bg-violet-50/35 hover:bg-violet-50 dark:bg-violet-950/10 dark:hover:bg-violet-950/20'
                : 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60';
        const frozenCellBgClass = selected
            ? 'bg-amber-50 dark:bg-amber-950/80'
            : translation
                ? 'bg-amber-50 dark:bg-amber-950/80'
                : 'bg-amber-50 dark:bg-amber-950/80';
        const row = (
            <div
                className={`grid min-h-11 cursor-pointer border-b border-slate-200 text-sm transition-colors dark:border-slate-800 ${rowBgClass}`}
                style={gridRowStyle}
                onClick={() => handleRowClick(job)}
                onDoubleClick={() => openJobDetails(job)}
            >
                <div
                    data-frozen-cell="true"
                    className="relative z-20 flex items-center justify-center border-r border-slate-200 bg-slate-50 text-xs text-slate-500 shadow-[1px_0_0_rgba(148,163,184,0.35)] dark:border-slate-800 dark:bg-slate-950"
                    style={getFrozenIndexStyle()}
                >
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
                {displayColumns.map(column => (
                    <div
                        key={column.id}
                        data-frozen-cell={pinnedColumns.includes(column.id) ? 'true' : undefined}
                        className={`flex min-w-0 items-center overflow-hidden border-r border-slate-200 px-3 py-2 dark:border-slate-800 ${pinnedColumns.includes(column.id) ? `relative z-10 ${frozenCellBgClass} shadow-[1px_0_0_rgba(148,163,184,0.45)]` : ''}`}
                        style={getFrozenCellStyle(column.id)}
                    >
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
        <div className="flex h-full min-w-0 overflow-hidden bg-white dark:bg-slate-950">
            <WorkspaceViewSidebar
                activeView={activeView}
                views={views}
                viewSearchQuery={viewSearchQuery}
                isCollapsed={isViewsSidebarCollapsed}
                sectionLabel={isFinanceWorkspace ? 'Finance Views' : 'Job Views'}
                fallbackViewName={isFinanceWorkspace ? 'All Finance Records' : 'All Jobs'}
                onSearchChange={setViewSearchQuery}
                onCollapsedChange={setIsViewsSidebarCollapsed}
                onCreateView={() => openViewEditor(null)}
                onEditView={openViewEditor}
                onSelectView={selectWorkspaceView}
                onToggleFavorite={toggleViewFavorite}
                onReorderView={reorderViews}
                getViewCount={(view) => filterBookings(searchFilteredBookings, view).length}
            />

            <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div ref={toolsRef} data-jobs-toolbar="true" className="relative z-[90] shrink-0 border-b border-slate-200 bg-white shadow-sm shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
                <div className="flex flex-col gap-2 border-b border-slate-200 p-2 dark:border-slate-800 xl:flex-row xl:items-center">
                    <div className="relative" ref={viewsMenuRef}>
                        <WorkspaceViewMenu
                            activeView={activeView}
                            views={views}
                            viewSearchQuery={viewSearchQuery}
                            isOpen={isViewsMenuOpen}
                            sectionLabel={isFinanceWorkspace ? 'Finance Views' : 'Job Views'}
                            fallbackViewName={isFinanceWorkspace ? 'All Finance Records' : 'All Jobs'}
                            activeCount={viewFilteredBookings.length}
                            onOpenChange={setIsViewsMenuOpen}
                            onSearchChange={setViewSearchQuery}
                            onCreateView={() => openViewEditor(null)}
                            onEditView={openViewEditor}
                            onSelectView={selectWorkspaceView}
                            onToggleFavorite={toggleViewFavorite}
                            onReorderView={reorderViews}
                            getViewCount={(view) => filterBookings(searchFilteredBookings, view).length}
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-1 xl:order-3">
                        {isFinanceWorkspace && (
                            <FinanceLaneToggle
                                lane={financeLane}
                                onLaneChange={(lane) => {
                                    setFinanceLane(lane);
                                    setQuickFilter('ALL');
                                    setCurrentPage(1);
                                }}
                            />
                        )}
                        <Button onClick={refresh} icon={RefreshCw} variant="ghost" size="sm">Refresh</Button>
                        {isFinanceWorkspace && <Button onClick={() => navigate('/admin/billing/overview')} icon={PoundSterling} variant="ghost" size="sm">Overview</Button>}
                        {!isFinanceWorkspace && <Button onClick={() => navigate('/admin/bookings/new')} icon={Plus} size="sm">New</Button>}
                        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                            <button
                                type="button"
                                onClick={() => setWorkspaceBoardMode('table')}
                                className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-black ${boardMode === 'table' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                            >
                                <List size={14} /> Table
                            </button>
                            <button
                                type="button"
                                onClick={() => setWorkspaceBoardMode('calendar')}
                                className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-black ${boardMode === 'calendar' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                            >
                                <CalendarDays size={14} /> Calendar
                            </button>
                        </div>
                        <ToolButton icon={EyeOff} label="Hide fields" active={activeToolPanel === 'hide'} onClick={(event) => openToolPanel('hide', event, 288)} />
                        <ToolButton icon={Filter} label="Filter" active={activeToolPanel === 'filter' || quickFilter !== 'ALL' || Boolean(columnFilter) || serviceScope !== 'all'} onClick={(event) => openToolPanel('filter', event, 320)} />
                        <ToolButton icon={Group} label="Group" active={activeToolPanel === 'group' || groupField !== 'view'} onClick={(event) => openToolPanel('group', event, 288)} />
                        <ToolButton icon={ArrowUpDown} label="Sort" active={activeToolPanel === 'sort'} onClick={(event) => openToolPanel('sort', event, 288)} />
                        <ToolButton icon={Maximize2} label={clientScopeId || interpreterScopeId ? 'All jobs' : 'Open'} onClick={() => navigate(workspacePath)} />
                        <ToolPanelContent />
                    </div>

                    <div data-jobs-search="true" className="relative min-w-0 flex-1 xl:order-2">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search ref, client, contact, language, interpreter, postcode"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-950 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setCurrentPage(1);
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                aria-label="Clear search"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

            </div>

            {hasActiveGridFilters && (
                <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
                    <span className="font-black uppercase tracking-wide text-slate-400">Active filters</span>
                    {searchQuery.trim() && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchQuery('');
                                setCurrentPage(1);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                        >
                            Search: {searchQuery.trim()}
                            <X size={12} />
                        </button>
                    )}
                    {quickFilter !== 'ALL' && (
                        <button
                            type="button"
                            onClick={() => {
                                setQuickFilter('ALL');
                                setCurrentPage(1);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-blue-700 hover:border-blue-300 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200"
                        >
                            View filter: {quickFilterLabel}
                            <X size={12} />
                        </button>
                    )}
                    {serviceScope !== 'all' && (
                        <button
                            type="button"
                            onClick={clearServiceScope}
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 hover:border-emerald-300 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
                        >
                            Service: {serviceScopeLabel} ({serviceScopeCounts[serviceScope]})
                            <X size={12} />
                        </button>
                    )}
                    {columnFilter?.value.trim() && columnFilterColumn && (
                        <button
                            type="button"
                            onClick={() => {
                                setColumnFilter(null);
                                setCurrentPage(1);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-1 font-semibold text-violet-700 hover:border-violet-300 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200"
                        >
                            {columnFilterColumn.label}: {columnFilter.value.trim()}
                            <X size={12} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={clearGridFilters}
                        className="ml-auto rounded-md px-2 py-1 font-black uppercase tracking-wide text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                        Clear all
                    </button>
                </div>
            )}

            {(clientScopeId || interpreterScopeId) && (
                <div className="shrink-0 flex items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                    <div className="flex items-center gap-2 font-semibold">
                        {clientScopeId ? <Building2 size={14} /> : <User size={14} />}
                        Showing {clientScopeId ? 'client jobs' : 'professional jobs'} for <span className="font-black">{clientScopeId ? scopedClientName : scopedInterpreterName}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate(workspacePath)}
                        className="rounded-md px-2 py-1 font-black uppercase tracking-widest hover:bg-blue-100 dark:hover:bg-blue-900/40"
                    >
                        Clear {clientScopeId ? 'client' : 'professional'} scope
                    </button>
                </div>
            )}

            {isFinanceWorkspace && (
                <FinanceSummaryBar lane={financeLane} recordCount={sortedBookings.length} summary={financeSummary} />
            )}

            {boardMode === 'calendar' ? (
                <JobsCalendar
                    jobs={sortedBookings}
                    workspace={workspace}
                    viewMode={calendarViewMode}
                    cursorDate={calendarCursorDate}
                    onViewModeChange={setWorkspaceCalendarView}
                    onCursorChange={setCalendarCursorDate}
                    onOpenJob={handleRowClick}
                    getCompanyName={getCompanyName}
                />
            ) : (
            <>
            <div className="relative z-0 min-h-0 min-w-0 flex-1 isolate overflow-hidden border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div
                    data-jobs-grid-scroll="true"
                    className="h-full min-w-0 overflow-auto overscroll-contain"
                >
                    <div className={`${gridMinWidth} min-w-full`}>
                        <div
                            data-jobs-grid-header="true"
                            className="sticky top-0 z-40 grid h-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 shadow-[0_1px_0_rgba(148,163,184,0.35)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                            style={gridRowStyle}
                        >
                            <div
                                data-frozen-cell="true"
                                className="relative z-50 flex items-center justify-center border-r border-slate-200 bg-slate-50 shadow-[1px_0_0_rgba(148,163,184,0.35)] dark:border-slate-800 dark:bg-slate-950"
                                style={getFrozenIndexStyle()}
                            >
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
                            {displayColumns.map(column => (
                                <div
                                    key={column.id}
                                    data-column-id={column.id}
                                    onMouseDown={(event) => startColumnReorder(event, column)}
                                    data-frozen-cell={pinnedColumns.includes(column.id) ? 'true' : undefined}
                                    className={`group/header relative flex min-w-0 cursor-grab items-center justify-between gap-2 border-r border-slate-200 px-3 active:cursor-grabbing dark:border-slate-800 ${pinnedColumns.includes(column.id) ? 'z-50 bg-amber-100 shadow-[2px_0_0_rgb(203,213,225)] dark:bg-amber-950 dark:shadow-[2px_0_0_rgb(30,41,59)]' : 'bg-slate-50 dark:bg-slate-950'} ${draggedColumnId === column.id ? 'opacity-45' : ''}`}
                                    style={getFrozenCellStyle(column.id)}
                                >
                                    <div className="flex min-w-0 items-center gap-2">
                                        <column.icon size={14} className="shrink-0 text-slate-400" />
                                        <span className="truncate">{column.label}</span>
                                        {pinnedColumns.includes(column.id) && <Pin size={11} className="shrink-0 text-blue-500" />}
                                    </div>
                                    <button
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setActiveColumnMenu(activeColumnMenu === column.id ? null : column.id);
                                        }}
                                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                                        aria-label={`Open ${column.label} menu`}
                                        title={`${column.label} options`}
                                    >
                                        <ChevronDown size={13} />
                                    </button>
                                    {activeColumnMenu === column.id && <ColumnMenu column={column} />}
                                    <button
                                        type="button"
                                        onMouseDown={(event) => startColumnResize(event, column)}
                                        onDoubleClick={(event) => resetColumnWidth(event, column.id)}
                                        className="absolute -right-1 top-0 z-20 h-full w-2 cursor-col-resize touch-none opacity-0 transition-opacity hover:opacity-100 group-hover/header:opacity-100"
                                        aria-label={`Resize ${column.label} column`}
                                        title="Drag to resize. Double-click to reset."
                                    >
                                        <span className="mx-auto block h-full w-px bg-blue-500/70" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div>
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

            <WorkspacePagination
                totalCount={sortedBookings.length}
                pageStartIndex={pageStartIndex}
                pageEndIndex={pageEndIndex}
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                onPreviousPage={() => setCurrentPage(page => Math.max(1, page - 1))}
                onNextPage={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                onPageSizeChange={(nextPageSize) => {
                    setPageSize(nextPageSize);
                    setCurrentPage(1);
                }}
            />
            </>
            )}

            <BulkActionBar
                selectedIds={selectedIds}
                selectedCount={selectedIds.length}
                totalCount={sortedBookings.length}
                entityLabel="job"
                isLoading={isBulkLoading}
                onClearSelection={() => setSelectedIds([])}
                onSelectAll={() => setSelectedIds(sortedBookings.map(b => b.id))}
                actions={isFinanceWorkspace ? [
                    { label: 'Timesheet', icon: FileText, onClick: (ids) => handleBulkManualStep(ids, 'Record Timesheet', async job => { await BillingService.recordManualTimesheetReceived(job.id); }) },
                    { label: 'Verify', icon: CheckCircle2, onClick: (ids) => handleBulkManualStep(ids, 'Verify Timesheet', job => BillingService.approveTimesheetByBookingId(job.id)), variant: 'success' },
                    {
                        label: financeLane === 'interpreterPayables' ? 'Payable' : 'Invoice',
                        icon: Receipt,
                        onClick: (ids) => handleBulkManualStep(
                            ids,
                            financeLane === 'interpreterPayables' ? 'Record Interpreter Invoice' : 'Mark Invoiced',
                            job => financeLane === 'interpreterPayables'
                                ? BillingService.recordManualInterpreterInvoiceReceived(job.id)
                                : BillingService.recordManualInvoiceIssued(job.id)
                        )
                    },
                    {
                        label: 'Paid',
                        icon: PoundSterling,
                        onClick: (ids) => handleBulkManualStep(
                            ids,
                            financeLane === 'interpreterPayables' ? 'Mark Interpreter Paid' : 'Mark Paid',
                            job => financeLane === 'interpreterPayables'
                                ? BillingService.recordManualInterpreterPaymentSent(job.id)
                                : BillingService.recordManualPaymentReceived(job.id)
                        ),
                        variant: 'success'
                    },
                    { label: 'Flag issue', icon: AlertCircle, onClick: (ids) => handleBulkManualStep(ids, 'Flag Billing Issue', async job => {
                        await BookingService.update(job.id, {
                            ...({
                                billingIssueFlag: true,
                                billingIssueRaisedAt: new Date().toISOString(),
                                paymentStatus: 'ISSUE',
                                adminNotes: `${job.adminNotes || ''}${job.adminNotes ? '\n' : ''}[${new Date().toLocaleString('en-GB')}] Finance issue flagged in bulk for Accounts review.`,
                            } as any),
                        });
                    }), variant: 'warning' },
                ] : [
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
                                {isFinanceWorkspace && financeLane === 'interpreterPayables' && (selectedJob as any).interpreterInvoiceId && (selectedJob as any).interpreterPaymentStatus !== 'PAID' && (
                                    <Button size="sm" onClick={() => handleRecordInterpreterPaymentSent(selectedJob)} icon={PoundSterling} className="col-span-2">Mark interpreter paid</Button>
                                )}
                                {invoiceWorkStatuses.includes(selectedJob.status) && (
                                    isFinanceWorkspace && financeLane === 'interpreterPayables'
                                        ? <Button size="sm" onClick={() => handleRecordInterpreterInvoiceReceived(selectedJob)} icon={Receipt} className="col-span-2">Record payable</Button>
                                        : <Button size="sm" onClick={() => handleRecordInvoiceIssued(selectedJob)} icon={Receipt} className="col-span-2">Mark invoiced</Button>
                                )}
                                {selectedJob.status === BookingStatus.INVOICED && (
                                    isFinanceWorkspace && financeLane === 'interpreterPayables'
                                        ? <Button size="sm" onClick={() => handleRecordInterpreterPaymentSent(selectedJob)} icon={PoundSterling} className="col-span-2">Mark interpreter paid</Button>
                                        : <Button size="sm" onClick={() => handleRecordPaymentReceived(selectedJob)} icon={Receipt} className="col-span-2">Mark paid</Button>
                                )}
                                {selectedJob.status === BookingStatus.PAID && (
                                    <p className="col-span-2 rounded-md bg-emerald-50 p-2 text-center text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Completed and paid</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <DetailLabel label="Schedule" value={<>{formatDate(selectedJob.date, { weekday: 'long', day: 'numeric', month: 'long' })}<br /><span className="text-blue-600 dark:text-blue-400">{selectedJob.startTime || 'TBC'} {selectedJob.durationMinutes ? `(${selectedJob.durationMinutes}m)` : ''}</span></>} />
                            <DetailLabel label="Service" value={<>{formatLanguagePair(selectedJob.languageFrom, selectedJob.languageTo)}<br /><span className="text-slate-500">{selectedJob.serviceType || selectedJob.serviceCategory}</span></>} />
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
                workspace={workspace}
            />
            </section>
        </div>
    );
};
