
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookings } from '../../hooks/useBookings';
import { StatusBadge } from '../../components/StatusBadge';
import { Search, Filter, MapPin, Video, User } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { Card } from '../../components/ui/Card';

export const AdminBookings = () => {
  const { bookings, loading, error, refresh } = useBookings();
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();

  const filteredBookings = bookings.filter(b => 
    b.clientName.toLowerCase().includes(filter.toLowerCase()) ||
    b.status.toLowerCase().includes(filter.toLowerCase()) ||
    (b.bookingRef && b.bookingRef.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Bookings</h1>
          <p className="text-gray-500 text-sm">Manage system-wide requests</p>
        </div>
        <Button onClick={() => alert('Feature coming soon')}>
          + Create Booking
        </Button>
      </div>

      {/* Filters */}
      <Card padding="sm" className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search clients, ref (e.g. LL-123) or status..." 
            className="pl-10 pr-4 py-2 border-none w-full focus:ring-0 outline-none text-sm"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <div className="border-l border-gray-200 pl-4">
           <Button variant="ghost" size="sm" icon={Filter}>Filters</Button>
        </div>
      </Card>

      {/* Content */}
      {error && <Alert type="error" message={error} />}
      
      {loading ? (
        <div className="py-12 text-center">
          <Spinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-500">Loading bookings...</p>
        </div>
      ) : filteredBookings.length === 0 ? (
        <EmptyState 
          title="No bookings found" 
          description={filter ? "Try adjusting your search filters." : "There are no bookings in the system yet."}
          actionLabel={filter ? "Clear Filters" : "Refresh"}
          onAction={filter ? () => setFilter('') : refresh}
        />
      ) : (
        <Card padding="none">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref / Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredBookings.map((booking) => (
                <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="font-bold text-blue-600">{booking.bookingRef || '---'}</div>
                    <div className="font-medium mt-1">{new Date(booking.date).toLocaleDateString()}</div>
                    <div className="text-gray-500 text-xs">{booking.startTime}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {booking.clientName}
                      {!booking.clientId && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-800">
                          Guest
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{booking.costCode || 'No Ref'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                     <div className="text-sm text-gray-900">{booking.languageFrom} &rarr; {booking.languageTo}</div>
                     <div className="flex items-center text-xs text-gray-500 mt-1">
                        {booking.locationType === 'ONLINE' ? <Video size={12} className="mr-1"/> : <MapPin size={12} className="mr-1"/>}
                        {booking.serviceType}
                     </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {booking.interpreterName ? (
                      <span className="text-blue-600 font-medium flex items-center">
                        <User size={12} className="mr-1" />
                        {booking.interpreterName}
                      </span>
                    ) : (
                      <span className="text-gray-400 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={booking.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => navigate(`/admin/bookings/${booking.id}`)}
                    >
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};
