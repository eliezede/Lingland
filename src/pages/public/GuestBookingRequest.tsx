
import React, { useState } from 'react';
import { BookingService, ClientService } from '../../services/api';
import { ServiceType, Booking, Client } from '../../types';
import { Globe2, CheckCircle2, AlertCircle, ArrowRight, FileText } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Link } from 'react-router-dom';

export const GuestBookingRequest = () => {
  const [step, setStep] = useState<'FORM' | 'SUCCESS'>('FORM');
  const [loading, setLoading] = useState(false);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);
  const [createdClient, setCreatedClient] = useState<Client | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    // Billing
    costCode: '',
    // Contact
    name: '',
    organisation: '',
    email: '',
    phone: '',
    billingEmail: '',
    // Session
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
    // Needs
    notes: '',
    genderPreference: 'None',
    // Terms
    agreedToTerms: false
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      
      // Link the booking to the new client
      await BookingService.linkClientToBooking(createdBooking.id, client.id);
      
      setCreatedClient(client);
    } catch (e) {
      alert('Failed to create profile');
    } finally {
      setLoading(false);
    }
  };

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
                This allows you to track bookings, view invoices, and book faster next time.
              </p>
              <Button onClick={handleCreateClient} isLoading={loading} className="w-full justify-center">
                Create Client Profile
              </Button>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-green-900">Profile Created!</h3>
              <p className="text-sm text-green-800 mt-1">
                This booking has been linked to your new profile.
                <br/>You can now log in using your email: <strong>{createdClient.email}</strong>.
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
        
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="flex items-center text-blue-600">
              <Globe2 size={32} className="mr-2" />
              <span className="text-2xl font-bold tracking-tight">Lingland</span>
            </div>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900">Book an Interpreter</h1>
          <p className="mt-2 text-lg text-gray-600">
            Professional interpreting services for legal, medical, and business needs.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* Section A: Billing Codes */}
          <Card className="p-6 md:p-8">
            <div className="flex items-start mb-6">
              <div className="bg-blue-100 p-2 rounded-lg text-blue-600 mr-4">
                <FileText size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Billing Codes</h3>
                <p className="text-sm text-gray-500">
                  Please provide a Cost Code, PO Number, or Reference. 
                  <span className="italic text-orange-600 ml-1">Missing codes may delay confirmation.</span>
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Order / Reference / Cost Code</label>
              <input 
                type="text"
                required
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. PO-99812 or Legal Aid Ref"
                value={formData.costCode}
                onChange={e => setFormData({...formData, costCode: e.target.value})}
              />
            </div>
          </Card>

          {/* Section B: Client Details */}
          <Card className="p-6 md:p-8">
            <h3 className="text-lg font-bold text-gray-900 mb-6 pb-2 border-b">Client Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Name *</label>
                <input 
                  type="text" required
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organisation *</label>
                <input 
                  type="text" required
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  placeholder="e.g. NHS Trust, Law Firm"
                  value={formData.organisation}
                  onChange={e => setFormData({...formData, organisation: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                <input 
                  type="email" required
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input 
                  type="tel"
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Billing Email (if different)</label>
                <input 
                  type="email"
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  placeholder="accounts@example.com"
                  value={formData.billingEmail}
                  onChange={e => setFormData({...formData, billingEmail: e.target.value})}
                />
              </div>
            </div>
          </Card>

          {/* Section C: Session Details */}
          <Card className="p-6 md:p-8">
            <h3 className="text-lg font-bold text-gray-900 mb-6 pb-2 border-b">Session Details</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">From Language</label>
                 <input 
                   type="text" readOnly disabled
                   className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                   value="English"
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">To Language *</label>
                 <input 
                   type="text" required
                   className="w-full p-3 border border-gray-300 rounded-lg"
                   placeholder="e.g. Polish, Arabic, BSL"
                   value={formData.languageTo}
                   onChange={e => setFormData({...formData, languageTo: e.target.value})}
                 />
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                 <input 
                   type="date" required
                   className="w-full p-3 border border-gray-300 rounded-lg"
                   value={formData.date}
                   onChange={e => setFormData({...formData, date: e.target.value})}
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                 <input 
                   type="time" required
                   className="w-full p-3 border border-gray-300 rounded-lg"
                   value={formData.startTime}
                   onChange={e => setFormData({...formData, startTime: e.target.value})}
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Mins) *</label>
                 <input 
                   type="number" required min="30" step="15"
                   className="w-full p-3 border border-gray-300 rounded-lg"
                   value={formData.durationMinutes}
                   onChange={e => setFormData({...formData, durationMinutes: Number(e.target.value)})}
                 />
               </div>
            </div>

            <div className="mb-4">
               <label className="block text-sm font-medium text-gray-700 mb-2">Service Type</label>
               <select 
                 className="w-full p-3 border border-gray-300 rounded-lg"
                 value={formData.serviceType}
                 onChange={e => setFormData({...formData, serviceType: e.target.value as ServiceType})}
               >
                 {Object.values(ServiceType).map(t => <option key={t} value={t}>{t}</option>)}
               </select>
            </div>

            <div className="space-y-4">
               <div className="flex gap-6">
                 <label className="flex items-center">
                   <input 
                     type="radio" name="loc" value="ONSITE" 
                     checked={formData.locationType === 'ONSITE'}
                     onChange={() => setFormData({...formData, locationType: 'ONSITE'})}
                     className="w-4 h-4 text-blue-600 mr-2"
                   />
                   Face-to-Face Address
                 </label>
                 <label className="flex items-center">
                   <input 
                     type="radio" name="loc" value="ONLINE"
                     checked={formData.locationType === 'ONLINE'}
                     onChange={() => setFormData({...formData, locationType: 'ONLINE'})}
                     className="w-4 h-4 text-blue-600 mr-2"
                   />
                   Video / Remote
                 </label>
               </div>

               {formData.locationType === 'ONSITE' ? (
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
                   <div className="md:col-span-2">
                     <input 
                       type="text" required
                       placeholder="Address Line 1 & 2"
                       className="w-full p-3 border border-gray-300 rounded-lg"
                       value={formData.address}
                       onChange={e => setFormData({...formData, address: e.target.value})}
                     />
                   </div>
                   <div>
                     <input 
                       type="text" required
                       placeholder="Postcode"
                       className="w-full p-3 border border-gray-300 rounded-lg"
                       value={formData.postcode}
                       onChange={e => setFormData({...formData, postcode: e.target.value})}
                     />
                   </div>
                 </div>
               ) : (
                 <div className="animate-fade-in">
                   <input 
                     type="text"
                     placeholder="Meeting Link / Platform (e.g. MS Teams)"
                     className="w-full p-3 border border-gray-300 rounded-lg"
                     value={formData.onlineLink}
                     onChange={e => setFormData({...formData, onlineLink: e.target.value})}
                   />
                 </div>
               )}
            </div>
          </Card>

          {/* Section D: Bespoke Needs */}
          <Card className="p-6 md:p-8">
            <h3 className="text-lg font-bold text-gray-900 mb-6 pb-2 border-b">Bespoke Needs</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender Preference</label>
              <select 
                className="w-full md:w-1/2 p-3 border border-gray-300 rounded-lg"
                value={formData.genderPreference}
                onChange={e => setFormData({...formData, genderPreference: e.target.value})}
              >
                <option value="None">No Preference</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
              <textarea 
                className="w-full p-3 border border-gray-300 rounded-lg h-32"
                placeholder="Specific dialect, arrival instructions, sensitivity..."
                value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
              />
            </div>
          </Card>

          {/* Terms */}
          <div className="bg-white p-6 rounded-xl border border-gray-200">
             <label className="flex items-start cursor-pointer">
               <input 
                 type="checkbox" required
                 className="mt-1 w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                 checked={formData.agreedToTerms}
                 onChange={e => setFormData({...formData, agreedToTerms: e.target.checked})}
               />
               <span className="ml-3 text-sm text-gray-700">
                 I have read and agree to the <a href="#" className="text-blue-600 underline">Terms and Conditions of Service</a>. 
                 I understand that submitting this form constitutes a formal booking request.
               </span>
             </label>
          </div>

          <div className="flex justify-center pb-12">
            <Button 
              type="submit" 
              size="lg" 
              isLoading={loading}
              className="w-full md:w-auto px-12 py-4 text-lg shadow-lg shadow-blue-200"
            >
              Submit Booking Request <ArrowRight size={20} className="ml-2" />
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
};
