import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronLeft,
  CheckCircle2,
  CreditCard,
  Download,
  Edit2,
  FileText,
  Globe2,
  History,
  Mail,
  MessageSquare,
  MoreVertical,
  Phone,
  Receipt,
  ShieldCheck,
  Trash2,
  User,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { BookingService } from '../../../services/bookingService';
import { BillingService } from '../../../services/billingService';
import { ChatService } from '../../../services/chatService';
import { Booking, BookingStatus, ServiceCategory, Timesheet } from '../../../types';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { PdfService } from '../../../services/pdfService';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Spinner } from '../../../components/ui/Spinner';
import { StatusBadge } from '../../../components/StatusBadge';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { useChat } from '../../../context/ChatContext';
import { useAuth } from '../../../context/AuthContext';
import { useClients } from '../../../context/ClientContext';
import { ActivityTimeline } from '../../../components/operations/ActivityTimeline';
import { InterpreterAllocationDrawer } from '../../../components/operations/InterpreterAllocationDrawer';
import { InterpreterPreviewDrawer } from '../../../components/operations/InterpreterPreviewDrawer';
import { LocationMap } from '../../../components/ui/LocationMap';
import { formatLanguagePair } from '../../../utils/languageDisplay';
import { getServiceCategoryLabel, getServiceTypeLabel } from '../../../utils/serviceTypeDisplay';
import {
  BookingWorkflowFocus,
  BookingWorkflowStepper,
} from '../../../components/bookings/BookingWorkflowTracker';
import {
  BookingWorkflowStepId,
  buildBookingWorkflowSteps,
  getCurrentBookingWorkflowStep,
} from '../../../utils/bookingWorkflow';
import {
  BookingEssentialsStrip,
  BookingNavigationState,
  BookingRecordHeader,
  BookingSection as Section,
  createBookingDetailNavigationState,
} from '../../../components/bookings/BookingRecordShell';

const formatDate = (value: any, options?: Intl.DateTimeFormatOptions): string => {
  if (!value) return 'N/A';
  try {
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-GB', options || { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return 'N/A';
  }
};

const formatMoney = (amount?: number) => `GBP ${(amount || 0).toFixed(2)}`;

const formatDateTime = (value?: string): string => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const formatSource = (source?: string, recordedByStaff?: boolean) => {
  if (recordedByStaff) return 'Staff manual';
  if (source === 'AIRTABLE_MIRROR') return 'Airtable mirror';
  if (source === 'SYSTEM_IMPORT') return 'System import';
  if (source === 'INTERPRETER_APP') return 'Interpreter app';
  return 'Unknown source';
};

const formatBookingSource = (source?: string) => {
  if (source === 'AIRTABLE') return 'Airtable mirror';
  if (source === 'CLIENT_PORTAL') return 'Client portal';
  if (source === 'STAFF_MANUAL') return 'Staff manual';
  if (source === 'INTERPRETER_APP') return 'Interpreter app';
  if (source === 'PLATFORM') return 'Platform';
  return source || 'Unknown';
};

const getSyncTone = (status?: string) => {
  if (status === 'SYNCED') return 'success';
  if (status === 'CONFLICT') return 'danger';
  if (status === 'ARCHIVED') return 'muted';
  return 'warning';
};

const getSyncBadgeClass = (status?: string) => ({
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  danger: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
  muted: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
}[getSyncTone(status)]);

const getBookingMoment = (booking: Booking): Date | null => {
  const rawDate = booking.serviceCategory === ServiceCategory.TRANSLATION
    ? (booking.translationDeadline || booking.date)
    : booking.date;
  if (!rawDate) return null;

  const date = (rawDate as any)?.toDate ? (rawDate as any).toDate() : new Date(rawDate as any);
  if (Number.isNaN(date.getTime())) return null;

  if (booking.serviceCategory !== ServiceCategory.TRANSLATION && booking.startTime) {
    const [hours, minutes] = booking.startTime.split(':').map(Number);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) date.setHours(hours, minutes, 0, 0);
  }
  return date;
};

const InfoItem = ({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ElementType }) => (
  <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
    <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {Icon && <Icon size={13} />}
      {label}
    </div>
    <div className="text-sm font-semibold leading-6 text-slate-950 dark:text-white">{value}</div>
  </div>
);

const EssentialField = ({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ElementType;
  tone?: 'default' | 'warning' | 'success';
}) => {
  const valueClass = tone === 'warning'
    ? 'text-amber-700 dark:text-amber-300'
    : tone === 'success'
      ? 'text-emerald-700 dark:text-emerald-300'
      : 'text-slate-950 dark:text-white';

  return (
    <div className="min-w-0 py-1">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
        <Icon size={13} className="shrink-0" />
        <span>{label}</span>
      </div>
      <div className={`mt-1 min-w-0 text-sm font-semibold leading-6 ${valueClass}`}>{value}</div>
    </div>
  );
};

type RecordPanel = 'source' | 'activity' | 'finance' | 'location' | null;

export const AdminBookingDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { openThread } = useChat();
  const { user } = useAuth();
  const { getClientCompany } = useClients();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAllocationDrawerOpen, setIsAllocationDrawerOpen] = useState(false);
  const [selectedInterpreterId, setSelectedInterpreterId] = useState<string | null>(null);
  const [isInterpreterPreviewOpen, setIsInterpreterPreviewOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<RecordPanel>(null);
  const [selectedWorkflowStep, setSelectedWorkflowStep] = useState<BookingWorkflowStepId | null>(null);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [timesheet, setTimesheet] = useState<Timesheet | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const routeState = location.state as BookingNavigationState | null;
  const returnLabel = routeState?.returnLabel || 'Previous page';
  const bookingContextState = createBookingDetailNavigationState(
    `${location.pathname}${location.search}`,
    routeState,
  );
  const goBackToContext = () => {
    if (routeState?.returnTo) {
      navigate(routeState.returnTo, { state: routeState.returnState });
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/admin/bookings');
  };

  const loadBooking = async () => {
    try {
      if (!id) return;
      const data = await BookingService.getById(id);
      setBooking(data || null);
    } catch {
      showToast('Failed to load booking details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadOperationalArtifacts = async () => {
    if (!id) return;
    await Promise.all([
      BillingService.getTimesheetByBookingId(id).then(setTimesheet).catch(() => setTimesheet(null)),
      BookingService.getJobEvents(id).then(setAuditEvents).catch(() => {}),
    ]);
  };

  useEffect(() => {
    if (id) {
      setSelectedWorkflowStep(null);
      loadBooking();
      loadOperationalArtifacts();
    }
  }, [id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setIsActionsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsActionsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleStatusChange = async (newStatus: BookingStatus) => {
    if (!booking || !id) return;

    const ok = await confirm({
      title: 'Change Booking Status',
      message: `Change this booking from ${booking.status} to ${newStatus}?`,
      confirmLabel: 'Update Status',
      variant: 'primary',
    });
    if (!ok) return;

    setIsActionLoading(true);
    try {
      await BookingService.updateStatus(id, newStatus);
      showToast(`Booking status updated to ${newStatus}`, 'success');
      loadBooking();
    } catch {
      showToast('Failed to update status', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteBooking = async () => {
    if (!booking || !id) return;
    const reference = booking.displayRef || booking.jobNumber || booking.bookingRef || id;
    const ok = await confirm({
      title: 'Delete Job Permanently',
      message: `This will permanently delete ${reference} and direct assignments, timesheets and job events. Use this only for mock/test records or imports created by mistake.`,
      confirmLabel: 'Delete Permanently',
      variant: 'danger',
    });
    if (!ok) return;

    setIsActionLoading(true);
    try {
      await BookingService.delete(id);
      showToast('Job deleted permanently', 'success');
      navigate(routeState?.returnTo || '/admin/bookings');
    } catch {
      showToast('Failed to delete job', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDepartmentRequestDecision = async (action: 'APPROVE' | 'REJECT') => {
    if (!booking?.clientDepartmentRequestId) return;
    const proposedName = booking.proposedDepartmentName || booking.clientSnapshot?.departmentName || 'the proposed department';
    const approved = await confirm({
      title: action === 'APPROVE' ? 'Approve Department' : 'Reject Department',
      message: action === 'APPROVE'
        ? `Approve ${proposedName} and link it to this job? An existing department with the same name will be reused.`
        : `Reject ${proposedName}? The job will remain linked at organisation level.`,
      confirmLabel: action === 'APPROVE' ? 'Approve and Link' : 'Reject Proposal',
      variant: action === 'APPROVE' ? 'primary' : 'danger',
    });
    if (!approved) return;
    setIsActionLoading(true);
    try {
      const result = await BookingService.resolveClientDepartmentRequest({
        requestId: booking.clientDepartmentRequestId,
        action,
        reason: action === 'REJECT' ? 'Rejected during booking review' : 'Approved during booking review',
      });
      showToast(
        action === 'APPROVE'
          ? `Department ${result.departmentName || proposedName} linked to the job`
          : 'Department proposal rejected',
        'success',
      );
      await loadBooking();
      await loadOperationalArtifacts();
    } catch (error: any) {
      showToast(error?.message || 'Failed to review the department proposal', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleVerifyTimesheet = async () => {
    if (!booking || !id) return;
    setIsActionLoading(true);
    try {
      await BillingService.approveTimesheetByBookingId(id);
      showToast('Timesheet verified and moved to invoicing', 'success');
      loadBooking();
    } catch {
      showToast('Failed to verify timesheet', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRecordInterpreterResponse = async (accepted: boolean) => {
    if (!booking || !id) return;
    const ok = await confirm({
      title: accepted ? 'Record Interpreter Acceptance' : 'Record Interpreter Decline',
      message: accepted
        ? 'Use this when the interpreter accepted outside the app, for example in Airtable, WhatsApp, email or by phone.'
        : 'Use this when the interpreter declined outside the app. The job will return to the assignment queue.',
      confirmLabel: accepted ? 'Record Accepted' : 'Record Declined',
      variant: accepted ? 'primary' : 'warning',
    });
    if (!ok) return;

    setIsActionLoading(true);
    try {
      await BookingService.recordInterpreterResponseByStaff(id, accepted);
      showToast(accepted ? 'Interpreter acceptance recorded' : 'Interpreter decline recorded', 'success');
      await loadBooking();
      await loadOperationalArtifacts();
    } catch (error: any) {
      showToast(error?.message || 'Failed to record interpreter response', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRecordManualTimesheet = async () => {
    if (!booking || !id) return;
    const ok = await confirm({
      title: 'Record Timesheet Received',
      message: 'Use this when the interpreter sent the timesheet outside the app. A draft claim will be created for finance review.',
      confirmLabel: 'Record Timesheet',
      variant: 'primary',
    });
    if (!ok) return;

    setIsActionLoading(true);
    try {
      await BillingService.recordManualTimesheetReceived(id);
      showToast('Timesheet recorded for review', 'success');
      await loadBooking();
      await loadOperationalArtifacts();
    } catch (error: any) {
      showToast(error?.message || 'Failed to record timesheet', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRecordSessionCompleted = async () => {
    if (!booking || !id) return;
    const deliveryNoun = booking.serviceCategory === ServiceCategory.TRANSLATION ? 'translation delivery' : 'session delivery';
    const ok = await confirm({
      title: `Confirm ${deliveryNoun}`,
      message: `This records the ${deliveryNoun} as completed and moves the job to the claim and billing handoff. It does not close the full job lifecycle.`,
      confirmLabel: 'Confirm delivery',
      variant: 'primary',
    });
    if (!ok) return;

    setIsActionLoading(true);
    try {
      await BookingService.recordSessionCompletedByStaff(id);
      showToast(`${deliveryNoun.charAt(0).toUpperCase()}${deliveryNoun.slice(1)} confirmed`, 'success');
      await loadBooking();
      await loadOperationalArtifacts();
    } catch (error: any) {
      showToast(error?.message || `Failed to confirm ${deliveryNoun}`, 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRecordInvoiceIssued = async () => {
    if (!booking || !id) return;
    const ok = await confirm({
      title: 'Record Invoice Issued',
      message: 'Use this when finance created or sent the invoice outside the platform.',
      confirmLabel: 'Mark Invoiced',
      variant: 'primary',
    });
    if (!ok) return;

    setIsActionLoading(true);
    try {
      await BillingService.recordManualInvoiceIssued(id);
      showToast('Invoice issued recorded', 'success');
      await loadBooking();
      await loadOperationalArtifacts();
    } catch (error: any) {
      showToast(error?.message || 'Failed to record invoice', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRecordPaymentReceived = async () => {
    if (!booking || !id) return;
    const ok = await confirm({
      title: 'Record Payment Received',
      message: 'Use this when finance confirmed payment outside the platform.',
      confirmLabel: 'Mark Paid',
      variant: 'primary',
    });
    if (!ok) return;

    setIsActionLoading(true);
    try {
      await BillingService.recordManualPaymentReceived(id);
      showToast('Payment received recorded', 'success');
      await loadBooking();
      await loadOperationalArtifacts();
    } catch (error: any) {
      showToast(error?.message || 'Failed to record payment', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleMarkNotExecuted = async () => {
    if (!booking || !id) return;
    const ok = await confirm({
      title: 'Mark Job Not Executed',
      message: 'This creates an exception claim for finance review instead of bypassing timesheet approval. It can still be billed if it falls inside the cancellation window.',
      confirmLabel: 'Create Exception',
      variant: 'warning',
    });
    if (!ok) return;

    setIsActionLoading(true);
    try {
      await BillingService.createNonExecutedJobClaim(id, 'Marked as not executed from booking details');
      showToast('Exception claim created for review', 'success');
      await loadBooking();
      await loadOperationalArtifacts();
    } catch (error: any) {
      showToast(error?.message || 'Failed to create exception claim', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!booking) return;
    setIsExporting(true);
    try {
      PdfService.generateBookingSummary(booking);
      showToast('Booking summary exported successfully', 'success');
    } catch {
      showToast('Failed to export PDF', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenChat = async () => {
    if (!booking?.interpreterId || !user) {
      showToast('No professional assigned to chat with', 'info');
      return;
    }

    try {
      const interpreterUser = await ChatService.resolveUserByProfileId(booking.interpreterId);
      if (!interpreterUser) {
        showToast('No active user account found for this interpreter', 'error');
        return;
      }
      const threadId = await ChatService.getOrCreateBookingThread(
        booking.id,
        user,
        { ...interpreterUser, displayName: booking.interpreterName || interpreterUser.displayName },
        { name: booking.displayRef || booking.jobNumber || booking.bookingRef || booking.id }
      );
      openThread(threadId);
    } catch {
      showToast('Failed to open booking chat', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="bg-slate-100 p-6 dark:bg-slate-950">
        <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <AlertCircle size={34} className="mx-auto mb-4 text-slate-400" />
          <h2 className="text-xl font-semibold text-slate-950 dark:text-white">Booking not found</h2>
          <p className="mt-2 text-sm text-slate-500">The booking may have been removed or the URL is invalid.</p>
          <Button onClick={goBackToContext} icon={ChevronLeft} variant="secondary" className="mt-6">Back</Button>
        </div>
      </div>
    );
  }

  const reference = booking.displayRef || booking.jobNumber || booking.bookingRef || booking.id;
  const companyName = getClientCompany(booking.clientId, booking.guestContact?.organisation || booking.clientName);
  const contactName = booking.guestContact?.name || (booking as any).contactName || 'No contact';
  const contactEmail = booking.guestContact?.email || (booking as any).contactEmail;
  const contactPhone = booking.guestContact?.phone || (booking as any).contactPhone;
  const isTranslationJob = booking.serviceCategory === ServiceCategory.TRANSLATION || booking.serviceType?.toLowerCase().includes('translation');
  const professionalRole = isTranslationJob ? 'Translator' : 'Interpreter';
  const professionalRoleLower = professionalRole.toLowerCase();
  const isOnline = booking.locationType === 'ONLINE';
  const serviceCategoryLabel = getServiceCategoryLabel(booking);
  const serviceTypeLabel = getServiceTypeLabel(booking);
  const addressLine = isTranslationJob
    ? 'Document delivery'
    : isOnline
    ? (booking.onlineLink || 'No online link provided')
    : [booking.address || booking.location, booking.postcode].filter(Boolean).join(', ') || 'No address provided';
  const invoiceEstimate = booking.clientInvoiceTotal || booking.finalQuote || booking.totalAmount || 0;
  const vatEstimate = booking.clientInvoiceVatAmount || booking.vatAmount || 0;
  const sessionDate = isTranslationJob ? (booking.translationDeadline || booking.date) : booking.date;
  const sessionLabel = sessionDate
    ? `${sessionDate}${!isTranslationJob && booking.startTime ? `, ${booking.startTime}` : ''}`
    : 'No date';
  const languageLabel = formatLanguagePair(booking.languageFrom || 'English', booking.languageTo || 'N/A');
  const durationLabel = `${booking.durationMinutes || 'N/A'} min`;
  const departmentName = booking.clientSnapshot?.departmentName || booking.proposedDepartmentName || 'Organisation-wide';
  const scheduleSummaryLabel = sessionDate
    ? `${formatDate(sessionDate, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${!isTranslationJob ? ` at ${booking.startTime || 'TBC'}` : ''}`
    : 'Not scheduled';
  const scheduleSummaryDetail = isTranslationJob
    ? (booking.wordCount ? `${booking.wordCount.toLocaleString()} words` : `${booking.numberOfDocs || 0} documents`)
    : durationLabel;
  const locationSummaryLabel = isTranslationJob
    ? 'Document delivery'
    : isOnline
      ? 'Remote / online'
      : (booking.location || booking.address || 'Location not provided');
  const locationSummaryDetail = isTranslationJob
    ? (booking.deliveryEmail || contactEmail || 'Delivery email not provided')
    : isOnline
      ? (booking.onlineLink ? 'Connection link available' : 'No connection link')
      : (booking.postcode || undefined);
  const assignmentSummaryDetail = booking.interpreterId
    ? (booking.assignmentState || booking.statusMappingState?.assignmentState || professionalRole)
    : `${professionalRole} required`;
  const sourceFileCount = Array.isArray(booking.sourceFiles) ? booking.sourceFiles.length : 0;
  const claimSourceLabel = timesheet ? formatSource(timesheet.source, timesheet.recordedByStaff) : 'No claim';
  const clientAmount = timesheet?.clientAmountCalculated || booking.clientInvoiceTotal || booking.finalQuote || booking.totalAmount || 0;
  const interpreterAmount = timesheet?.interpreterAmountCalculated || timesheet?.totalToPay || booking.interpreterInvoiceTotal || booking.professionalCost || 0;
  const deliveryComplete = Boolean(isTranslationJob && (booking.translationCompletedAt || booking.translationDeliveredAt)) || [
    BookingStatus.SESSION_COMPLETED,
    BookingStatus.TIMESHEET_SUBMITTED,
    BookingStatus.READY_FOR_INVOICE,
    BookingStatus.INVOICING,
    BookingStatus.INVOICED,
    BookingStatus.PAID,
  ].includes(booking.status);
  const claimComplete = Boolean(timesheet || booking.timesheetId);
  const invoiceComplete = Boolean(
    booking.clientInvoiceId
    || booking.clientInvoiceNumber
    || booking.status === BookingStatus.INVOICED
    || booking.status === BookingStatus.PAID,
  );
  const paidComplete = booking.status === BookingStatus.PAID || booking.paymentStatus === 'PAID';
  const operationalChecks = [
    {
      label: `${professionalRole} assigned`,
      ok: Boolean(booking.interpreterId),
      detail: booking.interpreterName || `No ${professionalRoleLower} assigned`,
      action: () => setIsAllocationDrawerOpen(true),
    },
    {
      label: 'Schedule confirmed',
      ok: isTranslationJob
        ? Boolean(booking.translationDeadline || booking.date)
        : Boolean(booking.date && booking.startTime),
      detail: sessionLabel,
    },
    {
      label: 'Billing reference',
      ok: Boolean(booking.costCode || invoiceComplete),
      detail: booking.costCode || (invoiceComplete ? 'Invoice already issued' : 'Missing PO / cost code'),
      action: () => navigate(`/admin/bookings/edit/${id}`, { state: bookingContextState }),
    },
    {
      label: 'Claim recorded',
      ok: Boolean(timesheet || booking.timesheetId || ![
        BookingStatus.SESSION_COMPLETED,
        BookingStatus.TIMESHEET_SUBMITTED,
        BookingStatus.READY_FOR_INVOICE,
        BookingStatus.INVOICED,
        BookingStatus.PAID,
      ].includes(booking.status)),
      detail: timesheet ? claimSourceLabel : 'No claim yet',
      action: () => navigate(`/admin/operations/timesheets?jobId=${encodeURIComponent(booking.id)}`, { state: bookingContextState }),
    },
    {
      label: 'Billing issue',
      ok: !booking.billingIssueFlag,
      detail: booking.billingIssueReason || (booking.billingIssueFlag ? 'Issue raised' : 'No issue'),
    },
  ];
  const blockedChecks = operationalChecks.filter(check => !check.ok);
  const scheduledMoment = getBookingMoment(booking);
  const isWaitingForScheduledDelivery = booking.status === BookingStatus.BOOKED
    && Boolean(scheduledMoment && scheduledMoment.getTime() > Date.now());
  const scheduledMomentLabel = scheduledMoment
    ? isTranslationJob
      ? formatDate(scheduledMoment, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : `${formatDate(scheduledMoment, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${scheduledMoment.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    : sessionLabel;
  const workflowProgress = {
    requestNeedsAttention: Boolean((!booking.costCode && !invoiceComplete) || booking.departmentIdentityStatus === 'PENDING_APPROVAL' || booking.departmentIdentityStatus === 'PENDING_CLIENT_REVIEW'),
    assignmentComplete: Boolean(booking.interpreterId),
    serviceComplete: deliveryComplete,
    claimComplete,
    invoiceComplete,
    paidComplete,
    serviceLabel: (isTranslationJob ? 'Delivery' : 'Session') as 'Delivery' | 'Session',
    serviceScheduled: isWaitingForScheduledDelivery,
  };
  const workflowSteps = buildBookingWorkflowSteps(workflowProgress);
  const currentWorkflowStep = getCurrentBookingWorkflowStep(workflowProgress);
  const activeWorkflowStep = selectedWorkflowStep || currentWorkflowStep;
  const activeWorkflowStage = workflowSteps.find(step => step.id === activeWorkflowStep) || workflowSteps[0];
  const workflowActionClass = 'w-full sm:w-auto';
  const workflowFocus = (() => {
    switch (activeWorkflowStep) {
      case 'request':
        return {
          title: workflowProgress.requestNeedsAttention ? 'Complete request details' : 'Request captured',
          detail: `${companyName} · ${contactName}. ${serviceCategoryLabel}, ${languageLabel}.`,
        };
      case 'assignment':
        return {
          title: booking.interpreterId ? `${professionalRole} assigned` : `Assign ${professionalRoleLower}`,
          detail: booking.interpreterId
            ? `${booking.interpreterName || professionalRole} · ${booking.assignmentState || booking.statusMappingState?.assignmentState || 'Assignment recorded'}.`
            : `No ${professionalRoleLower} is assigned to this job yet.`,
        };
      case 'service':
        return {
          title: deliveryComplete
            ? `${isTranslationJob ? 'Translation' : 'Session'} delivered`
            : isWaitingForScheduledDelivery
              ? `${isTranslationJob ? 'Translation' : 'Session'} scheduled`
              : `Record ${isTranslationJob ? 'delivery' : 'session'} outcome`,
          detail: deliveryComplete
            ? `${isTranslationJob ? 'Delivery' : 'Session'} outcome has been recorded. Review the service evidence or continue to the claim.`
            : isWaitingForScheduledDelivery
              ? `${isTranslationJob ? 'Delivery is due on' : 'The session is scheduled for'} ${scheduledMomentLabel}.`
              : `Confirm whether the ${isTranslationJob ? 'translation was delivered' : 'session was delivered or not executed'}.`,
        };
      case 'claim':
        return {
          title: claimComplete ? (timesheet?.adminApproved ? 'Claim authorised' : 'Claim recorded') : deliveryComplete ? 'Record claim' : 'Claim not ready',
          detail: claimComplete
            ? `${claimSourceLabel} · client charge ${formatMoney(clientAmount)} · ${professionalRoleLower} payable ${formatMoney(interpreterAmount)}.`
            : deliveryComplete
              ? `Record the actual service outcome and amounts for finance review.`
              : `The claim opens after the ${isTranslationJob ? 'delivery' : 'session'} outcome is recorded.`,
        };
      case 'invoice':
        return {
          title: invoiceComplete ? 'Client invoice issued' : booking.status === BookingStatus.INVOICING ? 'Complete client invoice' : 'Prepare client invoice',
          detail: `${formatMoney(invoiceEstimate)} client charge · ${booking.costCode ? `reference ${booking.costCode}` : invoiceComplete ? 'invoice already issued' : 'billing reference missing'}.`,
        };
      case 'paid':
        return {
          title: paidComplete ? 'Payment received' : invoiceComplete ? 'Await client payment' : 'Payment not ready',
          detail: paidComplete
            ? `The client payment is recorded for this job.`
            : invoiceComplete
              ? `${booking.clientInvoiceNumber || 'Client invoice'} is issued and awaiting settlement.`
              : `Issue the client invoice before recording payment.`,
        };
      default:
        return { title: activeWorkflowStage.label, detail: 'Review this workflow stage.' };
    }
  })();

  const openBookingCalendar = () => navigate(
    `/admin/bookings?mode=calendar&calendar=month&service=${isTranslationJob ? 'translation' : 'interpreting'}`,
    {
      state: {
        workspaceSnapshot: {
          boardMode: 'calendar',
          calendarViewMode: 'month',
          calendarCursorDate: scheduledMoment?.toISOString(),
        },
      },
    },
  );

  const workflowAction = () => {
    switch (activeWorkflowStep) {
      case 'request':
        return (
          <Button
            className={workflowActionClass}
            variant={workflowProgress.requestNeedsAttention ? 'primary' : 'secondary'}
            icon={Edit2}
            onClick={() => navigate(`/admin/bookings/edit/${id}`, { state: bookingContextState })}
          >
            {!booking.costCode && !invoiceComplete ? 'Add billing reference' : 'Edit request details'}
          </Button>
        );
      case 'assignment':
        if (!booking.interpreterId) {
          return <Button className={workflowActionClass} onClick={() => setIsAllocationDrawerOpen(true)} icon={UserPlus}>Assign {professionalRoleLower}</Button>;
        }
        if ([BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(booking.status)) {
          return (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button className={workflowActionClass} onClick={() => handleRecordInterpreterResponse(true)} isLoading={isActionLoading} icon={CheckCircle2}>Record accepted</Button>
              <Button className={workflowActionClass} variant="secondary" onClick={() => handleRecordInterpreterResponse(false)} isLoading={isActionLoading} icon={XCircle}>Record declined</Button>
            </div>
          );
        }
        return <Button className={workflowActionClass} variant="secondary" onClick={() => setIsAllocationDrawerOpen(true)} icon={UserPlus}>Change assignment</Button>;
      case 'service':
        if (!booking.interpreterId) {
          return <Button className={workflowActionClass} variant="secondary" onClick={() => setSelectedWorkflowStep('assignment')} icon={UserPlus}>Complete assignment first</Button>;
        }
        if (booking.status === BookingStatus.BOOKED && !isWaitingForScheduledDelivery) {
          return (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button className={workflowActionClass} onClick={handleRecordSessionCompleted} isLoading={isActionLoading} icon={CheckCircle2}>
                {isTranslationJob ? 'Confirm translation delivered' : 'Confirm session delivered'}
              </Button>
              <Button className={workflowActionClass} variant="secondary" onClick={handleMarkNotExecuted} isLoading={isActionLoading} icon={AlertCircle}>Mark not executed</Button>
            </div>
          );
        }
        if (isWaitingForScheduledDelivery) {
          return <Button className={workflowActionClass} variant="secondary" icon={CalendarDays} onClick={openBookingCalendar}>View in calendar</Button>;
        }
        return <Button className={workflowActionClass} variant="secondary" icon={History} onClick={() => setActivePanel('activity')}>View service activity</Button>;
      case 'claim':
        if (!deliveryComplete) {
          return <Button className={workflowActionClass} variant="secondary" onClick={() => setSelectedWorkflowStep('service')} icon={CalendarDays}>Open {isTranslationJob ? 'delivery' : 'session'} stage</Button>;
        }
        if (!claimComplete) {
          return <Button className={workflowActionClass} onClick={handleRecordManualTimesheet} isLoading={isActionLoading} icon={FileText}>Record timesheet</Button>;
        }
        if (!timesheet?.adminApproved || booking.status === BookingStatus.TIMESHEET_SUBMITTED) {
          return <Button className={workflowActionClass} onClick={handleVerifyTimesheet} isLoading={isActionLoading} icon={ShieldCheck}>Verify timesheet</Button>;
        }
        return <Button className={workflowActionClass} variant="secondary" icon={ArrowUpRight} onClick={() => navigate(`/admin/operations/timesheets?jobId=${encodeURIComponent(booking.id)}`, { state: bookingContextState })}>Open claims</Button>;
      case 'invoice':
        if (!booking.costCode && !invoiceComplete) {
          return <Button className={workflowActionClass} icon={Edit2} onClick={() => navigate(`/admin/bookings/edit/${id}`, { state: bookingContextState })}>Add billing reference</Button>;
        }
        if (!claimComplete) {
          return <Button className={workflowActionClass} variant="secondary" icon={FileText} onClick={() => setSelectedWorkflowStep('claim')}>Complete claim first</Button>;
        }
        if (booking.status === BookingStatus.READY_FOR_INVOICE) {
          return <Button className={workflowActionClass} onClick={handleRecordInvoiceIssued} isLoading={isActionLoading} icon={Receipt}>Mark invoiced</Button>;
        }
        if (booking.clientInvoiceId) {
          return <Button className={workflowActionClass} variant="secondary" icon={ArrowUpRight} onClick={() => navigate(`/admin/billing/client-invoices/${booking.clientInvoiceId}`, { state: bookingContextState })}>Open client invoice</Button>;
        }
        return <Button className={workflowActionClass} icon={Receipt} onClick={() => setActivePanel('finance')}>Open finance details</Button>;
      case 'paid':
        if (!invoiceComplete) {
          return <Button className={workflowActionClass} variant="secondary" icon={Receipt} onClick={() => setSelectedWorkflowStep('invoice')}>Open invoice stage</Button>;
        }
        if (!paidComplete) {
          return <Button className={workflowActionClass} onClick={handleRecordPaymentReceived} isLoading={isActionLoading} icon={CheckCircle2}>Record payment received</Button>;
        }
        return <Button className={workflowActionClass} variant="secondary" icon={Receipt} onClick={() => setActivePanel('finance')}>View finance details</Button>;
      default:
        return null;
    }
  };

  const locationSummaryValue = !isTranslationJob && !isOnline && booking.lat && booking.lng
    ? (
        <button
          type="button"
          className="block w-full truncate text-left hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-blue-300"
          onClick={() => setActivePanel('location')}
          title="View location map"
        >
          {locationSummaryLabel}
        </button>
      )
    : locationSummaryLabel;

  return (
    <div className="-m-3 min-h-full bg-slate-100 pb-10 dark:bg-slate-950 sm:-m-5 lg:-m-6">
      <BookingRecordHeader
        title="Booking record"
        reference={reference}
        subtitle={companyName}
        status={booking.status}
        backLabel={returnLabel}
        onBack={goBackToContext}
        summary={(
          <BookingEssentialsStrip
            items={[
              {
                label: 'Client / requester',
                value: companyName,
                secondary: `${departmentName} / ${contactName}`,
              },
              {
                label: 'Language',
                value: languageLabel,
                secondary: serviceCategoryLabel,
              },
              {
                label: isTranslationJob ? 'Deadline' : 'Schedule',
                value: scheduleSummaryLabel,
                secondary: scheduleSummaryDetail,
                tone: sessionDate ? 'default' : 'warning',
              },
              {
                label: 'Service type',
                value: serviceTypeLabel,
                secondary: `${booking.priority || 'Normal'} / ${booking.isOOH ? 'Out of hours' : 'Standard hours'}`,
              },
              {
                label: isTranslationJob ? 'Delivery' : 'Location',
                value: locationSummaryValue,
                secondary: locationSummaryDetail,
                tone: locationSummaryLabel === 'Location not provided' ? 'warning' : 'default',
              },
              {
                label: 'Assignment',
                value: booking.interpreterName || 'Unassigned',
                secondary: assignmentSummaryDetail,
                tone: booking.interpreterId ? 'success' : 'warning',
              },
            ]}
          />
        )}
        progress={(
          <BookingWorkflowStepper
            steps={workflowSteps}
            selectedStepId={activeWorkflowStep}
            onSelect={setSelectedWorkflowStep}
          />
        )}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => navigate(`/admin/bookings/edit/${id}`, {
                state: bookingContextState,
              })}
              icon={Edit2}
            >
              Edit
            </Button>
            {booking.interpreterId && <Button variant="outline" icon={MessageSquare} onClick={handleOpenChat}>Message</Button>}
            <div className="relative" ref={actionsRef}>
              <Button
                variant="ghost"
                icon={MoreVertical}
                onClick={() => setIsActionsOpen(!isActionsOpen)}
                className="w-full sm:w-auto"
                aria-label="More booking actions"
                title="More booking actions"
              />
              {isActionsOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900" role="menu">
                  <button
                    onClick={() => { setActivePanel('activity'); setIsActionsOpen(false); }}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <History size={15} /> Activity history
                  </button>
                  <button
                    onClick={() => { setActivePanel('source'); setIsActionsOpen(false); }}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <History size={15} /> Source and sync details
                  </button>
                  <button
                    onClick={() => { setActivePanel('finance'); setIsActionsOpen(false); }}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Receipt size={15} /> Finance details
                  </button>
                  <button
                    onClick={() => { handleExportPdf(); setIsActionsOpen(false); }}
                    disabled={isExporting}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Download size={15} /> Export PDF
                  </button>
                  <div className="border-t border-slate-100 dark:border-slate-800" />
                  <button
                    onClick={() => { handleStatusChange(BookingStatus.CANCELLED); setIsActionsOpen(false); }}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Trash2 size={15} /> Cancel booking
                  </button>
                  <div className="border-t border-slate-100 dark:border-slate-800" />
                  <button
                    onClick={() => { handleDeleteBooking(); setIsActionsOpen(false); }}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-black text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    <Trash2 size={15} /> Delete permanently
                  </button>
                </div>
              )}
            </div>
          </>
        }
      />

      <main className="mx-auto max-w-[1600px] space-y-4 p-3 sm:p-5 lg:p-6">
        <BookingWorkflowFocus
          steps={workflowSteps}
          selectedStepId={activeWorkflowStep}
          title={workflowFocus.title}
          detail={workflowFocus.detail}
          action={workflowAction()}
        />

        <div className={`grid grid-cols-1 gap-4 ${blockedChecks.length > 0 ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
          <div className="space-y-4">
            {activeWorkflowStep === 'request' && (
              <Section title="Client and requester" icon={Building2}>
                <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
                  <EssentialField icon={Building2} label="Organisation" value={companyName} />
                  <EssentialField icon={Building2} label="Department" value={booking.clientSnapshot?.departmentName || booking.proposedDepartmentName || 'Organisation-wide'} />
                  <EssentialField icon={User} label="Requester" value={contactName} />
                  <EssentialField icon={Mail} label="Email" value={contactEmail || 'Not provided'} tone={contactEmail ? 'default' : 'warning'} />
                  <EssentialField icon={Phone} label="Phone" value={contactPhone || 'Not provided'} />
                </div>
                {booking.departmentIdentityStatus === 'PENDING_APPROVAL' && booking.clientDepartmentRequestId && (
                  <div className="mt-3 flex flex-col gap-3 border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">New department review</p>
                      <p className="mt-1 truncate text-sm font-semibold">{booking.proposedDepartmentName || booking.clientSnapshot?.departmentName}</p>
                      <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200">Submitted with this public request. Approving reuses an existing exact match or creates one canonical department.</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="secondary" icon={XCircle} disabled={isActionLoading} onClick={() => void handleDepartmentRequestDecision('REJECT')}>Reject</Button>
                      <Button size="sm" icon={CheckCircle2} isLoading={isActionLoading} onClick={() => void handleDepartmentRequestDecision('APPROVE')}>Approve and link</Button>
                    </div>
                  </div>
                )}
                {booking.departmentIdentityStatus === 'PENDING_CLIENT_REVIEW' && booking.proposedDepartmentName && (
                  <div className="mt-3 border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Client identity review required</p>
                    <p className="mt-1 text-sm font-semibold">{booking.proposedDepartmentName}</p>
                    <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200">Resolve the client in Client CRM first. The department proposal can then be linked without creating an incomplete client record.</p>
                  </div>
                )}
                {booking.departmentIdentityStatus === 'REJECTED' && booking.proposedDepartmentName && (
                  <div className="mt-3 border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                    Department proposal <strong>{booking.proposedDepartmentName}</strong> was rejected; this job remains organisation-wide.
                  </div>
                )}
              </Section>
            )}

            {(activeWorkflowStep === 'request' || activeWorkflowStep === 'service') && (booking.notes || booking.adminNotes) && (
              <Section title={activeWorkflowStep === 'service' ? 'Job instructions' : 'Request notes'} icon={FileText}>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">
                  {booking.adminNotes || booking.notes}
                </p>
              </Section>
            )}

            {activeWorkflowStep === 'service' && isTranslationJob && (
              <Section title="Translation delivery" icon={FileText}>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <InfoItem icon={CalendarDays} label="Deadline" value={sessionDate ? formatDate(sessionDate, { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'} />
                  <InfoItem icon={FileText} label="Volume" value={<>{booking.wordCount ? `${booking.wordCount.toLocaleString()} words` : 'No word count'}<br /><span className="text-slate-500">{booking.numberOfDocs ? `${booking.numberOfDocs} documents` : `${sourceFileCount} source files`}</span></>} />
                  <InfoItem icon={Globe2} label="Format" value={booking.translationFormat === 'Other' ? (booking.translationFormatOther || 'Other') : (booking.translationFormat || booking.translationFormatOther || 'N/A')} />
                  <InfoItem icon={Mail} label="Delivery email" value={booking.deliveryEmail || contactEmail || 'N/A'} />
                  <InfoItem icon={CheckCircle2} label="Delivery state" value={booking.statusMappingState?.deliveryState || (booking.translationDeliveredAt ? 'DELIVERED' : booking.translationCompletedAt ? 'COMPLETED' : 'N/A')} />
                  <InfoItem icon={CalendarDays} label="Completed" value={booking.translationCompletedAt ? formatDateTime(booking.translationCompletedAt) : 'N/A'} />
                  <InfoItem icon={CalendarDays} label="Delivered" value={booking.translationDeliveredAt ? formatDateTime(booking.translationDeliveredAt) : 'N/A'} />
                  <InfoItem icon={Receipt} label="Quote" value={formatMoney(booking.finalQuote || booking.totalAmount || 0)} />
                </div>
                {sourceFileCount > 0 && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Source documents</p>
                    <div className="flex flex-wrap gap-2">
                      {booking.sourceFiles?.slice(0, 6).map((file, index) => {
                        const fileName = typeof file === 'string' ? `Document ${index + 1}` : file.name || `Document ${index + 1}`;
                        const fileUrl = typeof file === 'string' ? file : file.url;
                        return fileUrl ? (
                          <a
                            key={`${fileName}-${index}`}
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 max-w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-blue-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                          >
                            <FileText size={13} />
                            <span className="truncate">{fileName}</span>
                          </a>
                        ) : (
                          <span key={`${fileName}-${index}`} className="inline-flex h-8 max-w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            <FileText size={13} />
                            <span className="truncate">{fileName}</span>
                          </span>
                        );
                      })}
                      {sourceFileCount > 6 && <span className="inline-flex h-8 items-center rounded-md bg-slate-200 px-3 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">+{sourceFileCount - 6} more</span>}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {activeWorkflowStep === 'assignment' && (
              <Section title={`${professionalRole} assignment`} icon={User}>
                {booking.interpreterId ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <UserAvatar name={booking.interpreterName || professionalRole} src={booking.interpreterPhotoUrl} size="md" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-950 dark:text-white">{booking.interpreterName || professionalRole}</p>
                          <p className="text-xs text-slate-500">INT-{booking.interpreterId.slice(0, 8)}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="outline" icon={MessageSquare} onClick={handleOpenChat}>Message</Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={ArrowUpRight}
                          onClick={() => {
                            setSelectedInterpreterId(booking.interpreterId || null);
                            setIsInterpreterPreviewOpen(true);
                          }}
                        >
                          Profile
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-x-8 gap-y-5 border-t border-slate-200 pt-4 dark:border-slate-800 sm:grid-cols-2">
                      <EssentialField icon={CheckCircle2} label="Assignment state" value={booking.assignmentState || booking.statusMappingState?.assignmentState || 'Assigned'} />
                      <EssentialField icon={ShieldCheck} label="Working basis" value={booking.isOOH ? 'Out of hours' : 'Standard hours'} />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-sm font-semibold text-slate-950 dark:text-white">No {professionalRoleLower} assigned</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Open allocation to search the active professional pool.</p>
                    </div>
                    <Button icon={UserPlus} onClick={() => setIsAllocationDrawerOpen(true)}>Assign {professionalRoleLower}</Button>
                  </div>
                )}
              </Section>
            )}

            {activeWorkflowStep === 'claim' && (
              <Section
                title="Claim and timesheet"
                icon={FileText}
                action={<span className="text-xs font-semibold text-slate-500">{timesheet ? (timesheet.adminApproved ? 'Authorised' : 'Review required') : 'Not recorded'}</span>}
              >
                <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
                  <EssentialField icon={FileText} label="Claim source" value={claimSourceLabel} />
                  <EssentialField icon={ShieldCheck} label="Claim status" value={timesheet ? (timesheet.adminApproved ? 'Authorised' : 'Needs review') : deliveryComplete ? 'Ready to record' : 'Waiting for service outcome'} />
                  <EssentialField icon={Receipt} label="Client charge" value={timesheet ? formatMoney(clientAmount) : 'Pending claim'} />
                  <EssentialField icon={CreditCard} label={`${professionalRole} payable`} value={timesheet ? formatMoney(interpreterAmount) : 'Pending claim'} />
                </div>
                {timesheet?.nonExecutionReason && (
                  <div className="mt-4 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                    <span className="font-semibold">Exception claim:</span> {timesheet.nonExecutionReason}
                  </div>
                )}
              </Section>
            )}

            {(activeWorkflowStep === 'invoice' || activeWorkflowStep === 'paid') && (
              <Section
                title={activeWorkflowStep === 'paid' ? 'Payment status' : 'Client invoice'}
                icon={Receipt}
                action={<StatusBadge status={(booking as any).paymentStatus || 'UNPAID'} />}
              >
                <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
                  <EssentialField icon={Receipt} label="Client charge" value={formatMoney(clientAmount || invoiceEstimate)} />
                  <EssentialField icon={CreditCard} label="VAT" value={formatMoney(vatEstimate)} />
                  <EssentialField icon={FileText} label="Client invoice" value={booking.clientInvoiceNumber || booking.clientInvoiceId || 'Not issued'} />
                  <EssentialField icon={CheckCircle2} label="Payment" value={paidComplete ? 'Paid' : invoiceComplete ? 'Awaiting payment' : 'Not ready'} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <Button variant="secondary" icon={ArrowUpRight} onClick={() => setActivePanel('finance')}>Finance details</Button>
                  {booking.clientInvoiceId && (
                    <Button variant="outline" icon={ArrowUpRight} onClick={() => navigate(`/admin/billing/client-invoices/${booking.clientInvoiceId}`, { state: bookingContextState })}>Client invoice</Button>
                  )}
                  <Button variant="outline" icon={ArrowUpRight} onClick={() => navigate(`/admin/billing?view=fin-ready-client-invoice&lane=clientBilling${booking.clientId ? `&clientId=${encodeURIComponent(booking.clientId)}` : ''}`, { state: bookingContextState })}>Receivables</Button>
                </div>
              </Section>
            )}

          </div>

          {blockedChecks.length > 0 && (
            <aside className="space-y-4 xl:self-start">
              <Section
                title="Action required"
                icon={AlertCircle}
                action={
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                    {blockedChecks.length} blocked
                  </span>
                }
              >
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {blockedChecks.map(check => (
                    <div key={check.label} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">{check.label}</p>
                        <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{check.detail}</p>
                      </div>
                      {check.action && (
                        <Button size="sm" variant="secondary" onClick={check.action}>Fix</Button>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            </aside>
          )}
        </div>
      </main>

      <InterpreterAllocationDrawer
        isOpen={isAllocationDrawerOpen}
        onClose={() => setIsAllocationDrawerOpen(false)}
        job={booking}
        onSuccess={() => {
          loadBooking();
          setIsAllocationDrawerOpen(false);
          showToast('Interpreter successfully allocated', 'success');
        }}
      />

      <InterpreterPreviewDrawer
        interpreterId={selectedInterpreterId || ''}
        jobId={id || ''}
        isOpen={isInterpreterPreviewOpen}
        onClose={() => setIsInterpreterPreviewOpen(false)}
        onSuccess={() => loadBooking()}
      />

      <Modal
        isOpen={activePanel === 'source'}
        onClose={() => setActivePanel(null)}
        title={`Source and sync details · ${reference}`}
        maxWidth="3xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Source</p>
              <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{formatBookingSource(booking.sourceSystem)}</p>
            </div>
            <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${getSyncBadgeClass(booking.syncStatus)}`}>
              {booking.syncStatus || 'LOCAL'}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem label="Source record" value={booking.sourceRecordId || booking.legacyAirtableRef || 'N/A'} />
            <InfoItem label="Source table" value={booking.sourceTable || 'N/A'} />
            <InfoItem label="Source base" value={booking.sourceBaseId || 'N/A'} />
            <InfoItem label="Legacy reference" value={booking.legacyRef || booking.legacyPlatformRef || booking.legacyAirtableRef || 'N/A'} />
            <InfoItem label="Last synced" value={booking.lastSyncedAt ? formatDateTime(booking.lastSyncedAt) : 'Not synced'} />
            <InfoItem label="Snapshot hash" value={booking.snapshotHash || 'N/A'} />
            <InfoItem label="Airtable status" value={booking.sourceStatusRaw || booking.airtableOperationalStatus || 'N/A'} />
            <InfoItem label="Mapped at" value={booking.statusMappedAt ? formatDateTime(booking.statusMappedAt) : 'N/A'} />
            <InfoItem label="Assignment state" value={booking.assignmentState || booking.statusMappingState?.assignmentState || 'N/A'} />
            <InfoItem label="Billing state" value={booking.billingState || booking.statusMappingState?.billingState || 'N/A'} />
            {booking.lastSyncRunId && <InfoItem label="Sync run" value={booking.lastSyncRunId} />}
          </div>
          {booking.sourceSystem === 'AIRTABLE' && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
              Airtable remains the source while Mirror Mode is active. Staff actions in Lingland advance the platform workflow without hiding the original sync evidence.
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={activePanel === 'activity'}
        onClose={() => setActivePanel(null)}
        title={`Activity history · ${reference}`}
        maxWidth="2xl"
      >
        <ActivityTimeline
          events={auditEvents.length > 0 ? auditEvents : [
            { id: '1', type: 'BOOKING_CREATED', createdAt: booking.createdAt, description: 'Booking created in the system.' },
            ...(booking.interpreterId ? [{ id: '2', type: 'RESOURCE_MATCHED', createdAt: booking.updatedAt, description: `${booking.interpreterName || 'Interpreter'} assigned.` }] : []),
          ]}
        />
      </Modal>

      <Modal
        isOpen={activePanel === 'finance'}
        onClose={() => setActivePanel(null)}
        title={`Finance handoff · ${reference}`}
        maxWidth="3xl"
      >
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem icon={FileText} label="Claim source" value={claimSourceLabel} />
            <InfoItem icon={ShieldCheck} label="Claim status" value={timesheet ? (timesheet.adminApproved ? 'Authorised' : 'Needs review') : 'Not recorded'} />
            <InfoItem icon={Receipt} label="Client charge" value={formatMoney(clientAmount || invoiceEstimate)} />
            <InfoItem icon={CreditCard} label={`${professionalRole} payable`} value={timesheet ? formatMoney(interpreterAmount) : 'Pending claim'} />
            <InfoItem label="VAT" value={formatMoney(vatEstimate)} />
            <InfoItem label="PO / cost code" value={booking.costCode || 'Not provided'} />
            <InfoItem label="Client invoice" value={booking.clientInvoiceNumber || booking.clientInvoiceId || 'Not issued'} />
            <InfoItem label="Payment" value={booking.paymentStatus || 'UNPAID'} />
          </div>

          {timesheet?.nonExecutionReason && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-200">Exception claim</p>
              <p className="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-100">{timesheet.nonExecutionReason}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button
              variant="secondary"
              icon={ArrowUpRight}
              onClick={() => navigate(`/admin/operations/timesheets?jobId=${encodeURIComponent(booking.id)}`, { state: bookingContextState })}
            >
              Claims and timesheets
            </Button>
            {booking.clientInvoiceId && (
              <Button
                variant="secondary"
                icon={ArrowUpRight}
                onClick={() => navigate(`/admin/billing/client-invoices/${booking.clientInvoiceId}`, { state: bookingContextState })}
              >
                Client invoice
              </Button>
            )}
            {booking.interpreterInvoiceId && (
              <Button
                variant="secondary"
                icon={ArrowUpRight}
                onClick={() => navigate(`/admin/billing/interpreter-invoices/${booking.interpreterInvoiceId}`, { state: bookingContextState })}
              >
                Professional invoice
              </Button>
            )}
            <Button
              variant="outline"
              icon={ArrowUpRight}
              onClick={() => navigate(`/admin/billing?view=fin-ready-client-invoice&lane=clientBilling${booking.clientId ? `&clientId=${encodeURIComponent(booking.clientId)}` : ''}`, { state: bookingContextState })}
            >
              Receivables
            </Button>
            <Button
              variant="outline"
              icon={ArrowUpRight}
              onClick={() => navigate(`/admin/billing?view=fin-interpreter-invoices&lane=interpreterPayables${booking.interpreterId ? `&interpreterId=${encodeURIComponent(booking.interpreterId)}` : ''}`, { state: bookingContextState })}
            >
              Payables
            </Button>
            {timesheet?.supportingDocumentUrl && (
              <a
                href={timesheet.supportingDocumentUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-semibold text-blue-600 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
              >
                Evidence <ArrowUpRight size={15} />
              </a>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activePanel === 'location'}
        onClose={() => setActivePanel(null)}
        title={`Job location · ${reference}`}
        maxWidth="3xl"
      >
        <div className="space-y-4">
          <p className="text-sm font-semibold leading-6 text-slate-950 dark:text-white">{addressLine}</p>
          {!isOnline && booking.lat && booking.lng && (
            <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
              <LocationMap
                center={{ lat: booking.lat, lng: booking.lng }}
                zoom={12}
                height="420px"
                markers={[{ lat: booking.lat, lng: booking.lng, label: 'Job location', color: '#ef4444' }]}
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default AdminBookingDetails;
