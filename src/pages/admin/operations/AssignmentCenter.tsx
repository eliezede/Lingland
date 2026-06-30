import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Info,
  Trash2,
  UserPlus,
  XCircle,
  Zap,
} from 'lucide-react';
import { useBookings } from '../../../hooks/useBookings';
import { useAuth } from '../../../context/AuthContext';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { StatusBadge } from '../../../components/StatusBadge';
import { Booking, BookingStatus } from '../../../types';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { BookingService } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { createDependencies, updateJobStatusAction } from '../../../ui/actions';
import { BulkActionBar } from '../../../components/ui/BulkActionBar';
import { InterpreterAllocationDrawer } from '../../../components/operations/InterpreterAllocationDrawer';

const assignmentStatuses = [
  BookingStatus.INCOMING,
  BookingStatus.NEEDS_ASSIGNMENT,
  BookingStatus.OPENED,
  BookingStatus.ASSIGNMENT_PENDING,
];

const getJobRef = (job: Booking) => job.displayRef || job.jobNumber || job.bookingRef || job.legacyAirtableRef || job.id.slice(0, 8).toUpperCase();

const formatDate = (value?: string) => {
  if (!value) return 'No date';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

type AssignmentFilter = 'ALL' | 'NEEDS_ASSIGNMENT' | 'WAITING_RESPONSE';

export const AssignmentCenter = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { bookings = [], loading, refresh } = useBookings();
  const actionsDeps = createDependencies((user as any)?.organizationId || 'lingland-main');

  const assignmentJobs = bookings.filter(job => assignmentStatuses.includes(job.status));
  const needsAssignment = assignmentJobs.filter(job => !job.interpreterId);
  const waitingResponse = assignmentJobs.filter(job => Boolean(job.interpreterId));

  const [selectedJob, setSelectedJob] = useState<Booking | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('ALL');
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const assignmentReturnState = { returnTo: `${location.pathname}${location.search}`, returnLabel: 'Assignment Center' };

  const visibleJobs = assignmentFilter === 'NEEDS_ASSIGNMENT'
    ? needsAssignment
    : assignmentFilter === 'WAITING_RESPONSE'
      ? waitingResponse
      : assignmentJobs;

  const selectedNeedsAssignmentIds = selectedIds.filter(id => needsAssignment.some(job => job.id === id));

  const applyAssignmentFilter = (filter: AssignmentFilter) => {
    setAssignmentFilter(current => current === filter ? 'ALL' : filter);
    setSelectedIds([]);
  };

  const openAssignmentHub = (job: Booking) => {
    if (job.interpreterId) {
      navigate(`/admin/bookings/${job.id}`, {
        state: assignmentReturnState,
      });
      return;
    }
    setSelectedJob(job);
    setIsAssignModalOpen(true);
  };

  const handleRecordResponse = async (event: React.MouseEvent, job: Booking, accepted: boolean) => {
    event.stopPropagation();
    try {
      await BookingService.recordInterpreterResponseByStaff(job.id, accepted);
      showToast(accepted ? 'Interpreter acceptance recorded' : 'Interpreter decline recorded', 'success');
      refresh();
    } catch (error: any) {
      showToast(error?.message || 'Could not update assignment response', 'error');
    }
  };

  const handleBulkOpenForOffers = async (ids: string[]) => {
    const eligibleIds = ids.filter(id => needsAssignment.some(job => job.id === id));
    if (eligibleIds.length === 0) {
      showToast('Select unassigned jobs before opening them for offers', 'info');
      return;
    }
    let done = 0;
    await Promise.allSettled(eligibleIds.map(async id => {
      try {
        await updateJobStatusAction(id, BookingStatus.ASSIGNMENT_PENDING, actionsDeps);
        done++;
      } catch {
        // Continue processing the rest of the selected jobs.
      }
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
      variant: 'danger',
    });
    if (!ok) return;

    let done = 0;
    await Promise.allSettled(ids.map(async id => {
      try {
        await updateJobStatusAction(id, BookingStatus.CANCELLED, actionsDeps);
        done++;
      } catch {
        // Continue processing the rest of the selected jobs.
      }
    }));
    showToast(`${done} job${done !== 1 ? 's' : ''} cancelled`, 'success');
    setSelectedIds([]);
    refresh();
  };

  const columns = [
    {
      header: 'Target Job',
      accessor: (job: Booking) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-900 dark:text-white">{job.languageFrom} to {job.languageTo}</span>
          <span className="text-[10px] text-slate-400 uppercase">Ref: {getJobRef(job)}</span>
        </div>
      ),
    },
    {
      header: 'Schedule',
      accessor: (job: Booking) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDate(job.date)}</span>
          <span className="text-[10px] font-bold text-blue-600">{job.startTime || 'TBC'}</span>
        </div>
      ),
    },
    {
      header: 'Interpreter',
      accessor: (job: Booking) => (
        <div className="flex items-center space-x-2">
          {job.interpreterId ? (
            <>
              <UserAvatar name={job.interpreterName || 'Assigned'} src={job.interpreterPhotoUrl} size="xs" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{job.interpreterName || 'Assigned'}</span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-black uppercase text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <UserPlus size={13} /> Unassigned
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Location',
      accessor: (job: Booking) => (
        <div className="max-w-[220px] truncate text-xs text-slate-600 dark:text-slate-400">
          {job.locationType === 'ONLINE' ? 'Remote / online' : job.location || job.address || 'Onsite'}
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (job: Booking) => <StatusBadge status={job.status} />,
    },
    {
      header: 'Action',
      accessor: (job: Booking) => (
        <div className="flex items-center justify-end gap-2">
          {job.interpreterId ? (
            <>
              <Button size="sm" variant="secondary" icon={CheckCircle2} onClick={(event) => handleRecordResponse(event, job, true)}>
                Accept
              </Button>
              <Button size="sm" variant="outline" icon={XCircle} onClick={(event) => handleRecordResponse(event, job, false)}>
                Decline
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" icon={UserPlus} onClick={(event) => { event.stopPropagation(); openAssignmentHub(job); }}>
              Assign
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Assignment Center" subtitle="Operational queue for allocation and staff-recorded interpreter responses." />

      <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex min-w-max items-center justify-between gap-3 p-3">
              <div className="flex items-center gap-2">
                {[
                  ['ALL', 'All', assignmentJobs.length],
                  ['NEEDS_ASSIGNMENT', 'Needs assignment', needsAssignment.length],
                  ['WAITING_RESPONSE', 'Waiting response', waitingResponse.length],
                ].map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => applyAssignmentFilter(value as AssignmentFilter)}
                    className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-black uppercase tracking-wide ${assignmentFilter === value ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-300' : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'}`}
                  >
                    <span>{label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${assignmentFilter === value ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/admin/bookings?view=sys-unassigned', { state: assignmentReturnState })}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                  <ArrowUpRight size={15} className="text-blue-500" />
                  Allocation view
                </button>
                <button
                  type="button"
                  onClick={() => setIsInfoOpen(open => !open)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-expanded={isInfoOpen}
                >
                  <Info size={15} className="text-blue-500" />
                  {isInfoOpen ? 'Hide rules' : 'Rules'}
                </button>
              </div>
            </div>

            {isInfoOpen && (
              <div className="grid gap-3 border-t border-slate-100 p-3 dark:border-slate-800 md:grid-cols-3">
                <div className="flex items-start gap-3 rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <UserPlus size={16} className="mt-0.5 text-amber-500" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Use <span className="font-black">Assign</span> when no professional has been selected yet.</p>
                </div>
                <div className="flex items-start gap-3 rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <Clock size={16} className="mt-0.5 text-blue-500" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Use <span className="font-black">Accept</span> or <span className="font-black">Decline</span> when Airtable, phone or email confirms the response.</p>
                </div>
                <div className="flex items-start gap-3 rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <AlertCircle size={16} className="mt-0.5 text-rose-500" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Decline returns the job to the assignment queue without losing the audit trail.</p>
                </div>
              </div>
            )}
          </div>

          <Table
            data={visibleJobs}
            columns={columns}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onRowClick={openAssignmentHub}
            onRowDoubleClick={(job) => navigate(`/admin/bookings/${job.id}`, {
              state: assignmentReturnState,
            })}
            isLoading={loading}
            emptyMessage="No jobs require assignment action."
          />

          <BulkActionBar
            selectedIds={selectedIds}
            selectedCount={selectedIds.length}
            totalCount={visibleJobs.length}
            onClearSelection={() => setSelectedIds([])}
            entityLabel="job"
            actions={[
              {
                label: 'Open for Offers',
                icon: Zap,
                onClick: handleBulkOpenForOffers,
                variant: 'success',
                disabled: selectedNeedsAssignmentIds.length === 0,
              },
              {
                label: 'Cancel Jobs',
                icon: Trash2,
                onClick: handleBulkCancel,
                variant: 'danger',
              },
            ]}
          />
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
