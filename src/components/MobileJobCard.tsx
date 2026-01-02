import React from 'react';
import { MapPin, Clock, Video, ChevronRight, Loader2 } from 'lucide-react';
import { Booking, BookingAssignment, ServiceType } from '../types';

interface Props {
  type: 'OFFER' | 'UPCOMING';
  data: Booking | BookingAssignment;
  onAccept?: (id: string) => void;
  onDecline?: (id: string) => void;
  onClick?: () => void;
}

export const MobileJobCard: React.FC<Props> = ({ type, data, onAccept, onDecline, onClick }) => {
  // Helper para identificar se é um Assignment ou Booking direto
  const isAssignment = (d: any): d is BookingAssignment => 'bookingId' in d;
  
  const details = isAssignment(data) 
    ? (data.bookingSnapshot || {}) 
    : (data as Booking);
  
  const id = data.id;

  // Informações básicas com fallbacks amigáveis
  const language = details.languageTo || 'Language TBD';
  const startTime = details.startTime || '--:--';
  const duration = details.durationMinutes || 60;
  const client = details.clientName || 'Lingland Client';
  const postcode = details.postcode || 'Location TBD';

  const isRemote = details.locationType === 'ONLINE' || details.serviceType === ServiceType.VIDEO || details.serviceType === ServiceType.TELEPHONE;

  let dateString = 'Date TBD';
  if (details.date) {
    try {
      dateString = new Date(details.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short'});
    } catch (e) {
      dateString = details.date;
    }
  }

  // Verifica se o card está em estado de "dados parciais"
  const isIncomplete = !details.date || !details.languageTo;

  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-xl p-4 shadow-sm border relative active:bg-gray-50 transition-all mb-4 ${
        isIncomplete ? 'border-orange-200' : 'border-gray-100'
      }`}
    >
      {type === 'OFFER' && (
        <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-black px-2 py-1 rounded-bl-lg uppercase tracking-wider z-10">
          New Offer
        </div>
      )}
      
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-gray-900 font-bold text-lg flex items-center">
            {language} 
            {isIncomplete && <Loader2 size={14} className="ml-2 animate-spin text-orange-500" />}
            <span className="font-normal text-gray-500 text-sm ml-2">Interpreting</span>
          </h3>
          <div className="flex items-center text-blue-600 font-semibold text-sm mt-0.5">
             <Clock size={14} className="mr-1.5" />
             {dateString} • {startTime}
          </div>
        </div>
      </div>

      <div className="flex items-center text-gray-600 text-sm mb-4">
        {isRemote ? (
          <>
            <Video size={16} className="mr-2 text-purple-500" />
            <span>Remote / Online</span>
          </>
        ) : (
          <>
            <MapPin size={16} className="mr-2 text-red-500" />
            <span className="truncate">{postcode}</span>
          </>
        )}
        <span className="mx-2 text-gray-300">|</span>
        <span>{duration} min</span>
      </div>

      {isIncomplete && (
        <div className="mb-3 p-2 bg-orange-50 rounded-lg text-[10px] text-orange-700 font-medium italic border border-orange-100 flex items-center">
          <Loader2 size={10} className="mr-1.5 animate-spin" />
          Syncing full assignment details...
        </div>
      )}

      {type === 'OFFER' ? (
        <div className="grid grid-cols-2 gap-3 mt-2">
          <button 
            onClick={(e) => { e.stopPropagation(); onDecline?.(id); }}
            className="py-3 text-sm font-bold text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
          >
            Decline
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onAccept?.(id); }}
            className="py-3 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-md shadow-blue-100 transition-all active:scale-95"
          >
            Accept Job
          </button>
        </div>
      ) : (
        <div className="mt-2 pt-3 border-t border-gray-50 flex justify-between items-center text-sm text-gray-500">
           <span className="font-medium text-gray-700">{client}</span>
           <ChevronRight size={16} className="text-gray-400" />
        </div>
      )}
    </div>
  );
};