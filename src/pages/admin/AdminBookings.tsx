import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookings } from '../../hooks/useBookings';
import { StatusBadge } from '../../components/StatusBadge';
import { Search, MapPin, Video, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { Card } from '../../components/ui/Card';
import { ClientService } from '../../services/api';

export const AdminBookings = () => {
  const { bookings = [], loading, error, refresh } = useBookings();
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    ClientService.getAll();
  }, []);

  const safe = (val: unknown) => String(val ?? "").toLowerCase();

  const filteredBookings = (bookings ?? []).filter(b => {
    const q = safe(filter);
    return (
      safe(b?.clientName).includes(q) ||
      safe(b?.status).includes(q) ||
      safe(b?.bookingRef).includes(q) ||
      safe(b?.languageTo).includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Bookings</h1>
          <p className="text-gray-500 text-sm">System-wide requests</p>
        </div>
        <Button onClick={() => navigate('/admin/bookings/new')} icon={Plus}>Create Booking</Button>
      </div>

      <Card padding="sm" className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search clients, ref or status..." 
            className="pl-10 pr-4 py-2 border-none w-full focus:ring-0 outline-none text-sm bg-transparent text-gray-900"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      </Card>

      {error && <Alert type="error" message={error} />}
      
      {loading ? (
        <div className="py-12 text-center">
          <Spinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-500">Loading bookings...</p>
        </div>
      ) : filteredBookings.length === 0 ? (
        <EmptyState 
          title="No bookings found" 
          description={filter ? "Adjust your search filters." : "No bookings in the system."}
          actionLabel={filter ? "Clear Filters" : "Refresh"}
          onAction={filter ? () => setFilter('') : refresh}
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref / Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="font-bold text-blue-600">{booking.bookingRef || 'TBD'}</div>
                      <div className="text-xs text-gray-500">{booking.date}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{booking.clientName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                       <div className="text-sm text-gray-900">{booking.languageFrom} &rarr; {booking.languageTo}</div>
                       <div className="flex items-center text-xs text-gray-500 mt-1">
                          {booking.locationType === 'ONLINE' ? <Video size={12} className="mr-1"/> : <MapPin size={12} className="mr-1"/>}
                          {booking.serviceType}
                       </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={booking.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/bookings/${booking.id}`)}>Manage</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};