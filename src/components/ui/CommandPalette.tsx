import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Search, Command, Zap, Users, Briefcase, FileText, Settings, ArrowRight,
    CalendarDays, UserCheck, Clock, UserPlus, PoundSterling, BarChart3, Shield, ShieldCheck, Globe, Database, BrainCircuit, Bot
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';

interface CommandItem {
    id: string;
    title: string;
    subtitle: string;
    icon: React.ElementType;
    shortcut?: string;
    category: 'Actions' | 'Navigation' | 'Finance' | 'Admin';
    keywords?: string[];
    onSelect: () => void;
}

export const CommandPalette = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const inputRef = useRef<HTMLInputElement>(null);
    const canUseAdminCommands = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;

    const close = useCallback(() => { setIsOpen(false); setQuery(''); setActiveIndex(0); }, []);
    const commandReturnState = { returnTo: `${location.pathname}${location.search}`, returnLabel: 'Previous workspace' };

    const commands: CommandItem[] = [
        // Actions (first — most frequently used)
        { id: 'new-booking', title: 'Create New Booking', subtitle: 'Launch booking wizard', icon: Zap, shortcut: 'N', category: 'Actions', keywords: ['new', 'create', 'request'], onSelect: () => navigate('/admin/bookings/new', { state: commandReturnState }) },
        // Navigation
        { id: 'jobs-board', title: 'Job Centre', subtitle: 'Work bookings, views and job status', icon: CalendarDays, category: 'Navigation', keywords: ['bookings', 'jobs', 'board', 'job centre'], onSelect: () => navigate('/admin/bookings') },
        { id: 'assignments', title: 'Assignment Center', subtitle: 'Allocate interpreters to jobs', icon: UserCheck, category: 'Navigation', keywords: ['assign', 'allocate', 'interpreters', 'operations'], onSelect: () => navigate('/admin/operations/assignments') },
        { id: 'timesheets', title: 'Timesheet Review', subtitle: 'Review and approve timesheets', icon: FileText, category: 'Navigation', keywords: ['timesheets', 'hours', 'review'], onSelect: () => navigate('/admin/operations/timesheets') },
        { id: 'interpreters', title: 'Interpreters', subtitle: 'Browse interpreter profiles', icon: Users, category: 'Navigation', keywords: ['interpreters', 'linguists', 'freelancers'], onSelect: () => navigate('/admin/interpreters') },
        { id: 'clients', title: 'Clients & Departments', subtitle: 'Manage client accounts', icon: Briefcase, category: 'Navigation', keywords: ['clients', 'departments', 'organisations'], onSelect: () => navigate('/admin/clients') },
        { id: 'applications', title: 'Onboarding Desk', subtitle: 'Review applications and compliance documents', icon: UserPlus, category: 'Navigation', keywords: ['applications', 'onboard', 'new interpreter', 'compliance'], onSelect: () => navigate('/admin/applications') },
        { id: 'messages', title: 'Direct Messages', subtitle: 'Team communications', icon: Globe, category: 'Navigation', keywords: ['messages', 'chat', 'communications'], onSelect: () => navigate('/admin/messages') },
        { id: 'ai-command', title: 'AI Command', subtitle: 'Live AI work, approvals, activity and insights', icon: Bot, category: 'Navigation', keywords: ['ai', 'deepseek', 'autopilot', 'approvals', 'activity', 'suggestions'], onSelect: () => navigate('/admin/ai-command') },
        // Finance
        { id: 'finance-board', title: 'Finance Board', subtitle: 'Open the accounts workspace', icon: PoundSterling, category: 'Finance', keywords: ['finance', 'accounts', 'billing'], onSelect: () => navigate('/admin/billing') },
        { id: 'billing-queue', title: 'Billing Queue', subtitle: 'Work delivered jobs through billing', icon: PoundSterling, category: 'Finance', keywords: ['invoices', 'billing', 'clients', 'queue'], onSelect: () => navigate('/admin/billing?view=fin-billing-queue&lane=clientBilling') },
        { id: 'ready-client-invoice', title: 'Ready to Invoice', subtitle: 'Client invoice preparation queue', icon: PoundSterling, category: 'Finance', keywords: ['invoice ready', 'client invoice', 'accounts receivable'], onSelect: () => navigate('/admin/billing?view=fin-ready-client-invoice&lane=clientBilling') },
        { id: 'interpreter-payables', title: 'Interpreter Payables', subtitle: 'Timesheets and interpreter payment queue', icon: PoundSterling, category: 'Finance', keywords: ['payments', 'remittance', 'payroll', 'interpreters', 'timesheets'], onSelect: () => navigate('/admin/billing?view=fin-interpreter-invoices&lane=interpreterPayables') },
        { id: 'awaiting-payment', title: 'Awaiting Payment', subtitle: 'Client invoices waiting for payment', icon: PoundSterling, category: 'Finance', keywords: ['paid', 'payment', 'outstanding', 'receivables'], onSelect: () => navigate('/admin/billing?view=fin-awaiting-payment&lane=clientBilling') },
        { id: 'finance-overview', title: 'Finance Overview', subtitle: 'Accounts control room', icon: BarChart3, category: 'Finance', keywords: ['reports', 'analytics', 'revenue', 'finance'], onSelect: () => navigate('/admin/billing/overview') },
        // Admin
        { id: 'settings', title: 'System Config', subtitle: 'Platform settings and configuration', icon: Settings, category: 'Admin', keywords: ['settings', 'config', 'system'], onSelect: () => navigate('/admin/settings') },
        { id: 'users', title: 'Users & Roles', subtitle: 'Manage user accounts and permissions', icon: Shield, category: 'Admin', keywords: ['users', 'roles', 'permissions', 'accounts'], onSelect: () => navigate('/admin/users') },
        { id: 'data-center', title: 'Data Center', subtitle: 'Sync readiness, exports and platform data guardrails', icon: Database, category: 'Admin', keywords: ['data', 'database', 'import', 'export', 'system', 'sync', 'readiness'], onSelect: () => navigate('/admin/administration/data') },
        { id: 'audit-log', title: 'Audit & Event Control', subtitle: 'Immutable operations, finance, sync and communication events', icon: FileText, category: 'Admin', keywords: ['audit', 'logs', 'history', 'trail', 'events'], onSelect: () => navigate('/admin/system/audit-log') },
        { id: 'go-live', title: 'Go-Live Control', subtitle: 'Final reconciliation, sign-off and rollback', icon: ShieldCheck, category: 'Admin', keywords: ['go live', 'readiness', 'rollback', 'transition'], onSelect: () => navigate('/admin/administration/go-live') },
        { id: 'ai-governance', title: 'AI Governance', subtitle: 'Provider, operating policy, safety boundaries and audit', icon: BrainCircuit, category: 'Admin', keywords: ['ai', 'deepseek', 'settings', 'autopilot', 'policy', 'audit'], onSelect: () => navigate('/admin/administration/ai') },
    ];

    const filtered = query.trim() === ''
        ? commands
        : commands.filter(cmd => {
            const q = query.toLowerCase();
            return (
                cmd.title.toLowerCase().includes(q) ||
                cmd.subtitle.toLowerCase().includes(q) ||
                (cmd.keywords || []).some(k => k.includes(q)) ||
                cmd.category.toLowerCase().includes(q)
            );
        });

    const categoryOrder = ['Actions', 'Navigation', 'Finance', 'Admin'] as const;
    const categorized = categoryOrder
        .map(cat => ({
            cat,
            items: filtered.filter(c => c.category === cat)
        }))
        .filter(g => g.items.length > 0);

    // Flattened for keyboard nav
    const flat = categorized.flatMap(g => g.items);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!canUseAdminCommands) return;
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            setIsOpen(prev => !prev);
        }
        if (e.key === 'Escape') close();
        if (e.key === '/' && !isOpen) {
            const active = document.activeElement;
            if (active?.tagName !== 'INPUT' && active?.tagName !== 'TEXTAREA') {
                e.preventDefault();
                setIsOpen(true);
            }
        }
    }, [canUseAdminCommands, isOpen, close]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
    }, [isOpen]);

    useEffect(() => { setActiveIndex(0); }, [query]);

    useEffect(() => {
        if (!canUseAdminCommands) close();
    }, [canUseAdminCommands, close]);

    const execute = (item: CommandItem) => {
        item.onSelect();
        close();
    };

    const handlePanelKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { close(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, flat.length - 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
        if (e.key === 'Enter') { e.preventDefault(); if (flat[activeIndex]) execute(flat[activeIndex]); }
    };

    if (!isOpen || !canUseAdminCommands) return null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] px-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={close}
        >
            <div
                className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl shadow-slate-950/40 border border-slate-200 dark:border-white/5 overflow-hidden animate-in zoom-in-95 duration-150"
                onClick={e => e.stopPropagation()}
                onKeyDown={handlePanelKeyDown}
            >
                {/* Input */}
                <div className="flex items-center px-6 py-5 border-b border-slate-100 dark:border-white/5 gap-4">
                    <Search className="text-slate-400 shrink-0" size={20} />
                    <input
                        ref={inputRef}
                        autoFocus
                        type="text"
                        placeholder="Search for pages, actions, or records..."
                        className="flex-1 bg-transparent border-none outline-none text-slate-900 dark:text-white text-base font-medium placeholder:text-slate-400"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    <div className="flex items-center space-x-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Esc</span>
                    </div>
                </div>

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto p-4 scrollbar-hide space-y-5">
                    {flat.length === 0 ? (
                        <div className="py-20 text-center">
                            <div className="w-12 h-12 bg-slate-50 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                <Search size={24} />
                            </div>
                            <p className="text-sm text-slate-400 font-medium italic">No results found for "{query}"</p>
                        </div>
                    ) : (
                        categorized.map(({ cat, items }) => (
                            <div key={cat} className="space-y-1">
                                <h3 className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{cat}</h3>
                                {items.map(item => {
                                    const globalIdx = flat.findIndex(c => c.id === item.id);
                                    const isActive = activeIndex === globalIdx;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => execute(item)}
                                            onMouseEnter={() => setActiveIndex(globalIdx)}
                                            className={`group w-full flex items-center justify-between p-4 rounded-2xl transition-all text-left ${isActive
                                                    ? 'bg-blue-50 dark:bg-blue-900/20'
                                                    : 'hover:bg-slate-50 dark:hover:bg-white/5'
                                                }`}
                                        >
                                            <div className="flex items-center space-x-4">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isActive
                                                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                                                        : 'bg-slate-100 dark:bg-white/5 text-slate-500 group-hover:text-blue-500'
                                                    }`}>
                                                    <item.icon size={18} />
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-bold leading-tight ${isActive ? 'text-blue-800 dark:text-blue-200' : 'text-slate-900 dark:text-white'}`}>
                                                        {item.title}
                                                    </p>
                                                    <p className="text-[11px] text-slate-500 mt-0.5">{item.subtitle}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {item.shortcut && (
                                                    <div className="flex items-center justify-center w-5 h-5 border border-slate-300 dark:border-white/10 rounded text-[10px] font-black text-slate-400 bg-white dark:bg-transparent opacity-40 group-hover:opacity-100 transition-opacity">
                                                        {item.shortcut}
                                                    </div>
                                                )}
                                                {isActive && <ArrowRight size={14} className="text-blue-500" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50/50 dark:bg-white/5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
                    <div className="flex items-center space-x-5 text-[10px] font-bold text-slate-500 uppercase">
                        <div className="flex items-center space-x-2">
                            <div className="flex items-center justify-center w-5 h-5 border border-slate-300 dark:border-white/10 rounded text-[10px] font-black text-slate-400 bg-white dark:bg-transparent">↵</div>
                            <span>Select</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <div className="flex items-center justify-center w-5 h-5 border border-slate-300 dark:border-white/10 rounded text-[10px] font-black text-slate-400 bg-white dark:bg-transparent">↑↓</div>
                            <span>Navigate</span>
                        </div>
                    </div>
                    <div className="flex items-center text-blue-600 space-x-1.5">
                        <Zap size={12} fill="currentColor" />
                        <span className="text-[10px] font-black uppercase tracking-wider">CMD+K · Lingland</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
