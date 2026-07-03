import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Calendar as JobCalendar } from '../../components/Calendar';
import { useInterpreterJobOffers } from '../../hooks/useInterpreterJobOffers';
import { useInterpreterUpcomingJobs } from '../../hooks/useInterpreterUpcomingJobs';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clock, Briefcase, Calendar, MapPin, Video, Globe2, ChevronRight, CheckCircle2, XCircle, CalendarDays } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { BookingStatus } from '../../types';
import { formatLanguagePair } from '../../utils/languageDisplay';

type Tab = 'OFFERS' | 'UPCOMING';

export const InterpreterJobs = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    return (location.state as any)?.tab || 'OFFERS';
  });

  const { offers, loading: offersLoading, acceptOffer, declineOffer } = useInterpreterJobOffers(user?.profileId);
  const { jobs, loading: jobsLoading } = useInterpreterUpcomingJobs(user?.profileId);

  const isLoading = offersLoading || jobsLoading;

  const handleDateClick = (date: Date) => {
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    const dateStr = d.toISOString().split('T')[0];
    const jobOnDay = jobs.find(j => j.date === dateStr);
    if (jobOnDay) {
      navigate(`/interpreter/jobs/${jobOnDay.id}`, {
        state: { returnTo: '/interpreter/jobs', returnTab: 'UPCOMING', returnLabel: 'Upcoming Schedule' }
      });
    }
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)] flex-1 flex-col bg-slate-50 animate-in fade-in duration-700 dark:bg-slate-950">
      <PageHeader
        title="Marketplace & Rota"
        subtitle="Manage your upcoming assignments and review new contract offers."
      >
        <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            onClick={() => setActiveTab('OFFERS')}
            className={`rounded-md px-4 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all ${activeTab === 'OFFERS' ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-950' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            Job Offers ({offers.length})
          </button>
          <button
            onClick={() => setActiveTab('UPCOMING')}
            className={`rounded-md px-4 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all ${activeTab === 'UPCOMING' ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-950' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            Upcoming Schedule
          </button>
        </div>
      </PageHeader>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 md:p-6">

        {/* Left Column: Job List */}
        <div className="min-h-0 flex-1">
          <div className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-3">
                {activeTab === 'OFFERS' ? <Briefcase size={16} className="text-blue-600" /> : <Calendar size={16} className="text-emerald-600" />}
                <h3 className="text-[10px] font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">{activeTab === 'OFFERS' ? 'Available Contracts' : 'Confirmed Itinerary'}</h3>
              </div>
              <div className="hidden text-[10px] font-black uppercase tracking-wide text-slate-400 sm:block">
                {activeTab === 'OFFERS' ? `${offers.length} open` : `${jobs.length} booked`}
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              {isLoading ? (
                <div className="flex-1 flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-4 text-slate-400">
                    <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Syncing Matrix...</span>
                  </div>
                </div>
              ) : (
                <>
                  {activeTab === 'OFFERS' && (
                    offers.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center py-20 px-6">
                        <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-slate-200">
                          <Briefcase size={24} />
                        </div>
                        <h3 className="text-slate-900 font-black text-sm">No Pending Offers</h3>
                        <p className="text-slate-400 text-[10px] uppercase tracking-widest font-bold mt-2">Marketplace is currently empty. We will notify you when new contracts match your profile.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {offers.map(offer => (
                          <div key={offer.id} className="group flex flex-col items-start justify-between gap-4 p-4 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/60 sm:flex-row sm:items-center">
                            <div className="flex flex-1 items-start gap-3">
                              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${offer.locationType === 'ONLINE' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                                {offer.locationType === 'ONLINE' ? <Video size={16} /> : <MapPin size={16} />}
                              </div>
                              <div className="min-w-0">
                                <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <h4 className="truncate text-sm font-black text-slate-900 dark:text-white">{offer.clientName || 'Confidential Client'}</h4>
                                  <span className="text-[9px] font-black bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded uppercase tracking-tighter shadow-sm">{offer.serviceType}</span>
                                  {offer._isDirect && <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded uppercase tracking-tighter shadow-sm">Direct</span>}
                                </div>
                                <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                  <span className="font-black text-slate-900 dark:text-slate-200">REF: {offer.bookingRef || offer.id?.slice(0, 6)}</span> <span className="text-slate-200">|</span> <CalendarDays size={12} /> {new Date(offer.date).toLocaleDateString()} <span className="text-slate-200">|</span> <Clock size={12} /> {offer.startTime}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                                  <Globe2 size={12} className="text-slate-400" /> {formatLanguagePair(offer.languageFrom, offer.languageTo)}
                                </div>
                              </div>
                            </div>

                            <div className="flex w-full shrink-0 flex-row gap-2 sm:w-auto">
                              <Button
                                variant="outline"
                                onClick={() => declineOffer(offer.id, offer._isDirect, offer._assignmentId)}
                                icon={XCircle}
                                size="sm"
                                className="flex-1 justify-center border-slate-200 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 sm:flex-none"
                              >
                                Decline
                              </Button>
                              <Button
                                onClick={() => acceptOffer(offer.id, offer._isDirect, offer._assignmentId)}
                                icon={CheckCircle2}
                                size="sm"
                                className="flex-1 justify-center bg-blue-600 text-white shadow-sm hover:bg-blue-700 sm:flex-none"
                              >
                                Accept
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {activeTab === 'UPCOMING' && (
                    jobs.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center py-20 px-6">
                        <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-slate-200">
                          <Calendar size={24} />
                        </div>
                        <h3 className="text-slate-900 font-black text-sm">Empty Schedule</h3>
                        <p className="text-slate-400 text-[10px] uppercase tracking-widest font-bold mt-2">You have no upcoming confirmed assignments at this time.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {jobs.map(job => (
                          <div
                            key={job.id}
                            onClick={() => navigate(`/interpreter/jobs/${job.id}`, {
                              state: { returnTo: '/interpreter/jobs', returnTab: 'UPCOMING', returnLabel: 'Upcoming Schedule' }
                            })}
                            className="group flex cursor-pointer flex-col items-start justify-between gap-4 p-4 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/60 sm:flex-row sm:items-center"
                          >
                            <div className="flex flex-1 items-start gap-3">
                              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${job.locationType === 'ONLINE' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                                {job.locationType === 'ONLINE' ? <Video size={16} /> : <MapPin size={16} />}
                              </div>
                              <div className="min-w-0">
                                <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <h4 className="truncate text-sm font-black text-slate-900 dark:text-white">{job.clientName || 'Confidential Client'}</h4>
                                  <span className={`text-[9px] font-black border px-2 py-0.5 rounded uppercase tracking-tighter shadow-sm
                                        ${job.status === BookingStatus.BOOKED ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}
                                     `}>
                                    {job.status === BookingStatus.BOOKED ? 'CONFIRMED' : job.status}
                                  </span>
                                </div>
                                <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                  <span className="font-black text-slate-900 dark:text-slate-200">REF: {job.bookingRef || job.id?.slice(0, 6)}</span> <span className="text-slate-200">|</span> <CalendarDays size={12} /> {new Date(job.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} <span className="text-slate-200">|</span> <Clock size={12} /> {job.startTime}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                                  <Globe2 size={12} className="text-slate-400" /> {formatLanguagePair(job.languageFrom, job.languageTo)}
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0">
                              <span className="hidden whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-blue-600 opacity-0 transition-opacity group-hover:opacity-100 sm:inline-block">
                                Manage Session
                              </span>
                              <ChevronRight className="text-slate-300 sm:hidden" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <JobCalendar jobs={jobs} onDateClick={handleDateClick} />
        </div>
      </div>
    </div>
  );
};
