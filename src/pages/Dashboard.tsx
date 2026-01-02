import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { StatsService } from '../services/api';
import { UserRole } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
// Fix: Added missing icons FileText, UserPlus, and ChevronRight to resolve name errors on lines 154, 171, and 177
import { Activity, Users, AlertCircle, PoundSterling, CalendarDays, Settings, ArrowUpRight, FileText, UserPlus, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { useTheme } from '../context/ThemeContext';

const StatCard = ({ title, value, icon: Icon, color, onClick }: any) => (
  <Card 
    onClick={onClick}
    className="p-6"
  >
    <div className="flex justify-between items-start">
      <div>
        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em]">{title}</p>
        <p className="text-3xl font-black text-slate-900 dark:text-white mt-2 tracking-tight">{value}</p>
      </div>
      <div className={`p-3 rounded-2xl shadow-lg shadow-current/10 ${color}`}>
        <Icon size={24} className="text-white" />
      </div>
    </div>
    {onClick && (
      <div className="mt-4 flex items-center text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest group">
        Explore <ArrowUpRight size={12} className="ml-1 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    )}
  </Card>
);

export const Dashboard = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    StatsService.getAdminStats().then(setStats);
  }, [user]);

  if (!stats) return <div className="flex justify-center py-20"><div className="animate-pulse text-slate-400 font-black uppercase tracking-widest">Loading Analytics...</div></div>;

  const chartData = [
    { name: 'Mon', bookings: 4 },
    { name: 'Tue', bookings: 7 },
    { name: 'Wed', bookings: 5 },
    { name: 'Thu', bookings: 12 },
    { name: 'Fri', bookings: 8 },
    { name: 'Sat', bookings: 3 },
    { name: 'Sun', bookings: 2 },
  ];

  const renderAdminDashboard = () => (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2">
         <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">System Health</h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Real-time overview of Lingland's operations.</p>
         </div>
         <div className="bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full flex items-center border border-green-100 dark:border-green-800">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-2"></div>
            <span className="text-[10px] font-black text-green-600 dark:text-green-400 uppercase tracking-widest">Live Sync Active</span>
         </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="New Requests" 
          value={stats.pendingRequests} 
          icon={Activity} 
          color="bg-blue-600" 
          onClick={() => navigate('/admin/bookings')}
        />
        <StatCard 
          title="Talent Pool" 
          value={stats.activeInterpreters} 
          icon={Users} 
          color="bg-indigo-600" 
          onClick={() => navigate('/admin/interpreters')}
        />
        <StatCard 
          title="Awaiting Pay" 
          value={stats.unpaidInvoices} 
          icon={AlertCircle} 
          color="bg-orange-500" 
          onClick={() => navigate('/admin/billing/client-invoices')}
        />
        <StatCard 
          title="Gross Revenue" 
          value={`£${stats.revenueMonth.toLocaleString()}`} 
          icon={PoundSterling} 
          color="bg-emerald-600" 
          onClick={() => navigate('/admin/billing')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-8">
          <div className="flex justify-between items-center mb-8">
             <h3 className="text-lg font-bold text-slate-900 dark:text-white">Engagement Volume</h3>
             <select className="bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-xs font-bold text-slate-500 uppercase px-3 py-1.5 outline-none focus:ring-1 ring-blue-500 transition-all">
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
             </select>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#1e293b' : '#f1f5f9'} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12, fontWeight: 600 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12, fontWeight: 600 }}
                />
                <Tooltip 
                  cursor={{ fill: theme === 'dark' ? '#0f172a' : '#f8fafc' }} 
                  contentStyle={{ 
                    backgroundColor: theme === 'dark' ? '#0f172a' : '#fff', 
                    borderColor: theme === 'dark' ? '#1e293b' : '#e2e8f0',
                    borderRadius: '12px',
                    fontWeight: 'bold'
                  }}
                />
                <Bar dataKey="bookings" fill="#2563eb" radius={[6, 6, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-6">
           <Card className="p-6 bg-gradient-to-br from-blue-600 to-indigo-700 border-none shadow-xl shadow-blue-600/20">
              <h3 className="text-lg font-black text-white mb-2 tracking-tight">Quick Actions</h3>
              <p className="text-blue-100 text-xs mb-6 font-medium">Streamline your administrative workflow.</p>
              <div className="space-y-3">
                 <button 
                   onClick={() => navigate('/admin/bookings')}
                   className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all text-left flex items-center backdrop-blur-md border border-white/10"
                 >
                   <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center mr-3"><Activity size={14}/></div>
                   New Booking Request
                 </button>
                 <button 
                   onClick={() => navigate('/admin/timesheets')}
                   className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all text-left flex items-center backdrop-blur-md border border-white/10"
                 >
                   <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center mr-3"><FileText size={14}/></div>
                   Review Timesheets (3)
                 </button>
                 <button 
                   onClick={() => navigate('/admin/settings')}
                   className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all text-left flex items-center backdrop-blur-md border border-white/10"
                 >
                   <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center mr-3"><Settings size={14}/></div>
                   System Settings
                 </button>
              </div>
           </Card>

           <Card className="p-6">
              <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Onboarding Pipeline</h4>
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 cursor-pointer hover:border-blue-500 transition-colors" onClick={() => navigate('/admin/applications')}>
                 <div className="flex items-center">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mr-3"><UserPlus size={16}/></div>
                    <div>
                       <p className="text-xs font-bold text-slate-900 dark:text-white">Interpreters Awaiting</p>
                       <p className="text-[10px] text-slate-500">1 new application</p>
                    </div>
                 </div>
                 <ChevronRight size={14} className="text-slate-400"/>
              </div>
           </Card>
        </div>
      </div>
    </div>
  );

  const renderClientDashboard = () => (
    <div className="space-y-8">
      <div>
         <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Client Hub</h1>
         <p className="text-slate-500 dark:text-slate-400 font-medium italic">Welcome back, {user?.displayName}.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Upcoming Bookings" value="2" icon={CalendarDays} color="bg-blue-600" onClick={() => navigate('/client/bookings')} />
        <StatCard title="Invoices Due" value="£1,250" icon={PoundSterling} color="bg-orange-500" onClick={() => navigate('/client/invoices')} />
        <StatCard title="Completed Jobs" value="14" icon={Activity} color="bg-emerald-600" onClick={() => navigate('/client/bookings')} />
      </div>
    </div>
  );

  const renderInterpreterDashboard = () => (
    <div className="space-y-8">
       <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Interpreter Portal</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Hello, {user?.displayName?.split(' ')[0]}. Here is your agenda.</p>
       </div>
       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Job Offers" value="3" icon={Activity} color="bg-blue-600" onClick={() => navigate('/interpreter/jobs')} />
        <StatCard title="Upcoming" value="1" icon={CalendarDays} color="bg-indigo-600" onClick={() => navigate('/interpreter/jobs')} />
        <StatCard title="Earnings" value="£340.50" icon={PoundSterling} color="bg-emerald-600" onClick={() => navigate('/interpreter/billing')} />
      </div>
    </div>
  );

  switch (user?.role) {
    case UserRole.ADMIN: return renderAdminDashboard();
    case UserRole.CLIENT: return renderClientDashboard();
    case UserRole.INTERPRETER: return renderInterpreterDashboard();
    default: return <div className="p-20 text-center text-slate-400 uppercase font-black tracking-widest">Unauthorized Access</div>;
  }
};
