
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useClientBookingById } from '../../../hooks/useClientHooks';
import { ChevronLeft, Calendar, Clock, MapPin, Video, FileText, User } from 'lucide-react';
import { StatusBadge } from '../../../components/StatusBadge';

export const ClientBookingDetails = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { booking, loading } = useClientBookingById(user?.profileId, id);

  if (loading) return <div className="p-8">Loading details...</div>;
  if (!booking) return <div className="p-8 text-red-500">Booking not found.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Link to="/client/bookings" className="mr-4 p-2 rounded-full hover:bg-gray-200 transition-colors">
            <ChevronLeft size={24} className="text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Booking #{booking.id.substring(0, 6).toUpperCase()}</h1>
            <p className="text-gray-500 text-sm">Created on {new Date().toLocaleDateString()}</p>
          </div>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
             <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">Requirement</h3>
             <div className="grid grid-cols-2 gap-4 mb-6">
               <div>
                 <p className="text-sm text-gray-500">Language</p>
                 <p className="font-medium text-gray-900">{booking.languageFrom} &rarr; {booking.languageTo}</p>
               </div>
               <div>
                 <p className="text-sm text-gray-500">Service Type</p>
                 <p className="font-medium text-gray-900">{booking.serviceType}</p>
               </div>
               <div>
                 <p className="text-sm text-gray-500">Case Type</p>
                 <p className="font-medium text-gray-900">{booking.caseType || 'General'}</p>
               </div>
               <div>
                 <p className="text-sm text-gray-500">Gender Preference</p>
                 <p className="font-medium text-gray-900">{booking.genderPreference || 'None'}</p>
               </div>
             </div>

             <div className="bg-gray-50 p-4 rounded-lg">
               <h4 className="text-sm font-bold text-gray-700 mb-2">Notes</h4>
               <p className="text-sm text-gray-600">{booking.notes || 'No special notes provided.'}</p>
             </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
             <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">Date & Location</h3>
             <div className="space-y-4">
                <div className="flex items-center">
                  <Calendar className="text-blue-600 mr-3" size={20} />
                  <div>
                    <p className="text-sm text-gray-500">Date</p>
                    <p className="font-medium text-gray-900">{new Date(booking.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <Clock className="text-blue-600 mr-3" size={20} />
                  <div>
                    <p className="text-sm text-gray-500">Time</p>
                    <p className="font-medium text-gray-900">{booking.startTime} ({booking.durationMinutes} mins)</p>
                  </div>
                </div>
                <div className="flex items-center">
                  {booking.locationType === 'ONLINE' ? <Video className="text-blue-600 mr-3" size={20}/> : <MapPin className="text-red-600 mr-3" size={20}/>}
                  <div>
                    <p className="text-sm text-gray-500">{booking.locationType === 'ONLINE' ? 'Online Link' : 'Address'}</p>
                    <p className="font-medium text-gray-900">
                      {booking.locationType === 'ONLINE' ? (booking.onlineLink || 'Pending') : `${booking.address}, ${booking.postcode}`}
                    </p>
                  </div>
                </div>
             </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          {/* Assignment Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
             <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wide">Assignment</h3>
             {booking.interpreterId ? (
               <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold mr-3">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{booking.interpreterName}</p>
                    <p className="text-xs text-green-600 font-medium">Confirmed</p>
                  </div>
               </div>
             ) : (
               <div className="text-center py-4">
                 <p className="text-sm text-gray-500">We are currently searching for the best interpreter for your request.</p>
               </div>
             )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
             <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wide">Reference</h3>
             <div>
                <p className="text-xs text-gray-500 mb-1">Cost Code</p>
                <p className="text-sm font-bold text-gray-900 bg-gray-100 p-2 rounded inline-block">
                  {booking.costCode || 'N/A'}
                </p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
