
import React, { useEffect, useState } from 'react';
import { BillingService } from '../../../services/api';
import { Timesheet } from '../../../types';
import { CheckCircle, XCircle, FileText } from 'lucide-react';

export const AdminTimesheets = () => {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await BillingService.getAllTimesheets();
    setTimesheets(data);
    setLoading(false);
  };

  const handleApprove = async (id: string) => {
    await BillingService.approveTimesheet(id);
    await loadData(); // Refresh
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Timesheet Management</h1>
      <p className="text-gray-500">Review and approve submitted timesheets to trigger billing calculations.</p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading timesheets...</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Booking ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Interpreter</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Times</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client Bill</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Interp. Pay</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {timesheets.map((ts) => (
                <tr key={ts.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {ts.bookingId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {ts.interpreterId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>{new Date(ts.actualStart).toLocaleTimeString()} - {new Date(ts.actualEnd).toLocaleTimeString()}</div>
                    <div className="text-xs text-gray-400">Break: {ts.breakDurationMinutes}m</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    {ts.adminApproved ? `£${ts.totalClientAmount?.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {ts.adminApproved ? `£${ts.totalInterpreterAmount?.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${ts.adminApproved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {ts.adminApproved ? 'APPROVED' : 'PENDING'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {!ts.adminApproved && (
                      <button 
                        onClick={() => handleApprove(ts.id)}
                        className="text-green-600 hover:text-green-900 flex items-center justify-end ml-auto"
                      >
                        <CheckCircle size={16} className="mr-1" /> Approve
                      </button>
                    )}
                    {ts.adminApproved && <span className="text-gray-400 flex items-center justify-end"><FileText size={16} className="mr-1"/> View</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
