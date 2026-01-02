
import React, { useEffect, useState } from 'react';
import { BookingService } from '../../services/api';
import { BookingAssignment } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { MapPin, Clock, Calendar, CheckCircle, XCircle } from 'lucide-react';

export const InterpreterOffers = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [offers, setOffers] = useState<BookingAssignment[]>([]);

  useEffect(() => {
    if (user?.profileId) {
      BookingService.getInterpreterOffers(user.profileId).then(setOffers);
    }
  }, [user]);

  const handleAccept = async (id: string) => {
    await BookingService.acceptOffer(id);
    if (user?.profileId) {
      BookingService.getInterpreterOffers(user.profileId).then(setOffers);
    }
    showToast("Job Accepted successfully!", "success");
  };

  const handleDecline = async (id: string) => {
    await BookingService.declineOffer(id);
    if (user?.profileId) {
      BookingService.getInterpreterOffers(user.profileId).then(setOffers);
    }
    showToast("Job offer declined", "info");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Job Offers</h1>
      
      {offers.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">No new job offers at the moment.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {offers.map((offer) => (
            <div key={offer.id} className="bg-white rounded-xl shadow-sm border border-blue-100 p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs px-3 py-1 rounded-bl-lg font-bold">
                NEW OFFER
              </div>
              
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                  {offer.bookingSnapshot?.languageTo} Interpreting
                </h3>
                <p className="text-sm text-gray-500 uppercase tracking-wide font-semibold mt-1">
                  {offer.bookingSnapshot?.locationType}
                </p>
              </div>

              <div className="space-y-3 text-sm text-gray-600 mb-6">
                <div className="flex items-center">
                  <Calendar size={16} className="mr-2 text-blue-600" />
                  {offer.bookingSnapshot?.date}
                </div>
                <div className="flex items-center">
                  <Clock size={16} className="mr-2 text-blue-600" />
                  {offer.bookingSnapshot?.startTime}
                </div>
                {offer.bookingSnapshot?.locationType === 'ONSITE' && (
                  <div className="flex items-center">
                    <MapPin size={16} className="mr-2 text-blue-600" />
                    {offer.bookingSnapshot?.postcode}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => handleDecline(offer.id)}
                  className="flex items-center justify-center py-2 px-4 border border-red-200 text-red-700 rounded-lg hover:bg-red-50 font-medium transition-colors"
                >
                  <XCircle size={18} className="mr-2" />
                  Decline
                </button>
                <button 
                  onClick={() => handleAccept(offer.id)}
                  className="flex items-center justify-center py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors"
                >
                  <CheckCircle size={18} className="mr-2" />
                  Accept
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
