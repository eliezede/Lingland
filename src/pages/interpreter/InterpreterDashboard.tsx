import React, { useEffect, useState } from 'react';
import { StatsService } from '../../services/statsService';
import { useAuth } from '../../context/AuthContext';
import { BookingService, BillingService, InterpreterService } from '../../services/api';
import { Booking, BookingStatus } from '../../types';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Clock, CheckCircle2,
  Calendar, PoundSterling, Star, MessageSquare,
  ChevronRight, AlertCircle, Award, ShieldCheck,
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

// --- Sub-components matching Admin Dashboard ---

const MetricSkeleton = () => (
  <div className="flex items-center gap-3 md:border-l border-slate-100 md:pl-8">
    <div className="space-y-1">
      <Skeleton className="h-2 w-16" />
      <Skeleton className="h-4 w-12" />
    </div>
    <Skeleton className="h-3 w-8 rounded-full" />
  </div>
);

const HighDensityActivityTable = ({ title, data, loading, onRowClick }: { title: string, data: any[], loading?: boolean, onRowClick: (job: any) => void }) => (
  <div className="flex-1 flex flex-col min-w-0 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden shrink-0 min-h-[400px]">
    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white overflow-hidden">
      <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-[0.2em] shrink-0">{title}</h3>
    </div>
    <div className="overflow-x-auto custom-scrollbar flex-1">
      <table className="w-full text-left border-collapse min-w-[600px]">
        <thead className="bg-slate-50/50 border-b border-slate-100 sticky top-0 z-10">
          <tr>
            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client / Location</th>
            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Service</th>
            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date & Time</th>
            <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Estimated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {loading ? (
            Array(5).fill(0).map((_, i) => (
              <tr key={i}>
                <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-16 rounded" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-12 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No scheduled sessions found.</td></tr>
          ) : data.map((item, i) => (
            <tr key={i} onClick={() => onRowClick(item.raw)} className="hover:bg-slate-50/80 group transition-colors cursor-pointer">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-md border flex flex-col items-center justify-center text-[8px] font-black uppercase ${item.isOnline ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                    {item.isOnline ? <Video size={10} /> : <MapPin size={10} />}
                  </div>
                  <span className="text-xs font-bold text-slate-900 whitespace-nowrap">{item.client || 'Confidential'}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-xs font-medium text-slate-600 whitespace-nowrap">
                <span className="flex items-center gap-1.5"><Globe2 size={12} className="text-blue-500" /> {item.service}</span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider
                  ${item.raw.status === BookingStatus.READY_FOR_INVOICE || item.raw.status === BookingStatus.BOOKED ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                    item.raw.status === BookingStatus.OPENED ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                      'bg-slate-50 text-slate-700 border border-slate-100'}`}>
                  {item.raw.status === BookingStatus.BOOKED ? 'CONFIRMED' : item.raw.status}
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
                  {item.date} <span className="text-[10px] text-slate-300 font-normal">|</span> {item.time}
                </div>
              </td>
              <td className="px-4 py-3 text-right text-xs font-black text-slate-900 whitespace-nowrap">
                {item.pay}
                <span className="opacity-0 group-hover:opacity-100 text-blue-600 ml-2 transition-opacity inline-block">→</span>
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
    nextPayout: '£4,280.00'
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

      // Categorize
      const isPending = (s: string) => s === BookingStatus.OPENED || s === 'PENDING_ASSIGNMENT';
      const confirmed = schedule.filter((b: Booking) => !isPending(b.status as string));
      // We tag these as "direct" so the UI knows they use Booking ID
      const directPending = schedule.filter((b: Booking) => isPending(b.status as string)).map(b => ({ ...b, _isDirect: true }));

      const upcoming = confirmed
        .filter((b: Booking) => new Date(b.date + 'T' + (b.startTime || '00:00')) > new Date())
        .sort((a: Booking, b: Booking) => new Date(a.date + 'T' + (a.startTime || '00:00')).getTime() - new Date(b.date + 'T' + (b.startTime || '00:00')).getTime());

      const pastPendingTs = confirmed
        .filter((b: Booking) => String(b.status) === 'BOOKED' && new Date(b.date + 'T' + (b.startTime || '23:59')) <= new Date())
        .sort((a: Booking, b: Booking) => new Date(b.date + 'T' + (b.startTime || '00:00')).getTime() - new Date(a.date + 'T' + (a.startTime || '00:00')).getTime());

      setUpcomingJobs(upcoming.map(job => ({
        client: job.clientName,
        isOnline: job.locationType === 'ONLINE',
        service: `${job.languageFrom} → ${job.languageTo}`,
        date: new Date(job.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        time: job.startTime,
        pay: '£45.00', // Mocked payload for assignment
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

      setOffers([...directPending, ...enrichedOffers]);

      setStats({
        completedBookings: realStats.completedBookings || 0,
        liveOffers: (realStats.liveOffers || 0) + directPending.length,
        upcomingBookings: upcoming.length,
        rating: 4.96,
        hoursWorked: '84.5h', // Mock for design
        nextPayout: `£${totalEarnings.toLocaleString('en-GB') || '0.00'}`
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
        // Direct assignment: The ID is the Booking ID. Update the booking status to BOOKED.
        await BookingService.updateStatus(id, BookingStatus.BOOKED);
      } else {
        // Broadcast offer: We need the assignment ID to accept.
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
        // Direct assignment: Unassign interpreter
        await BookingService.unassignInterpreterFromBooking(id);
      } else {
        // Broadcast Offer
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
    <div className="flex-1 flex flex-col h-full min-h-[calc(100vh-4rem)] bg-slate-50 animate-in fade-in duration-700">
      <PageHeader
        title="Agent Interface"
        subtitle={`Session active for ${user?.displayName?.split(' ')[0] || 'Agent'}`}
      >
        {!requiresInterpreterOnboarding(interpreterStatus) && (
          <Button onClick={() => navigate('/interpreter/jobs')} variant="secondary" icon={Briefcase} size="sm">Browse Jobs</Button>
        )}
      </PageHeader>

      {/* Welcome Block */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="flex items-center gap-6 relative">
            <UserAvatar
              name={user?.displayName || ''}
              src={user?.photoUrl}
              size="lg"
              className="rounded-3xl shadow-lg border-2 border-slate-50 dark:border-slate-800"
            />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Welcome back,</p>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">{user?.displayName || 'Agent'}</h2>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 relative z-10">
            <Button variant="secondary" onClick={() => navigate('/interpreter/profile')} icon={User}>My Profile</Button>
            {!requiresInterpreterOnboarding(interpreterStatus) && (
              <Button onClick={() => navigate('/interpreter/timesheets')} icon={Calendar}>Timesheets</Button>
            )}
          </div>
          <div className="absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 w-48 h-48 bg-blue-500/10 dark:bg-blue-400/10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-700" />
        </div>

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
          {/* Metrics Ribbon */}
      <div className="bg-white border border-slate-200 rounded-3xl px-8 py-5 flex flex-wrap items-center gap-x-12 gap-y-4 mb-8 shadow-sm mx-4 sm:mx-0">
        {loading ? (
          Array(3).fill(0).map((_, i) => <MetricSkeleton key={i} />)
        ) : [
          { label: 'Active Offers', value: offers.length, badge: 'New', badgeColor: 'text-blue-600 bg-blue-50' },
          { label: 'Booked Sessions', value: upcomingJobs.length, badge: 'Active', badgeColor: 'text-indigo-600 bg-indigo-50' },
          { label: 'Settled Earnings', value: stats.nextPayout, badge: 'Total', badgeColor: 'text-emerald-600 bg-emerald-50' },
        ].map((m, i) => (
          <div key={i} className={`flex items-center gap-3 ${i > 0 ? 'md:border-l border-slate-100 md:pl-8' : ''}`}>
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{m.label}</div>
              <div className="text-lg font-black text-slate-900 mt-1 leading-none">{m.value}</div>
            </div>
            <div className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${m.badgeColor}`}>{m.badge}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden px-4 md:px-0">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Urgent Attention Zone */}
          {(pendingTimesheets.length > 0 || offers.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={14} className="text-amber-600" />
                <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider">Action Required</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {pendingTimesheets.length > 0 && (
                  <button
                    onClick={() => navigate('/interpreter/timesheets')}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-amber-200 hover:border-amber-400 rounded-lg text-left transition-all shadow-sm group"
                  >
                    <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600 font-bold text-sm">{pendingTimesheets.length}</div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Pending Timesheets</p>
                      <p className="text-[10px] text-slate-500">Awaiting your submission →</p>
                    </div>
                  </button>
                )}
                {offers.length > 0 && (
                  <button
                    onClick={() => navigate('/interpreter/offers')}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-blue-200 hover:border-blue-400 rounded-lg text-left transition-all shadow-sm group"
                  >
                    <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm">{offers.length}</div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Job Offers Live</p>
                      <p className="text-[10px] text-slate-500">Review pending marketplace assignments →</p>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}

          <HighDensityActivityTable title="Upcoming Schedule" data={upcomingJobs} loading={loading} onRowClick={openJobModal} />
        </div>

        <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white flex flex-col shrink-0 mt-6 lg:mt-0 lg:ml-6 rounded-2xl lg:rounded-none overflow-hidden shadow-sm lg:shadow-none">
          <div className="flex-1 p-6 overflow-y-auto">
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] mb-6">Market Opportunities</h3>
            <div className="space-y-4">
              {offers.length === 0 ? (
                <div className="text-xs text-slate-400 py-12 text-center font-bold uppercase tracking-widest border border-dashed border-slate-200 rounded-2xl">No open offers</div>
              ) : (
                offers.slice(0, 3).map((offer: any, i: number) => (
                  <div key={i} className="p-4 bg-white border border-slate-200 rounded-2xl hover:border-blue-400 transition-all shadow-sm group">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex flex-col">
                        <h4 className="font-black text-xs text-slate-900">{offer.serviceType}</h4>
                        {offer.status === BookingStatus.OPENED && <span className="text-[9px] font-black text-blue-600 flex items-center gap-1 mt-0.5"><ShieldCheck size={10} /> Direct Assignment</span>}
                      </div>
                      <span className="text-[9px] font-black bg-blue-900 text-white px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-sm group-hover:scale-110 transition-transform">Live</span>
                    </div>
                    <div className="flex items-center gap-3 mb-4 text-[10px] font-black text-slate-600">
                      <span className="bg-slate-50 px-2 py-1 flex items-center rounded"><Globe2 size={12} className="mr-1 text-blue-500" /> {offer.languageFrom} → {offer.languageTo}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openJobModal(offer)} className="flex-1 py-2 bg-slate-900 text-white text-[10px] font-black rounded-xl hover:bg-black transition-colors uppercase tracking-widest shadow-lg shadow-slate-100">Review</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Certification / Action Card */}
          <div className="bg-blue-600 p-6 text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:scale-125 transition-transform duration-1000" />
            <ShieldCheck size={64} className="absolute -bottom-4 -right-4 text-white opacity-10 group-hover:rotate-12 transition-transform duration-700" />

            <div className="relative z-10">
              <h4 className="text-sm font-black mb-1">Certification Update</h4>
              <p className="text-blue-100 text-[10px] font-medium mb-4 opacity-80 leading-relaxed">Ensure compliance scores remain active.</p>

              <button className="w-full bg-white text-blue-600 font-black py-2 rounded-xl text-[10px] shadow-lg hover:bg-blue-50 transition-all uppercase tracking-widest">
                Review Account
              </button>
            </div>
          </div>
        </aside>
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
