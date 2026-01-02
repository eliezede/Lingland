import React, { useState } from 'react';
import { BookingService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ServiceType, BookingStatus } from '../../types';
import { useNavigate } from 'react-router-dom';

export const ClientNewBooking = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    serviceType: ServiceType.FACE_TO_FACE,
    languageFrom: 'English',
    languageTo: '',
    date: '',
    startTime: '',
    durationMinutes: 60,
    locationType: 'ONSITE' as 'ONSITE' | 'ONLINE',
    address: '',
    postcode: '',
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.profileId) return;

    setIsSubmitting(true);
    try {
      await BookingService.create({
        ...formData,
        clientId: user.profileId,
        clientName: user.displayName,
        requestedByUserId: user.id
      });
      showToast('Booking Request Created Successfully', 'success');
      navigate('/client/bookings');
    } catch (err) {
      console.error(err);
      showToast('Failed to create booking', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Booking Request</h1>
      
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 space-y-6">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
            <select 
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={formData.serviceType}
              onChange={e => setFormData({...formData, serviceType: e.target.value as ServiceType})}
            >
              {/* Fix: Explicitly type mapped items as ServiceType to satisfy Key and ReactNode expectations */}
              {(Object.values(ServiceType) as ServiceType[]).map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Language</label>
            <input 
              type="text"
              required
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Arabic"
              value={formData.languageTo}
              onChange={e => setFormData({...formData, languageTo: e.target.value})}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input 
              type="date"
              required
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={formData.date}
              onChange={e => setFormData({...formData, date: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
            <input 
              type="time"
              required
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={formData.startTime}
              onChange={e => setFormData({...formData, startTime: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Mins)</label>
            <input 
              type="number"
              required
              min="30"
              step="15"
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              value={formData.durationMinutes}
              onChange={e => setFormData({...formData, durationMinutes: parseInt(e.target.value)})}
            />
          </div>
        </div>

        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location Type</label>
            <div className="flex space-x-4 mb-3">
              <label className="flex items-center">
                <input 
                  type="radio" 
                  name="locationType" 
                  value="ONSITE"
                  checked={formData.locationType === 'ONSITE'}
                  onChange={() => setFormData({...formData, locationType: 'ONSITE'})}
                  className="mr-2"
                />
                On-site Address
              </label>
              <label className="flex items-center">
                <input 
                  type="radio" 
                  name="locationType" 
                  value="ONLINE"
                  checked={formData.locationType === 'ONLINE'}
                  onChange={() => setFormData({...formData, locationType: 'ONLINE'})}
                  className="mr-2"
                />
                Online / Remote
              </label>
            </div>
            
            {formData.locationType === 'ONSITE' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <input 
                    type="text" 
                    placeholder="Street Address, Building, etc."
                    className="w-full p-2.5 border border-gray-300 rounded-lg"
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                  />
                </div>
                <div>
                  <input 
                    type="text" 
                    placeholder="Postcode"
                    className="w-full p-2.5 border border-gray-300 rounded-lg"
                    value={formData.postcode}
                    onChange={e => setFormData({...formData, postcode: e.target.value})}
                  />
                </div>
              </div>
            )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea 
            className="w-full p-2.5 border border-gray-300 rounded-lg h-24"
            placeholder="Any special instructions..."
            value={formData.notes}
            onChange={e => setFormData({...formData, notes: e.target.value})}
          />
        </div>

        <div className="flex justify-end">
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>

      </form>
    </div>
  );
};
