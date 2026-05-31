import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookingService, ChatService } from '../../services/api';
import { Booking, BookingStatus } from '../../types';
import { MapPin, Clock, Calendar, Video, ChevronLeft, FileText, MessageSquare, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useChat } from '../../context/ChatContext';

export const InterpreterJobDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { openThread } = useChat();
  const [job, setJob] = useState<Booking | null>(null);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [isDirectOffer, setIsDirectOffer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (id && user?.profileId) {
      Promise.all([
        BookingService.getById(id),
        BookingService.getInterpreterOffers(user.profileId)
      ]).then(([res, offers]) => {
        setJob(res || null);
        setIsDirectOffer(!!res?.interpreterId && res.interpreterId === user.profileId && [BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING, 'PENDING_ASSIGNMENT' as any].includes(res.status));
        const matchingOffer = offers.find(o => o.bookingId === id);
        setAssignmentId(matchingOffer?.id || null);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [id, user?.profileId]);

  const handleJobChat = async () => {
    if (!user || !job) return;

    try {
      const adminUser = await ChatService.getAdminSupportUser();
      if (!adminUser) {
        showToast('No operations user is available for chat', 'error');
        return;
      }

      const threadId = await ChatService.getOrCreateBookingThread(
        job.id,
        user,
        adminUser,
        { name: job.bookingRef || job.id }
      );

      openThread(threadId);
    } catch {
      showToast('Failed to open job chat', 'error');
    }
  };

  const handleAccept = async () => {
    if (!job) return;
    setProcessing(true);
    try {
      if (assignmentId) {
        // Fallback for broadcast offers if they ever route here
        await BookingService.acceptOffer(assignmentId);
      } else if (isDirectOffer || [BookingStatus.ASSIGNMENT_PENDING, 'PENDING_ASSIGNMENT' as any].includes(job.status)) {
        await BookingService.updateStatus(job.id, BookingStatus.BOOKED);
      } else {
        throw new Error('This job is not currently available to accept.');
      }
      showToast('Job accepted successfully!', 'success');
      navigate('/interpreter/dashboard');
    } catch (e: any) {
      showToast(e.message || 'Failed to accept job', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    if (!job) return;
    setProcessing(true);
    try {
      if (isDirectOffer || [BookingStatus.ASSIGNMENT_PENDING, 'PENDING_ASSIGNMENT' as any].includes(job.status)) {
        await BookingService.unassignInterpreterFromBooking(job.id);
      } else if (assignmentId) {
        await BookingService.declineOffer(assignmentId);
      } else {
        throw new Error('This job is not currently available to decline.');
      }
      showToast('Job declined.', 'info');
      navigate('/interpreter/dashboard');
    } catch (e: any) {
      showToast(e.message || 'Failed to decline job', 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading job details...</div>;
  if (!job) return <div className="p-8 text-center text-red-500">Job not found.</div>;

  const isOnline = job.locationType === 'ONLINE';
  const canRespondToOffer = isDirectOffer || !!assignmentId || [BookingStatus.ASSIGNMENT_PENDING, 'PENDING_ASSIGNMENT' as any].includes(job.status);

  return (
    <div className="max-w-[1000px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-24">
      {/* Premium Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft size={16} className="mr-1" /> Jobs / {job.bookingRef || job.id?.slice(0, 6)}
        </button>

        <button
          onClick={handleJobChat}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white text-slate-700 font-bold rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm text-xs"
        >
          <MessageSquare size={14} className="text-blue-500" /> Message Admin
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Card */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
            <div className="flex justify-between items-start mb-6 relative z-10">
              <span className="inline-flex px-2 py-1 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest rounded border border-slate-200">
                {job.status === 'PENDING_ASSIGNMENT' as any ? 'Direct Assignment' : job.status}
              </span>
              <div className="text-right">
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-0.5">Est. Pay</p>
                <p className="text-xl font-black text-emerald-600 leading-none">£45.00</p>
              </div>
            </div>

            <div className="relative z-10">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-6">
                {job.languageFrom} <span className="text-slate-300 font-normal mx-2">&rarr;</span> {job.languageTo}
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-100 rounded-lg overflow-hidden">
                <div className="border-r border-b lg:border-b-0 border-slate-100 p-4 bg-white hidden sm:block">
                  <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1">Service Type</p>
                  <p className="font-semibold text-sm text-slate-900">{job.serviceType}</p>
                </div>
                <div className="border-b lg:border-b-0 lg:border-r border-slate-100 p-4 bg-white sm:hidden">
                  <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1">Service Type</p>
                  <p className="font-semibold text-sm text-slate-900">{job.serviceType}</p>
                </div>

                <div className="border-b lg:border-b-0 lg:border-r border-slate-100 p-4 bg-white hidden sm:block">
                  <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1">Case Type</p>
                  <p className="font-semibold text-sm text-slate-900">{job.caseType || 'General'}</p>
                </div>
                <div className="border-b lg:border-b-0 lg:border-r border-slate-100 p-4 bg-white sm:hidden border-l">
                  <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1">Case Type</p>
                  <p className="font-semibold text-sm text-slate-900">{job.caseType || 'General'}</p>
                </div>

                <div className="border-r border-slate-100 p-4 bg-white hidden sm:block">
                  <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1">Gender</p>
                  <p className="font-semibold text-sm text-slate-900">{job.genderPreference || 'Any'}</p>
                </div>
                <div className="border-b lg:border-b-0 border-slate-100 p-4 bg-white sm:hidden">
                  <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1">Gender</p>
                  <p className="font-semibold text-sm text-slate-900">{job.genderPreference || 'Any'}</p>
                </div>

                <div className="p-4 bg-white hidden sm:block">
                  <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1">Client</p>
                  <p className="font-semibold text-sm text-slate-900 truncate" title={job.clientName}>{job.clientName || 'Confidential'}</p>
                </div>
                <div className="p-4 bg-white sm:hidden border-l">
                  <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-1">Client</p>
                  <p className="font-semibold text-sm text-slate-900 truncate" title={job.clientName}>{job.clientName || 'Confidential'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-100">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Patient / Client Name</p>
                  <p className="font-bold text-slate-700">{job.patientName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Professional Name</p>
                  <p className="font-bold text-slate-700">{job.professionalName || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Notes Card */}
          {job.notes && (
            <div className="bg-amber-50 p-5 rounded-xl border border-amber-100">
              <h3 className="text-xs font-black text-amber-800 uppercase tracking-wider mb-2">Special Instructions</h3>
              <p className="text-amber-900 font-medium leading-relaxed text-sm">{job.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-xs font-black text-slate-900 mb-4">Schedule</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Calendar size={16} />
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-0.5">
                    {job.serviceType === 'TRANSLATION' ? 'Deadline Date' : 'Scheduled Date'}
                  </p>
                  <p className="font-semibold text-sm text-slate-900">
                    {new Date(job.date).toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Clock size={16} />
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-0.5">
                    {job.serviceType === 'TRANSLATION' ? 'Delivery Time' : 'Time & Duration'}
                  </p>
                  <p className="font-semibold text-sm text-slate-900">{job.startTime}{job.serviceType !== 'TRANSLATION' && ` (${job.durationMinutes} mins)`}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-xs font-black text-slate-900 mb-4">Location</h3>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isOnline ? 'bg-purple-50 text-purple-600' : 'bg-red-50 text-red-600'}`}>
                {isOnline ? <Video size={16} /> : <MapPin size={16} />}
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-0.5">
                  {isOnline ? 'Meeting Link' : 'Address'}
                </p>
                {isOnline ? (
                  job.onlineLink ? (
                    <a href={job.onlineLink} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-600 hover:text-blue-700 break-all">
                      {job.onlineLink}
                    </a>
                  ) : (
                    <p className="text-sm font-semibold text-slate-400 italic">Pending link generation</p>
                  )
                ) : (
                  <>
                    <p className="text-sm font-semibold text-slate-900">{job.address}</p>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{job.postcode}</p>
                    <a href={`https://maps.google.com/?q=${job.address} ${job.postcode}`} target="_blank" rel="noreferrer" className="text-blue-600 text-[10px] font-black uppercase tracking-wider mt-2 inline-block hover:text-blue-700">
                      Open in Maps →
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-md border-t border-slate-200 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] z-30 pb-safe md:pl-64 lg:pl-[inherit] transition-all">
        <div className="w-full max-w-[1000px] mx-auto p-4 flex justify-end">
          {canRespondToOffer ? (
            <div className="flex gap-3 w-full sm:w-auto">
              <button
                onClick={handleDecline}
                disabled={processing}
                className="flex-[0.5] sm:flex-none px-5 py-2.5 bg-white border border-slate-200 text-slate-600 font-semibold rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center disabled:opacity-50 text-sm shadow-sm"
              >
                <XCircle size={14} className="mr-2 text-slate-400" /> Decline
              </button>
              <button
                onClick={handleAccept}
                disabled={processing}
                className="flex-1 sm:flex-none px-6 py-2.5 bg-[#009b62] text-white font-semibold rounded-lg shadow-sm hover:bg-[#008956] transition-colors flex items-center justify-center disabled:opacity-50 text-sm tracking-tight"
              >
                <CheckCircle2 size={16} className="mr-2" /> Accept Job
              </button>
            </div>
          ) : job.status === BookingStatus.BOOKED && (job.serviceType === 'TRANSLATION' ? true : new Date(job.date) < new Date()) ? (
            <button
              onClick={() => navigate(`/interpreter/timesheets/new/${job.id}`)}
              className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg shadow-sm hover:bg-blue-700 transition-colors flex items-center justify-center text-sm tracking-tight"
            >
              <FileText className="mr-2" size={16} /> {job.serviceType === 'TRANSLATION' ? 'Submit Work / Delivery' : 'Submit Timesheet'}
            </button>
          ) : (
            null
          )}
        </div>
      </div>
    </div>
  );
};
