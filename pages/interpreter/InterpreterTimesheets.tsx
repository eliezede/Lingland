
import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Clock, ChevronRight, CheckCircle } from 'lucide-react';
import { useInterpreterTimesheets } from '../../hooks/useInterpreterTimesheets';
import { useNavigate } from 'react-router-dom';

export const InterpreterTimesheets = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pendingSubmission, submittedHistory, loading } = useInterpreterTimesheets(user?.profileId);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6 pb-20">
      <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
      
      {/* Pending Actions */}
      {pendingSubmission.length > 0 ? (
         <div className="space-y-3">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center">
              <Clock className="text-yellow-600 mr-2" size={18} />
              <span className="text-sm text-yellow-800 font-medium">Action Required: {pendingSubmission.length} Pending</span>
            </div>
            {pendingSubmission.map(job => (
              <div 
                key={job.id} 
                onClick={() => navigate(`/interpreter/timesheets/new/${job.id}`)}
                className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center active:bg-gray-50"
              >
                <div>
                  <p className="font-bold text-gray-900">{new Date(job.date).toLocaleDateString()}</p>
                  <p className="text-sm text-gray-500">{job.clientName}</p>
                </div>
                <button className="bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-lg">
                  Submit
                </button>
              </div>
            ))}
         </div>
      ) : (
        <div className="bg-white p-6 rounded-xl border border-gray-100 text-center">
          <CheckCircle className="mx-auto text-green-500 mb-2" size={32} />
          <p className="text-gray-900 font-medium">All caught up!</p>
          <p className="text-sm text-gray-400">No pending timesheets.</p>
        </div>
      )}

      {/* History */}
      <div className="pt-4">
        <h3 className="font-bold text-gray-900 mb-4">History</h3>
        <div className="space-y-3">
          {submittedHistory.length === 0 && <p className="text-gray-400 text-sm text-center">No history found.</p>}
          {submittedHistory.map(ts => (
             <div key={ts.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex justify-between items-center mb-2">
                   <span className="text-sm font-bold text-gray-700">{new Date(ts.actualStart).toLocaleDateString()}</span>
                   <span className={`text-xs px-2 py-1 rounded-full font-medium ${ts.adminApproved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                     {ts.status}
                   </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                   <span>{new Date(ts.actualStart).toLocaleTimeString()} - {new Date(ts.actualEnd).toLocaleTimeString()}</span>
                   <span>{ts.totalInterpreterAmount ? `£${ts.totalInterpreterAmount}` : 'Processing'}</span>
                </div>
             </div>
          ))}
        </div>
      </div>
    </div>
  );
};
