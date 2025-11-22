
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useClientBookings, useClientInvoices } from '../../hooks/useClientHooks';
import { CalendarDays, PlusCircle, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BookingStatus } from '../../types';

export const ClientDashboard = () => {
  const { user } = useAuth();
  const { bookings, loading: bookingsLoading } = useClientBookings(user?.profileId);
  const { invoices, loading: invoicesLoading } = useClientInvoices(user?.profileId);
  
  const [stats, setStats] = useState({
    upcoming: 0,
    completed: 0,
    unpaidInvoices: 0,
    unpaidAmount: 0
  });

  useEffect(() => {
    if (!bookingsLoading && !invoicesLoading) {
      const upcoming = bookings.filter(b => new Date(b.date) >= new Date() && b.status !== BookingStatus.CANCELLED).length;
      const completed = bookings.filter(b => b.status === BookingStatus.COMPLETED).length;
      const unpaidInv = invoices.filter(i => i.status !== 'PAID');
      
      setStats({
        upcoming,
        completed,
        unpaidInvoices: unpaidInv.length,
        unpaidAmount: unpaidInv.reduce((acc, curr) => acc + curr.totalAmount, 0)
      });
    }
  }, [bookings, invoices, bookingsLoading, invoicesLoading]);

  // Get next 3 upcoming bookings
  const nextBookings = bookings
    .filter(b => new Date(b.date) >= new Date() && b.status !== BookingStatus.CANCELLED)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

  if (bookingsLoading) return <div className="p-8">Loading dashboard...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
           <h1 className="text-2xl font-bold text-gray-900">Client Dashboard</h1>
           <p className="text-gray-500">Welcome back, {user?.displayName}</p>
        </div>
        <Link to="/client/new-booking" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center">
          <PlusCircle size={18} className="mr-2" /> New Booking
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Upcoming Bookings</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{stats.upcoming}</h3>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
              <CalendarDays size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Unpaid Invoices</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{stats.unpaidInvoices}</h3>
              <p className="text-xs text-red-500 font-medium">£{stats.unpaidAmount.toFixed(2)} due</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg text-red-600">
              <AlertCircle size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Completed Jobs</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{stats.completed}</h3>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-green-600">
              <CheckCircle2 size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Bookings Preview */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">Upcoming Bookings</h2>
          <Link to="/client/bookings" className="text-sm text-blue-600 hover:text-blue-800">View All</Link>
        </div>
        <div className="divide-y divide-gray-200">
          {nextBookings.length === 0 && (
            <div className="p-6 text-center text-gray-500">No upcoming bookings.</div>
          )}
          {nextBookings.map(booking => (
            <div key={booking.id} className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex justify-between items-center">
                 <div className="flex items-start space-x-4">
                   <div className="bg-blue-100 p-3 rounded-lg text-blue-600">
                     <CalendarDays size={20} />
                   </div>
                   <div>
                     <p className="font-bold text-gray-900">{booking.languageTo} Interpreting</p>
                     <p className="text-sm text-gray-500">{new Date(booking.date).toLocaleDateString()} • {booking.startTime}</p>
                     <div className="mt-1 flex items-center text-xs text-gray-500">
                       <span className="bg-gray-100 px-2 py-0.5 rounded mr-2">{booking.serviceType}</span>
                       <span>{booking.locationType === 'ONLINE' ? 'Remote' : booking.postcode}</span>
                     </div>
                   </div>
                 </div>
                 <div className="text-right">
                   <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium 
                     ${booking.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                     {booking.status}
                   </span>
                   <div className="mt-2">
                     <Link to={`/client/bookings/${booking.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                       Details &rarr;
                     </Link>
                   </div>
                 </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
