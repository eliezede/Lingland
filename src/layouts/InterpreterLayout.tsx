
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Briefcase, Clock, PoundSterling, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const InterpreterLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth(); // Assuming logout is exposed here now

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const navItems = [
    { to: '/interpreter/dashboard', icon: Home, label: 'Home' },
    { to: '/interpreter/jobs', icon: Briefcase, label: 'Jobs' },
    { to: '/interpreter/timesheets', icon: Clock, label: 'Times' },
    { to: '/interpreter/billing', icon: PoundSterling, label: 'Money' },
    { to: '/interpreter/profile', icon: User, label: 'Profile' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Top Bar (Mobile Header) */}
      <header className="bg-white shadow-sm px-4 py-3 sticky top-0 z-20 flex justify-between items-center border-b border-gray-100">
        <div className="flex items-center">
          <span className="text-lg font-bold text-blue-600 tracking-tight mr-1">Ling</span>
          <span className="text-lg font-bold text-gray-900 tracking-tight">land</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs font-medium text-gray-500 hidden md:block">{user?.email}</span>
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs border border-blue-200">
            {user?.displayName?.charAt(0) || 'U'}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 pb-24 md:pb-8 overflow-y-auto max-w-3xl mx-auto w-full">
        {children}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-30 md:sticky md:top-0">
        <div className="flex justify-around items-center h-16 max-w-3xl mx-auto px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link 
                key={item.to} 
                to={item.to} 
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
                  active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} className={active ? "transform scale-110 transition-transform" : ""} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
