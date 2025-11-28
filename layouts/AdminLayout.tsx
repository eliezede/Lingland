import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, CalendarDays, Users, Briefcase, 
  LogOut, Menu, Globe2, FileText, PoundSterling, 
  CreditCard, UserCog
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, label, active }) => (
  <Link 
    to={to} 
    className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors mb-1 ${
      active 
        ? 'bg-blue-50 text-blue-700 font-medium' 
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    }`}
  >
    <Icon size={20} className={active ? 'text-blue-600' : 'text-gray-400'} />
    <span>{label}</span>
  </Link>
);

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Helper for active state matching
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out flex flex-col
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-100">
          <Globe2 className="text-blue-600 mr-2" size={24} />
          <span className="text-lg font-bold text-gray-900 tracking-tight">Lingland Admin</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-4">Overview</div>
          <NavItem to="/admin/dashboard" icon={LayoutDashboard} label="Dashboard" active={location.pathname === '/admin/dashboard'} />

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-6 px-4">Management</div>
          <NavItem to="/admin/bookings" icon={CalendarDays} label="Bookings" active={isActive('/admin/bookings')} />
          <NavItem to="/admin/clients" icon={Briefcase} label="Clients" active={isActive('/admin/clients')} />
          <NavItem to="/admin/interpreters" icon={Users} label="Interpreters" active={isActive('/admin/interpreters')} />
          
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-6 px-4">System</div>
          <NavItem to="/admin/users" icon={UserCog} label="Users" active={isActive('/admin/users')} />

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-6 px-4">Finance</div>
          <NavItem to="/admin/billing" icon={LayoutDashboard} label="Overview" active={location.pathname === '/admin/billing'} />
          <NavItem to="/admin/timesheets" icon={FileText} label="Timesheets" active={isActive('/admin/timesheets')} />
          <NavItem to="/admin/billing/client-invoices" icon={CreditCard} label="Invoices" active={isActive('/admin/billing/client-invoices')} />
          <NavItem to="/admin/billing/interpreter-invoices" icon={PoundSterling} label="Claims" active={isActive('/admin/billing/interpreter-invoices')} />
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 mb-2">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                {user?.displayName?.charAt(0)}
              </div>
              <div className="ml-2 overflow-hidden">
                <p className="text-sm font-medium text-gray-900 truncate w-32">{user?.displayName}</p>
                <p className="text-xs text-gray-500 truncate">Administrator</p>
              </div>
            </div>
          </div>
          <button 
            onClick={logout}
            className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={16} className="mr-2" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header (Mobile Only basically) */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:hidden">
          <button 
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>
          <span className="font-semibold text-gray-900">Admin Portal</span>
          <div className="w-8" /> {/* Spacer */}
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};