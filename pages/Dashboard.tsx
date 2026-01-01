
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { StatsService } from '../services/api';
import { UserRole } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Users, AlertCircle, PoundSterling, CalendarDays, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const StatCard = ({ title, value, icon: Icon, color, onClick }: any) => (
  <div 
    onClick={onClick}
    className={`bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all duration-200 ${
      onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-200 active:scale-[0.98]' : ''
    }`}
  >
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
      </div>
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon size={24} className="text-white" />
      </div>
    </div>
  </div>
);

export const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    // In real app, load different stats based on role
    StatsService.getAdminStats().then(setStats);
  }, [user]);

  if (!stats) return <div>Loading dashboard...</div>;

  const chartData = [
    { name: 'Mon', bookings: 4 },
    { name: 'Tue', bookings: 7 },
    { name: 'Wed', bookings: 5 },
    { name: 'Thu', bookings: 12 },
    { name: 'Fri', bookings: 8 },
  ];

  const renderAdminDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Pending Requests" 
          value={stats.pendingRequests} 
          icon={Activity} 
          color="bg-blue-500" 
          onClick={() => navigate('/admin/bookings')}
        />
        <StatCard 
          title="Active Interpreters" 
          value={stats.activeInterpreters} 
          icon={Users} 
          color="bg-purple-500" 
          onClick={() => navigate('/admin/interpreters')}
        />
        <StatCard 
          title="Unpaid Invoices" 
          value={stats.unpaidInvoices} 
          icon={AlertCircle} 
          color="bg-orange-500" 
          onClick={() => navigate('/admin/billing/client-invoices')}
        />
        <StatCard 
          title="Monthly Revenue" 
          value={`£${stats.revenueMonth.toLocaleString()}`} 
          icon={PoundSterling} 
          color="bg-green-500" 
          onClick={() => navigate('/admin/billing')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Weekly Booking Volume</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#F3F4F6' }} />
                <Bar dataKey="bookings" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
             <button 
               onClick={() => navigate('/admin/bookings')}
               className="w-full py-2 px-4 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 text-left flex items-center"
             >
               + New Booking Request
             </button>
             <button 
               onClick={() => navigate('/admin/timesheets')}
               className="w-full py-2 px-4 bg-gray-50 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100 text-left"
             >
               Review Timesheets (3)
             </button>
             <button 
               onClick={() => navigate('/admin/interpreters')}
               className="w-full py-2 px-4 bg-gray-50 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100 text-left"
             >
               Approve New Interpreters (1)
             </button>
             <button 
               onClick={() => navigate('/admin/settings')}
               className="w-full py-2 px-4 bg-gray-50 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100 text-left flex items-center"
             >
               <Settings size={14} className="mr-2" /> System Settings
             </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderClientDashboard = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Welcome, {user?.displayName}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Upcoming Bookings" value="2" icon={CalendarDays} color="bg-blue-500" onClick={() => navigate('/client/bookings')} />
        <StatCard title="Invoices Due" value="£1,250" icon={PoundSterling} color="bg-orange-500" onClick={() => navigate('/client/invoices')} />
        <StatCard title="Completed Jobs" value="14" icon={Activity} color="bg-green-500" onClick={() => navigate('/client/bookings')} />
      </div>
    </div>
  );

  const renderInterpreterDashboard = () => (
    <div className="space-y-6">
       <h2 className="text-2xl font-bold text-gray-900">Hello, {user?.displayName?.split(' ')[0]}</h2>
       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Available Offers" value="3" icon={Activity} color="bg-blue-500" onClick={() => navigate('/interpreter/jobs')} />
        <StatCard title="Upcoming Jobs" value="1" icon={CalendarDays} color="bg-purple-500" onClick={() => navigate('/interpreter/jobs')} />
        <StatCard title="Pending Payment" value="£340.50" icon={PoundSterling} color="bg-green-500" onClick={() => navigate('/interpreter/billing')} />
      </div>
    </div>
  );

  switch (user?.role) {
    case UserRole.ADMIN: return renderAdminDashboard();
    case UserRole.CLIENT: return renderClientDashboard();
    case UserRole.INTERPRETER: return renderInterpreterDashboard();
    default: return <div>Access Denied</div>;
  }
};
