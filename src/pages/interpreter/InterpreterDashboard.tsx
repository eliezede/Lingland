import React, { useEffect, useState } from 'react';
import { StatsService } from '../../services/statsService';
import { useAuth } from '../../context/AuthContext';
import { BookingService, BillingService, InterpreterService } from '../../services/api';
import { AssignmentStatus, Booking, BookingAssignment, BookingStatus } from '../../types';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Clock, CheckCircle2,
  Calendar,
  ChevronRight, AlertCircle, ShieldCheck,
  Video, Globe2, Briefcase, User
} from 'lucide-react';
import { JobDetailsModal } from '../../components/interpreter/JobDetailsModal';
import { OnboardingWidget } from '../../components/interpreter/OnboardingWidget';
import { useToast } from '../../context/ToastContext';
import { useChat } from '../../context/ChatContext';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { ChatService } from '../../services/chatService';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { Interpreter } from '../../types';
import { isInterpreterLocked, requiresInterpreterOnboarding } from '../../utils/interpreterFlow';
import { formatLanguagePair } from '../../utils/languageDisplay';

// --- Sub-components matching Admin Dashboard ---

const MetricSkeleton = () => (
  <div className="flex items-center gap-3 border-slate-100 md:border-l md:pl-5 dark:border-slate-800">
    <div className="space-y-1">
      <Skeleton className="h-2 w-16" />
      <Skeleton className="h-4 w-12" />
    </div>
    <Skeleton className="h-3 w-8 rounded-full" />
  </div>
);

const HighDensityActivityTable = ({ title, data, loading, onRowClick }: { title: string, data: any[], loading?: boolean, onRowClick: (job: any) => void }) => (
  <div className="flex min-h-[360px] min-w-0 flex-1 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center justify-between overflow-hidden border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="shrink-0 text-[10px] font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">{title}</h3>
    </div>
    <div className="custom-scrollbar flex-1 overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-left">
        <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950">
          <tr>
            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Client / Location</th>
            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Service</th>
            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Status</th>
            <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Date & Time</th>
            <th className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wide text-slate-400">Estimated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {loading ? (
            Array(5).fill(0).map((_, i) => (
              <tr key={i}>
                <td className="px-3 py-3"><Skeleton className="h-4 w-24" /></td>
                <td className="px-3 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-3 py-3"><Skeleton className="h-4 w-16 rounded" /></td>
                <td className="px-3 py-3"><Skeleton className="h-4 w-24" /></td>
                <td className="px-3 py-3 text-right"><Skeleton className="ml-auto h-4 w-12" /></td>
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-12 text-center text-xs font-bold uppercase tracking-wide text-slate-400">No scheduled sessions found.</td></tr>
          ) : data.map((item, i) => (
            <tr key={i} onClick={() => onRowClick(item.raw)} className="group cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/60">
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-md border flex flex-col items-center justify-center text-[8px] font-black uppercase ${item.isOnline ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                    {item.isOnline ? <Video size={10} /> : <MapPin size={10} />}
                  </div>
                  <span className="whitespace-nowrap text-xs font-bold text-slate-900 dark:text-white">{item.client || 'Confidential'}</span>
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-xs font-medium text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1.5"><Globe2 size={12} className="text-blue-500" /> {item.service}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider
                  ${item.raw.status === BookingStatus.READY_FOR_INVOICE || item.raw.status === BookingStatus.BOOKED ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                    [BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING, 'PENDING_ASSIGNMENT' as any].includes(item.raw.status) ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                      'bg-slate-50 text-slate-700 border border-slate-100'}`}>
                  {item.raw.status === BookingStatus.BOOKED ? 'CONFIRMED' : item.raw.status}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                  {item.date} <span className="text-[10px] text-slate-300 font-normal">|</span> {item.time}
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-xs font-black text-slate-900 dark:text-white">
                {item.pay}
                <span className="ml-2 inline-block text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">Open</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// --- Main Dashboard ---

export const InterpreterDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { openThread } = useChat();

  const [loading, setLoading] = useState(true);

  // Modal State
  const [selectedJob, setSelectedJob] = useState<Booking | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Data State
  const [upcomingJobs, setUpcomingJobs] = useState<any[]>([]);
  const [pendingTimesheets, setPendingTimesheets] = useState<Booking[]>([]);
  const [offers, setOffers] = useState<Booking[]>([]);
  const [interpreterStatus, setInterpreterStatus] = useState<string | null>(null);
  const [interpreter, setInterpreter] = useState<Interpreter | null>(null);
  const [stats, setStats] = useState({
    completedBookings: 0,
    liveOffers: 0,
    upcomingBookings: 0,
    rating: 4.96,
    hoursWorked: '84.5h',
    nextPayout: 'GBP 4,280.00'
  });

  useEffect(() => {
    if (user?.profileId) {
      loadDashboardData(user.profileId);
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadDashboardData = async (interpreterId: string) => {
    setLoading(true);
    try {
      const [schedule, offerList, totalEarnings, realStats] = await Promise.all([
        BookingService.getInterpreterSchedule(interpreterId),
        BookingService.getInterpreterOffers(interpreterId),
        BillingService.getInterpreterEarnings(interpreterId),
        StatsService.getInterpreterStats(interpreterId)
      ]);

      const isPending = (s: string) => s === BookingStatus.OPENED || s === BookingStatus.ASSIGNMENT_PENDING || s === 'PENDING_ASSIGNMENT';
      const assignmentByBooking = new Map(offerList.map((assignment: BookingAssignment) => [assignment.bookingId, assignment]));
      const confirmed = schedule.filter((b: Booking) => !isPending(b.status as string));
      const directPending = schedule
        .filter((b: Booking) => isPending(b.status as string))
        .map(b => ({ ...b, _isDirect: true, _assignmentId: assignmentByBooking.get(b.id)?.id }));

      const upcoming = confirmed
        .filter((b: Booking) => new Date(b.date + 'T' + (b.startTime || '00:00')) > new Date())
        .sort((a: Booking, b: Booking) => new Date(a.date + 'T' + (a.startTime || '00:00')).getTime() - new Date(b.date + 'T' + (b.startTime || '00:00')).getTime());

      const pastPendingTs = confirmed
        .filter((b: Booking) => String(b.status) === 'BOOKED' && new Date(b.date + 'T' + (b.startTime || '23:59')) <= new Date())
        .sort((a: Booking, b: Booking) => new Date(b.date + 'T' + (b.startTime || '00:00')).getTime() - new Date(a.date + 'T' + (a.startTime || '00:00')).getTime());

      setUpcomingJobs(upcoming.map(job => ({
        client: job.clientName,
        isOnline: job.locationType === 'ONLINE',
        service: formatLanguagePair(job.languageFrom, job.languageTo),
        date: new Date(job.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        time: job.startTime,
        pay: 'GBP 45.00', // Mocked payload for assignment
        raw: job
      })));
      setPendingTimesheets(pastPendingTs);

      // Map over broadcast offers
      const enrichedOffers: any[] = await Promise.all(
        offerList.map(async (assignment: any) => {
          const bookingId = assignment.bookingId;
          const offerBase = { _isBroadcast: true, _assignmentId: assignment.id }; // Keep track of the assignment ID for accept/reject

          if (!bookingId) {
            return { ...(assignment.bookingSnapshot || assignment), id: assignment.id, ...offerBase };
          }
          try {
            const booking = await BookingService.getById(bookingId);
            if (booking) {
              return { ...booking, ...offerBase };
            }
          } catch {/* ignore */ }
          return { ...(assignment.bookingSnapshot || assignment), id: assignment.id, ...offerBase };
        })
      );

      const directIds = new Set(directPending.map((b: any) => b.id));
      setOffers([...directPending, ...enrichedOffers.filter(offer => !directIds.has(offer.id))]);

      setStats({
        completedBookings: realStats.completedBookings || 0,
        liveOffers: (realStats.liveOffers || 0) + directPending.length,
        upcomingBookings: upcoming.length,
        rating: 4.96,
        hoursWorked: '84.5h', // Mock for design
        nextPayout: `GBP ${totalEarnings.toLocaleString('en-GB') || '0.00'}`
      });

      // Fetch full interpreter profile to check status
      const profile = await InterpreterService.getById(interpreterId);
      if (profile) {
        setInterpreterStatus(profile.status);
        setInterpreter(profile as Interpreter);
      } else {
        setInterpreterStatus('ONBOARDING');
      }
    } catch (error) {
      console.error("Failed to load dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  const openJobModal = (job: Booking) => {
    setSelectedJob(job);
    setIsModalOpen(true);
  };

  const handleAcceptJob = async (id: string, isDirect?: boolean, assignmentId?: string) => {
    try {
      if (isDirect) {
        const assignments = await BookingService.getAssignmentsByBookingId(id);
        const directAssignment = assignments.find((assignment: BookingAssignment) => assignment.interpreterId === user?.profileId && assignment.status === AssignmentStatus.OFFERED);
        const targetAssignment = directAssignment || await BookingService.ensureInterpreterAssignment(id, user!.profileId!);
        await BookingService.acceptOffer(targetAssignment.id);
      } else {
        await BookingService.acceptOffer(assignmentId || id);
      }
      showToast('Job accepted successfully!', 'success');
      if (user?.profileId) loadDashboardData(user.profileId);
    } catch (e: any) {
      showToast(e.message || 'Failed to accept job', 'error');
    }
  };

  const handleRejectJob = async (id: string, isDirect?: boolean, assignmentId?: string) => {
    try {
      if (isDirect) {
        const assignments = await BookingService.getAssignmentsByBookingId(id);
        const directAssignment = assignments.find((assignment: BookingAssignment) => assignment.interpreterId === user?.profileId && assignment.status === AssignmentStatus.OFFERED);
        const targetAssignment = directAssignment || await BookingService.ensureInterpreterAssignment(id, user!.profileId!);
        await BookingService.declineOffer(targetAssignment.id);
      } else {
        await BookingService.declineOffer(assignmentId || id);
      }
      showToast('Job declined', 'info');
      if (user?.profileId) loadDashboardData(user.profileId);
    } catch (e: any) {
      showToast(e.message || 'Failed to decline job', 'error');
    }
  };

  const handleMessageAdmin = async (bookingId: string) => {
    if (!user) return;

    try {
      const adminUser = await ChatService.getAdminSupportUser();
      if (!adminUser) {
        showToast('No operations user is available for chat', 'error');
        return;
      }

      const threadId = await ChatService.getOrCreateBookingThread(
        bookingId,
        user,
        adminUser,
        { name: `Job ${bookingId}` }
      );
      openThread(threadId);
    } catch (e) {
      showToast('Failed to start chat', 'error');
    }
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)] flex-1 flex-col bg-slate-50 animate-in fade-in duration-700 dark:bg-slate-950">
      <PageHeader
        title="Interpreter Workspace"
        subtitle={`Session active for ${user?.displayName?.split(' ')[0] || 'Agent'}`}
      >
        {!requiresInterpreterOnboarding(interpreterStatus) && (
          <Button onClick={() => navigate('/interpreter/jobs')} variant="secondary" icon={Briefcase} size="sm">Browse Jobs</Button>
        )}
      </PageHeader>

      {/* Conditional Rendering: Onboarding Flow */}
      {/* Case 1: New Applicant - Must complete profile wizard first */}
      {interpreterStatus === 'APPLICANT' && interpreter && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-[2.5rem] p-8 text-center shadow-xl shadow-slate-200/50">
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <User size={40} />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Welcome aboard!</h2>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              We've provisioned your account. To start receiving job offers, we first need to complete your professional profile.
            </p>
            <Button
              onClick={() => navigate('/interpreter/onboarding')}
              className="w-full bg-slate-900 py-4 rounded-2xl"
              icon={ChevronRight}
              iconPosition="right"
            >
              Start Profile Wizard
            </Button>
          </div>
        </div>
      )}

      {isInterpreterLocked(interpreterStatus) && interpreter && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="max-w-md w-full bg-white border border-red-100 rounded-[2rem] p-8 text-center shadow-xl shadow-red-100/50">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Account Requires Admin Review</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Your interpreter profile is currently {interpreterStatus?.toLowerCase()}. Jobs, timesheets, and billing are paused until the Lingland team reactivates access.
            </p>
          </div>
        </div>
      )}

      {/* Case 2: Onboarding - Documents Review Hub */}
      {interpreterStatus !== 'APPLICANT' && !isInterpreterLocked(interpreterStatus) && requiresInterpreterOnboarding(interpreterStatus) && interpreter && (
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-8">
           <OnboardingWidget 
             interpreter={interpreter} 
             onUpdate={() => user?.profileId && loadDashboardData(user.profileId)} 
           />
        </div>
      )}

      {/* Primary Dashboard Content (Hidden if Onboarding) */}
      {!requiresInterpreterOnboarding(interpreterStatus) && (
        <>
      <div className="flex flex-1 flex-col overflow-hidden px-4 pb-4 md:px-6">
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar
                name={user?.displayName || ''}
                src={user?.photoUrl}
                size="md"
                className="rounded-lg border border-slate-200 shadow-sm dark:border-slate-800"
              />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Current session</p>
                <h2 className="truncate text-base font-black text-slate-900 dark:text-white">{user?.displayName || 'Agent'}</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:min-w-[560px]">
              {loading ? (
                Array(3).fill(0).map((_, i) => <MetricSkeleton key={i} />)
              ) : [
                { label: 'Active Offers', value: offers.length, badge: 'New', badgeColor: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300' },
                { label: 'Booked Sessions', value: upcomingJobs.length, badge: 'Active', badgeColor: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-300' },
                { label: 'Settled Earnings', value: stats.nextPayout, badge: 'Total', badgeColor: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300' },
              ].map((m, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-black uppercase tracking-wide text-slate-400">{m.label}</div>
                    <div className="mt-0.5 truncate text-sm font-black text-slate-900 dark:text-white">{m.value}</div>
                  </div>
                  <div className={`ml-2 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${m.badgeColor}`}>{m.badge}</div>
                </div>
              ))}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" onClick={() => navigate('/interpreter/profile')} icon={User} size="sm">Profile</Button>
              <Button onClick={() => navigate('/interpreter/timesheets')} icon={Calendar} size="sm">Timesheets</Button>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Urgent Attention Zone */}
          {(pendingTimesheets.length > 0 || offers.length > 0) && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="mb-2 flex items-center gap-2">
                <AlertCircle size={14} className="text-amber-600" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">Action Required</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {pendingTimesheets.length > 0 && (
                  <button
                    onClick={() => navigate('/interpreter/timesheets')}
                    className="group flex items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-left shadow-sm transition-all hover:border-amber-400 dark:bg-slate-900"
                  >
                    <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600 font-bold text-sm">{pendingTimesheets.length}</div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Pending Timesheets</p>
                      <p className="text-[10px] text-slate-500">Awaiting your submission</p>
                    </div>
                  </button>
                )}
                {offers.length > 0 && (
                  <button
                    onClick={() => navigate('/interpreter/offers')}
                    className="group flex items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-left shadow-sm transition-all hover:border-blue-400 dark:bg-slate-900"
                  >
                    <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm">{offers.length}</div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Job Offers Live</p>
                      <p className="text-[10px] text-slate-500">Review pending marketplace assignments</p>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}

          <HighDensityActivityTable title="Upcoming Schedule" data={upcomingJobs} loading={loading} onRowClick={openJobModal} />
        </div>
      </div>
    </>)}

      {/* Shared Job Details Modal */}
      <JobDetailsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        job={selectedJob}
        onAccept={(id: string, isDirect?: boolean, assignmentId?: string) => handleAcceptJob(id, isDirect, assignmentId)}
        onReject={(id: string, isDirect?: boolean, assignmentId?: string) => handleRejectJob(id, isDirect, assignmentId)}
        onMessageAdmin={handleMessageAdmin}
      />
    </div>
  );
};
