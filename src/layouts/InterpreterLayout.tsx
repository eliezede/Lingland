import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, MessageSquare, Bell, Briefcase, PoundSterling,
  LogOut, Menu, X, ChevronRight, PanelLeftOpen, PanelLeftClose, ChevronLeft, ChevronRight as ChevronRightIcon,
  HelpCircle, ClipboardList, Wallet, User as UserIcon, Settings, User, ChevronDown, Download
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { ChatService } from '../services/chatService';
import { ChatSystem } from '../components/chat/ChatSystem';
import { BrandLogo } from '../components/ui/BrandLogo';
import { NotificationCenter } from '../components/notifications/NotificationCenter';
import { UserAvatar } from '../components/ui/UserAvatar';
import { InterpreterService } from '../services/interpreterService';
import { requiresInterpreterOnboarding } from '../utils/interpreterFlow';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { formatLondonDate, getLondonDateKey } from '../utils/londonDateTime';

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

export const InterpreterLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSecondarySlim, setIsSecondarySlim] = useState(false);
  const [isPrimaryExpanded, setIsPrimaryExpanded] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const { canInstall, install } = usePwaInstall();

  const [activeCategory, setActiveCategory] = useState<string>('CORE');

  const categories = [
    { id: 'CORE', label: 'Home', icon: LayoutDashboard, rootPath: '/interpreter/dashboard' },
    { id: 'JOBS', label: 'Jobs', icon: Briefcase, rootPath: '/interpreter/jobs' },
    { id: 'TIMESHEETS', label: 'Timesheets', icon: ClipboardList, rootPath: '/interpreter/timesheets' },
    { id: 'FIN', label: 'Payments', icon: Wallet, rootPath: '/interpreter/billing' },
    { id: 'ACCOUNT', label: 'Account', icon: UserIcon, rootPath: '/interpreter/profile' },
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
    const dateKey = getLondonDateKey();
    const weekday = formatLondonDate(dateKey, { weekday: 'long' });
    const day = Number(dateKey.slice(8, 10));
    const month = formatLondonDate(dateKey, { month: 'long' });
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

  const showSecondaryNavigation = activeCategory === 'ACCOUNT';
  const mobileBottomNavPaths = new Set([
    '/interpreter/dashboard',
    '/interpreter/jobs',
    '/interpreter/timesheets',
    '/interpreter/billing',
    '/interpreter/profile',
  ]);
  const showMobileBottomNav = mobileBottomNavPaths.has(location.pathname);

  useEffect(() => {
    const pathMap: Record<string, string> = {
      '/interpreter/dashboard': 'CORE',
      '/interpreter/jobs': 'JOBS',
      '/interpreter/offers': 'JOBS',
      '/interpreter/timesheets': 'TIMESHEETS',
      '/interpreter/billing': 'FIN',
      '/interpreter/profile': 'ACCOUNT',
      '/interpreter/messages': 'ACCOUNT',
    };
    const currentPath = location.pathname;
    const categoryId = Object.entries(pathMap).find(([path]) => currentPath.startsWith(path))?.[1];
    if (categoryId) setActiveCategory(categoryId);
  }, [location.pathname]);

  useEffect(() => {
    if (!user || location.pathname.endsWith('/messages')) return;
    const unsubscribeChat = ChatService.subscribeToThreads(user.id, (threads) => {
      const count = threads.reduce((acc, t) => acc + (t.unreadCount[user.id] || 0), 0);
      setUnreadMessages(count);
    }, () => setUnreadMessages(0));
    return () => unsubscribeChat();
  }, [user, location.pathname]);

  useEffect(() => {
    if (!user?.profileId) return;
    let mounted = true;
    InterpreterService.getById(user.profileId).then((profile) => {
      if (!mounted) return;
      const status = profile?.status || null;
      const allowedDuringOnboarding = [
        '/interpreter/dashboard',
        '/interpreter/onboarding',
        '/interpreter/profile'
      ];
      if (requiresInterpreterOnboarding(status) && !allowedDuringOnboarding.some(path => location.pathname.startsWith(path))) {
        navigate('/interpreter/dashboard', { replace: true });
      }
    });
    return () => { mounted = false; };
  }, [user?.profileId, location.pathname, navigate]);

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

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
    <div className="interpreter-app flex h-dvh overflow-hidden bg-slate-100 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <ChatSystem />
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 flex transform transition-all duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className={`${isPrimaryExpanded ? 'w-56' : 'w-16 lg:w-20'} flex shrink-0 flex-col items-center border-r border-slate-800 bg-slate-950 py-5 transition-all duration-300`}>
          <div className={`flex w-full items-center ${isPrimaryExpanded ? 'justify-start px-4' : 'justify-center'} mb-8`}>
            <BrandLogo
              variant={isPrimaryExpanded ? 'wordmark' : 'mark'}
              tone="light"
              size={isPrimaryExpanded ? 'sm' : 'md'}
              className={isPrimaryExpanded ? 'max-w-[190px]' : ''}
            />
          </div>

          <div className="flex-1 w-full flex flex-col space-y-1.5 px-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                aria-label={cat.label}
                aria-current={activeCategory === cat.id ? 'page' : undefined}
                title={!isPrimaryExpanded ? cat.label : undefined}
                onClick={() => {
                  setActiveCategory(cat.id);
                  if (cat.rootPath) navigate(cat.rootPath);
                  setIsSidebarOpen(false);
                }}
                className={`group relative flex w-full items-center rounded-lg transition-colors duration-150 ${isPrimaryExpanded ? 'space-x-3 px-4 py-2.5' : 'h-11 justify-center'} ${activeCategory === cat.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <cat.icon size={22} className="shrink-0" />
                {isPrimaryExpanded && <span className="text-sm font-semibold truncate">{cat.label}</span>}
              </button>
            ))}
          </div>

          <button type="button" aria-label={isPrimaryExpanded ? 'Collapse primary navigation' : 'Expand primary navigation'} onClick={() => setIsPrimaryExpanded(!isPrimaryExpanded)} className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
            {isPrimaryExpanded ? <ChevronLeft size={20} /> : <ChevronRightIcon size={20} />}
          </button>
        </div>

        {showSecondaryNavigation && (
          <div className={`${isSecondarySlim ? 'w-16 lg:w-20' : 'w-64'} hidden flex-col border-r border-slate-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900 lg:flex`}>
            <div className={`h-16 flex items-center ${isSecondarySlim ? 'justify-center' : 'px-6 justify-between'} border-b border-slate-100 dark:border-slate-800`}>
              {!isSecondarySlim ? <h2 className="text-xs font-black text-slate-500 tracking-widest uppercase truncate">{categories.find(c => c.id === activeCategory)?.label}</h2> : <div className="w-8 h-1 bg-slate-200 dark:bg-slate-800 rounded-full" />}
            </div>
            <nav className={`flex-1 overflow-y-auto ${isSecondarySlim ? 'p-2' : 'p-4'} space-y-4`}>
              {activeCategory === 'ACCOUNT' && (
                <div className="space-y-1">
                  <NavItem to="/interpreter/messages" icon={MessageSquare} label="Messages" badge={unreadMessages} active={isActive('/interpreter/messages')} isCollapsed={isSecondarySlim} />
                  <NavItem to="/interpreter/profile" icon={User} label="Profile" active={isActive('/interpreter/profile')} isCollapsed={isSecondarySlim} />
                </div>
              )}
            </nav>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800">
              <button type="button" aria-label={isSecondarySlim ? 'Expand account navigation' : 'Collapse account navigation'} onClick={toggleSecondaryCollapse} className={`w-full flex items-center ${isSecondarySlim ? 'justify-center' : 'space-x-2'} text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors`}>
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
            <button
              type="button"
              aria-label="Open navigation"
              className="-ml-2 mr-3 rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
              onClick={() => {
                setIsPrimaryExpanded(true);
                setIsSidebarOpen(true);
              }}
            >
              <Menu size={24} />
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-6">
            <div className="hidden md:flex items-center space-x-3 text-slate-500">
               <span className="text-[10px] font-black tracking-widest text-slate-400 dark:text-slate-500">{today}</span>
               <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" title="Online" />
            </div>

            <div className="flex items-center space-x-2 border-l border-slate-100 pl-2 dark:border-slate-800 sm:pl-6">
              <ThemeToggle className="!p-2 text-slate-500" />
              <button
                type="button"
                onClick={() => navigate('/interpreter/messages')}
                className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="Open messages"
              >
                <MessageSquare size={20} />
                {unreadMessages > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[9px] font-bold leading-4 text-white">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </button>
              <NotificationCenter />
            </div>

            <div className="relative" ref={userMenuRef}>
              <button 
                type="button"
                aria-label="Open account menu"
                aria-expanded={isUserMenuOpen}
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
                  {canInstall && (
                    <button
                      type="button"
                      onClick={async () => {
                        await install();
                        setIsUserMenuOpen(false);
                      }}
                      className="flex w-full items-center space-x-3 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Download size={16} />
                      <span className="font-semibold">Install Lingland App</span>
                    </button>
                  )}
                  <button onClick={handleLogout} className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                    <LogOut size={16} />
                    <span className="font-semibold">Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={`flex-1 overflow-auto bg-slate-100 p-3 dark:bg-slate-950 sm:p-5 lg:p-6 ${showMobileBottomNav ? 'pb-24 sm:pb-5' : ''}`}>
          <div className="max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>

        {showMobileBottomNav && (
          <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden" aria-label="Interpreter navigation">
            {categories.map((category) => {
              const active = activeCategory === category.id;
              return (
                <button
                  type="button"
                  key={category.id}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => navigate(category.rootPath)}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-[10px] font-semibold ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  <category.icon size={20} strokeWidth={active ? 2.5 : 2} />
                  <span>{category.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
};
