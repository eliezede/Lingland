import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import {
  LayoutDashboard, CalendarDays, Users, Briefcase,
  LogOut, Globe2, Menu, FileText, PoundSterling,
  CreditCard, UserCog, Settings, UserPlus, X, ChevronRight, MessageSquare, Mail,
  UserCheck, BarChart3, ClipboardList, PanelLeftOpen, PanelLeftClose, ChevronLeft, ChevronRight as ChevronRightIcon,
  Search, ShieldCheck, Database, History, HelpCircle, Bell, User as UserIcon, Clock, ChevronDown, Building2
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { NotificationCenter } from '../components/notifications/NotificationCenter';
import { ChatSystem } from '../components/chat/ChatSystem';
import { ChatService } from '../services/chatService';
import { StaffService } from '../services/staffService';
import { CommandPalette } from '../components/ui/CommandPalette';
import { UserAvatar } from '../components/ui/UserAvatar';
import { SystemModule } from '../types';

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
    {!isCollapsed && (
      <div className="flex items-center">
        {badge ? (
          <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
            {badge}
          </span>
        ) : null}
      </div>
    )}
  </Link>
);

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSecondarySlim, setIsSecondarySlim] = useState(false);
  const [isPrimaryExpanded, setIsPrimaryExpanded] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [onboardingBadge, setOnboardingBadge] = useState(0);
  const [allowedModules, setAllowedModules] = useState<SystemModule[] | null>(null);
  const [loadingPerms, setLoadingPerms] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('CORE');

  // Logic variables
  const isWorkstation = location.pathname === '/admin/dashboard' || location.pathname === '/admin/terminal-one';

  const categories = [
    { id: 'CORE', label: 'Home', icon: LayoutDashboard, rootPath: '/admin/dashboard', module: SystemModule.DASHBOARD },
    { id: 'OPS', label: 'Operations', icon: Briefcase, rootPath: '/admin/bookings', module: SystemModule.BOOKINGS },
    { id: 'NET', label: 'Network', icon: Users, rootPath: '/admin/interpreters', modules: [SystemModule.INTERPRETERS, SystemModule.CLIENTS, SystemModule.RECRUITMENT] },
    { id: 'FIN', label: 'Finance', icon: PoundSterling, rootPath: '/admin/billing', module: SystemModule.FINANCE },
    { id: 'COMMS', label: 'Comms', icon: MessageSquare, rootPath: '/admin/messages', modules: [SystemModule.MESSAGES] },
    { id: 'ADMIN', label: 'Administration', icon: Settings, rootPath: '/admin/users', modules: [SystemModule.STAFF_MGMT, SystemModule.SYSTEM_CONFIG, SystemModule.AUDIT_LOGS] },
  ];

  const getUKDate = () => {
    const now = new Date();
    const day = now.getDate();
    const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
    const month = now.toLocaleDateString('en-GB', { month: 'long' });
    
    const suffix = (d: number) => {
        if (d > 3 && d < 21) return 'th';
        switch (d % 10) {
            case 1: return 'st';
            case 2: return 'nd';
            case 3: return 'rd';
            default: return 'th';
        }
    };
    
    return `${weekday}, ${day}${suffix(day)} ${month}`;
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

  useEffect(() => {
    const pathMap: Record<string, string> = {
      '/admin/dashboard': 'CORE',
      '/admin/terminal-one': 'CORE',
      '/admin/bookings': 'OPS',
      '/admin/operations': 'OPS',
      '/admin/interpreters': 'NET',
      '/admin/clients': 'NET',
      '/admin/applications': 'NET',
      '/admin/billing': 'FIN',
      '/admin/finance': 'FIN',
      '/admin/messages': 'COMMS',
      '/admin/settings/email-templates': 'COMMS',
      '/admin/users': 'ADMIN',
      '/admin/settings': 'ADMIN',
      '/admin/system': 'ADMIN',
      '/admin/administration': 'ADMIN',
      '/admin/profile': 'ADMIN'
    };

    const currentPath = location.pathname;
    const cid = Object.entries(pathMap).find(([path]) => currentPath.startsWith(path))?.[1];
    if (cid) setActiveCategory(cid);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;

    // Force redirection for pending staff
    if (user.status === 'PENDING' && location.pathname !== '/admin/onboarding') {
      navigate('/admin/onboarding', { replace: true });
      return;
    }
    
    const unsubscribeChat = ChatService.subscribeToThreads(user.id, (threads) => {
      const count = threads.reduce((acc, t) => acc + (t.unreadCount[user.id] || 0), 0);
      setTotalUnread(count);
    });

    const refreshData = async () => {
      try {
        const stats = await import('../services/statsService').then(m => m.StatsService.getOnboardingStats());
        setOnboardingBadge(stats.pendingApplications + stats.pendingOnboardingDocs);
        
        if (user.role === UserRole.SUPER_ADMIN) {
            setAllowedModules(null);
        } else {
            const prof = await StaffService.getStaffProfileByUserId(user.id);
            if (prof) {
                const jobs = await StaffService.getJobTitles();
                const job = jobs.find(j => j.id === prof.jobTitleId);
                const perms = await StaffService.getLevelPermissions();
                const lp = perms.find(p => p.level === (job?.level || 1));
                setAllowedModules(lp?.modules || []);
            } else {
                setAllowedModules([]);
            }
        }
      } catch (e) {
        console.error("Dashboard data load error", e);
      } finally {
        setLoadingPerms(false);
      }
    };

    refreshData();
    const interval = setInterval(refreshData, 60000);
    return () => { clearInterval(interval); unsubscribeChat(); };
  }, [user, location.pathname]);

  const visibleCategories = categories.filter(cat => {
    if (!allowedModules) return true;
    if (cat.module) return allowedModules.includes(cat.module);
    if (cat.modules) return cat.modules.some(m => allowedModules.includes(m));
    return true;
  });

  const isActive = (path: string) => location.pathname === path || (path !== '/admin/dashboard' && location.pathname.startsWith(path + '/'));

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans text-slate-900 dark:text-slate-100">
      <ChatSystem />
      <CommandPalette />

      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 flex transform transition-all duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className={`${isPrimaryExpanded ? 'w-56' : 'w-16 lg:w-20'} bg-slate-900 flex flex-col items-center py-6 border-r border-slate-800 shrink-0 transition-all duration-300`}>
          <div className={`flex items-center ${isPrimaryExpanded ? 'px-4 space-x-3 justify-start' : 'justify-center'} w-full mb-8`}>
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0">
              <Globe2 size={24} />
            </div>
            {isPrimaryExpanded && <span className="text-white font-black tracking-tighter text-xl capitalize">Lingland</span>}
          </div>

          <div className="flex-1 w-full flex flex-col space-y-1.5 px-2 overflow-y-auto scrollbar-hide">
            {visibleCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  if (cat.rootPath) navigate(cat.rootPath);
                }}
                className={`w-full rounded-xl flex items-center transition-all duration-200 group relative ${isPrimaryExpanded ? 'px-4 py-2.5 space-x-3' : 'h-12 justify-center'} ${activeCategory === cat.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                <cat.icon size={22} />
                {isPrimaryExpanded && <span className="text-sm font-semibold truncate">{cat.label}</span>}
              </button>
            ))}
          </div>

          <button onClick={() => setIsPrimaryExpanded(!isPrimaryExpanded)} className="mt-auto w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 mb-4">
            {isPrimaryExpanded ? <ChevronLeft size={20} /> : <ChevronRightIcon size={20} />}
          </button>
        </div>

        {!isWorkstation && (
          <div className={`${isSecondarySlim ? 'w-16 lg:w-20' : 'w-64'} bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 overflow-hidden`}>
            <div className={`h-16 flex items-center ${isSecondarySlim ? 'justify-center' : 'justify-between px-6'} border-b border-slate-100 dark:border-slate-800 shrink-0`}>
              {!isSecondarySlim && <h2 className="text-xs font-black text-slate-500 dark:text-slate-400 tracking-widest uppercase truncate">{visibleCategories.find(c => c.id === activeCategory)?.label}</h2>}
              <button onClick={() => setIsSecondarySlim(!isSecondarySlim)} className="p-1 text-slate-400 hover:text-slate-600">
                {isSecondarySlim ? <PanelLeftOpen size={18} /> : <X size={18} className="lg:hidden" />}
                {!isSecondarySlim && <PanelLeftClose size={18} className="hidden lg:block" />}
              </button>
            </div>
            
            <nav className={`flex-1 overflow-y-auto ${isSecondarySlim ? 'p-2' : 'p-4'} space-y-6`}>
              {activeCategory === 'OPS' && (
                <div className="space-y-4">
                  {!isSecondarySlim && <div className="sidebar-group-label">Scheduling</div>}
                  <NavItem to="/admin/bookings" icon={CalendarDays} label="Jobs Board" active={isActive('/admin/bookings')} isCollapsed={isSecondarySlim} />
                  <NavItem to="/admin/operations/assignments" icon={UserCheck} label="Assignments" active={isActive('/admin/operations/assignments')} isCollapsed={isSecondarySlim} />
                  {!isSecondarySlim && <div className="sidebar-group-label">Review</div>}
                  <NavItem to="/admin/operations/timesheets" icon={ClipboardList} label="Timesheet Review" active={isActive('/admin/operations/timesheets')} isCollapsed={isSecondarySlim} />
                </div>
              )}

              {activeCategory === 'NET' && (
                <div className="space-y-4">
                  {!isSecondarySlim && <div className="sidebar-group-label">Resources</div>}
                  <NavItem to="/admin/interpreters" icon={Users} label="Interpreters" active={isActive('/admin/interpreters')} isCollapsed={isSecondarySlim} />
                  <NavItem to="/admin/clients" icon={Briefcase} label="Clients & Depts" active={isActive('/admin/clients')} isCollapsed={isSecondarySlim} />
                  {!isSecondarySlim && <div className="sidebar-group-label">Recruitment</div>}
                  <NavItem to="/admin/applications" icon={UserPlus} label="Applications" badge={onboardingBadge} active={isActive('/admin/applications')} isCollapsed={isSecondarySlim} />
                </div>
              )}

              {activeCategory === 'FIN' && (
                <div className="space-y-4">
                   {!isSecondarySlim && <div className="sidebar-group-label">Invoicing</div>}
                  <NavItem to="/admin/billing" icon={PoundSterling} label="Finance Hub" active={location.pathname === '/admin/billing'} isCollapsed={isSecondarySlim} />
                  <NavItem to="/admin/billing/client-invoices" icon={CreditCard} label="Client Invoices" active={isActive('/admin/billing/client-invoices')} isCollapsed={isSecondarySlim} />
                  {!isSecondarySlim && <div className="sidebar-group-label">Accounting</div>}
                  <NavItem to="/admin/finance/statements" icon={FileText} label="Statements" active={isActive('/admin/finance/statements')} isCollapsed={isSecondarySlim} />
                  <NavItem to="/admin/finance/payroll" icon={PoundSterling} label="Payroll" active={isActive('/admin/finance/payroll')} isCollapsed={isSecondarySlim} />
                </div>
              )}

              {activeCategory === 'COMMS' && (
                <div className="space-y-4">
                  {!isSecondarySlim && <div className="sidebar-group-label">Messaging</div>}
                  <NavItem to="/admin/messages" icon={MessageSquare} label="Messages" badge={totalUnread} active={isActive('/admin/messages')} isCollapsed={isSecondarySlim} />
                  {!isSecondarySlim && <div className="sidebar-group-label">Templates</div>}
                  <NavItem to="/admin/settings/email-templates" icon={Mail} label="Email Templates" active={isActive('/admin/settings/email-templates')} isCollapsed={isSecondarySlim} />
                </div>
              )}

              {activeCategory === 'ADMIN' && (
                <div className="space-y-4">
                  {!isSecondarySlim && <div className="sidebar-group-label">Directory</div>}
                  <NavItem to="/admin/administration/staff" icon={Users} label="Staff Directory" active={isActive('/admin/administration/staff')} isCollapsed={isSecondarySlim} />
                  <NavItem to="/admin/administration/org-chart" icon={Building2} label="Org Chart" active={isActive('/admin/administration/org-chart')} isCollapsed={isSecondarySlim} />
                  {!isSecondarySlim && <div className="sidebar-group-label">System</div>}
                  <NavItem to="/admin/users" icon={UserCog} label="Users & Roles" active={isActive('/admin/users')} isCollapsed={isSecondarySlim} />
                  <NavItem to="/admin/settings" icon={Settings} label="System Config" active={location.pathname === '/admin/settings'} isCollapsed={isSecondarySlim} />
                  <NavItem to="/admin/administration/migration" icon={Database} label="Airtable Migration" active={isActive('/admin/administration/migration')} isCollapsed={isSecondarySlim} />
                  <NavItem to="/admin/system/audit-log" icon={History} label="Audit Logs" active={isActive('/admin/system/audit-log')} isCollapsed={isSecondarySlim} />
                </div>
              )}
            </nav>
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 sticky top-0 z-30">
          <button className="lg:hidden p-2 text-slate-600 dark:text-slate-300" onClick={() => setIsSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          
          <div className="flex items-center space-x-6 ml-auto">
            <div className="hidden md:flex items-center space-x-3">
               <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">{today}</span>
               <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
            </div>

            <div className="flex items-center space-x-2 border-l border-slate-100 dark:border-slate-800 pl-6">
              <ThemeToggle className="!p-2" />
              <NotificationCenter />
            </div>
            
            <div className="relative" ref={userMenuRef}>
              <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center space-x-3 p-1 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                <UserAvatar 
                  name={user?.displayName || 'User'} 
                  src={user?.photoUrl} 
                  size="sm" 
                  className="rounded-lg shadow-sm"
                />
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold leading-none">{user?.displayName}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{user?.role}</p>
                </div>
                <ChevronDown size={14} className="text-slate-400" />
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 py-2 z-50">
                   <button onClick={() => { navigate('/admin/profile'); setIsUserMenuOpen(false); }} className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <UserIcon size={16} /> <span>View Profile</span>
                   </button>
                   <button onClick={() => { navigate('/admin/settings'); setIsUserMenuOpen(false); }} className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <Settings size={16} /> <span>Settings</span>
                   </button>
                   <div className="border-t border-slate-100 dark:border-slate-800 mt-2 pt-2">
                     <button onClick={handleLogout} className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <LogOut size={16} /> <span className="font-bold">Sign Out</span>
                     </button>
                   </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 p-6">
          <div className="max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};