
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookingService, StorageService } from '../../services/api';
import { Booking } from '../../types';
import { useInterpreterTimesheets } from '../../hooks/useInterpreterTimesheets';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ChevronLeft, Camera, Upload, Check } from 'lucide-react';

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
    breakMins: 0,
    evidenceUrl: ''
  });
  
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (bookingId) {
      BookingService.getById(bookingId).then(setJob);
    }
  }, [bookingId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const path = `timesheets/${bookingId}/${Date.now()}_${file.name}`;
      const url = await StorageService.uploadFile(file, path);
      setFormData(prev => ({ ...prev, evidenceUrl: url }));
      showToast('File uploaded successfully', 'success');
    } catch (error) {
      showToast('Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

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
      breakDurationMinutes: formData.breakMins,
      supportingDocumentUrl: formData.evidenceUrl
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
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Evidence (Signed Form)</label>
            <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center relative transition-colors ${
              formData.evidenceUrl ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50'
            }`}>
              <input 
                type="file" 
                accept="image/*,.pdf"
                onChange={handleFileUpload}
                disabled={uploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              
              {uploading ? (
                <div className="flex flex-col items-center text-blue-600">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                  <span className="text-sm">Uploading...</span>
                </div>
              ) : formData.evidenceUrl ? (
                <div className="flex flex-col items-center text-green-600">
                  <Check size={32} className="mb-2" />
                  <span className="text-sm font-bold">File Attached</span>
                  <span className="text-xs mt-1">Tap to change</span>
                </div>
              ) : (
                <div className="flex flex-col items-center text-gray-400">
                  <Camera size={32} className="mb-2" />
                  <span className="text-sm font-medium">Tap to upload signed form</span>
                  <span className="text-xs mt-1">Image or PDF</span>
                </div>
              )}
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting || uploading}
            className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 disabled:opacity-50 mt-8"
          >
            {isSubmitting ? 'Sending...' : 'Submit Timesheet'}
          </button>
      </form>
    </div>
  );
};
