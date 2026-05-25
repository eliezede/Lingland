import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Clock, ChevronRight, CheckCircle2, AlertCircle, FileText, CalendarDays } from 'lucide-react';
import { useInterpreterTimesheets } from '../../hooks/useInterpreterTimesheets';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { getTimesheetInterpreterAmount } from '../../utils/interpreterFlow';

export const InterpreterTimesheets = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pendingSubmission, submittedHistory, loading } = useInterpreterTimesheets(user?.profileId);

  return (
    <div className="flex-1 flex flex-col h-full min-h-[calc(100vh-4rem)] bg-slate-50 animate-in fade-in duration-700">
      <PageHeader
        title="Timesheets & Logs"
        subtitle="Submit end-of-session reports and track your historical records."
      >
        <Button onClick={() => navigate('/interpreter/billing')} variant="secondary" icon={FileText} size="sm">View Statements</Button>
      </PageHeader>

      <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full flex flex-col lg:flex-row gap-8">

        {/* Left Col: Pending & Active Queue */}
        <div className="flex-1 space-y-8">

          {/* Pending Submissions */}
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <AlertCircle size={16} className={pendingSubmission.length > 0 ? "text-amber-600" : "text-slate-400"} />
                <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-[0.2em]">Pending Submissions</h3>
              </div>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${pendingSubmission.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                {pendingSubmission.length} Due
              </span>
            </div>

            <div className="p-4 sm:p-6">
              {loading ? (
                <div className="py-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 animate-pulse">Syncing...</div>
              ) : pendingSubmission.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <CheckCircle2 size={32} className="text-emerald-400 mb-3" />
                  <p className="text-slate-900 font-bold text-sm">All caught up!</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">No pending timesheets</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingSubmission.map(job => (
                    <div
                      key={job.id}
                      onClick={() => navigate(`/interpreter/timesheets/new/${job.id}`)}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-amber-200 bg-amber-50/30 hover:bg-amber-50 transition-all cursor-pointer shadow-sm hover:shadow-md"
                    >
                      <div className="mb-4 sm:mb-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock size={14} className="text-amber-600" />
                          <span className="text-xs font-black text-slate-900">{new Date(job.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-5">{job.clientName || 'Confidential Client'}</p>
                      </div>
                      <Button size="sm" className="w-full sm:w-auto mt-2 sm:mt-0 bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/20 uppercase tracking-widest text-[10px] py-2">
                        Submit Log
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submitted History Grid */}
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-[0.2em] shrink-0">Historical Logs</h3>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Duration</th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Settlement</th>
                    <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Logs...</td></tr>
                  ) : submittedHistory.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No historical logs found.</td></tr>
                  ) : submittedHistory.map(ts => (
                    <tr key={ts.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <CalendarDays size={14} className="text-slate-400" />
                          <span className="text-xs font-bold text-slate-900">{new Date(ts.actualStart).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-600">
                        {new Date(ts.actualStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(ts.actualEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider
                          ${ts.adminApproved ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                          {ts.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-xs font-black text-slate-900">
                        {getTimesheetInterpreterAmount(ts) > 0 ? `£${getTimesheetInterpreterAmount(ts).toFixed(2)}` : <span className="text-slate-400 text-[10px] uppercase">Processing</span>}
                      </td>
                      <td className="px-6 py-4 text-center">
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

        {/* Right Col: Info Sidebar */}
        <aside className="w-full lg:w-80 shrink-0 space-y-6">
          <div className="bg-blue-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-600/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:scale-125 transition-transform duration-1000" />
            <div className="relative z-10">
              <h4 className="text-sm font-black mb-2 uppercase tracking-widest">Timesheet Policy</h4>
              <p className="text-blue-100 text-[10px] font-medium leading-relaxed mb-4">
                All timesheets must be submitted within 24 hours of session completion to guarantee inclusion in the current billing cycle.
              </p>
              <div className="text-[9px] font-black bg-white/20 px-3 py-1.5 rounded-lg inline-block uppercase tracking-widest border border-white/20">
                Billing cycle closes Friday 17:00
              </div>
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
};
