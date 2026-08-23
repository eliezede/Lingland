import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Clock, ChevronRight, CheckCircle2, AlertCircle, FileText, CalendarDays, RefreshCw } from 'lucide-react';
import { useInterpreterTimesheets } from '../../hooks/useInterpreterTimesheets';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { getTimesheetInterpreterAmount } from '../../utils/interpreterFlow';
import { formatLanguagePair } from '../../utils/languageDisplay';
import { getInterpreterBookingAmount, isTranslationBooking } from '../../utils/interpreterJobLifecycle';
import { formatLondonDate } from '../../utils/londonDateTime';

const money = (amount: number) =>
  `GBP ${Number(amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const InterpreterTimesheets = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pendingSubmission, jobHistory, loading, error, refresh } = useInterpreterTimesheets(user?.profileId);

  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)] flex-1 flex-col bg-slate-50 animate-in fade-in duration-700 dark:bg-slate-950">
      <PageHeader
        title="Timesheets"
        subtitle="Submit completed work and track approval progress."
      >
        <Button onClick={() => navigate('/interpreter/billing')} variant="secondary" icon={FileText} size="sm">View Payments</Button>
      </PageHeader>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 md:p-6">

        {error && (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">{error}</p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Your submitted records remain unchanged.</p>
            </div>
            <Button onClick={() => void refresh()} variant="secondary" icon={RefreshCw} size="sm">Try again</Button>
          </div>
        )}

        {/* Left Col: Pending & Active Queue */}
        <div className="flex-1 space-y-4">

          {/* Pending Submissions */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-3">
                <AlertCircle size={16} className={pendingSubmission.length > 0 ? "text-amber-600" : "text-slate-400"} />
                <h3 className="text-[10px] font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">Ready to submit</h3>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${pendingSubmission.length > 0 && !error ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                {error ? 'Unavailable' : `${pendingSubmission.length} Due`}
              </span>
            </div>

            <div className="p-3 sm:p-4">
              {loading ? (
                <div className="py-8 text-center text-sm text-slate-500 animate-pulse">Loading timesheets...</div>
              ) : error ? (
                <div className="py-10 text-center text-sm font-semibold text-slate-500">Timesheets will appear after the connection is restored.</div>
              ) : pendingSubmission.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <CheckCircle2 size={32} className="text-emerald-400 mb-3" />
                  <p className="text-slate-900 font-bold text-sm dark:text-white">All caught up</p>
                  <p className="mt-1 text-xs text-slate-500">No timesheets are waiting for you.</p>
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
                          <span className="text-xs font-black text-slate-900 dark:text-white">{formatLondonDate(job.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </div>
                        <p className="pl-5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{job.clientName || 'Confidential Client'}</p>
                      </div>
                      <Button size="sm" className="mt-2 w-full bg-amber-600 text-white hover:bg-amber-700 sm:mt-0 sm:w-auto">
                        {isTranslationBooking(job) ? 'Submit delivery' : 'Submit timesheet'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Unified work and timesheet history */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <h3 className="shrink-0 text-[10px] font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">Submission history</h3>
              <span className="text-[10px] font-bold text-slate-400">{error ? 'Unavailable' : `${jobHistory.length} records`}</span>
            </div>
            <div className="custom-scrollbar overflow-x-auto">
              {!loading && !error && jobHistory.length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
                  {jobHistory.map(record => {
                    const booking = record.booking;
                    const timesheet = record.timesheet;
                    const dateValue = booking?.date || timesheet?.actualStart;
                    const amount = timesheet ? getTimesheetInterpreterAmount(timesheet) : getInterpreterBookingAmount(booking);
                    return (
                      <button
                        type="button"
                        key={record.id}
                        disabled={!booking}
                        onClick={() => booking && navigate(`/interpreter/jobs/${booking.id}`, {
                          state: { returnTo: '/interpreter/timesheets', returnLabel: 'Timesheets' }
                        })}
                        className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-slate-50 disabled:cursor-default dark:hover:bg-slate-800"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                            {booking?.displayRef || booking?.jobNumber || booking?.bookingRef || timesheet?.bookingId || 'Historical record'}
                          </p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            {booking ? formatLanguagePair(booking.languageFrom, booking.languageTo) : 'Historical service'}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            {dateValue ? formatLondonDate(String(dateValue)) : 'Date unavailable'}
                            {' / '}{booking?.status || timesheet?.status || 'Historical'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{amount > 0 ? money(amount) : 'Pending'}</p>
                          {timesheet?.adminApproved && <p className="mt-1 text-[10px] font-bold uppercase text-emerald-600">Approved</p>}
                          {booking && <ChevronRight className="ml-auto mt-2 text-slate-400" size={18} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {loading && <div className="p-8 text-center text-sm text-slate-500 md:hidden">Loading history...</div>}
              {!loading && error && <div className="p-10 text-center text-sm text-slate-500 md:hidden">History is temporarily unavailable.</div>}
              {!loading && !error && jobHistory.length === 0 && <div className="p-10 text-center text-sm text-slate-500 md:hidden">No submitted work yet.</div>}
              <table className="hidden w-full min-w-[820px] border-collapse text-left md:table">
                <thead className="border-b border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950">
                  <tr>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Job</th>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Date</th>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Service</th>
                    <th className="px-4 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Status</th>
                    <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-wide text-slate-400">Settlement</th>
                    <th className="px-4 py-2 text-center text-[10px] font-black uppercase tracking-wide text-slate-400">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr><td colSpan={6} className="px-6 py-8 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading history...</td></tr>
                  ) : error ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-xs font-bold text-slate-400">History is temporarily unavailable.</td></tr>
                  ) : jobHistory.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No work history found.</td></tr>
                  ) : jobHistory.map(record => {
                    const booking = record.booking;
                    const timesheet = record.timesheet;
                    const dateValue = booking?.date || timesheet?.actualStart;
                    const amount = timesheet ? getTimesheetInterpreterAmount(timesheet) : getInterpreterBookingAmount(booking);
                    return (
                    <tr
                      key={record.id}
                      onClick={() => booking && navigate(`/interpreter/jobs/${booking.id}`, {
                        state: { returnTo: '/interpreter/timesheets', returnLabel: 'Timesheets' }
                      })}
                      className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/60 ${booking ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <p className="text-xs font-black text-slate-900 dark:text-white">
                          {booking?.displayRef || booking?.jobNumber || booking?.bookingRef || timesheet?.bookingId || 'Historical record'}
                        </p>
                        {booking?.sourceSystem === 'AIRTABLE' && <span className="text-[9px] font-bold uppercase text-blue-600">Imported history</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CalendarDays size={14} className="text-slate-400" />
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {dateValue ? formatLondonDate(String(dateValue)) : 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-600 dark:text-slate-300">
                        {booking ? formatLanguagePair(booking.languageFrom, booking.languageTo) : 'Historical service'}
                        {booking && <span className="block text-[9px] font-bold uppercase text-slate-400">{isTranslationBooking(booking) ? 'Translation' : 'Interpreting'}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider
                          ${timesheet?.adminApproved ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                          {booking?.status || timesheet?.status || 'HISTORICAL'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-black text-slate-900 dark:text-white">
                        {amount > 0 ? money(amount) : <span className="text-slate-400 text-[10px] uppercase">Pending review</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {timesheet?.supportingDocumentUrl ? (
                          <a
                            href={timesheet.supportingDocumentUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={event => event.stopPropagation()}
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
                  )})}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
