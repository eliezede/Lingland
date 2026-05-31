import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronLeft,
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
} from 'lucide-react';
import { BookingService } from '../../../services/bookingService';
import { BillingService } from '../../../services/billingService';
import { ChatService } from '../../../services/chatService';
import { Booking, BookingStatus } from '../../../types';
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

const getNextAction = (booking: Booking) => {
  if ([BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT].includes(booking.status)) return 'Assign interpreter';
  if ([BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(booking.status) && !booking.interpreterId) return 'Assign interpreter';
  if (booking.status === BookingStatus.ASSIGNMENT_PENDING) return 'Await interpreter response';
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

const Section = ({ title, icon: Icon, children, action }: { title: string; icon: React.ElementType; children: React.ReactNode; action?: React.ReactNode }) => (
  <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
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

export const AdminBookingDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
  const actionsRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (id) {
      loadBooking();
      BookingService.getJobEvents(id).then(setAuditEvents).catch(() => {});
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
      loadBooking();
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
      showToast('No interpreter assigned to chat with', 'info');
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
        { name: booking.bookingRef || booking.id }
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
          <Button onClick={() => navigate('/admin/bookings')} icon={ChevronLeft} variant="secondary" className="mt-6">Back to Jobs Board</Button>
        </div>
      </div>
    );
  }

  const reference = booking.bookingRef || booking.id;
  const companyName = getClientCompany(booking.clientId, booking.guestContact?.organisation || booking.clientName);
  const contactName = booking.guestContact?.name || (booking as any).contactName || 'No contact';
  const contactEmail = booking.guestContact?.email || (booking as any).contactEmail;
  const contactPhone = booking.guestContact?.phone || (booking as any).contactPhone;
  const isOnline = booking.locationType === 'ONLINE';
  const addressLine = isOnline
    ? (booking.onlineLink || 'No online link provided')
    : [booking.address || booking.location, booking.postcode].filter(Boolean).join(', ') || 'No address provided';
  const invoiceEstimate = booking.totalAmount || 0;
  const sessionLabel = booking.date
    ? `${booking.date}${booking.startTime ? `, ${booking.startTime}` : ''}`
    : 'No date';
  const languageLabel = `${booking.languageFrom || 'English'} to ${booking.languageTo || 'N/A'}`;
  const assignmentLabel = booking.interpreterName || (booking.interpreterId ? 'Interpreter assigned' : 'No interpreter');
  const durationLabel = `${booking.durationMinutes || 'N/A'} min`;

  const primaryAction = () => {
    if ([BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT].includes(booking.status)) {
      return <Button variant="secondary" onClick={() => setIsAllocationDrawerOpen(true)} icon={UserPlus}>Assign interpreter</Button>;
    }
    if ([BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(booking.status) && !booking.interpreterId) {
      return <Button variant="secondary" onClick={() => setIsAllocationDrawerOpen(true)} icon={UserPlus}>Assign interpreter</Button>;
    }
    if (booking.status === BookingStatus.TIMESHEET_SUBMITTED) {
      return <Button variant="secondary" onClick={handleVerifyTimesheet} isLoading={isActionLoading} icon={FileText}>Verify timesheet</Button>;
    }
    if (booking.status === BookingStatus.READY_FOR_INVOICE) {
      return <Button variant="secondary" onClick={() => navigate('/admin/operations/timesheets')} icon={Receipt}>Invoice review</Button>;
    }
    return null;
  };

  return (
    <div className="-m-3 min-h-full bg-slate-100 pb-10 dark:bg-slate-950 sm:-m-5 lg:-m-6">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-5 lg:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => navigate('/admin/bookings')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Back to jobs board"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-semibold text-slate-950 dark:text-white">Booking record</h1>
                <StatusBadge status={booking.status} />
                <span className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 dark:border-slate-800">
                  {reference}
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">{companyName}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Button onClick={() => navigate(`/admin/bookings/edit/${id}`)} icon={Edit2}>Edit</Button>
            {primaryAction()}
            <Button variant="secondary" icon={Download} onClick={handleExportPdf} isLoading={isExporting}>Export</Button>
            <Button variant="outline" icon={MessageSquare} onClick={handleOpenChat}>Message</Button>
            <div className="relative" ref={actionsRef}>
              <Button variant="ghost" icon={MoreVertical} onClick={() => setIsActionsOpen(!isActionsOpen)} className="w-full sm:w-auto" />
              {isActionsOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
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
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1600px] space-y-4 p-3 sm:p-5 lg:p-6">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5">
            <MetricCell icon={Building2} label="Requester" value={companyName} />
            <MetricCell icon={Globe2} label="Language" value={languageLabel} />
            <MetricCell icon={CalendarDays} label="Schedule" value={sessionLabel} tone={booking.date && booking.startTime ? 'default' : 'warning'} />
            <MetricCell icon={MapPin} label="Location" value={addressLine} tone={addressLine ? 'default' : 'warning'} />
            <MetricCell icon={UserCheck} label="Assignment" value={assignmentLabel} tone={booking.interpreterId ? 'success' : 'warning'} />
          </div>
        </div>

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

            <Section title="Service and schedule" icon={Globe2}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoItem icon={Globe2} label="Service" value={booking.serviceType || booking.serviceCategory || 'N/A'} />
                <InfoItem icon={Globe2} label="Languages" value={languageLabel} />
                <InfoItem icon={CalendarDays} label="Date" value={formatDate(booking.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
                <InfoItem icon={Clock} label="Time and duration" value={<>{booking.startTime || 'TBC'}{booking.expectedEndTime ? ` - ${booking.expectedEndTime}` : ''}<br /><span className="text-slate-500">{durationLabel}</span></>} />
              </div>
            </Section>

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
          </div>

          <aside className="space-y-4 xl:sticky xl:top-16 xl:self-start">
            <Section title="Interpreter assignment" icon={User}>
              <div className="space-y-3">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Interpreter</p>
                    {!booking.interpreterId && (
                      <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => setIsAllocationDrawerOpen(true)}>Assign</Button>
                    )}
                  </div>
                  {booking.interpreterId ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={booking.interpreterName || 'Interpreter'} src={booking.interpreterPhotoUrl} size="md" />
                        <div>
                          <p className="font-semibold text-slate-950 dark:text-white">{booking.interpreterName || 'Interpreter'}</p>
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
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Client charge estimate</p>
                  <p className="mt-2 text-2xl font-semibold">{formatMoney(invoiceEstimate)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="VAT estimate" value={formatMoney(invoiceEstimate * 0.2)} />
                  <InfoItem label="Cost code" value={booking.costCode || 'N/A'} />
                </div>
                <Button variant="secondary" icon={ArrowUpRight} onClick={() => navigate('/admin/billing')} className="w-full">Open billing hub</Button>
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
