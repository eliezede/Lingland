import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Layers3,
  PoundSterling,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Booking, BookingStatus, UserRole } from '../types';
import { BookingService, InterpreterService, StatsService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/layout/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import { UserAvatar } from '../components/ui/UserAvatar';
import { InterpreterAllocationDrawer } from '../components/operations/InterpreterAllocationDrawer';
import { InterpreterPreviewDrawer } from '../components/operations/InterpreterPreviewDrawer';
import { Modal } from '../components/ui/Modal';
import { StatusBadge } from '../components/StatusBadge';

type DashboardJob = Booking & {
  interpreterPhotoUrl?: string;
};

const closedStatuses = new Set<string>([
  BookingStatus.CANCELLED,
  BookingStatus.INVOICED,
  BookingStatus.PAID,
]);

const formatDate = (value?: string) => {
  if (!value) return 'TBC';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const getJobStart = (job: Booking) => new Date(`${job.date}T${job.startTime || '00:00'}:00`);

const statusClasses = (status?: string) => {
  switch (status) {
    case BookingStatus.INCOMING:
      return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900/40';
    case BookingStatus.OPENED:
    case 'PENDING_ASSIGNMENT':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900/40';
    case BookingStatus.BOOKED:
      return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900/40';
    case BookingStatus.TIMESHEET_SUBMITTED:
    case BookingStatus.READY_FOR_INVOICE:
      return 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/20 dark:text-violet-300 dark:border-violet-900/40';
    case BookingStatus.INVOICED:
    case BookingStatus.PAID:
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/40';
    case BookingStatus.CANCELLED:
      return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  }
};

const StatusPill = ({ status }: { status?: string }) => (
  <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${statusClasses(status)}`}>
    {(status || 'UNKNOWN').replace(/_/g, ' ')}
  </span>
);

const Metric = ({
  label,
  value,
  detail,
  tone = 'slate',
  loading,
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  tone?: 'slate' | 'red' | 'blue' | 'green' | 'amber' | 'violet';
  loading?: boolean;
}) => {
  const tones = {
    slate: 'border-slate-300 dark:border-slate-700',
    red: 'border-rose-500',
    blue: 'border-blue-500',
    green: 'border-emerald-500',
    amber: 'border-amber-500',
    violet: 'border-violet-500',
  };

  return (
    <div className={`border-l-2 px-3 py-2 ${tones[tone]}`}>
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</div>
      {loading ? <Skeleton className="mt-3 h-7 w-20" /> : <div className="mt-2 text-2xl font-black leading-none text-slate-950 dark:text-white">{value}</div>}
      <div className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">{detail}</div>
    </div>
  );
};

const QueueButton = ({
  icon: Icon,
  label,
  count,
  helper,
  tone,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  helper: string;
  tone: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="group flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800 dark:hover:bg-blue-950/20"
  >
    <div className="flex min-w-0 items-center gap-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-slate-900 dark:text-white">{label}</div>
        <div className="truncate text-xs text-slate-500 dark:text-slate-400">{helper}</div>
      </div>
    </div>
    <div className="flex items-center gap-3">
      <span className="text-xl font-black text-slate-950 dark:text-white">{count}</span>
      <ArrowUpRight size={16} className="text-slate-300 transition group-hover:text-blue-600" />
    </div>
  </button>
);

export const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Booking | null>(null);
  const [selectedInterpreterId, setSelectedInterpreterId] = useState<string | null>(null);
  const [isJobPreviewOpen, setIsJobPreviewOpen] = useState(false);
  const [isAllocationOpen, setIsAllocationOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;

  const loadData = async () => {
    setLoading(true);
    try {
      const roleStats = isAdmin
        ? await StatsService.getAdminStats()
        : user?.role === UserRole.CLIENT
          ? await StatsService.getClientStats(user.profileId || user.id)
          : user?.role === UserRole.INTERPRETER
            ? await StatsService.getInterpreterStats(user.profileId || user.id)
            : null;

      const [allBookings, photoMap] = await Promise.all([
        isAdmin ? BookingService.getAll() : BookingService.getRecentBookings(12),
        InterpreterService.getPhotoMap(),
      ]);

      setStats(roleStats);
      setJobs(allBookings.map(job => ({
        ...job,
        interpreterPhotoUrl: job.interpreterPhotoUrl || (job.interpreterId ? photoMap[job.interpreterId] : undefined),
      })));
    } catch (error) {
      console.error('Dashboard load failed', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const model = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const active = jobs.filter(job => !closedStatuses.has(String(job.status)));
    const incoming = jobs.filter(job => job.status === BookingStatus.INCOMING);
    const opened = jobs.filter(job => job.status === BookingStatus.OPENED || String(job.status) === 'PENDING_ASSIGNMENT');
    const booked = jobs.filter(job => job.status === BookingStatus.BOOKED);
    const submitted = jobs.filter(job => job.status === BookingStatus.TIMESHEET_SUBMITTED);
    const readyInvoice = jobs.filter(job => job.status === BookingStatus.READY_FOR_INVOICE);
    const dueToday = active.filter(job => {
      const start = getJobStart(job);
      return start >= today && start < tomorrow;
    });
    const overdue = active.filter(job => getJobStart(job) < today && ![
      BookingStatus.TIMESHEET_SUBMITTED,
      BookingStatus.READY_FOR_INVOICE,
      BookingStatus.INVOICED,
      BookingStatus.PAID,
    ].includes(job.status));

    const recent = [...jobs]
      .sort((a, b) => getJobStart(b).getTime() - getJobStart(a).getTime())
      .slice(0, 12);

    return {
      active,
      incoming,
      opened,
      booked,
      submitted,
      readyInvoice,
      dueToday,
      overdue,
      recent,
      riskCount: incoming.length + overdue.length + submitted.length,
    };
  }, [jobs]);

  const openAllocation = (job: Booking) => {
    setSelectedJob(job);
    setIsJobPreviewOpen(false);
    setIsAllocationOpen(true);
  };

  const openInterpreter = (job: Booking) => {
    if (!job.interpreterId) return;
    setSelectedJob(job);
    setIsJobPreviewOpen(false);
    setSelectedInterpreterId(job.interpreterId);
    setIsPreviewOpen(true);
  };

  const openJobPreview = (job: Booking) => {
    setSelectedJob(job);
    setIsJobPreviewOpen(true);
  };

  const openJobDetails = (job: Booking) => {
    navigate(`/admin/bookings/${job.id}`, {
      state: { returnTo: '/admin/dashboard', returnLabel: 'Operations Command' },
    });
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle={`Welcome back, ${user?.displayName || 'User'}`} />
        <div className="grid gap-4 md:grid-cols-3">
          <Metric label="Total jobs" value={stats?.totalBookings || 0} detail="Across your account" loading={loading} />
          <Metric label="Upcoming" value={stats?.upcomingBookings || 0} detail="Confirmed schedule" tone="blue" loading={loading} />
          <Metric label="Completed" value={stats?.completedBookings || 0} detail="Ready or invoiced" tone="green" loading={loading} />
        </div>
      </div>
    );
  }

  const healthTone = model.riskCount > 0 ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-600 dark:text-emerald-300';
  const healthLabel = model.riskCount > 0 ? `${model.riskCount} items need attention` : 'Operationally clear';

  return (
    <div className="space-y-5">
      <PageHeader title="Operations Command" subtitle="Live control surface for requests, assignments, delivery and billing.">
        <Button onClick={() => navigate('/admin/bookings/new')} icon={UserPlus} size="sm">New request</Button>
        <Button onClick={() => navigate('/admin/operations/assignments')} icon={UserCheck} variant="secondary" size="sm">Assignments</Button>
        <Button onClick={() => navigate('/admin/operations/timesheets')} icon={FileText} variant="secondary" size="sm">Timesheets</Button>
      </PageHeader>

      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-0 divide-y divide-slate-200 dark:divide-slate-800 lg:grid-cols-[1.2fr_0.8fr] lg:divide-x lg:divide-y-0">
          <div className="p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className={healthTone} />
                  <h2 className="text-lg font-black text-slate-950 dark:text-white">Today at a glance</h2>
                </div>
                <p className={`mt-1 text-sm font-bold ${healthTone}`}>{healthLabel}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Today" value={model.dueToday.length} detail="Scheduled" tone="blue" loading={loading} />
                <Metric label="Unassigned" value={model.incoming.length} detail="Need action" tone={model.incoming.length ? 'red' : 'slate'} loading={loading} />
                <Metric label="Overdue" value={model.overdue.length} detail="Past date" tone={model.overdue.length ? 'red' : 'slate'} loading={loading} />
                <Metric label="Billing" value={model.readyInvoice.length + model.submitted.length} detail="Claims queue" tone="violet" loading={loading} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-0 divide-x divide-slate-200 dark:divide-slate-800">
            <div className="p-5">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <PoundSterling size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest">Revenue MTD</span>
              </div>
              <div className="mt-3 text-3xl font-black text-slate-950 dark:text-white">
                GBP {(stats?.revenueMonth || 0).toLocaleString()}
              </div>
              <button onClick={() => navigate('/admin/billing/client-invoices')} className="mt-3 text-xs font-black uppercase tracking-wider text-blue-600 hover:text-blue-700">
                Open finance
              </button>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <Users size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest">Active pool</span>
              </div>
              <div className="mt-3 text-3xl font-black text-slate-950 dark:text-white">{stats?.activeInterpreters || 0}</div>
              <button onClick={() => navigate('/admin/interpreters')} className="mt-3 text-xs font-black uppercase tracking-wider text-blue-600 hover:text-blue-700">
                View network
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Priority queues</h2>
            <span className="text-xs font-bold text-slate-400">{model.active.length} active jobs</span>
          </div>
          <QueueButton
            icon={AlertCircle}
            label="Unassigned requests"
            count={model.incoming.length}
            helper="Requests waiting for an interpreter"
            tone="bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
            onClick={() => navigate('/admin/operations/assignments')}
          />
          <QueueButton
            icon={Clock}
            label="Overdue operations"
            count={model.overdue.length}
            helper="Past-date jobs not closed or submitted"
            tone="bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
            onClick={() => navigate('/admin/bookings')}
          />
          <QueueButton
            icon={FileText}
            label="Timesheet review"
            count={model.submitted.length}
            helper="Claims awaiting verification"
            tone="bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
            onClick={() => navigate('/admin/operations/timesheets')}
          />
          <QueueButton
            icon={PoundSterling}
            label="Ready to invoice"
            count={model.readyInvoice.length}
            helper="Verified claims ready for billing"
            tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
            onClick={() => navigate('/admin/billing/client-invoices')}
          />

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Layers3 size={16} className="text-blue-600" />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">Pipeline shape</h3>
            </div>
            <div className="mt-4 space-y-3">
              {[
                ['Incoming', model.incoming.length, 'bg-rose-500'],
                ['Opened', model.opened.length, 'bg-amber-500'],
                ['Booked', model.booked.length, 'bg-blue-500'],
                ['Submitted', model.submitted.length, 'bg-violet-500'],
                ['Ready invoice', model.readyInvoice.length, 'bg-emerald-500'],
              ].map(([label, count, color]) => {
                const width = model.active.length ? Math.max(8, (Number(count) / model.active.length) * 100) : 0;
                return (
                  <div key={String(label)}>
                    <div className="mb-1 flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
                      <span>{label}</span>
                      <span>{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-950 dark:text-white">Operational worklist</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Sorted by latest scheduled activity.</p>
            </div>
            <Button onClick={() => navigate('/admin/bookings')} variant="secondary" icon={Briefcase} size="sm">Open jobs board</Button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-left dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-950/40">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Job</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Assignment</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Schedule</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
                  <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  Array.from({ length: 7 }).map((_, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-4"><Skeleton className="h-10 w-56" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-8 w-40" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-8 w-28" /></td>
                      <td className="px-4 py-4"><Skeleton className="h-7 w-24" /></td>
                      <td className="px-4 py-4"><Skeleton className="ml-auto h-8 w-20" /></td>
                    </tr>
                  ))
                ) : model.recent.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-14 text-center text-sm font-bold text-slate-400">No jobs in the system.</td>
                  </tr>
                ) : model.recent.map(job => (
                  <tr
                    key={job.id}
                    className="group cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-950/40"
                    onClick={() => openJobPreview(job)}
                  >
                    <td className="px-4 py-4">
                      <div className="min-w-[220px]">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black text-blue-700 dark:text-blue-300">{job.bookingRef || job.id.slice(0, 8).toUpperCase()}</span>
                          {getJobStart(job) < new Date() && !closedStatuses.has(String(job.status)) && (
                            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">late</span>
                          )}
                        </div>
                        <div className="mt-1 truncate text-sm font-bold text-slate-950 dark:text-white">{job.clientName || job.guestContact?.organisation || 'Guest client'}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{job.languageFrom || 'English'} to {job.languageTo || 'TBC'} · {job.serviceType}</div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {job.interpreterId ? (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            openInterpreter(job);
                          }}
                          className="flex items-center gap-2 rounded-lg px-1 py-1 transition hover:bg-blue-50 dark:hover:bg-blue-950/20"
                        >
                          <UserAvatar name={job.interpreterName || 'Interpreter'} src={job.interpreterPhotoUrl} size="xs" />
                          <span className="max-w-[150px] truncate text-xs font-bold text-blue-700 dark:text-blue-300">{job.interpreterName || 'Assigned'}</span>
                        </button>
                      ) : (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            openAllocation(job);
                          }}
                          className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-amber-700 transition hover:border-amber-300 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
                        >
                          Assign now
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                        <CalendarDays size={14} className="text-slate-400" />
                        {formatDate(job.date)}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <Clock size={12} />
                        {job.startTime || 'TBC'} {job.durationMinutes ? `· ${job.durationMinutes}m` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-4"><StatusPill status={job.status} /></td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          openJobPreview(job);
                        }}
                        className="text-xs font-black uppercase tracking-wider text-blue-600 opacity-0 transition hover:text-blue-700 group-hover:opacity-100"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedJob && (
        <>
          <Modal
            isOpen={isJobPreviewOpen}
            onClose={() => setIsJobPreviewOpen(false)}
            title={`Job ${selectedJob.bookingRef || selectedJob.id.slice(0, 8)}`}
            maxWidth="2xl"
            footer={
              <div className="flex w-full gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setIsJobPreviewOpen(false)} icon={X}>Close</Button>
                <Button className="flex-1" onClick={() => openJobDetails(selectedJob)} icon={ArrowUpRight}>Full details</Button>
              </div>
            }
          >
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Current stage</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{selectedJob.clientName || selectedJob.guestContact?.organisation || 'Guest client'}</h3>
                    <p className="mt-1 text-sm text-slate-500">{selectedJob.languageFrom || 'English'} to {selectedJob.languageTo || 'TBC'} · {selectedJob.serviceType || selectedJob.serviceCategory}</p>
                  </div>
                  <StatusBadge status={selectedJob.status} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Schedule</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{formatDate(selectedJob.date)}</p>
                  <p className="text-sm text-blue-600">{selectedJob.startTime || 'TBC'} {selectedJob.durationMinutes ? `(${selectedJob.durationMinutes}m)` : ''}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Assignment</p>
                  {selectedJob.interpreterId ? (
                    <button
                      onClick={() => openInterpreter(selectedJob)}
                      className="mt-1 flex items-center gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-blue-50 dark:hover:bg-blue-950/20"
                    >
                      <UserAvatar name={selectedJob.interpreterName || 'Interpreter'} src={selectedJob.interpreterPhotoUrl} size="xs" />
                      <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">{selectedJob.interpreterName || 'Assigned'}</span>
                    </button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => openAllocation(selectedJob)} icon={UserPlus}>Assign interpreter</Button>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Location</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{selectedJob.locationType === 'ONLINE' ? 'Remote / online' : selectedJob.postcode || 'On-site'}</p>
                  <p className="text-sm text-slate-500">{selectedJob.locationType === 'ONLINE' ? selectedJob.onlineLink || 'No link' : selectedJob.address || selectedJob.location || 'No address'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Contact</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{selectedJob.guestContact?.name || 'No contact'}</p>
                  <p className="text-sm text-slate-500">{selectedJob.guestContact?.email || selectedJob.guestContact?.phone || 'No contact details'}</p>
                </div>
              </div>

              {(selectedJob.notes || selectedJob.adminNotes) && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100">
                  {selectedJob.adminNotes || selectedJob.notes}
                </div>
              )}
            </div>
          </Modal>
          <InterpreterAllocationDrawer
            isOpen={isAllocationOpen}
            onClose={() => setIsAllocationOpen(false)}
            job={selectedJob}
            onSuccess={loadData}
          />
          <InterpreterPreviewDrawer
            isOpen={isPreviewOpen}
            onClose={() => setIsPreviewOpen(false)}
            interpreterId={selectedInterpreterId}
            jobId={selectedJob.id}
            onSuccess={loadData}
          />
        </>
      )}
    </div>
  );
};
