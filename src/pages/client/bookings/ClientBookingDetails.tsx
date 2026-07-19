import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useClientBookingById } from '../../../hooks/useClientHooks';
import { ChevronLeft, Calendar, Clock, MapPin, Video, FileText, User } from 'lucide-react';
import { StatusBadge } from '../../../components/StatusBadge';
import { ServiceType } from '../../../types';
import { UserAvatar } from '../../../components/ui/UserAvatar';

export const ClientBookingDetails = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { booking, loading } = useClientBookingById(user?.clientId || user?.profileId, id);
  const isTranslation = booking?.serviceType === ServiceType.TRANSLATION;
  const formatCreatedAt = (value: any) => {
    if (!value) return 'Unknown';
    const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
  };
  const getSourceFile = (file: string | { name?: string; url?: string }) => {
    const url = typeof file === 'string' ? file : file.url || '';
    const name = typeof file === 'string' ? file.split('/').pop() || 'Source file' : file.name || url.split('/').pop() || 'Source file';
    return { url, name };
  };

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
            <h1 className="text-2xl font-bold text-gray-900">Booking {booking.bookingRef || `#${booking.id.substring(0, 6).toUpperCase()}`}</h1>
            <p className="text-gray-500 text-sm">Created on {formatCreatedAt(booking.createdAt)}</p>
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
               <div className="col-span-2 md:col-span-1">
                 <p className="text-sm text-gray-500">Language</p>
                 <p className="font-medium text-gray-900">{booking.languageFrom} &rarr; {booking.languageTo}</p>
               </div>
               <div className="col-span-2 md:col-span-1">
                 <p className="text-sm text-gray-500">Service Type</p>
                 <p className="font-medium text-gray-900">{booking.serviceType}</p>
               </div>
               
               {isTranslation ? (
                 <>
                   <div className="col-span-2 md:col-span-1">
                     <p className="text-sm text-gray-500">Delivery Format</p>
                     <p className="font-medium text-gray-900">{booking.translationFormat === 'Other' ? booking.translationFormatOther : booking.translationFormat}</p>
                   </div>
                   <div className="col-span-2 md:col-span-1">
                     <p className="text-sm text-gray-500">Delivery Email</p>
                     <p className="font-medium text-gray-900">{booking.deliveryEmail || 'N/A'}</p>
                   </div>
                   {booking.quoteRequested && (
                     <div className="col-span-2">
                       <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Quote Requested</p>
                       <p className="text-sm font-medium text-amber-700">You have requested a quote before proceeding with this translation.</p>
                     </div>
                   )}
                 </>
               ) : (
                 <>
                   <div>
                     <p className="text-sm text-gray-500">Case Type</p>
                     <p className="font-medium text-gray-900">{booking.caseType || 'General'}</p>
                   </div>
                   <div>
                     <p className="text-sm text-gray-500">Gender Preference</p>
                     <p className="font-medium text-gray-900">{booking.genderPreference || 'None'}</p>
                   </div>
                 </>
               )}
             </div>

             {booking.notes && (
               <div className="bg-gray-50 p-4 rounded-lg">
                 <h4 className="text-sm font-bold text-gray-700 mb-2">Notes</h4>
                 <p className="text-sm text-gray-600">{booking.notes}</p>
               </div>
             )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
             <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">{isTranslation ? 'Delivery' : 'Date & Location'}</h3>
             <div className="space-y-4">
                <div className="flex items-center">
                  <Calendar className="text-blue-600 mr-3" size={20} />
                  <div>
                    <p className="text-sm text-gray-500">{isTranslation ? 'Target Delivery Date' : 'Event Date'}</p>
                    <p className="font-medium text-gray-900">{new Date(booking.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  </div>
                </div>
                {!isTranslation && (
                  <>
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
                  </>
                )}
             </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                <div className="col-span-2 md:col-span-1">
                  <p className="text-sm text-gray-500">Patient / Client Name</p>
                  <p className="font-medium text-gray-900">{booking.patientName || 'N/A'}</p>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <p className="text-sm text-gray-500">Professional Name</p>
                  <p className="font-medium text-gray-900">{booking.professionalName || 'N/A'}</p>
                </div>
              </div>
          </div>

          {isTranslation && booking.sourceFiles && booking.sourceFiles.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">Source Files</h3>
              <div className="space-y-3">
                {booking.sourceFiles.map((file: any, idx: number) => {
                  const sourceFile = getSourceFile(file);
                  return (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group hover:border-blue-200 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-white rounded-lg shadow-sm group-hover:bg-blue-50 transition-colors">
                          <FileText size={18} className="text-blue-600" />
                        </div>
                        <span className="text-sm font-medium text-slate-700 truncate">{sourceFile.name}</span>
                      </div>
                      {sourceFile.url && (
                        <a href={sourceFile.url} target="_blank" rel="noreferrer" className="text-xs font-black text-blue-600 uppercase tracking-widest hover:text-blue-800 transition-colors">Download</a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          {/* Assignment Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
             <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wide">Assignment</h3>
             {booking.interpreterId ? (
               <div className="flex items-center gap-3">
                  <UserAvatar 
                    name={booking.interpreterName || 'Unknown'} 
                    src={booking.interpreterPhotoUrl} 
                    size="md"
                  />
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
