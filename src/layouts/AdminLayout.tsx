import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { 
  LayoutDashboard, CalendarDays, Users, Briefcase, 
  LogOut, Menu, Globe2, FileText, PoundSterling, 
  CreditCard, UserCog, Settings, UserPlus, X, ChevronRight
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ui/ThemeToggle';

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, label, active, onClick }) => (
  <Link 
    to={to} 
    onClick={onClick}
    className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 mb-1 group ${
      active 
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
    }`}
  >
    <div className="flex items-center space-x-3">
      <Icon size={20} className={active ? 'text-white' : 'text-slate-400 group-hover:text-blue-500'} />
      <span className="font-medium">{label}</span>
    </div>
    {active && <ChevronRight size={14} className="text-blue-200" />}
  </Link>
);

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans">
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 lg:hidden transition-opacity" 
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 
        transform transition-transform duration-300 ease-in-out flex flex-col
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white mr-3 shadow-lg shadow-blue-500/20">
              <Globe2 size={22} />
            </div>
            <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Lingland</span>
          </div>
          <button onClick={closeSidebar} className="lg:hidden p-2 text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 scrollbar-hide">
          <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 px-4 mt-2">Core</div>
          <NavItem to="/admin/dashboard" icon={LayoutDashboard} label="Dashboard" active={location.pathname === '/admin/dashboard'} onClick={closeSidebar} />
          
          <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 px-4 mt-8">Operations</div>
          <NavItem to="/admin/bookings" icon={CalendarDays} label="Bookings" active={isActive('/admin/bookings')} onClick={closeSidebar} />
          <NavItem to="/admin/clients" icon={Briefcase} label="Clients" active={isActive('/admin/clients')} onClick={closeSidebar} />
          <NavItem to="/admin/interpreters" icon={Users} label="Interpreters" active={isActive('/admin/interpreters')} onClick={closeSidebar} />
          <NavItem to="/admin/applications" icon={UserPlus} label="Applications" active={isActive('/admin/applications')} onClick={closeSidebar} />
          
          <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 px-4 mt-8">Finance</div>
          <NavItem to="/admin/billing" icon={LayoutDashboard} label="Overview" active={location.pathname === '/admin/billing'} onClick={closeSidebar} />
          <NavItem to="/admin/timesheets" icon={FileText} label="Timesheets" active={isActive('/admin/timesheets')} onClick={closeSidebar} />
          <NavItem to="/admin/billing/client-invoices" icon={CreditCard} label="Client Invoices" active={isActive('/admin/billing/client-invoices')} onClick={closeSidebar} />
          <NavItem to="/admin/billing/interpreter-invoices" icon={PoundSterling} label="Payable Claims" active={isActive('/admin/billing/interpreter-invoices')} onClick={closeSidebar} />

          <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 px-4 mt-8">System</div>
          <NavItem to="/admin/users" icon={UserCog} label="User Roles" active={isActive('/admin/users')} onClick={closeSidebar} />
          {user?.role === UserRole.ADMIN && (
            <NavItem to="/admin/settings" icon={Settings} label="Global Settings" active={isActive('/admin/settings')} onClick={closeSidebar} />
          )}
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
          <div className="flex items-center space-x-3 mb-4 px-2">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-md">
                {user?.displayName?.charAt(0)}
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white dark:border-slate-900 rounded-full"></div>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{user?.displayName}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-black">Admin Portal</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ThemeToggle className="w-full justify-center" />
            <button 
              onClick={handleLogout}
              className="flex items-center justify-center px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors uppercase tracking-widest border border-red-100 dark:border-red-900/30"
            >
              <LogOut size={14} className="mr-2" /> Out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 lg:px-10 sticky top-0 z-30">
          <div className="flex items-center">
            <button className="lg:hidden p-2 -ml-2 mr-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white hidden sm:block">Control Center</h2>
          </div>
          <div className="flex items-center space-x-4">
             <div className="hidden sm:flex flex-col items-end mr-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short'})}</span>
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-tighter">System Live</span>
             </div>
             <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 mx-2 hidden sm:block"></div>
             <ThemeToggle className="sm:flex" />
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8 lg:p-10 scrollbar-hide">
          <div className="max-w-7xl mx-auto animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};