
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { 
  LayoutDashboard, 
  CalendarDays, 
  Users, 
  Briefcase, 
  LogOut, 
  Menu, 
  Globe2,
  CheckCircle2,
  PlusCircle,
  FileText,
  PoundSterling
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const NavItem = ({ to, icon: Icon, label, active }: any) => (
  <Link 
    to={to} 
    className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
      active 
        ? 'bg-blue-600 text-white shadow-md' 
        : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'
    }`}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </Link>
);

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  const isActive = (path: string) => location.pathname === path;

  const renderNavItems = () => {
    switch (user?.role) {
      case UserRole.ADMIN:
        return (
          <>
            <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Management</div>
            <NavItem to="/admin/dashboard" icon={LayoutDashboard} label="Dashboard" active={isActive('/admin/dashboard')} />
            <NavItem to="/admin/bookings" icon={CalendarDays} label="All Bookings" active={isActive('/admin/bookings')} />
            <NavItem to="/admin/clients" icon={Briefcase} label="Clients" active={isActive('/admin/clients')} />
            <NavItem to="/admin/interpreters" icon={Users} label="Interpreters" active={isActive('/admin/interpreters')} />
            
            <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4">Finance</div>
            <NavItem to="/admin/timesheets" icon={FileText} label="Timesheets" active={isActive('/admin/timesheets')} />
            <NavItem to="/admin/invoices" icon={PoundSterling} label="Client Invoices" active={isActive('/admin/invoices')} />
          </>
        );
      case UserRole.CLIENT:
        return (
          <>
            <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">My Company</div>
            <NavItem to="/client/dashboard" icon={LayoutDashboard} label="Dashboard" active={isActive('/client/dashboard')} />
            <NavItem to="/client/new-booking" icon={PlusCircle} label="New Request" active={isActive('/client/new-booking')} />
            <NavItem to="/client/bookings" icon={CalendarDays} label="My Bookings" active={isActive('/client/bookings')} />
          </>
        );
      case UserRole.INTERPRETER:
        return (
          <>
            <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Work</div>
            <NavItem to="/interpreter/dashboard" icon={LayoutDashboard} label="Dashboard" active={isActive('/interpreter/dashboard')} />
            <NavItem to="/interpreter/offers" icon={Globe2} label="Job Offers" active={isActive('/interpreter/offers')} />
            <NavItem to="/interpreter/schedule" icon={CheckCircle2} label="My Jobs" active={isActive('/interpreter/schedule')} />
            
            <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4">Finance</div>
            <NavItem to="/interpreter/billing" icon={PoundSterling} label="My Invoices" active={isActive('/interpreter/billing')} />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="flex items-center h-16 px-6 border-b border-gray-200">
          <Globe2 className="text-blue-600 mr-2" size={28} />
          <span className="text-xl font-bold text-gray-800 tracking-tight">Lingland</span>
        </div>

        <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-8rem)]">
          {renderNavItems()}
        </nav>

        <div className="absolute bottom-0 w-full p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold mr-3">
              {user?.displayName.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.displayName}</p>
              <p className="text-xs text-gray-500 truncate capitalize">{user?.role.toLowerCase()}</p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="flex items-center w-full px-3 py-2 text-sm text-red-600 rounded hover:bg-red-50 transition-colors"
          >
            <LogOut size={16} className="mr-2" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-8">
          <button 
            className="p-2 rounded-md hover:bg-gray-100 md:hidden text-gray-600"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>
          <div className="ml-auto">
            {/* Placeholder for notifications */}
          </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};
