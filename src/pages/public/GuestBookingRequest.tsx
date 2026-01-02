import React, { useState, useEffect } from 'react';
import { BookingService, ClientService, InterpreterService } from '../../services/api';
import { ServiceType, Booking, Client } from '../../types';
import { Globe2, CheckCircle2, ArrowRight, FileText } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Link } from 'react-router-dom';

export const GuestBookingRequest = () => {
  const [step, setStep] = useState<'FORM' | 'SUCCESS'>('FORM');
  const [loading, setLoading] = useState(false);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);
  const [createdClient, setCreatedClient] = useState<Client | null>(null);
  
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [loadingLangs, setLoadingLangs] = useState(true);

  const [formData, setFormData] = useState({
    costCode: '',
    name: '',
    organisation: '',
    email: '',
    phone: '',
    billingEmail: '',
    languageFrom: 'English',
    languageTo: '',
    date: '',
    startTime: '',
    durationMinutes: 60,
    serviceType: ServiceType.FACE_TO_FACE,
    locationType: 'ONSITE' as 'ONSITE' | 'ONLINE',
    address: '',
    postcode: '',
    onlineLink: '',
    notes: '',
    genderPreference: 'None',
    agreedToTerms: false
  });

  useEffect(() => {
    const fetchLangs = async () => {
      try {
        const interpreters = await InterpreterService.getAll();
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
    if (!formData.languageTo) {
      alert('Please select a target language');
      return;
    }
    setLoading(true);
    try {
      const booking = await BookingService.createGuestBooking({
        guestContact: {
          name: formData.name,
          organisation: formData.organisation,
          email: formData.email,
          phone: formData.phone,
          billingEmail: formData.billingEmail
        },
        date: formData.date,
        startTime: formData.startTime,
        durationMinutes: Number(formData.durationMinutes),
        languageFrom: formData.languageFrom,
        languageTo: formData.languageTo,
        serviceType: formData.serviceType,
        locationType: formData.locationType,
        address: formData.address,
        postcode: formData.postcode,
        onlineLink: formData.onlineLink,
        costCode: formData.costCode,
        notes: formData.notes,
        genderPreference: formData.genderPreference
      });
      
      setCreatedBooking(booking);
      setStep('SUCCESS');
    } catch (err) {
      console.error(err);
      alert('Failed to submit request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async () => {
    if (!createdBooking?.guestContact) return;
    setLoading(true);
    try {
      const client = await ClientService.createClientFromGuest(createdBooking.guestContact);
      await BookingService.linkClientToBooking(createdBooking.id, client.id);
      setCreatedClient(client);
    } catch (e) {
      alert('Failed to create profile');
    } finally {
      setLoading(false);
    }
  };

  const inputClasses = "w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 outline-none transition-shadow";

  if (step === 'SUCCESS' && createdBooking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-xl w-full text-center p-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Request Received!</h2>
          <p className="text-gray-600 mb-6">
            Thank you. Your booking reference is <span className="font-bold text-gray-900">{createdBooking.bookingRef}</span>.
            <br />We have sent a confirmation email to {formData.email}.
          </p>

          {!createdClient ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-blue-900 mb-2">Use Lingland often?</h3>
              <p className="text-sm text-blue-800 mb-4">
                Create a client profile instantly using the details you just provided. 
              </p>
              <Button onClick={handleCreateClient} isLoading={loading} className="w-full justify-center">
                Create Client Profile
              </Button>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-green-900">Profile Created!</h3>
              <p className="text-sm text-green-800 mt-1">
                You can now log in using your email: <strong>{createdClient.email}</strong>.
              </p>
            </div>
          )}

          <div className="flex justify-center">
             <Link to="/" className="text-gray-500 hover:text-gray-900 text-sm font-medium">
               Back to Homepage
             </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="flex items-center text-blue-600">
              <Globe2 size={32} className="mr-2" />
              <span className="text-2xl font-bold tracking-tight">Lingland</span>
            </div>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900">Book an Interpreter</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <Card className="p-6 md:p-8">
            <div className="flex items-start mb-6">
              <div className="bg-blue-100 p-2 rounded-lg text-blue-600 mr-4">
                <FileText size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Billing Codes</h3>
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Purchase Order / Reference / Cost Code</label>
              <input 
                type="text"
                required
                className={inputClasses}
                value={formData.costCode}
                onChange={e => setFormData({...formData, costCode: e.target.value})}
              />
            </div>
          </Card>

          <Card className="p-6 md:p-8">
            <h3 className="text-lg font-bold text-gray-900 mb-6 pb-2 border-b">Client Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Your Name *</label>
                <input type="text" required className={inputClasses} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Organisation *</label>
                <input type="text" required className={inputClasses} value={formData.organisation} onChange={e => setFormData({...formData, organisation: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Email Address *</label>
                <input type="email" required className={inputClasses} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
            </div>
          </Card>

          <Card className="p-6 md:p-8">
            <h3 className="text-lg font-bold text-gray-900 mb-6 pb-2 border-b">Session Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1">From Language</label>
                 <input type="text" readOnly disabled className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500" value="English" />
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
                   <option value="">{loadingLangs ? 'Loading...' : 'Select language...'}</option>
                   {availableLanguages.map(lang => (
                     <option key={lang} value={lang}>{lang}</option>
                   ))}
                 </select>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1">Date *</label>
                 <input type="date" required className={inputClasses} value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
               </div>
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1">Start Time *</label>
                 <input type="time" required className={inputClasses} value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} />
               </div>
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1">Duration (Mins) *</label>
                 <input type="number" required min="30" step="15" className={inputClasses} value={formData.durationMinutes} onChange={e => setFormData({...formData, durationMinutes: Number(e.target.value)})} />
               </div>
            </div>

            <div className="space-y-4">
               <div className="flex gap-8">
                 <label className="flex items-center cursor-pointer text-gray-800 font-medium">
                   <input type="radio" name="loc" value="ONSITE" checked={formData.locationType === 'ONSITE'} onChange={() => setFormData({...formData, locationType: 'ONSITE'})} className="w-4 h-4 text-blue-600 mr-2 focus:ring-blue-500" />
                   Face-to-Face
                 </label>
                 <label className="flex items-center cursor-pointer text-gray-800 font-medium">
                   <input type="radio" name="loc" value="ONLINE" checked={formData.locationType === 'ONLINE'} onChange={() => setFormData({...formData, locationType: 'ONLINE'})} className="w-4 h-4 text-blue-600 mr-2 focus:ring-blue-500" />
                   Video / Remote
                 </label>
               </div>

               {formData.locationType === 'ONSITE' ? (
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <div className="md:col-span-2">
                     <label className="block text-sm font-bold text-gray-700 mb-1">Address</label>
                     <input type="text" required placeholder="Address Line 1 & 2" className={inputClasses} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                   </div>
                   <div>
                     <label className="block text-sm font-bold text-gray-700 mb-1">Postcode</label>
                     <input type="text" required placeholder="Postcode" className={inputClasses} value={formData.postcode} onChange={e => setFormData({...formData, postcode: e.target.value})} />
                   </div>
                 </div>
               ) : (
                 <div>
                   <label className="block text-sm font-bold text-gray-700 mb-1">Meeting Link</label>
                   <input type="text" placeholder="Meeting Link / Platform (e.g. MS Teams)" className={inputClasses} value={formData.onlineLink} onChange={e => setFormData({...formData, onlineLink: e.target.value})} />
                 </div>
               )}
            </div>
          </Card>

          <div className="bg-white p-6 rounded-xl border border-gray-200">
             <label className="flex items-start cursor-pointer group">
               <input type="checkbox" required className="mt-1 w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" checked={formData.agreedToTerms} onChange={e => setFormData({...formData, agreedToTerms: e.target.checked})} />
               <span className="ml-3 text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                 I have read and agree to the <a href="#" className="text-blue-600 underline font-medium">Terms and Conditions of Service</a>.
               </span>
             </label>
          </div>

          <div className="flex justify-center pb-12">
            <Button type="submit" size="lg" isLoading={loading} disabled={availableLanguages.length === 0} className="w-full md:w-auto px-12 py-4 text-lg shadow-lg shadow-blue-200">
              Submit Booking Request <ArrowRight size={20} className="ml-2" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};