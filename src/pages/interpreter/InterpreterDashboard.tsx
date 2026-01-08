import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { BookingService, ChatService } from '../../services/api';
import { Booking } from '../../types';
import { MobileJobCard } from '../../components/MobileJobCard';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronRight, MessageSquare } from 'lucide-react';
import { useChat } from '../../context/ChatContext';

export const InterpreterDashboard = () => {
  const { user } = useAuth();
  const { openThread } = useChat();
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
      const [schedule, offers] = await Promise.all([
        BookingService.getInterpreterSchedule(interpreterId),
        BookingService.getInterpreterOffers(interpreterId)
      ]);

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

  const handleSupportChat = async () => {
    if (!user) return;
    // For support chat, we'd ideally have a global support UID or just link to 'admin'
    // For demo, we search for an admin or use a fixed ID
    const names = {
      [user.id]: user.displayName || 'Interpreter',
      'u1': 'Sarah Admin' // Fixed admin from mock data for demo consistency
    };
    
    const threadId = await ChatService.getOrCreateThread(
      [user.id, 'u1'],
      names
    );
    openThread(threadId);
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  const firstName = user?.displayName?.split(' ')[0] || 'Interpreter';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Good morning,</h2>
        <p className="text-gray-500">{firstName}</p>
      </div>

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

      {/* Support Chat Quick Action */}
      <button 
        onClick={handleSupportChat}
        className="w-full flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-500 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
            <MessageSquare size={20} />
          </div>
          <div className="text-left">
             <p className="text-sm font-bold text-gray-900">Chat with Support</p>
             <p className="text-xs text-gray-500">Instant help for active jobs</p>
          </div>
        </div>
        <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
      </button>

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