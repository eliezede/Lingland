
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { BookingService } from '../../services/api';
import { StatsService } from '../../services/api';
import { Booking, BookingAssignment } from '../../types';
import { MobileJobCard } from '../../components/MobileJobCard';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronRight } from 'lucide-react';

export const InterpreterDashboard = () => {
  const { user } = useAuth();
  const [nextJob, setNextJob] = useState<Booking | null>(null);
  const [offerCount, setOfferCount] = useState(0);
  const [loading, setLoading] = useState(true);

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
      // Parallel fetch
      const [schedule, offers] = await Promise.all([
        BookingService.getInterpreterSchedule(interpreterId),
        BookingService.getInterpreterOffers(interpreterId)
      ]);

      // Find next job (future only)
      const upcoming = schedule
        .filter(b => new Date(b.date + 'T' + b.startTime) > new Date())
        .sort((a, b) => new Date(a.date + 'T' + a.startTime).getTime() - new Date(b.date + 'T' + b.startTime).getTime());

      setNextJob(upcoming[0] || null);
      setOfferCount(offers.length);
    } catch (error) {
      console.error("Failed to load dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  // Safe display name access
  const firstName = user?.displayName?.split(' ')[0] || 'Interpreter';

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Good morning,</h2>
        <p className="text-gray-500">{firstName}</p>
      </div>

      {/* Urgent Action: Offers */}
      {offerCount > 0 && (
        <Link to="/interpreter/jobs" className="block bg-blue-600 rounded-xl p-4 text-white shadow-lg shadow-blue-200 transform active:scale-95 transition-transform">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <AlertCircle size={24} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-lg">{offerCount} New Job Offer{offerCount > 1 ? 's' : ''}</p>
                <p className="text-blue-100 text-sm">Action required</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-blue-100" />
          </div>
        </Link>
      )}

      {/* Next Job */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-gray-800">Up Next</h3>
          <Link to="/interpreter/jobs" className="text-sm text-blue-600 font-medium">See all</Link>
        </div>
        {nextJob ? (
          <MobileJobCard type="UPCOMING" data={nextJob} onClick={() => {/* Navigate to details */}} />
        ) : (
          <div className="bg-white p-6 rounded-xl border border-gray-200 text-center">
            <p className="text-gray-400 text-sm">No upcoming jobs scheduled.</p>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">This Week</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">£250</p>
          <p className="text-xs text-green-600 mt-1">Estimated</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">To Invoice</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">£120</p>
          <Link to="/interpreter/billing" className="text-xs text-blue-600 mt-1 block">View Pending</Link>
        </div>
      </div>
    </div>
  );
};
