import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MobileJobCard } from '../../components/MobileJobCard';
import { useInterpreterJobOffers } from '../../hooks/useInterpreterJobOffers';
import { useInterpreterUpcomingJobs } from '../../hooks/useInterpreterUpcomingJobs';
import { useNavigate } from 'react-router-dom';
import { RefreshCcw } from 'lucide-react';

type Tab = 'OFFERS' | 'UPCOMING';

export const InterpreterJobs = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('OFFERS');
  
  const { offers, loading: offersLoading, acceptOffer, declineOffer, refresh: refreshOffers } = useInterpreterJobOffers(user?.profileId);
  const { jobs, loading: jobsLoading, refresh: refreshJobs } = useInterpreterUpcomingJobs(user?.profileId);

  const handleRefresh = () => {
    refreshOffers();
    refreshJobs();
  };

  const isLoading = offersLoading || jobsLoading;

  return (
    <div className="space-y-4">
      {/* Tabs & Controls */}
      <div className="flex items-center gap-2 sticky top-0 z-20 bg-gray-50 pt-2 pb-1">
        <div className="bg-gray-200 p-1 rounded-xl flex flex-1 shadow-inner">
          <button
            onClick={() => setActiveTab('OFFERS')}
            className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
              activeTab === 'OFFERS' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Offers {offers.length > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] px-1.5 rounded-full">{offers.length}</span>}
          </button>
          <button
            onClick={() => setActiveTab('UPCOMING')}
            className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
              activeTab === 'UPCOMING' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Upcoming
          </button>
        </div>
        <button 
          onClick={handleRefresh}
          disabled={isLoading}
          className="p-3 bg-white rounded-xl border border-gray-200 text-gray-400 hover:text-blue-600 active:rotate-180 transition-all duration-500 disabled:opacity-50"
        >
          <RefreshCcw size={18} className={isLoading ? 'animate-spin text-blue-500' : ''} />
        </button>
      </div>

      {/* Content */}
      <div className="space-y-4 pb-24">
        {activeTab === 'OFFERS' && (
          offersLoading ? (
            <div className="py-20 text-center flex flex-col items-center">
               <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
               <p className="text-gray-400 text-sm font-medium">Checking for new jobs...</p>
            </div>
          ) : offers.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300 mx-2">
               <p className="text-gray-400 text-sm font-medium">No pending job offers.</p>
               <button onClick={refreshOffers} className="mt-4 text-blue-600 text-xs font-black uppercase tracking-widest">Refresh Now</button>
            </div>
          ) : (
            offers.map(offer => (
              <MobileJobCard 
                key={offer.id} 
                type="OFFER" 
                data={offer} 
                onAccept={async (id) => {
                  const success = await acceptOffer(id);
                  if (success) setActiveTab('UPCOMING');
                }}
                onDecline={declineOffer}
              />
            ))
          )
        )}

        {activeTab === 'UPCOMING' && (
          jobsLoading ? (
            <div className="py-20 text-center">
               <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
               <p className="text-gray-400 text-sm">Syncing your schedule...</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300 mx-2">
              <p className="text-gray-400 text-sm font-medium">No upcoming jobs scheduled.</p>
            </div>
          ) : (
            jobs.map(job => (
              <MobileJobCard 
                key={job.id} 
                type="UPCOMING" 
                data={job} 
                onClick={() => navigate(`/interpreter/jobs/${job.id}`)}
              />
            ))
          )
        )}
      </div>
    </div>
  );
};