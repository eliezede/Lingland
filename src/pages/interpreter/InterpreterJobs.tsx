import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Calendar as JobCalendar } from '../../components/Calendar';
import { useInterpreterJobOffers } from '../../hooks/useInterpreterJobOffers';
import { useInterpreterUpcomingJobs } from '../../hooks/useInterpreterUpcomingJobs';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutGrid, List, BarChart3, Clock, Briefcase, Calendar, MapPin, Video, Globe2, ChevronRight, CheckCircle2, XCircle, CalendarDays } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { BookingStatus } from '../../types';

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
    <div className="flex-1 flex flex-col h-full min-h-[calc(100vh-4rem)] bg-slate-50 animate-in fade-in duration-700">
      <PageHeader
        title="Marketplace & Rota"
        subtitle="Manage your upcoming assignments and review new contract offers."
      >
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('OFFERS')}
            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${activeTab === 'OFFERS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Job Offers ({offers.length})
          </button>
          <button
            onClick={() => setActiveTab('UPCOMING')}
            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${activeTab === 'UPCOMING' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Upcoming Schedule
          </button>
        </div>
      </PageHeader>

      <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full flex flex-col lg:flex-row gap-8">

        {/* Left Column: Job List */}
        <div className="flex-1 space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden min-h-[500px] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                {activeTab === 'OFFERS' ? <Briefcase size={16} className="text-blue-600" /> : <Calendar size={16} className="text-emerald-600" />}
                <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-[0.2em]">{activeTab === 'OFFERS' ? 'Available Contracts' : 'Confirmed Itinerary'}</h3>
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
                      <div className="divide-y divide-slate-50">
                        {offers.map(offer => (
                          <div key={offer.id} className="p-4 sm:p-6 hover:bg-slate-50/80 transition-colors group flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center">
                            <div className="flex items-start gap-4 flex-1">
                              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${offer.locationType === 'ONLINE' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                                {offer.locationType === 'ONLINE' ? <Video size={16} /> : <MapPin size={16} />}
                              </div>
                              <div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                                  <h4 className="font-black text-xs text-slate-900">{offer.clientName || 'Confidential Client'}</h4>
                                  <span className="text-[9px] font-black bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded uppercase tracking-tighter shadow-sm">{offer.serviceType}</span>
                                  {offer._isDirect && <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded uppercase tracking-tighter shadow-sm">Direct</span>}
                                </div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                                  <span className="text-slate-900 font-black">REF: {offer.bookingRef || offer.id?.slice(0, 6)}</span> <span className="text-slate-200">|</span> <CalendarDays size={12} /> {new Date(offer.date).toLocaleDateString()} <span className="text-slate-200">|</span> <Clock size={12} /> {offer.startTime}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                  <Globe2 size={12} className="text-slate-400" /> {offer.languageFrom} <ChevronRight size={10} className="text-slate-300" /> {offer.languageTo}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-row w-full sm:w-auto gap-2 shrink-0">
                              <Button
                                variant="outline"
                                onClick={() => declineOffer(offer.id, offer._isDirect, offer._assignmentId)}
                                icon={XCircle}
                                size="sm"
                                className="text-slate-500 border-slate-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200 flex-1 sm:flex-none justify-center"
                              >
                                Decline
                              </Button>
                              <Button
                                onClick={() => acceptOffer(offer.id, offer._isDirect, offer._assignmentId)}
                                icon={CheckCircle2}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white flex-1 sm:flex-none justify-center shadow-lg shadow-blue-600/20"
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
                      <div className="divide-y divide-slate-50">
                        {jobs.map(job => (
                          <div
                            key={job.id}
                            onClick={() => navigate(`/interpreter/jobs/${job.id}`, {
                              state: { returnTo: '/interpreter/jobs', returnTab: 'UPCOMING', returnLabel: 'Upcoming Schedule' }
                            })}
                            className="p-4 sm:p-6 hover:bg-slate-50/80 transition-colors group flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center cursor-pointer"
                          >
                            <div className="flex items-start gap-4 flex-1">
                              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${job.locationType === 'ONLINE' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                                {job.locationType === 'ONLINE' ? <Video size={16} /> : <MapPin size={16} />}
                              </div>
                              <div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                                  <h4 className="font-black text-xs text-slate-900">{job.clientName || 'Confidential Client'}</h4>
                                  <span className={`text-[9px] font-black border px-2 py-0.5 rounded uppercase tracking-tighter shadow-sm
                                        ${job.status === BookingStatus.BOOKED ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}
                                     `}>
                                    {job.status === BookingStatus.BOOKED ? 'CONFIRMED' : job.status}
                                  </span>
                                </div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-2">
                                  <span className="text-slate-900 font-black">REF: {job.bookingRef || job.id?.slice(0, 6)}</span> <span className="text-slate-200">|</span> <CalendarDays size={12} /> {new Date(job.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} <span className="text-slate-200">|</span> <Clock size={12} /> {job.startTime}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                  <Globe2 size={12} className="text-slate-400" /> {job.languageFrom} <ChevronRight size={10} className="text-slate-300" /> {job.languageTo}
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0">
                              <span className="text-[10px] text-blue-600 font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden sm:inline-block">
                                Manage Session →
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

        {/* Right Column: Calendar & Filters */}
        <div className="w-full lg:w-80 shrink-0 space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-4">
            <JobCalendar jobs={jobs} onDateClick={handleDateClick} />
          </div>

          <div className="bg-gradient-to-br from-blue-700 to-indigo-800 p-6 rounded-3xl text-white shadow-xl shadow-blue-900/10">
            <h4 className="font-black text-[10px] uppercase tracking-[0.2em] mb-3 text-blue-200">Pro Tip</h4>
            <p className="text-white text-xs font-medium leading-relaxed">
              Keep your profile updated and response times immediate to increase priority allocation for premium contracts.
            </p>
            <button
              onClick={() => navigate('/interpreter/profile')}
              className="mt-6 w-full py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all backdrop-blur-sm border border-white/10"
            >
              Update Availability
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
