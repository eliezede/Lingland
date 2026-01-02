
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Briefcase, Clock, PoundSterling, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const InterpreterLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { user } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { to: '/interpreter/dashboard', icon: Home, label: 'Home' },
    { to: '/interpreter/jobs', icon: Briefcase, label: 'Jobs' },
    { to: '/interpreter/timesheets', icon: Clock, label: 'Timesheets' },
    { to: '/interpreter/billing', icon: PoundSterling, label: 'Money' },
    { to: '/interpreter/profile', icon: User, label: 'Profile' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Bar (Mobile Header) */}
      <header className="bg-white shadow-sm px-4 py-3 sticky top-0 z-20 flex justify-between items-center">
        <h1 className="text-lg font-bold text-gray-900 tracking-tight">Lingland</h1>
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
          {user?.displayName?.charAt(0) || 'U'}
        </div>
      </header>

      {/* Main Content - scrollable, with padding at bottom for nav bar */}
      <main className="flex-1 p-4 pb-24 overflow-y-auto">
        {children}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-30 pb-safe">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link 
                key={item.to} 
                to={item.to} 
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                  active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
