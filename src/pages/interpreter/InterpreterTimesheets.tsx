import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Clock, ChevronRight, CheckCircle2, AlertCircle, FileText, CalendarDays } from 'lucide-react';
import { useInterpreterTimesheets } from '../../hooks/useInterpreterTimesheets';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { getTimesheetInterpreterAmount } from '../../utils/interpreterFlow';

const money = (amount: number) =>
  `GBP ${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const InterpreterTimesheets = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pendingSubmission, submittedHistory, loading } = useInterpreterTimesheets(user?.profileId);

  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)] flex-1 flex-col bg-slate-50 animate-in fade-in duration-700 dark:bg-slate-950">
      <PageHeader
        title="Timesheets & Logs"
        subtitle="Submit end-of-session reports and track your historical records."
      >
        <Button onClick={() => navigate('/interpreter/billing')} variant="secondary" icon={FileText} size="sm">View Statements</Button>
      </PageHeader>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 md:p-6">

        {/* Left Col: Pending & Active Queue */}
        <div className="flex-1 space-y-4">

          {/* Pending Submissions */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-3">
                <AlertCircle size={16} className={pendingSubmission.length > 0 ? "text-amber-600" : "text-slate-400"} />
                <h3 className="text-[10px] font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">Pending Submissions</h3>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${pendingSubmission.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                {pendingSubmission.length} Due
              </span>
            </div>

            <div className="p-3 sm:p-4">
              {loading ? (
                <div className="py-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 animate-pulse">Syncing...</div>
              ) : pendingSubmission.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <CheckCircle2 size={32} className="text-emerald-400 mb-3" />
                  <p className="text-slate-900 font-bold text-sm">All caught up!</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">No pending timesheets</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingSubmission.map(job => (
                    <div
                      key={job.id}
                      onClick={() => navigate(`/interpreter/timesheets/new/${job.id}`, {
                        state: { returnTo: '/interpreter/timesheets', returnLabel: 'Timesheets' }
                      })}
                      className="group flex cursor-pointer flex-col justify-between rounded-lg border border-amber-200 bg-amber-50/30 p-3 transition-all hover:bg-amber-50 sm:flex-row sm:items-center dark:border-amber-900/40 dark:bg-amber-950/20"
                    >
                      <div className="mb-3 sm:mb-0">
                        <div className="mb-1 flex items-center gap-2">
                          <Clock size={14} className="text-amber-600" />
                          <span className="text-xs font-black text-slate-900 dark:text-white">{new Date(job.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </div>
                        <p className="pl-5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{job.clientName || 'Confidential Client'}</p>
                      </div>
                      <Button size="sm" className="mt-2 w-full bg-amber-600 text-white hover:bg-amber-700 sm:mt-0 sm:w-auto">
                        Submit Log
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submitted History Grid */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <h3 className="shrink-0 text-[10px] font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">Historical Logs</h3>
            </div>
            <div className="custom-scrollbar overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead className="border-b border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950">
                  <tr>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Date</th>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Duration</th>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Status</th>
                    <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-wide text-slate-400">Settlement</th>
                    <th className="px-4 py-2 text-center text-[10px] font-black uppercase tracking-wide text-slate-400">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Logs...</td></tr>
                  ) : submittedHistory.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No historical logs found.</td></tr>
                  ) : submittedHistory.map(ts => (
                    <tr key={ts.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CalendarDays size={14} className="text-slate-400" />
                          <span className="text-xs font-bold text-slate-900 dark:text-white">{new Date(ts.actualStart).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-600 dark:text-slate-300">
                        {new Date(ts.actualStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(ts.actualEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider
                          ${ts.adminApproved ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                          {ts.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-black text-slate-900 dark:text-white">
                        {getTimesheetInterpreterAmount(ts) > 0 ? money(getTimesheetInterpreterAmount(ts)) : <span className="text-slate-400 text-[10px] uppercase">Processing</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {ts.supportingDocumentUrl ? (
                          <a
                            href={ts.supportingDocumentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-blue-600 hover:text-blue-800"
                          >
                            <FileText size={12} />
                            View
                          </a>
                        ) : (
                          <span className="text-[10px] font-black uppercase text-slate-300">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
