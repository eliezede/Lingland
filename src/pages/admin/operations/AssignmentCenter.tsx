import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Star, MapPin, CheckCircle2, AlertCircle, Info, Search, Filter, Zap, Trash2, X } from 'lucide-react';
import { useBookings } from '../../../hooks/useBookings';
import { useAuth } from '../../../context/AuthContext';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge } from '../../../components/StatusBadge';
import { Booking, BookingStatus } from '../../../types';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { BookingService } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { createDependencies, updateJobStatusAction } from '../../../ui/actions';
import { BulkActionBar } from '../../../components/ui/BulkActionBar';
import { InterpreterAllocationDrawer } from '../../../components/operations/InterpreterAllocationDrawer';

export const AssignmentCenter = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const { bookings = [], loading, refresh } = useBookings();
    const actionsDeps = createDependencies((user as any)?.organizationId || 'lingland-main');

    // Filter only unassigned jobs that are in actionable states
    const unassignedJobs = bookings.filter(b => !b.interpreterId && [BookingStatus.INCOMING, BookingStatus.NEEDS_ASSIGNMENT, BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING].includes(b.status));

    const [selectedJob, setSelectedJob] = useState<Booking | null>(null);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const openAssignmentHub = (job: Booking) => {
        setSelectedJob(job);
        setIsAssignModalOpen(true);
    };


    const handleBulkOpenForOffers = async (ids: string[]) => {
        if (ids.length === 0) return;
        let done = 0;
        await Promise.allSettled(ids.map(async id => {
            try {
                await updateJobStatusAction(id, BookingStatus.ASSIGNMENT_PENDING, actionsDeps);
                done++;
            } catch { /* silent */ }
        }));
        showToast(`${done} job${done !== 1 ? 's' : ''} opened for interpreter offers`, 'success');
        setSelectedIds([]);
        refresh();
    };

    const handleBulkCancel = async (ids: string[]) => {
        const ok = await confirm({
            title: 'Cancel Jobs',
            message: `Are you sure you want to cancel ${ids.length} selected jobs? This action cannot be undone.`,
            confirmLabel: 'Cancel Jobs',
            variant: 'danger'
        });
        if (ok) {
            let done = 0;
            await Promise.allSettled(ids.map(async id => {
                try {
                    await updateJobStatusAction(id, BookingStatus.CANCELLED, actionsDeps);
                    done++;
                } catch { /* silent */ }
            }));
            showToast(`${done} job${done !== 1 ? 's' : ''} cancelled`, 'success');
            setSelectedIds([]);
            refresh();
        }
    };

    const columns = [
        {
            header: 'Target Job',
            accessor: (job: Booking) => (
                <div className="flex flex-col">
                    <span className="font-bold text-slate-900 dark:text-white">{job.languageFrom} → {job.languageTo}</span>
                    <span className="text-[10px] text-slate-400 uppercase">Ref: {job.bookingRef || 'TBD'}</span>
                </div>
            )
        },
        {
            header: 'Schedule',
            accessor: (job: Booking) => (
                <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {new Date(job.date).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                    </span>
                    <span className="text-[10px] text-blue-600 font-bold">{job.startTime}</span>
                </div>
            )
        },
        {
            header: 'Interpreter',
            accessor: (job: Booking) => (
                <div className="flex items-center space-x-2">
                    <UserAvatar 
                        name={job.interpreterName || 'Unknown'} 
                        src={job.interpreterPhotoUrl} 
                        size="xs"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{job.interpreterName || 'Unassigned'}</span>
                </div>
            )
        },
        {
            header: 'Location',
            accessor: (job: Booking) => (
                <div className="text-xs text-slate-600 dark:text-slate-400">
                    {job.locationType === 'ONLINE' ? 'Remote / Video' : job.location || 'Physical'}
                </div>
            )
        },
        {
            header: 'Status',
            accessor: (job: Booking) => <StatusBadge status={job.status} />
        }
    ];

    return (
        <div className="space-y-6">
            <PageHeader title="Assignment Center" subtitle="Ranked interpreter allocation hub" />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 p-4 rounded-2xl flex items-start space-x-3">
                        <Info className="text-blue-600 shrink-0 mt-0.5" size={18} />
                        <div>
                            <p className="text-sm font-bold text-blue-900 dark:text-blue-200">Pending Allocation</p>
                            <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">There are {unassignedJobs.length} jobs waiting for an interpreter. Use the allocation hub to match the best-ranked professionals.</p>
                        </div>
                    </div>

                    <Table
                        data={unassignedJobs}
                        columns={columns}
                        selectable
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                        onRowClick={openAssignmentHub}
                        onRowDoubleClick={(job) => navigate(`/admin/bookings/${job.id}`)}
                        isLoading={loading}
                        emptyMessage="All jobs are currently assigned. Great work!"
                    />

                    <BulkActionBar
                        selectedIds={selectedIds}
                        selectedCount={selectedIds.length}
                        totalCount={unassignedJobs.length}
                        onClearSelection={() => setSelectedIds([])}
                        entityLabel="job"
                        actions={[
                            {
                                label: 'Open for Offers',
                                icon: Zap,
                                onClick: handleBulkOpenForOffers,
                                variant: 'success'
                            },
                            {
                                label: 'Cancel Jobs',
                                icon: Trash2,
                                onClick: handleBulkCancel,
                                variant: 'danger'
                            }
                        ]}
                    />
                </div>

                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Network Health</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-slate-600 dark:text-slate-400">Active Professionals</span>
                                <span className="text-sm font-bold text-slate-900 dark:text-white">124</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-slate-600 dark:text-slate-400">Avg. Matching Time</span>
                                <span className="text-sm font-bold text-green-600">14m</span>
                            </div>
                            <div className="h-px bg-slate-100 dark:bg-slate-800" />
                            <div className="flex items-center space-x-2 text-amber-600">
                                <AlertCircle size={14} />
                                <span className="text-[10px] font-bold uppercase">3 DBS expiries this week</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <InterpreterAllocationDrawer
                isOpen={isAssignModalOpen}
                onClose={() => setIsAssignModalOpen(false)}
                job={selectedJob}
                onSuccess={refresh}
            />
        </div>
    );
};
