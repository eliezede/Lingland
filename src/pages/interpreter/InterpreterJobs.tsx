
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MobileJobCard } from '../../components/MobileJobCard';
import { useInterpreterJobOffers } from '../../hooks/useInterpreterJobOffers';
import { useInterpreterUpcomingJobs } from '../../hooks/useInterpreterUpcomingJobs';
import { useNavigate } from 'react-router-dom';

type Tab = 'OFFERS' | 'UPCOMING';

export const InterpreterJobs = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('OFFERS');
  
  const { offers, loading: offersLoading, acceptOffer, declineOffer } = useInterpreterJobOffers(user?.profileId);
  const { jobs, loading: jobsLoading } = useInterpreterUpcomingJobs(user?.profileId);

  const isLoading = offersLoading || jobsLoading;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="bg-gray-200 p-1 rounded-lg flex sticky top-0 z-10">
        <button
          onClick={() => setActiveTab('OFFERS')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
            activeTab === 'OFFERS' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Offers {offers.length > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] px-1.5 rounded-full">{offers.length}</span>}
        </button>
        <button
          onClick={() => setActiveTab('UPCOMING')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
            activeTab === 'UPCOMING' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Upcoming
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>
      ) : (
        <div className="space-y-4 pb-16">
          {activeTab === 'OFFERS' && (
            offers.length === 0 ? (
              <div className="text-center py-12 text-gray-400">No pending offers.</div>
            ) : (
              offers.map(offer => (
                <MobileJobCard 
                  key={offer.id} 
                  type="OFFER" 
                  data={offer} 
                  onAccept={acceptOffer}
                  onDecline={declineOffer}
                />
              ))
            )
          )}

          {activeTab === 'UPCOMING' && (
            jobs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">No upcoming jobs found.</div>
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
      )}
    </div>
  );
};
