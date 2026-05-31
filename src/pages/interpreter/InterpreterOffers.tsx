
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { MapPin, Clock, Calendar, CheckCircle, XCircle } from 'lucide-react';
import { useInterpreterJobOffers } from '../../hooks/useInterpreterJobOffers';
import { Spinner } from '../../components/ui/Spinner';

export const InterpreterOffers = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [processing, setProcessing] = useState<string | null>(null);
  
  const { offers, loading, acceptOffer, declineOffer } = useInterpreterJobOffers(user?.profileId);

  const handleAccept = async (offer: any) => {
    setProcessing(offer.id);
    try {
      const success = await acceptOffer(offer.id, offer._isDirect, offer._assignmentId);
      if (success) {
        showToast("Job Accepted! Waiting for admin final confirmation.", "success");
      } else {
        showToast("Failed to accept offer", "error");
      }
    } finally {
      setProcessing(null);
    }
  };

  const handleDecline = async (offer: any) => {
    setProcessing(offer.id);
    try {
      const success = await declineOffer(offer.id, offer._isDirect, offer._assignmentId);
      if (success) {
        showToast("Job offer declined", "info");
      } else {
        showToast("Failed to decline offer", "error");
      }
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><Spinner /></div>;
  }

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
            <div
              key={offer.id}
              className="bg-white rounded-xl shadow-sm border border-blue-100 p-6 relative overflow-hidden cursor-pointer transition hover:border-blue-300 hover:shadow-md"
              onClick={() => navigate(`/interpreter/jobs/${offer.id}`, {
                state: { returnTo: '/interpreter/offers', returnLabel: 'Job Offers' }
              })}
            >
              <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs px-3 py-1 rounded-bl-lg font-bold">
                {offer._isDirect ? 'DIRECT OFFER' : 'NEW OFFER'}
              </div>

              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                  {offer.languageTo || offer.bookingSnapshot?.languageTo} Interpreting
                </h3>
                <p className="text-sm text-gray-500 uppercase tracking-wide font-semibold mt-1">
                  {offer.locationType || offer.bookingSnapshot?.locationType}
                </p>
              </div>

              <div className="space-y-3 text-sm text-gray-600 mb-6">
                <div className="flex items-center">
                  <Calendar size={16} className="mr-2 text-blue-600" />
                  {offer.date || offer.bookingSnapshot?.date}
                </div>
                <div className="flex items-center">
                  <Clock size={16} className="mr-2 text-blue-600" />
                  {offer.startTime || offer.bookingSnapshot?.startTime}
                </div>
                {(offer.locationType === 'ONSITE' || offer.bookingSnapshot?.locationType === 'ONSITE') && (
                  <div className="flex items-center">
                    <MapPin size={16} className="mr-2 text-blue-600" />
                    {offer.postcode || offer.bookingSnapshot?.postcode}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  disabled={processing === offer.id}
                  onClick={(e) => { e.stopPropagation(); handleDecline(offer); }}
                  className="flex items-center justify-center py-2 px-4 border border-red-200 text-red-700 rounded-lg hover:bg-red-50 font-medium transition-colors disabled:opacity-50"
                >
                  <XCircle size={18} className="mr-2" />
                  Decline
                </button>
                <button
                  disabled={processing === offer.id}
                  onClick={(e) => { e.stopPropagation(); handleAccept(offer); }}
                  className="flex items-center justify-center py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                  {processing === offer.id ? <Spinner size="sm" /> : <CheckCircle size={18} className="mr-2" />}
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
