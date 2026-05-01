import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Clock, Building2, Globe2, MapPin, Video, Eye, Pencil, Trash2, CheckCircle2, UserPlus, UserCircle2, ChevronDown, List, Search, LayoutGrid } from 'lucide-react';
import { useBookings } from '../../../hooks/useBookings';
import { useAuth } from '../../../context/AuthContext';
import { useClients } from '../../../context/ClientContext';
import { useBookingViews } from '../../../hooks/useBookingViews';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge } from '../../../components/StatusBadge';
import { BulkActionBar } from '../../../components/ui/BulkActionBar';
import { Booking, BookingStatus } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { BookingService, BillingService } from '../../../services/api';
import { updateJobStatusAction, createDependencies } from '../../../ui/actions';
import { InterpreterAllocationDrawer } from '../../../components/operations/InterpreterAllocationDrawer';
import { InterpreterPreviewDrawer } from '../../../components/operations/InterpreterPreviewDrawer';
import { filterBookings, groupBookings } from '../../../utils/bookingFilters';
import { ViewManagerDrawer } from '../../../components/operations/ViewManagerDrawer';
import { Settings, Plus as PlusIcon } from 'lucide-react';
import { UserAvatar } from '../../../components/ui/UserAvatar';

export const JobsBoard = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { getClientCompany } = useClients();
    const { showToast } = useToast();
    const { bookings = [], loading, refresh } = useBookings();
    const { views, activeView, setActiveViewId } = useBookingViews(user?.id || '');
    const actionsDeps = createDependencies((user as any)?.organizationId || 'lingland-main');

    const [selectedJob, setSelectedJob] = useState<Booking | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isBulkLoading, setIsBulkLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Assignment States
    const [isAllocationOpen, setIsAllocationOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [targetInterpreterId, setTargetInterpreterId] = useState<string | null>(null);

    // View Manager States
    const [isViewManagerOpen, setIsViewManagerOpen] = useState(false);
    const [editingViewId, setEditingViewId] = useState<string | null>(null);
    const [isViewsMenuOpen, setIsViewsMenuOpen] = useState(false);
    const [viewSearchQuery, setViewSearchQuery] = useState('');
    const viewsMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (viewsMenuRef.current && !viewsMenuRef.current.contains(e.target as Node)) {
                setIsViewsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleRowClick = (job: Booking) => {
        setSelectedJob(job);
        setIsDrawerOpen(true);
    };

    const handleAssignClick = (e: React.MouseEvent, job: Booking) => {
        e.stopPropagation();
        setSelectedJob(job);
        setIsAllocationOpen(true);
    };

    const handleInterpreterPreview = (e: React.MouseEvent, job: Booking) => {
        e.stopPropagation();
        setSelectedJob(job);
        setTargetInterpreterId(job.interpreterId || null);
        setIsPreviewOpen(true);
    };

    const handleQuickStatusChange = async (job: Booking, status: BookingStatus) => {
        try {
            await updateJobStatusAction(job.id, status, actionsDeps);
            refresh();
            if (selectedJob?.id === job.id) setSelectedJob({ ...job, status });
        } catch {
            showToast('Failed to update job status', 'error');
        }
    };

    const handleVerifyTimesheet = async (job: Booking) => {
        try {
            await BillingService.approveTimesheetByBookingId(job.id);
            refresh();
            if (selectedJob?.id === job.id) setSelectedJob({ ...job, status: BookingStatus.READY_FOR_INVOICE });
            showToast('Timesheet verified and job moved to invoicing', 'success');
        } catch {
            showToast('Failed to verify timesheet', 'error');
        }
    };

    const handleBulkStatus = async (ids: string[], status: BookingStatus) => {
        setIsBulkLoading(true);
        let done = 0;
        await Promise.allSettled(ids.map(async id => {
            try { await updateJobStatusAction(id, status, actionsDeps); done++; } catch { /* silent */ }
        }));
        showToast(`${done} job${done !== 1 ? 's' : ''} updated to ${status}`, 'success');
        setSelectedIds([]);
        setIsBulkLoading(false);
        refresh();
    };

    const renderContextMenu = (job: Booking) => [
        { label: 'View Details', icon: Eye, onClick: () => navigate(`/admin/bookings/${job.id}`) },
        { label: 'Edit Job', icon: Pencil, onClick: () => navigate(`/admin/bookings/edit/${job.id}`) },
        { divider: true },
        { label: 'Mark as Verified', icon: CheckCircle2, onClick: () => handleQuickStatusChange(job, BookingStatus.READY_FOR_INVOICE) },
        { label: 'Cancel Job', icon: Trash2, variant: 'danger' as const, onClick: () => handleQuickStatusChange(job, BookingStatus.CANCELLED) },
    ];

    const columns = [
        {
            header: 'Date / Ref',
            accessor: (job: Booking) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const jobDate = new Date(job.date);
                jobDate.setHours(0, 0, 0, 0);
                
                const isOverdue = jobDate < today && !['PAID', 'CANCELLED', 'INVOICED', 'TIMESHEET_SUBMITTED', 'READY_FOR_INVOICE'].includes(job.status);
                const isToday = jobDate.getTime() === today.getTime();
                const isTomorrow = jobDate.getTime() === today.getTime() + 86400000;
                
                return (
                    <div className="flex items-center gap-3">
                        {(isOverdue || isToday || isTomorrow) && (
                            <div className={`w-1 h-8 rounded-full ${isOverdue ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : isToday ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-blue-500'}`} />
                        )}
                        <div className="flex flex-col">
                            <span className="font-bold text-slate-900 dark:text-white">
                                {new Date(job.date).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                            </span>
                            <span className="text-[10px] text-blue-600 font-bold">{job.startTime} {job.durationMinutes ? `(${job.durationMinutes}m)` : ''}</span>
                            <span className="text-[10px] text-slate-400 uppercase tracking-tighter">Ref: {job.bookingRef || 'TBD'}</span>
                        </div>
                    </div>
                );
            }
        },
        {
            header: 'Client',
            accessor: (job: Booking) => (
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-500 shrink-0">
                        <Building2 size={14} />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span 
                            className="font-bold text-slate-900 dark:text-white truncate max-w-[180px]"
                            title={getClientCompany(job.clientId, job.guestContact?.organisation || job.clientName)}
                        >
                            {getClientCompany(job.clientId, job.guestContact?.organisation || job.clientName)}
                        </span>
                        <span className="text-[10px] text-slate-500 uppercase truncate" title={job.guestContact?.name || 'Contact'}>
                            {job.guestContact?.name || 'Contact'}
                        </span>
                    </div>
                </div>
            )
        },
        {
            header: 'Service / Language',
            accessor: (job: Booking) => (
                <div className="flex flex-col">
                    <div className="flex items-center text-xs font-bold text-slate-800 dark:text-slate-200">
                        <Globe2 size={12} className="mr-1.5 text-blue-500 shrink-0" />
                        <span className="truncate max-w-[140px]">{job.languageFrom} → {job.languageTo}</span>
                    </div>
                    <div className="flex items-center text-[10px] text-slate-500 mt-1 uppercase font-medium">
                        {job.serviceType}
                    </div>
                </div>
            )
        },
        {
            header: 'Location / Area',
            accessor: (job: Booking) => (
                <div className="flex flex-col">
                    <div className="flex items-center text-xs font-bold text-slate-800 dark:text-slate-200">
                        {job.locationType === 'ONLINE' ? <Video size={12} className="mr-1.5 text-indigo-500 shrink-0" /> : <MapPin size={12} className="mr-1.5 text-red-500 shrink-0" />}
                        <span className="truncate max-w-[120px]">{job.locationType === 'ONLINE' ? 'Remote / Online' : (job.postcode || 'TBD')}</span>
                    </div>
                    <div className="flex items-center text-[10px] text-slate-500 mt-1 uppercase font-medium">
                        {job.locationType === 'ONLINE' ? 'Virtual' : 'On-Site'}
                    </div>
                </div>
            )
        },
        {
            header: 'Interpreter',
            accessor: (job: Booking) => (
                <div className="flex flex-col">
                    {job.interpreterId ? (
                        <button
                            onClick={(e) => handleInterpreterPreview(e, job)}
                            className="flex items-center gap-2 group hover:opacity-80 transition-opacity text-left"
                        >
                            <UserAvatar 
                                name={job.interpreterName || 'Professional'} 
                                src={job.interpreterPhotoUrl}
                                size="xs"
                                className="border border-blue-100 dark:border-blue-900/30"
                            />
                            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-tight truncate max-w-[120px]">
                                {job.interpreterName || 'Professional'}
                            </span>
                        </button>
                    ) : (
                        <button
                            onClick={(e) => handleAssignClick(e, job)}
                            className="flex items-center text-[10px] font-black text-amber-600 hover:text-amber-700 uppercase tracking-widest bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg border border-amber-100 dark:border-amber-900/30 transition-all hover:scale-105"
                        >
                            <UserPlus size={12} className="mr-1.5" />
                            Assign Now
                        </button>
                    )}
                </div>
            )
        },
        {
            header: 'Status',
            accessor: (job: Booking) => <StatusBadge status={job.status} />
        }
    ];

    const searchFilteredBookings = bookings.filter(b => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            b.bookingRef?.toLowerCase().includes(query) ||
            b.clientName?.toLowerCase().includes(query) ||
            b.guestContact?.organisation?.toLowerCase().includes(query) ||
            b.languageTo?.toLowerCase().includes(query) ||
            b.interpreterName?.toLowerCase().includes(query) ||
            b.postcode?.toLowerCase().includes(query)
        );
    });

    const filteredBookings = filterBookings(searchFilteredBookings, activeView);
    const groupedBookings = groupBookings(filteredBookings, activeView.groupBy);
    const groupKeys = Object.keys(groupedBookings);

    return (
        <div className="space-y-6">
            <PageHeader title="Jobs Board" subtitle="Operational request management">
                <div className="flex items-center gap-2 mr-4">
                    <div className="relative" ref={viewsMenuRef}>
                        <button 
                            onClick={() => setIsViewsMenuOpen(!isViewsMenuOpen)}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 border border-slate-900 dark:border-white rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors shadow-sm h-10"
                        >
                            <LayoutGrid size={16} className="opacity-70" />
                            <span className="text-[11px] font-black uppercase tracking-wider">{activeView?.name || 'All Bookings'}</span>
                            <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] bg-white/20 dark:bg-black/20 text-white dark:text-slate-900 font-bold`}>
                                {filterBookings(searchFilteredBookings, activeView).length}
                            </span>
                            <ChevronDown size={14} className={`opacity-70 transition-transform ${isViewsMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {isViewsMenuOpen && (
                            <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                                    <button 
                                        onClick={() => { setEditingViewId(null); setIsViewManagerOpen(true); setIsViewsMenuOpen(false); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
                                    >
                                        <Plus size={14} className="text-slate-400" /> Create new view...
                                    </button>
                                </div>
                                <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input 
                                            type="text" 
                                            placeholder="Find a view" 
                                            value={viewSearchQuery}
                                            onChange={(e) => setViewSearchQuery(e.target.value)}
                                            className="w-full pl-9 pr-8 py-2 text-xs border-none bg-slate-50 dark:bg-slate-800/50 rounded-lg focus:ring-0 outline-none text-slate-700 dark:text-slate-300 placeholder:text-slate-400"
                                            autoFocus
                                        />
                                        <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                            <Settings size={14} />
                                        </button>
                                    </div>
                                </div>
                                <div className="max-h-64 overflow-y-auto p-2 space-y-0.5 scrollbar-thin">
                                    {views.filter(v => v.name.toLowerCase().includes(viewSearchQuery.toLowerCase())).map(view => {
                                        const count = filterBookings(searchFilteredBookings, view).length;
                                        return (
                                            <div key={view.id} className="relative group flex items-center">
                                                <button
                                                    onClick={() => { setActiveViewId(view.id); setIsViewsMenuOpen(false); }}
                                                    className={`flex-1 flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${activeView.id === view.id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <LayoutGrid size={14} className={activeView.id === view.id ? "text-blue-500" : "text-slate-400"} />
                                                        <span className="text-xs font-bold">{view.name}</span>
                                                    </div>
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeView.id === view.id ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>{count}</span>
                                                </button>
                                                {activeView.id === view.id && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setEditingViewId(view.id); setIsViewManagerOpen(true); setIsViewsMenuOpen(false); }}
                                                        className={`absolute right-12 p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 opacity-0 group-hover:opacity-100 transition-all ${activeView.id === view.id ? 'opacity-100' : ''}`}
                                                    >
                                                        <Settings size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {views.filter(v => v.name.toLowerCase().includes(viewSearchQuery.toLowerCase())).length === 0 && (
                                        <div className="py-4 text-center text-xs text-slate-400">
                                            No views found.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="relative mr-4 shrink-0">
                    <input
                        type="text"
                        placeholder="Search bookings..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-48 lg:w-64 pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                <Button onClick={() => navigate('/admin/bookings/new')} icon={Plus} size="sm" className="shrink-0">Create Booking</Button>
            </PageHeader>

            {groupKeys.length > 1 || (groupKeys.length === 1 && groupKeys[0] !== 'All Jobs') ? (
                <Table
                    groups={groupKeys.map(key => ({
                        key,
                        items: groupedBookings[key]
                    }))}
                    columns={columns}
                    selectable
                    selectedIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                    onRowClick={handleRowClick}
                    renderContextMenu={renderContextMenu}
                    isLoading={loading}
                    defaultGroupsCollapsed={false}
                />
            ) : (
                <Table
                    data={filteredBookings}
                    columns={columns}
                    selectable
                    selectedIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                    onRowClick={handleRowClick}
                    renderContextMenu={renderContextMenu}
                    isLoading={loading}
                />
            )}

            {/* Phase 5: Floating Bulk Action Bar */}
            <BulkActionBar
                selectedCount={selectedIds.length}
                totalCount={filteredBookings.length}
                entityLabel="job"
                isLoading={isBulkLoading}
                onClearSelection={() => setSelectedIds([])}
                onSelectAll={() => setSelectedIds(filteredBookings.map(b => b.id))}
                actions={[
                    {
                        label: 'Confirm',
                        onClick: () => handleBulkStatus(selectedIds, BookingStatus.BOOKED),
                        variant: 'success',
                    },
                    {
                        label: 'Cancel',
                        onClick: () => handleBulkStatus(selectedIds, BookingStatus.CANCELLED),
                        variant: 'danger',
                    },
                ]}
            />

            <Modal
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                type="drawer"
                title={selectedJob ? `Job Record: ${selectedJob.bookingRef || 'TBD'}` : 'Job Record'}
                footer={
                    <div className="flex justify-between w-full">
                        <Button variant="outline" size="sm" onClick={() => setIsDrawerOpen(false)}>Close</Button>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => navigate(`/admin/bookings/edit/${selectedJob?.id}`)}>Edit Record</Button>
                            <Button size="sm" onClick={() => navigate(`/admin/bookings/${selectedJob?.id}`)}>Full Details</Button>
                        </div>
                    </div>
                }
            >
                {selectedJob && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                        {/* Quick Status Section */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Workflow Status Control</span>
                                <StatusBadge status={selectedJob.status} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {selectedJob.status === BookingStatus.INCOMING && (
                                    <Button size="sm" className="bg-blue-600 text-white !text-[10px] py-1" onClick={() => handleQuickStatusChange(selectedJob, BookingStatus.OPENED)}>Open for Assignments</Button>
                                )}
                                {selectedJob.status === BookingStatus.OPENED && (
                                    <Button size="sm" className="bg-amber-600 text-white !text-[10px] py-1" onClick={(e) => handleAssignClick(e, selectedJob)}>Assign Professional</Button>
                                )}
                                {selectedJob.status === BookingStatus.BOOKED && (
                                    <Button variant="outline" size="sm" className="bg-white dark:bg-slate-900 !text-[10px] py-1" onClick={() => handleQuickStatusChange(selectedJob, BookingStatus.READY_FOR_INVOICE)}>Manual Verification</Button>
                                )}
                                {(selectedJob.status === BookingStatus.TIMESHEET_SUBMITTED || (selectedJob.status as string) === 'TIMESHEET_SUBMITTED') && (
                                    <Button size="sm" className="bg-emerald-600 text-white !text-[10px] py-1 col-span-2" onClick={() => handleVerifyTimesheet(selectedJob)}>Verify Timesheet</Button>
                                )}
                                {selectedJob.status === BookingStatus.READY_FOR_INVOICE && (
                                    <Button size="sm" className="bg-indigo-600 text-white !text-[10px] py-1 col-span-2" onClick={() => navigate('/admin/operations/timesheets')}>Invoicing Review</Button>
                                )}
                                {selectedJob.status === BookingStatus.PAID && (
                                    <p className="text-[10px] text-green-600 font-bold uppercase col-span-2 bg-green-50 p-2 rounded-lg text-center">Process Completed & Paid</p>
                                )}
                            </div>
                        </div>

                        {/* Summary Info */}
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Schedule</h4>
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                                        {new Date(selectedJob.date).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'long' })}
                                    </p>
                                    <p className="text-sm text-blue-600 font-bold">{selectedJob.startTime} ({selectedJob.durationMinutes} min)</p>
                                </div>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Service</h4>
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedJob.languageFrom} → {selectedJob.languageTo}</p>
                                    <p className="text-sm text-slate-500">{selectedJob.serviceType}</p>
                                </div>
                            </div>
                        </div>

                        <div className="h-px bg-slate-100 dark:bg-slate-800" />

                        {/* Venue / Connection */}
                        <div>
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Venue / Connection</h4>
                            <div className="flex items-start space-x-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                                {selectedJob.locationType === 'ONLINE' ? (
                                    <>
                                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 rounded-lg">
                                            <Video size={18} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-slate-900 dark:text-white">Virtual Connection</p>
                                            <p className="text-xs text-slate-500 truncate mt-0.5">{selectedJob.onlineLink || 'No link provided'}</p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-lg">
                                            <MapPin size={18} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-slate-900 dark:text-white">Physical Location</p>
                                            <p className="text-xs text-slate-500 mt-0.5">{selectedJob.location || selectedJob.address || 'No address provided'}</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* People */}
                        <div className="grid grid-cols-1 gap-4">
                            {/* Interpreter Section */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Interpreter Assignment</h4>
                                {selectedJob.interpreterId ? (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-3">
                                            <UserAvatar 
                                                name={selectedJob.interpreterName || 'Professional'} 
                                                src={selectedJob.interpreterPhotoUrl}
                                                size="md"
                                                className="border-2 border-white dark:border-slate-800 shadow-sm"
                                            />
                                            <div>
                                                <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{selectedJob.interpreterName}</p>
                                                <button
                                                    onClick={(e) => handleInterpreterPreview(e, selectedJob)}
                                                    className="text-[11px] text-blue-600 font-bold uppercase hover:underline"
                                                >
                                                    View Intelligence
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-slate-500 italic">No professional assigned yet.</p>
                                        <Button size="sm" variant="outline" className="h-8 py-1 bg-white dark:bg-slate-900" onClick={(e) => handleAssignClick(e, selectedJob)}>
                                            <UserPlus size={14} className="mr-2" />
                                            Assign
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Client Information</h4>
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-600">
                                        <Building2 size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                                            {getClientCompany(selectedJob.clientId, selectedJob.clientName)}
                                        </p>
                                        <p className="text-[11px] text-slate-500 mt-0.5 uppercase tracking-tighter font-medium underline underline-offset-2">
                                            {selectedJob.guestContact?.name || 'Authorized Contact'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            <InterpreterAllocationDrawer
                isOpen={isAllocationOpen}
                onClose={() => setIsAllocationOpen(false)}
                job={selectedJob}
                onSuccess={refresh}
            />

            <InterpreterPreviewDrawer
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                interpreterId={targetInterpreterId}
                jobId={selectedJob?.id || null}
                onSuccess={refresh}
            />

            <ViewManagerDrawer
                isOpen={isViewManagerOpen}
                onClose={() => setIsViewManagerOpen(false)}
                viewId={editingViewId}
            />
        </div>
    );
};
