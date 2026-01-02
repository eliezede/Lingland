import React, { useState, useEffect } from 'react';
import { useCreateClientBooking } from '../../../hooks/useClientHooks';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { ServiceType, Interpreter } from '../../../types';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { InterpreterService } from '../../../services/api';

export const ClientNewBooking = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { createBooking } = useCreateClientBooking();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [loadingLangs, setLoadingLangs] = useState(true);
  
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
    onlineLink: '',
    costCode: '',
    caseType: '',
    genderPreference: 'None' as 'Male' | 'Female' | 'None',
    notes: ''
  });

  useEffect(() => {
    const fetchLangs = async () => {
      try {
        const interpreters = await InterpreterService.getAll();
        // Apenas intérpretes ativos podem oferecer idiomas
        const activeInts = interpreters.filter(i => i.status === 'ACTIVE');
        const allLangs = activeInts.flatMap(i => i.languages);
        const uniqueLangs = Array.from(new Set(allLangs)).sort();
        setAvailableLanguages(uniqueLangs);
      } catch (e) {
        console.error("Failed to load languages");
      } finally {
        setLoadingLangs(false);
      }
    };
    fetchLangs();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.profileId) return;
    if (!formData.languageTo) {
      showToast('Please select a target language', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const start = new Date(`2000-01-01T${formData.startTime}`);
      const end = new Date(start.getTime() + formData.durationMinutes * 60000);
      const expectedEndTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

      await createBooking({
        ...formData,
        expectedEndTime,
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

  const inputClasses = "w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 outline-none";

  return (
    <div className="max-w-3xl mx-auto pb-10">
      <div className="flex items-center mb-6">
        <Link to="/client/bookings" className="mr-4 p-2 rounded-full hover:bg-gray-200 transition-colors">
          <ChevronLeft size={24} className="text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Booking Request</h1>
          <p className="text-gray-500 text-sm">Fill in the details below to request an interpreter.</p>
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 space-y-6">
        
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">Job Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Service Type</label>
              <select 
                className={inputClasses}
                value={formData.serviceType}
                onChange={e => setFormData({...formData, serviceType: e.target.value as ServiceType})}
              >
                {Object.values(ServiceType).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">From Language</label>
                  <input 
                    type="text"
                    readOnly
                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                    value={formData.languageFrom}
                  />
               </div>
               <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">To Language *</label>
                  <select 
                    required
                    disabled={loadingLangs}
                    className={inputClasses}
                    value={formData.languageTo}
                    onChange={e => setFormData({...formData, languageTo: e.target.value})}
                  >
                    <option value="">{loadingLangs ? 'Loading...' : 'Select...'}</option>
                    {/* Fix: Explicitly type mapped items as string to satisfy Key and ReactNode expectations */}
                    {availableLanguages.map((lang: string) => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                  {availableLanguages.length === 0 && !loadingLangs && (
                    <p className="text-[10px] text-red-500 mt-1">No interpreters currently active.</p>
                  )}
               </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Date</label>
              <input 
                type="date"
                required
                className={inputClasses}
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Start Time</label>
                <input 
                  type="time"
                  required
                  className={inputClasses}
                  value={formData.startTime}
                  onChange={e => setFormData({...formData, startTime: e.target.value})}
                />
               </div>
               <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Duration (Mins)</label>
                <input 
                  type="number"
                  required
                  min="30"
                  step="15"
                  className={inputClasses}
                  value={formData.durationMinutes}
                  onChange={e => setFormData({...formData, durationMinutes: parseInt(e.target.value)})}
                />
               </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">Location</h3>
          <div className="space-y-4">
            <div className="flex space-x-6">
              <label className="flex items-center cursor-pointer text-gray-800 font-medium">
                <input 
                  type="radio" 
                  name="locationType" 
                  value="ONSITE"
                  checked={formData.locationType === 'ONSITE'}
                  onChange={() => setFormData({...formData, locationType: 'ONSITE'})}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span>On-site Address</span>
              </label>
              <label className="flex items-center cursor-pointer text-gray-800 font-medium">
                <input 
                  type="radio" 
                  name="locationType" 
                  value="ONLINE"
                  checked={formData.locationType === 'ONLINE'}
                  onChange={() => setFormData({...formData, locationType: 'ONLINE'})}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span>Online / Remote</span>
              </label>
            </div>
            
            {formData.locationType === 'ONSITE' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Full Address</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Street Address, Building, Ward, etc."
                    className={inputClasses}
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Postcode</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. SW1A 1AA"
                    className={inputClasses}
                    value={formData.postcode}
                    onChange={e => setFormData({...formData, postcode: e.target.value})}
                  />
                </div>
              </div>
            ) : (
              <div className="animate-fade-in">
                 <label className="block text-sm font-bold text-gray-700 mb-1">Meeting Link (Optional)</label>
                 <input 
                    type="url" 
                    placeholder="https://zoom.us/..."
                    className={inputClasses}
                    value={formData.onlineLink}
                    onChange={e => setFormData({...formData, onlineLink: e.target.value})}
                  />
              </div>
            )}
          </div>
        </div>

        <div>
           <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">Additional Information</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Case Type</label>
                <select 
                  className={inputClasses}
                  value={formData.caseType}
                  onChange={e => setFormData({...formData, caseType: e.target.value})}
                >
                  <option value="">Select...</option>
                  <option value="Medical">Medical</option>
                  <option value="Legal">Legal</option>
                  <option value="Social Services">Social Services</option>
                  <option value="Business">Business</option>
                  <option value="Education">Education</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Gender Preference</label>
                <select 
                  className={inputClasses}
                  value={formData.genderPreference}
                  onChange={e => setFormData({...formData, genderPreference: e.target.value as any})}
                >
                  <option value="None">No Preference</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Cost Code / Reference</label>
                <input 
                  type="text"
                  placeholder="e.g. PO-12345"
                  className={inputClasses}
                  value={formData.costCode}
                  onChange={e => setFormData({...formData, costCode: e.target.value})}
                />
              </div>
           </div>

           <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Notes / Special Instructions</label>
            <textarea 
              className={inputClasses + " h-24"}
              placeholder="e.g. Patient has hearing difficulties..."
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
            />
           </div>
        </div>

        <div className="flex justify-end space-x-4 pt-4 border-t border-gray-100">
          <Link 
            to="/client/bookings"
            className="px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button 
            type="submit" 
            disabled={isSubmitting || availableLanguages.length === 0}
            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>

      </form>
    </div>
  );
};
