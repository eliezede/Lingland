
import React from 'react';
import { MapPin, Clock, Video, ChevronRight } from 'lucide-react';
import { Booking, BookingAssignment, ServiceType } from '../types';

interface Props {
  type: 'OFFER' | 'UPCOMING';
  data: Booking | BookingAssignment;
  onAccept?: (id: string) => void;
  onDecline?: (id: string) => void;
  onClick?: () => void;
}

export const MobileJobCard: React.FC<Props> = ({ type, data, onAccept, onDecline, onClick }) => {
  // Extract generic data whether it's a Booking or Assignment
  const isAssignment = (d: any): d is BookingAssignment => (d as BookingAssignment).bookingSnapshot !== undefined;
  
  // Safely extract details. If assignment, use snapshot. If booking, use data.
  // Fallback to empty object or null handling if snapshot is missing (though types say it shouldn't be, runtime data might differ)
  const details = isAssignment(data) 
    ? (data.bookingSnapshot || {}) 
    : (data as Booking);
  
  const id = data.id;

  // Safety check: if critical data is missing, don't render broken card
  if (!details || !details.date) {
    return null;
  }

  const isRemote = details.locationType === 'ONLINE' || details.serviceType === ServiceType.VIDEO || details.serviceType === ServiceType.TELEPHONE;

  // Safe date formatting
  let dateString = 'TBD';
  try {
    dateString = new Date(details.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short'});
  } catch (e) {
    // ignore invalid date
  }

  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 relative active:bg-gray-50 transition-colors mb-4"
    >
      {/* Badge */}
      {type === 'OFFER' && (
        <div className="absolute top-0 right-0 bg-red-50 text-red-600 text-[10px] font-bold px-2 py-1 rounded-bl-lg uppercase tracking-wide">
          New Offer
        </div>
      )}
      
      {/* Header: Date & Time */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-gray-900 font-bold text-lg">
            {details.languageTo || 'Unknown'} <span className="font-normal text-gray-500 text-sm">Interpreting</span>
          </h3>
          <div className="flex items-center text-blue-600 font-medium text-sm mt-0.5">
             <Clock size={14} className="mr-1.5" />
             {dateString} • {details.startTime || 'TBD'}
          </div>
        </div>
      </div>

      {/* Location / Type */}
      <div className="flex items-center text-gray-600 text-sm mb-4">
        {isRemote ? (
          <>
            <Video size={16} className="mr-2 text-purple-500" />
            <span>Remote / Video Call</span>
          </>
        ) : (
          <>
            <MapPin size={16} className="mr-2 text-red-500" />
            <span className="truncate">{details.postcode || 'On-site'}</span>
          </>
        )}
        <span className="mx-2 text-gray-300">|</span>
        <span>{details.durationMinutes || 60} min</span>
      </div>

      {/* Actions */}
      {type === 'OFFER' ? (
        <div className="grid grid-cols-2 gap-3 mt-2">
          <button 
            onClick={(e) => { e.stopPropagation(); onDecline?.(id); }}
            className="py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Decline
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onAccept?.(id); }}
            className="py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm shadow-blue-200"
          >
            Accept
          </button>
        </div>
      ) : (
        <div className="mt-2 pt-3 border-t border-gray-50 flex justify-between items-center text-sm text-gray-500">
           <span>{details.clientName || 'Lingland Client'}</span>
           <ChevronRight size={16} />
        </div>
      )}
    </div>
  );
};
