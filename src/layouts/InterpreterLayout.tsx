import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Briefcase, Clock, PoundSterling, User, Globe2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../components/ui/ThemeToggle';

export const InterpreterLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { user } = useAuth();

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const navItems = [
    { to: '/interpreter/dashboard', icon: Home, label: 'Home' },
    { to: '/interpreter/jobs', icon: Briefcase, label: 'Jobs' },
    { to: '/interpreter/timesheets', icon: Clock, label: 'Times' },
    { to: '/interpreter/billing', icon: PoundSterling, label: 'Money' },
    { to: '/interpreter/profile', icon: User, label: 'Profile' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row font-sans transition-colors duration-300">
      
      {/* Desktop Sidebar (visible on large screens) */}
      <aside className="hidden lg:flex w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-col sticky top-0 h-screen">
        <div className="h-20 flex items-center px-6 border-b border-slate-100 dark:border-slate-800">
           <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white mr-2">
             <Globe2 size={18} />
           </div>
           <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white">Lingland</span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
           {navItems.map(item => {
             const active = isActive(item.to);
             return (
               <Link 
                 key={item.to} 
                 to={item.to} 
                 className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
                   active ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                 }`}
               >
                 <item.icon size={20} />
                 <span className="font-bold">{item.label}</span>
               </Link>
             );
           })}
        </nav>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
           <ThemeToggle />
           <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              {user?.displayName?.charAt(0)}
           </div>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="lg:hidden bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm px-5 py-4 sticky top-0 z-40 flex justify-between items-center border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center">
          <span className="text-xl font-black text-blue-600 tracking-tighter">L</span>
          <span className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">L</span>
        </div>
        <div className="flex items-center space-x-3">
          <ThemeToggle className="scale-90" />
          <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-slate-800 flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold text-xs border border-blue-200 dark:border-blue-900/50">
            {user?.displayName?.charAt(0) || 'U'}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        <div className="flex-1 p-4 pb-28 lg:pb-8 lg:p-10 max-w-4xl mx-auto w-full animate-fade-in">
           {children}
        </div>
      </main>

      {/* Bottom Navigation (Mobile Only) */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 z-50 pb-safe">
        <div className="flex justify-around items-center h-16 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link 
                key={item.to} 
                to={item.to} 
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-all ${
                  active ? 'text-blue-600 dark:text-blue-400 scale-110' : 'text-slate-400 dark:text-slate-600'
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-black uppercase tracking-tighter">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};