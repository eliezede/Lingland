import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Edit2,
  FileText,
  Globe2,
  History,
  Mail,
  MapPin,
  MessageSquare,
  MoreVertical,
  Phone,
  Receipt,
  ShieldCheck,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Video,
  XCircle,
} from 'lucide-react';
import { BookingService } from '../../../services/bookingService';
import { BillingService } from '../../../services/billingService';
import { ChatService } from '../../../services/chatService';
import { Booking, BookingStatus, ServiceCategory, Timesheet } from '../../../types';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { PdfService } from '../../../services/pdfService';
import { Button } from '../../../components/ui/Button';
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
import {
  BookingMetricCell as MetricCell,
  BookingMetricsBand,
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

const getNextAction = (booking: Booking) => {
  const professional = booking.serviceCategory === ServiceCategory.TRANSLATION ? 'translator' : 'interpreter';
  if ([BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT].includes(booking.status)) return `Assign ${professional}`;
  if ([BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(booking.status) && !booking.interpreterId) return `Assign ${professional}`;
  if (booking.status === BookingStatus.ASSIGNMENT_PENDING) return `Await ${professional} response`;
  if (booking.status === BookingStatus.BOOKED) return 'Monitor delivery';
  if (booking.status === BookingStatus.TIMESHEET_SUBMITTED) return 'Verify timesheet';
  if (booking.status === BookingStatus.READY_FOR_INVOICE) return 'Send to invoicing';
  if (booking.status === BookingStatus.INVOICED) return 'Await payment';
  if (booking.status === BookingStatus.PAID) return 'Completed';
  if (booking.status === BookingStatus.CANCELLED) return 'Cancelled';
  return 'Review booking';
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
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    const ok = await confirm({
      title: 'Record Session Completed',
      message: 'Use this when staff confirmed the session was delivered outside the interpreter app.',
      confirmLabel: 'Mark Completed',
      variant: 'primary',
    });
    if (!ok) return;

    setIsActionLoading(true);
    try {
      await BookingService.recordSessionCompletedByStaff(id);
      showToast('Session marked as completed', 'success');
      await loadBooking();
      await loadOperationalArtifacts();
    } catch (error: any) {
      showToast(error?.message || 'Failed to mark session completed', 'error');
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
  const assignmentLabel = booking.interpreterName || (booking.interpreterId ? `${professionalRole} assigned` : `No ${professionalRoleLower}`);
  const sourceFileCount = Array.isArray(booking.sourceFiles) ? booking.sourceFiles.length : 0;
  const claimSourceLabel = timesheet ? formatSource(timesheet.source, timesheet.recordedByStaff) : 'No claim';
  const clientAmount = timesheet?.clientAmountCalculated || booking.clientInvoiceTotal || booking.finalQuote || booking.totalAmount || 0;
  const interpreterAmount = timesheet?.interpreterAmountCalculated || timesheet?.totalToPay || booking.interpreterInvoiceTotal || booking.professionalCost || 0;
  const workflowSteps = [
    {
      label: isTranslationJob ? 'Translation complete' : 'Delivered',
      done: Boolean(isTranslationJob && (booking.translationCompletedAt || booking.translationDeliveredAt)) || [
        BookingStatus.SESSION_COMPLETED,
        BookingStatus.TIMESHEET_SUBMITTED,
        BookingStatus.READY_FOR_INVOICE,
        BookingStatus.INVOICING,
        BookingStatus.INVOICED,
        BookingStatus.PAID,
      ].includes(booking.status),
    },
    { label: 'Claim', done: Boolean(timesheet || booking.timesheetId) },
    { label: 'Authorized', done: Boolean(timesheet?.adminApproved || booking.timesheetVerifiedAt || booking.status === BookingStatus.READY_FOR_INVOICE || booking.status === BookingStatus.INVOICED || booking.status === BookingStatus.PAID) },
    { label: 'Invoiced', done: Boolean(booking.clientInvoiceId || booking.clientInvoiceNumber || booking.status === BookingStatus.INVOICED || booking.status === BookingStatus.PAID) },
    { label: 'Paid', done: booking.status === BookingStatus.PAID || booking.paymentStatus === 'PAID' },
  ];
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
      ok: Boolean(booking.costCode),
      detail: booking.costCode || 'Missing PO / cost code',
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

  const primaryAction = () => {
    if ([BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT].includes(booking.status)) {
      return <Button variant="secondary" onClick={() => setIsAllocationDrawerOpen(true)} icon={UserPlus}>Assign {professionalRoleLower}</Button>;
    }
    if ([BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(booking.status) && !booking.interpreterId) {
      return <Button variant="secondary" onClick={() => setIsAllocationDrawerOpen(true)} icon={UserPlus}>Assign {professionalRoleLower}</Button>;
    }
    if ([BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(booking.status) && booking.interpreterId) {
      return <Button variant="secondary" onClick={() => handleRecordInterpreterResponse(true)} isLoading={isActionLoading} icon={CheckCircle2}>Record accepted</Button>;
    }
    if (booking.status === BookingStatus.BOOKED) {
      return <Button variant="secondary" onClick={handleRecordSessionCompleted} isLoading={isActionLoading} icon={CheckCircle2}>Mark completed</Button>;
    }
    if (booking.status === BookingStatus.SESSION_COMPLETED) {
      return <Button variant="secondary" onClick={handleRecordManualTimesheet} isLoading={isActionLoading} icon={FileText}>Record timesheet</Button>;
    }
    if (booking.status === BookingStatus.TIMESHEET_SUBMITTED) {
      return <Button variant="secondary" onClick={handleVerifyTimesheet} isLoading={isActionLoading} icon={FileText}>Verify timesheet</Button>;
    }
    if (booking.status === BookingStatus.READY_FOR_INVOICE) {
      return <Button variant="secondary" onClick={handleRecordInvoiceIssued} isLoading={isActionLoading} icon={Receipt}>Mark invoiced</Button>;
    }
    if (booking.status === BookingStatus.INVOICED) {
      return <Button variant="secondary" onClick={handleRecordPaymentReceived} isLoading={isActionLoading} icon={Receipt}>Mark paid</Button>;
    }
    return null;
  };

  return (
    <div className="-m-3 min-h-full bg-slate-100 pb-10 dark:bg-slate-950 sm:-m-5 lg:-m-6">
      <BookingRecordHeader
        title="Booking record"
        reference={reference}
        subtitle={companyName}
        status={booking.status}
        backLabel={returnLabel}
        onBack={goBackToContext}
        actions={
          <>
            <Button
              onClick={() => navigate(`/admin/bookings/edit/${id}`, {
                state: bookingContextState,
              })}
              icon={Edit2}
            >
              Edit
            </Button>
            {primaryAction()}
            <Button variant="secondary" icon={Download} onClick={handleExportPdf} isLoading={isExporting}>Export</Button>
            <Button variant="outline" icon={MessageSquare} onClick={handleOpenChat}>Message</Button>
            <div className="relative" ref={actionsRef}>
              <Button variant="ghost" icon={MoreVertical} onClick={() => setIsActionsOpen(!isActionsOpen)} className="w-full sm:w-auto" />
              {isActionsOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
                  {[BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(booking.status) && booking.interpreterId && (
                    <>
                      <button
                        onClick={() => { handleRecordInterpreterResponse(true); setIsActionsOpen(false); }}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                      >
                        <CheckCircle2 size={15} /> Record accepted
                      </button>
                      <button
                        onClick={() => { handleRecordInterpreterResponse(false); setIsActionsOpen(false); }}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30"
                      >
                        <XCircle size={15} /> Record declined
                      </button>
                    </>
                  )}
                  {booking.status === BookingStatus.BOOKED && (
                    <button
                      onClick={() => { handleRecordSessionCompleted(); setIsActionsOpen(false); }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                    >
                      <CheckCircle2 size={15} /> Mark completed
                    </button>
                  )}
                  {booking.status === BookingStatus.SESSION_COMPLETED && (
                    <button
                      onClick={() => { handleRecordManualTimesheet(); setIsActionsOpen(false); }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/30"
                    >
                      <FileText size={15} /> Record timesheet
                    </button>
                  )}
                  {booking.status === BookingStatus.READY_FOR_INVOICE && (
                    <button
                      onClick={() => { handleRecordInvoiceIssued(); setIsActionsOpen(false); }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/30"
                    >
                      <Receipt size={15} /> Mark invoiced
                    </button>
                  )}
                  {booking.status === BookingStatus.INVOICED && (
                    <button
                      onClick={() => { handleRecordPaymentReceived(); setIsActionsOpen(false); }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                    >
                      <Receipt size={15} /> Mark paid
                    </button>
                  )}
                  {booking.status === BookingStatus.BOOKED && (
                    <button
                      onClick={() => { handleMarkNotExecuted(); setIsActionsOpen(false); }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30"
                    >
                      <AlertCircle size={15} /> Mark not executed
                    </button>
                  )}
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
        <BookingMetricsBand>
          <MetricCell icon={Building2} label="Requester" value={companyName} />
          <MetricCell icon={Globe2} label="Language" value={languageLabel} />
          <MetricCell icon={CalendarDays} label={isTranslationJob ? 'Deadline' : 'Schedule'} value={sessionLabel} tone={(isTranslationJob ? Boolean(sessionDate) : Boolean(booking.date && booking.startTime)) ? 'default' : 'warning'} />
          <MetricCell icon={MapPin} label="Location" value={addressLine} tone={addressLine ? 'default' : 'warning'} />
          <MetricCell icon={UserCheck} label="Assignment" value={assignmentLabel} tone={booking.interpreterId ? 'success' : 'warning'} />
        </BookingMetricsBand>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-4">
            <Section title="Requester" icon={Building2}>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{companyName}</p>
                  <p className="truncate text-xs text-slate-500">{contactName}</p>
                </div>
                <InfoItem icon={CreditCard} label="PO / cost code" value={booking.costCode || 'N/A'} />
                <InfoItem icon={Mail} label="Email" value={contactEmail || 'N/A'} />
                <InfoItem icon={Phone} label="Phone" value={contactPhone || 'N/A'} />
              </div>
            </Section>

            <Section title={isTranslationJob ? 'Service' : 'Service and schedule'} icon={Globe2}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoItem icon={Globe2} label="Service" value={booking.serviceType || booking.serviceCategory || 'N/A'} />
                <InfoItem icon={Globe2} label="Languages" value={languageLabel} />
                {!isTranslationJob && (
                  <>
                    <InfoItem icon={CalendarDays} label="Date" value={formatDate(booking.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
                    <InfoItem icon={Clock} label="Time and duration" value={<>{booking.startTime || 'TBC'}{booking.expectedEndTime ? ` - ${booking.expectedEndTime}` : ''}<br /><span className="text-slate-500">{durationLabel}</span></>} />
                  </>
                )}
              </div>
            </Section>

            {isTranslationJob && (
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

            {!isTranslationJob && (
              <Section title="Session and location" icon={isOnline ? Video : MapPin}>
                <div className="grid gap-3 lg:grid-cols-2">
                  <InfoItem icon={isOnline ? Video : MapPin} label={isOnline ? 'Connection' : 'Venue'} value={addressLine} />
                  <InfoItem icon={ShieldCheck} label="Operational flags" value={<>{booking.priority || 'Normal'} priority<br /><span className="text-slate-500">{booking.isOOH ? 'Out of hours' : 'Standard hours'}</span></>} />
                </div>

                {!isOnline && booking.lat && booking.lng && (
                  <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    <LocationMap
                      center={{ lat: booking.lat, lng: booking.lng }}
                      zoom={12}
                      height="260px"
                      markers={[{ lat: booking.lat, lng: booking.lng, label: 'Job Location', color: '#ef4444' }]}
                    />
                  </div>
                )}

                {(booking.notes || booking.adminNotes) && (
                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Notes</p>
                    <p className="text-sm leading-6 text-blue-950 dark:text-blue-100">{booking.adminNotes || booking.notes}</p>
                  </div>
                )}
              </Section>
            )}

            {isTranslationJob && (booking.notes || booking.adminNotes) && (
              <Section title="Translation notes" icon={MessageSquare}>
                <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{booking.adminNotes || booking.notes}</p>
              </Section>
            )}

            <Section
              title="Delivery, claim and billing handoff"
              icon={Receipt}
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  icon={ArrowUpRight}
                  onClick={() => navigate(`/admin/operations/timesheets?jobId=${encodeURIComponent(booking.id)}`, { state: bookingContextState })}
                >
                  Claims
                </Button>
              }
            >
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-5">
                  {workflowSteps.map((step, index) => (
                    <div
                      key={step.label}
                      className={`rounded-md border p-3 ${
                        step.done
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100'
                          : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${
                          step.done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-800'
                        }`}>
                          {step.done ? <CheckCircle2 size={13} /> : index + 1}
                        </span>
                        <span className="text-xs font-black uppercase tracking-wide">{step.label}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 lg:grid-cols-4">
                  <InfoItem
                    icon={FileText}
                    label="Claim source"
                    value={
                      <>
                        {claimSourceLabel}
                        {timesheet?.submittedAt && <><br /><span className="text-slate-500">{formatDateTime(timesheet.submittedAt)}</span></>}
                      </>
                    }
                  />
                  <InfoItem
                    icon={ShieldCheck}
                    label="Claim status"
                    value={timesheet ? (timesheet.adminApproved ? 'Authorized for finance' : 'Awaiting review') : (booking.status === BookingStatus.SESSION_COMPLETED ? 'Missing claim' : 'Not ready')}
                  />
                  <InfoItem icon={Receipt} label="Client billing" value={formatMoney(clientAmount)} />
                  <InfoItem icon={CreditCard} label="Interpreter payable" value={timesheet ? formatMoney(interpreterAmount) : 'Pending claim'} />
                </div>

                {timesheet?.nonExecutionReason && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
                    <p className="text-[10px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-200">Exception claim</p>
                    <p className="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-100">{timesheet.nonExecutionReason}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {booking.status === BookingStatus.SESSION_COMPLETED && !timesheet && (
                    <Button size="sm" icon={FileText} onClick={handleRecordManualTimesheet} isLoading={isActionLoading}>
                      Record manual claim
                    </Button>
                  )}
                  {timesheet && !timesheet.adminApproved && (
                    <Button size="sm" icon={ShieldCheck} onClick={handleVerifyTimesheet} isLoading={isActionLoading}>
                      Authorize claim
                    </Button>
                  )}
                  {booking.status === BookingStatus.READY_FOR_INVOICE && (
                    <Button size="sm" icon={Receipt} onClick={handleRecordInvoiceIssued} isLoading={isActionLoading}>
                      Mark invoiced
                    </Button>
                  )}
                  {booking.status === BookingStatus.INVOICED && (
                    <Button size="sm" icon={CreditCard} onClick={handleRecordPaymentReceived} isLoading={isActionLoading}>
                      Mark paid
                    </Button>
                  )}
                  {timesheet?.supportingDocumentUrl && (
                    <a
                      href={timesheet.supportingDocumentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-bold text-blue-600 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                    >
                      Evidence <ArrowUpRight size={13} />
                    </a>
                  )}
                </div>
              </div>
            </Section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-16 xl:self-start">
            <Section
              title="Operational checks"
              icon={ShieldCheck}
              action={
                <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
                  blockedChecks.length === 0
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200'
                }`}>
                  {blockedChecks.length === 0 ? 'Ready' : `${blockedChecks.length} blocked`}
                </span>
              }
            >
              <div className="space-y-2">
                {operationalChecks.map(check => (
                  <div key={check.label} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          check.ok ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
                        }`}>
                          {check.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                        </span>
                        <p className="truncate text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">{check.label}</p>
                      </div>
                      <p className="mt-1 truncate pl-7 text-xs font-semibold text-slate-500 dark:text-slate-400">{check.detail}</p>
                    </div>
                    {!check.ok && check.action && (
                      <button
                        onClick={check.action}
                        className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-blue-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                      >
                        Fix
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Mirror and source" icon={History}>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Source</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{formatBookingSource(booking.sourceSystem)}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${getSyncBadgeClass(booking.syncStatus)}`}>
                    {booking.syncStatus || 'LOCAL'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="Source record" value={booking.sourceRecordId || booking.legacyAirtableRef || 'N/A'} />
                  <InfoItem label="Source table" value={booking.sourceTable || 'N/A'} />
                  <InfoItem label="Legacy ref" value={booking.legacyRef || booking.legacyPlatformRef || booking.legacyAirtableRef || 'N/A'} />
                  <InfoItem label="Source base" value={booking.sourceBaseId || 'N/A'} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="Last synced" value={booking.lastSyncedAt ? formatDateTime(booking.lastSyncedAt) : 'Not synced'} />
                  <InfoItem label="Snapshot hash" value={booking.snapshotHash || 'N/A'} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="Airtable status" value={booking.sourceStatusRaw || booking.airtableOperationalStatus || 'N/A'} />
                  <InfoItem label="Mapped at" value={booking.statusMappedAt ? formatDateTime(booking.statusMappedAt) : 'N/A'} />
                  <InfoItem label="Assignment state" value={booking.assignmentState || booking.statusMappingState?.assignmentState || 'N/A'} />
                  <InfoItem label="Billing state" value={booking.billingState || booking.statusMappingState?.billingState || 'N/A'} />
                </div>
                {booking.lastSyncRunId && <InfoItem label="Sync run" value={booking.lastSyncRunId} />}
                {booking.sourceSystem === 'AIRTABLE' && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
                    This job is mirrored from Airtable. Manual actions here update Lingland workflow state, but Airtable remains the source while Mirror Mode is active.
                  </div>
                )}
              </div>
            </Section>

            <Section title={`${professionalRole} assignment`} icon={User}>
              <div className="space-y-3">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{professionalRole}</p>
                    {!booking.interpreterId && (
                      <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => setIsAllocationDrawerOpen(true)}>Assign</Button>
                    )}
                  </div>
                  {booking.interpreterId ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={booking.interpreterName || professionalRole} src={booking.interpreterPhotoUrl} size="md" />
                        <div>
                          <p className="font-semibold text-slate-950 dark:text-white">{booking.interpreterName || professionalRole}</p>
                          <p className="text-xs text-slate-500">INT-{booking.interpreterId.slice(0, 8)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" icon={MessageSquare} onClick={handleOpenChat}>Chat</Button>
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
                  ) : (
                    <p className="text-sm text-slate-500">No professional assigned. This is the main blocker before delivery.</p>
                  )}
                </div>
              </div>
            </Section>

            <Section title="Billing readiness" icon={Receipt} action={<StatusBadge status={(booking as any).paymentStatus || 'UNPAID'} />}>
              <div className="space-y-3">
                <div className="rounded-md bg-slate-950 p-4 text-white dark:bg-slate-950">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Client charge</p>
                  <p className="mt-2 text-2xl font-semibold">{formatMoney(invoiceEstimate)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="VAT" value={formatMoney(vatEstimate)} />
                  <InfoItem label="Cost code" value={booking.costCode || 'N/A'} />
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Claim / timesheet</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                        {timesheet ? (timesheet.adminApproved ? 'Authorized' : 'Needs review') : 'Not recorded'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={ArrowUpRight}
                      onClick={() => navigate(`/admin/operations/timesheets?jobId=${encodeURIComponent(booking.id)}`, { state: bookingContextState })}
                    >
                      Open
                    </Button>
                  </div>
                </div>
                {booking.clientInvoiceId && (
                  <Button
                    variant="secondary"
                    icon={ArrowUpRight}
                    onClick={() => navigate(`/admin/billing/client-invoices/${booking.clientInvoiceId}`, { state: bookingContextState })}
                    className="w-full"
                  >
                    Open client invoice
                  </Button>
                )}
                {booking.interpreterInvoiceId && (
                  <Button
                    variant="secondary"
                    icon={ArrowUpRight}
                    onClick={() => navigate(`/admin/billing/interpreter-invoices/${booking.interpreterInvoiceId}`, { state: bookingContextState })}
                    className="w-full"
                  >
                    Open interpreter invoice
                  </Button>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    variant="secondary"
                    icon={ArrowUpRight}
                    onClick={() => navigate(`/admin/billing?view=fin-ready-client-invoice&lane=clientBilling${booking.clientId ? `&clientId=${encodeURIComponent(booking.clientId)}` : ''}`, { state: bookingContextState })}
                    className="w-full"
                  >
                    Client billing
                  </Button>
                  <Button
                    variant="outline"
                    icon={ArrowUpRight}
                    onClick={() => navigate(`/admin/billing?view=fin-interpreter-invoices&lane=interpreterPayables${booking.interpreterId ? `&interpreterId=${encodeURIComponent(booking.interpreterId)}` : ''}`, { state: bookingContextState })}
                    className="w-full"
                  >
                    Payables
                  </Button>
                </div>
              </div>
            </Section>

            <Section title="Audit trail" icon={History}>
              <ActivityTimeline
                events={auditEvents.length > 0 ? auditEvents : [
                  { id: '1', type: 'BOOKING_CREATED', createdAt: booking.createdAt, description: 'Booking created in the system.' },
                  ...(booking.interpreterId ? [{ id: '2', type: 'RESOURCE_MATCHED', createdAt: booking.updatedAt, description: `${booking.interpreterName || 'Interpreter'} assigned.` }] : []),
                ]}
              />
            </Section>
          </aside>
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
    </div>
  );
};

export default AdminBookingDetails;
