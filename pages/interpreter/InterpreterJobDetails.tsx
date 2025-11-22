
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookingService } from '../../services/api';
import { Booking, BookingStatus } from '../../types';
import { MapPin, Clock, Calendar, Video, Phone, ChevronLeft, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const InterpreterJobDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [job, setJob] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      BookingService.getById(id).then(setJob).finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading job details...</div>;
  if (!job) return <div className="p-8 text-center text-red-500">Job not found.</div>;

  const isRemote = job.locationType === 'ONLINE';

  return (
    <div className="bg-gray-50 min-h-screen pb-20">
      {/* Header */}
      <div className="bg-white px-4 py-4 sticky top-0 z-10 border-b border-gray-200 flex items-center">
        <button onClick={() => navigate(-1)} className="mr-3 text-gray-600">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Job Details</h1>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        
        {/* Status Card */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
           <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide 
             ${job.status === BookingStatus.CONFIRMED ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
             {job.status}
           </span>
           <h2 className="text-xl font-bold text-gray-900 mt-2">
             {job.languageFrom} &rarr; {job.languageTo}
           </h2>
           <p className="text-gray-500 text-sm">{job.serviceType}</p>
        </div>

        {/* Time & Date */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
          <div className="flex items-center">
            <Calendar className="text-blue-600 mr-3" size={20} />
            <div>
              <p className="text-xs text-gray-400 uppercase font-bold">Date</p>
              <p className="text-gray-900 font-medium">{new Date(job.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>
          <div className="flex items-center">
            <Clock className="text-blue-600 mr-3" size={20} />
            <div>
              <p className="text-xs text-gray-400 uppercase font-bold">Time</p>
              <p className="text-gray-900 font-medium">{job.startTime} ({job.durationMinutes} mins)</p>
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-3">Location</h3>
          {isRemote ? (
            <div className="flex items-start bg-blue-50 p-3 rounded-lg">
              <Video className="text-blue-600 mr-3 mt-1" size={20} />
              <div>
                <p className="text-blue-900 font-medium">Remote Session</p>
                <a href={job.onlineLink} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline break-all">
                  {job.onlineLink || 'Link pending'}
                </a>
              </div>
            </div>
          ) : (
            <div className="flex items-start">
              <MapPin className="text-red-600 mr-3 mt-1" size={20} />
              <div>
                <p className="text-gray-900 font-medium">{job.address}</p>
                <p className="text-gray-500">{job.postcode}</p>
                <a 
                  href={`https://maps.google.com/?q=${job.address} ${job.postcode}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-blue-600 text-sm font-medium mt-2 inline-block"
                >
                  Open in Maps
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Client / Notes */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4">
           <div>
             <p className="text-xs text-gray-400 uppercase font-bold mb-1">Client</p>
             <p className="text-gray-900 font-medium">{job.clientName}</p>
           </div>
           {job.notes && (
             <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
               <p className="text-xs text-yellow-700 uppercase font-bold mb-1">Special Notes</p>
               <p className="text-sm text-yellow-900">{job.notes}</p>
             </div>
           )}
        </div>

        {/* Action Bar */}
        <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 p-4 pb-safe z-20">
           {job.status === BookingStatus.CONFIRMED && new Date(job.date) < new Date() ? (
             <button 
               onClick={() => navigate(`/interpreter/timesheets/new/${job.id}`)}
               className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center"
             >
               <FileText className="mr-2" size={20} /> Submit Timesheet
             </button>
           ) : (
             <button disabled className="w-full bg-gray-100 text-gray-400 font-bold py-3 rounded-xl cursor-not-allowed">
               {job.status === BookingStatus.CONFIRMED ? 'Upcoming' : job.status}
             </button>
           )}
        </div>

      </div>
    </div>
  );
};
