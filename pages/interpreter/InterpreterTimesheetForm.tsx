
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookingService } from '../../services/api';
import { Booking } from '../../types';
import { useInterpreterTimesheets } from '../../hooks/useInterpreterTimesheets';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ChevronLeft, Camera } from 'lucide-react';

export const InterpreterTimesheetForm = () => {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [job, setJob] = useState<Booking | null>(null);
  const { submitTimesheet } = useInterpreterTimesheets(user?.profileId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    start: '',
    end: '',
    breakMins: 0
  });

  useEffect(() => {
    if (bookingId) {
      BookingService.getById(bookingId).then(setJob);
    }
  }, [bookingId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setIsSubmitting(true);
    
    // Construct ISO dates
    const baseDate = job.date; 
    const startISO = `${baseDate}T${formData.start}:00`;
    const endISO = `${baseDate}T${formData.end}:00`;

    await submitTimesheet({
      bookingId: job.id,
      clientId: job.clientId,
      actualStart: startISO,
      actualEnd: endISO,
      breakDurationMinutes: formData.breakMins
    });
    
    setIsSubmitting(false);
    showToast("Timesheet submitted successfully!", "success");
    navigate('/interpreter/timesheets');
  };

  if (!job) return <div className="p-8">Loading...</div>;

  return (
    <div className="bg-white min-h-screen">
      <div className="px-4 py-4 border-b border-gray-200 flex items-center sticky top-0 bg-white z-10">
        <button onClick={() => navigate(-1)} className="mr-3 text-gray-600">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Submit Timesheet</h1>
      </div>

      <div className="p-4 bg-blue-50 m-4 rounded-xl">
         <h2 className="font-bold text-blue-900">{job.clientName}</h2>
         <p className="text-sm text-blue-700">{new Date(job.date).toLocaleDateString()} • {job.startTime}</p>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-6">
        <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Start Time</label>
              <input 
                type="time" 
                required
                className="w-full p-3 border border-gray-300 rounded-xl bg-gray-50 text-lg"
                value={formData.start}
                onChange={e => setFormData({...formData, start: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">End Time</label>
              <input 
                type="time" 
                required
                className="w-full p-3 border border-gray-300 rounded-xl bg-gray-50 text-lg"
                value={formData.end}
                onChange={e => setFormData({...formData, end: e.target.value})}
              />
            </div>
          </div>

          <div>
             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Break (Minutes)</label>
             <input 
                type="number" 
                className="w-full p-3 border border-gray-300 rounded-xl bg-gray-50"
                value={formData.breakMins}
                onChange={e => setFormData({...formData, breakMins: parseInt(e.target.value)})}
              />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Evidence</label>
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
              <Camera size={32} className="mb-2" />
              <span className="text-sm">Tap to upload signed form</span>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 disabled:opacity-50 mt-8"
          >
            {isSubmitting ? 'Sending...' : 'Submit Timesheet'}
          </button>
      </form>
    </div>
  );
};
