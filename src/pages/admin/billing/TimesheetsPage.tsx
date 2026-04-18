
import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { BillingService } from '../../../services/api';
import { Timesheet } from '../../../types';
import { CheckCircle, FileText, ArrowUpRight, Filter, X, Clock } from 'lucide-react';
import { TableSkeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';

export const AdminTimesheets = () => {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const jobIdFilter = searchParams.get('jobId');

  useEffect(() => {
    loadData();
  }, [jobIdFilter]);

  const loadData = async () => {
    setLoading(true);
    const data = await BillingService.getAllTimesheets();
    if (jobIdFilter) {
      setTimesheets(data.filter(t => t.bookingId === jobIdFilter));
    } else {
      setTimesheets(data);
    }
    setLoading(false);
  };

  const handleApprove = async (id: string) => {
    await BillingService.approveTimesheet(id);
    await loadData(); // Refresh
  };

  const clearFilter = () => {
    searchParams.delete('jobId');
    setSearchParams(searchParams);
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-start md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timesheet Management</h1>
          <p className="text-gray-500 text-sm mt-1">Review and approve submitted timesheets to trigger billing calculations.</p>
        </div>
      </div>

      {jobIdFilter && (
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center text-blue-800 text-sm font-bold">
            <Filter size={16} className="mr-2" /> Filtering by Job ID: {jobIdFilter}
          </div>
          <button onClick={clearFilter} className="text-blue-600 hover:text-blue-800 p-1"><X size={16} /></button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={8} />
          </div>
        ) : timesheets.length === 0 ? (
          <EmptyState
            title="No Timesheets Found"
            description={jobIdFilter ? `No timesheets found for Job ID: ${jobIdFilter}` : "There are no timesheets submitted yet."}
            icon={Clock}
            actionLabel={jobIdFilter ? "Clear Filter" : undefined}
            onAction={jobIdFilter ? clearFilter : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-black tracking-widest text-slate-400 uppercase">Job Ref</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black tracking-widest text-slate-400 uppercase">Interpreter</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black tracking-widest text-slate-400 uppercase">Times</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black tracking-widest text-slate-400 uppercase">Client Bill</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black tracking-widest text-slate-400 uppercase">Int. Pay</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black tracking-widest text-slate-400 uppercase">Status</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black tracking-widest text-slate-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {timesheets.map((ts) => (
                  <tr key={ts.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <Link to={`/admin/bookings/${ts.bookingId}`} className="text-sm font-black text-blue-600 hover:underline flex items-center">
                          {ts.bookingId.substring(0, 8).toUpperCase()} <ArrowUpRight size={14} className="ml-1" />
                        </Link>
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Job Link</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-700">
                      <Link to={`/admin/interpreters/${ts.interpreterId}`} className="hover:text-blue-600 hover:underline">
                        {(ts as any).interpreterName || ts.interpreterId.substring(0, 8).toUpperCase()}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-slate-900">{new Date(ts.actualStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(ts.actualEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Break: {ts.breakDurationMinutes}m</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-emerald-700">
                      {ts.adminApproved ? `£${ts.clientAmountCalculated?.toFixed(2) ?? '—'}` : <span className="text-slate-300 font-medium">Pending</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-blue-700">
                      {ts.adminApproved ? `£${(ts.interpreterAmountCalculated || ts.totalToPay)?.toFixed(2) ?? '—'}` : <span className="text-slate-300 font-medium">Pending</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 text-[10px] rounded-full font-black uppercase tracking-widest border ${ts.adminApproved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {ts.adminApproved ? 'VERIFIED' : 'SUBMITTED'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {!ts.adminApproved ? (
                        <button
                          onClick={() => handleApprove(ts.id)}
                          className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-lg text-xs font-black uppercase tracking-widest flex items-center justify-end ml-auto transition-colors"
                        >
                          <CheckCircle size={14} className="mr-1.5" /> Approve
                        </button>
                      ) : (
                        <span className="text-slate-400 flex items-center justify-end text-[10px] font-black uppercase tracking-widest"><FileText size={14} className="mr-1.5" /> Approved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

