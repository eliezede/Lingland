import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, CalendarDays, PlusCircle, User,
  LogOut, Globe2, Menu, CreditCard, X, ChevronRight, PanelLeftOpen, PanelLeftClose, ChevronLeft, ChevronRight as ChevronRightIcon,
  MessageSquare,
  HelpCircle, Bell, User as UserIcon, Settings, ChevronDown
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { NotificationCenter } from '../components/notifications/NotificationCenter';
import { UserAvatar } from '../components/ui/UserAvatar';
import { ChatService } from '../services/chatService';
import { ChatSystem } from '../components/chat/ChatSystem';
import { ClientPortalProvider, useClientPortal } from '../context/ClientPortalContext';

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  badge?: number;
  onClick?: () => void;
  isCollapsed?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, label, active, badge, onClick, isCollapsed }) => (
  <Link
    to={to}
    onClick={onClick}
    title={isCollapsed ? label : undefined}
    className={`flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} rounded-lg transition-all duration-200 mb-0.5 group ${active
      ? 'sidebar-active shadow-sm'
      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100'
      }`}
  >
    <div className="flex items-center space-x-3">
      <Icon size={isCollapsed ? 20 : 18} className={active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'} />
      {!isCollapsed && <span className={`text-sm ${active ? 'font-semibold' : 'font-medium'} whitespace-nowrap`}>{label}</span>}
    </div>
    {!isCollapsed && badge && (
      <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
        {badge}
      </span>
    )}
  </Link>
);

const ClientLayoutShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const { access, loading: accessLoading, error: accessError, refresh: refreshAccess } = useClientPortal();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSecondarySlim, setIsSecondarySlim] = useState(false);
  const [isPrimaryExpanded, setIsPrimaryExpanded] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const [activeCategory, setActiveCategory] = useState<string>('CORE');

  const categories = [
    { id: 'CORE', label: 'Dashboard', icon: LayoutDashboard, rootPath: '/client/dashboard' },
    ...(access?.canViewBookings
      ? [{ id: 'REQUESTS', label: 'Bookings', icon: CalendarDays, rootPath: '/client/bookings' }]
      : []),
    ...(access?.canReadFinance
      ? [{ id: 'FIN', label: 'Billing', icon: CreditCard, rootPath: '/client/invoices' }]
      : []),
    { id: 'COMMS', label: 'Messages', icon: MessageSquare, rootPath: '/client/messages' },
    { id: 'ACCOUNT', label: 'Account', icon: Settings, rootPath: '/client/profile' },
  ];

  const getOrdinalSuffix = (day: number) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  const getUKDate = () => {
    const now = new Date();
    const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
    const day = now.getDate();
    const month = now.toLocaleDateString('en-GB', { month: 'long' });
    return `${weekday}, ${day}${getOrdinalSuffix(day)} ${month}`;
  };

  const today = getUKDate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isWorkstation = location.pathname === '/client/dashboard';

  useEffect(() => {
    const pathMap: Record<string, string> = {
      '/client/dashboard': 'CORE',
      '/client/bookings': 'REQUESTS',
      '/client/new-booking': 'REQUESTS',
      '/client/invoices': 'FIN',
      '/client/messages': 'COMMS',
      '/client/profile': 'ACCOUNT'
    };
    const currentPath = location.pathname;
    const categoryId = Object.entries(pathMap).find(([path]) => currentPath.startsWith(path))?.[1];
    if (categoryId) setActiveCategory(categoryId);
  }, [location.pathname]);

  useEffect(() => {
    if (accessLoading || accessError || !access) return;
    const path = location.pathname;
    if (path.startsWith('/client/invoices') && !access.canReadFinance) {
      navigate('/client/dashboard', { replace: true });
      return;
    }
    if (path === '/client/new-booking' && !access.canRequest) {
      navigate(access.canViewBookings ? '/client/bookings' : '/client/dashboard', { replace: true });
      return;
    }
    if (path.startsWith('/client/bookings') && !access.canViewBookings) {
      navigate('/client/dashboard', { replace: true });
    }
  }, [access, accessError, accessLoading, location.pathname, navigate]);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  useEffect(() => {
    if (!user) return;
    const unsubscribeChat = ChatService.subscribeToThreads(user.id, (threads) => {
      const count = threads.reduce((acc, thread) => acc + (thread.unreadCount[user.id] || 0), 0);
      setUnreadMessages(count);
    });
    return () => unsubscribeChat();
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const toggleSecondaryCollapse = () => {
    const nextState = !isSecondarySlim;
    setIsSecondarySlim(nextState);
    if (nextState) setIsPrimaryExpanded(false);
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-100 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <ChatSystem />
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 flex transform transition-all duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className={`${isPrimaryExpanded ? 'w-56' : 'w-16 lg:w-20'} flex shrink-0 flex-col items-center border-r border-slate-800 bg-slate-950 py-5 transition-all duration-300`}>
          <div className={`flex items-center ${isPrimaryExpanded ? 'px-4 space-x-3 justify-start' : 'justify-center'} w-full mb-8`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <Globe2 size={24} />
            </div>
            {isPrimaryExpanded && <span className="text-white font-black tracking-tighter text-xl capitalize">Lingland</span>}
          </div>

          <div className="flex-1 w-full flex flex-col space-y-1.5 px-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  if (cat.rootPath) navigate(cat.rootPath);
                }}
                className={`group relative flex w-full items-center rounded-lg transition-colors duration-150 ${isPrimaryExpanded ? 'space-x-3 px-4 py-2.5' : 'h-11 justify-center'} ${activeCategory === cat.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <cat.icon size={22} className="shrink-0" />
                {isPrimaryExpanded && <span className="text-sm font-semibold truncate">{cat.label}</span>}
              </button>
            ))}
          </div>

          <button onClick={() => setIsPrimaryExpanded(!isPrimaryExpanded)} className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
            {isPrimaryExpanded ? <ChevronLeft size={20} /> : <ChevronRightIcon size={20} />}
          </button>
        </div>

        {!isWorkstation && (
          <div className={`${isSecondarySlim ? 'w-16 lg:w-20' : 'w-64'} flex flex-col border-r border-slate-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900`}>
            <div className={`h-16 flex items-center ${isSecondarySlim ? 'justify-center' : 'px-6 justify-between'} border-b border-slate-100 dark:border-slate-800`}>
              {!isSecondarySlim ? <h2 className="text-xs font-black text-slate-500 tracking-widest uppercase truncate">{categories.find(c => c.id === activeCategory)?.label}</h2> : <div className="w-8 h-1 bg-slate-200 dark:bg-slate-800 rounded-full" />}
            </div>
            <nav className={`flex-1 overflow-y-auto ${isSecondarySlim ? 'p-2' : 'p-4'} space-y-4`}>
              {activeCategory === 'REQUESTS' && (
                <div className="space-y-1">
                  <NavItem to="/client/bookings" icon={CalendarDays} label="My Bookings" active={isActive('/client/bookings')} isCollapsed={isSecondarySlim} />
                  {access?.canRequest && (
                    <NavItem to="/client/new-booking" icon={PlusCircle} label="New Request" active={isActive('/client/new-booking')} isCollapsed={isSecondarySlim} />
                  )}
                </div>
              )}
              {activeCategory === 'FIN' && (
                <div className="space-y-1">
                  <NavItem to="/client/invoices" icon={CreditCard} label="Invoices" active={isActive('/client/invoices')} isCollapsed={isSecondarySlim} />
                </div>
              )}
              {activeCategory === 'COMMS' && (
                <div className="space-y-1">
                  <NavItem to="/client/messages" icon={MessageSquare} label="Messages" badge={unreadMessages} active={isActive('/client/messages')} isCollapsed={isSecondarySlim} />
                </div>
              )}
              {activeCategory === 'ACCOUNT' && (
                <div className="space-y-1">
                  <NavItem to="/client/profile" icon={User} label="My Profile" active={isActive('/client/profile')} isCollapsed={isSecondarySlim} />
                </div>
              )}
            </nav>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800">
              <button onClick={toggleSecondaryCollapse} className={`w-full flex items-center ${isSecondarySlim ? 'justify-center' : 'space-x-2'} text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors`}>
                {isSecondarySlim ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                {!isSecondarySlim && <span>Collapse Sidebar</span>}
              </button>
            </div>
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:h-16 sm:px-6">
          <div className="flex items-center">
            <button className="-ml-2 mr-3 rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden" onClick={() => setIsSidebarOpen(true)}><Menu size={24} /></button>
          </div>

          <div className="flex items-center gap-2 sm:gap-6">
            <div className="hidden md:flex items-center space-x-3 text-slate-500">
               <span className="text-[10px] font-black tracking-widest text-slate-400 dark:text-slate-500">{today}</span>
               <div className="group relative">
                  <div className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse cursor-help" />
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    <p className="text-[10px] font-bold text-slate-900 dark:text-white uppercase mb-1 tracking-wider">System Engine Status</p>
                    <p className="text-[9px] text-slate-500 leading-tight">Operational. Latency: 12ms.</p>
                  </div>
               </div>
            </div>

            <div className="flex items-center space-x-2 border-l border-slate-100 pl-2 dark:border-slate-800 sm:pl-6">
              <ThemeToggle className="!p-2 text-slate-500" />
              <NotificationCenter />
            </div>

            <div className="relative" ref={userMenuRef}>
              <button 
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center space-x-3 rounded-lg border border-transparent p-1.5 pr-2 transition-colors hover:border-slate-200 hover:bg-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-800 sm:pr-3"
              >
                <UserAvatar 
                  name={user?.displayName || 'User'} 
                  src={user?.photoUrl} 
                  size="sm" 
                  className="rounded-lg shadow-sm"
                />
                <div className="hidden sm:flex flex-col items-start transition-opacity duration-200">
                  <span className="text-xs font-bold text-slate-900 dark:text-white leading-none mb-0.5">{user?.displayName}</span>
                  <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{user?.role}</span>
                </div>
                <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-lg border border-slate-200 bg-white py-2 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center space-x-3 mb-1">
                    <UserAvatar 
                      name={user?.displayName || 'User'} 
                      src={user?.photoUrl} 
                      size="md" 
                      className="rounded-xl shadow-sm"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold truncate">{user?.displayName}</span>
                      <span className="text-[10px] text-slate-400 truncate">{user?.email}</span>
                    </div>
                  </div>
                  <button onClick={handleLogout} className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                    <LogOut size={16} />
                    <span className="font-semibold">Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-100 p-3 dark:bg-slate-950 sm:p-5 lg:p-6">
          <div className="max-w-[1600px] mx-auto">
            {accessError && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                <span>{accessError}</span>
                <button type="button" onClick={() => void refreshAccess()} className="font-semibold underline underline-offset-4">
                  Try again
                </button>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export const ClientLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ClientPortalProvider>
    <ClientLayoutShell>{children}</ClientLayoutShell>
  </ClientPortalProvider>
);
