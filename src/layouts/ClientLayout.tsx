
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, CalendarDays, PlusCircle, User, 
  LogOut, Globe2, Menu, CreditCard
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

export const ClientLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
        <div className="h-16 flex items-center px-6 border-b border-gray-100">
          <Globe2 className="text-blue-600 mr-2" size={24} />
          <span className="text-lg font-bold text-gray-900 tracking-tight">Lingland Portal</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-4">My Account</div>
          <NavItem to="/client/dashboard" icon={LayoutDashboard} label="Dashboard" active={location.pathname === '/client/dashboard'} />
          <NavItem to="/client/profile" icon={User} label="Company Profile" active={isActive('/client/profile')} />
          
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-6 px-4">Requests</div>
          <NavItem to="/client/new-booking" icon={PlusCircle} label="New Request" active={isActive('/client/new-booking')} />
          <NavItem to="/client/bookings" icon={CalendarDays} label="Bookings History" active={isActive('/client/bookings')} />

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-6 px-4">Finance</div>
          <NavItem to="/client/invoices" icon={CreditCard} label="Invoices" active={isActive('/client/invoices')} />
        </nav>

        <div className="p-4 border-t border-gray-100">
           <div className="flex items-center p-2 rounded-lg bg-gray-50 mb-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
              {user?.displayName?.charAt(0)}
            </div>
            <div className="ml-2 overflow-hidden">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.displayName}</p>
              <p className="text-xs text-gray-500 truncate">Client</p>
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:hidden">
          <button 
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>
          <span className="font-semibold text-gray-900">Client Portal</span>
          <div className="w-8" />
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};
