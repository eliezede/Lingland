
import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useClientBookings } from '../../../hooks/useClientHooks';
import { StatusBadge } from '../../../components/StatusBadge';
import { Search, Clock, MapPin, Video, FileText, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ServiceType } from '../../../types';
import { useClientPortal } from '../../../context/ClientPortalContext';

export const ClientBookingsList = () => {
  const { user } = useAuth();
  const { access } = useClientPortal();
  const { bookings, loading } = useClientBookings(user?.clientId || user?.profileId);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [serviceFilter, setServiceFilter] = useState('ALL');
  const accessLevel = access?.membership?.accessLevel || (access?.legacyFallback ? 'LEGACY' : 'AGENT');

  const scopeTitle = accessLevel === 'CLIENT_MASTER'
    ? 'Organisation Bookings'
    : accessLevel === 'DEPARTMENT_MANAGER'
      ? 'Department Bookings'
      : 'My Bookings';
  const scopeDescription = accessLevel === 'CLIENT_MASTER'
    ? 'All requests across your organisation.'
    : accessLevel === 'DEPARTMENT_MANAGER'
      ? `Requests for ${access?.departments.map(department => department.name).join(', ') || 'your departments'}.`
      : 'Requests submitted through your account.';
  const statuses = Array.from(new Set(bookings.map(booking => booking.status).filter(Boolean))).sort();
  const search = filter.trim().toLowerCase();

  const filteredBookings = bookings.filter(b => (
    statusFilter === 'ALL' || b.status === statusFilter
  )).filter(b => (
    serviceFilter === 'ALL'
    || (serviceFilter === 'TRANSLATION' && b.serviceType === ServiceType.TRANSLATION)
    || (serviceFilter === 'INTERPRETING' && b.serviceType !== ServiceType.TRANSLATION)
  )).filter(b => (
      (b.languageTo || '').toLowerCase().includes(search) ||
      (b.languageFrom || '').toLowerCase().includes(search) ||
      (b.status || '').toLowerCase().includes(search) ||
      (b.bookingRef || '').toLowerCase().includes(search) ||
      (b.costCode || '').toLowerCase().includes(search)
    ));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{scopeTitle}</h1>
          <p className="text-gray-500 text-sm dark:text-slate-400">{scopeDescription}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {access?.canRequest && (
            <Link to="/client/new-booking" className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <Plus size={17} className="mr-1.5" /> New request
            </Link>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search language, ref, status..." 
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-full md:w-64"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
          <select value={serviceFilter} onChange={event => setServiceFilter(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <option value="ALL">All services</option>
            <option value="INTERPRETING">Interpreting</option>
            <option value="TRANSLATION">Translation</option>
          </select>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <option value="ALL">All statuses</option>
            {statuses.map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading bookings...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Language</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ref / Cost Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredBookings.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-500">No bookings found matching your search.</td></tr>
                )}
                {filteredBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {booking.date}
                      {booking.serviceType !== ServiceType.TRANSLATION && (
                        <div className="flex items-center text-xs text-gray-500 font-normal mt-0.5">
                          <Clock size={12} className="mr-1" />
                          {booking.startTime} ({booking.durationMinutes}m)
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                        {booking.languageFrom} &rarr; {booking.languageTo}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-600">
                         {booking.serviceType === ServiceType.TRANSLATION ? (
                           <FileText size={16} className="mr-2 text-blue-500" />
                         ) : (
                           booking.locationType === 'ONSITE' ? <MapPin size={16} className="mr-2 text-red-500" /> : <Video size={16} className="mr-2 text-blue-500" />
                         )}
                         {booking.serviceType}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="font-medium text-gray-900">{booking.bookingRef || booking.id.substring(0, 8).toUpperCase()}</div>
                      <div className="text-xs text-gray-500">{booking.costCode || 'No cost code'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={booking.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Link to={`/client/bookings/${booking.id}`} className="text-blue-600 hover:text-blue-900">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
