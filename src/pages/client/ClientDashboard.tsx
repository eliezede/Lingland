
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useClientBookings, useClientInvoices } from '../../hooks/useClientHooks';
import { CalendarDays, PlusCircle, AlertCircle, Clock, CheckCircle2, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Booking, BookingStatus, InvoiceStatus } from '../../types';
import { BillingService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useClientPortal } from '../../context/ClientPortalContext';
import { ClientPortalService } from '../../services/clientPortalService';

export const ClientDashboard = () => {
  const { user } = useAuth();
  const { access, loading: accessLoading } = useClientPortal();
  const linkedClientId = user?.clientId || user?.profileId;
  const canViewBookings = Boolean(access?.canViewBookings);
  const canReadFinance = Boolean(access?.canReadFinance);
  const { bookings, loading: bookingsLoading, refresh: refreshBookings } = useClientBookings(canViewBookings ? linkedClientId : undefined);
  const { invoices, loading: invoicesLoading } = useClientInvoices(canReadFinance ? linkedClientId : undefined);

  const [stats, setStats] = useState({
    upcoming: 0,
    completed: 0,
    unpaidInvoices: 0,
    unpaidAmount: 0
  });

  const { showToast } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [estimatedCosts, setEstimatedCosts] = useState<Record<string, number>>({});
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const getBookingStart = (booking: Booking) => new Date(`${booking.date}T${booking.startTime || '00:00'}`);

  useEffect(() => {
    const scanHistory = async () => {
      if (!user?.email || !linkedClientId || !access?.legacyFallback) return;
      setIsScanning(true);
      try {
        const result = await ClientPortalService.linkLegacyBookings();
        if (result.linked > 0) {
          refreshBookings();
          showToast(`Found and linked ${result.linked} previous guest bookings to your profile!`, 'success');
        }
      } catch (e) {
        console.error("History scan failed", e);
      } finally {
        setIsScanning(false);
      }
    };

    scanHistory();
  }, [access?.legacyFallback, linkedClientId, refreshBookings, showToast, user?.email]);

  useEffect(() => {
    if (!accessLoading && (!canViewBookings || !bookingsLoading) && (!canReadFinance || !invoicesLoading)) {
      const upcoming = bookings.filter(b => getBookingStart(b) >= todayStart && b.status !== BookingStatus.CANCELLED).length;
      const completed = bookings.filter(b => [BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICED, BookingStatus.PAID].includes(b.status)).length;
      const unpaidInv = invoices.filter(i => [InvoiceStatus.SENT, InvoiceStatus.APPROVED].includes(i.status));

      setStats({
        upcoming,
        completed,
        unpaidInvoices: unpaidInv.length,
        unpaidAmount: unpaidInv.reduce((acc, curr) => acc + curr.totalAmount, 0)
      });

      // Calculate estimated costs for completed bookings without invoices synchronously
      const completedWithoutInvoices = canReadFinance ? bookings.filter(b =>
        [BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICED, BookingStatus.PAID].includes(b.status) &&
        !invoices.some(inv => inv.items?.some((item: any) => item.bookingId === b.id))
      ) : [];

      if (completedWithoutInvoices.length > 0) {
        const newEstimatedCosts: Record<string, number> = {};
        completedWithoutInvoices.forEach(b => {
          newEstimatedCosts[b.id] = BillingService.calculateBookingTotalSync(b);
        });
        setEstimatedCosts(prev => ({ ...prev, ...newEstimatedCosts }));
      }
    }
  }, [accessLoading, bookings, bookingsLoading, canReadFinance, canViewBookings, invoices, invoicesLoading]);

  // Get next 3 upcoming bookings
  const nextBookings = bookings
    .filter(b => getBookingStart(b) >= todayStart && b.status !== BookingStatus.CANCELLED)
    .sort((a, b) => getBookingStart(a).getTime() - getBookingStart(b).getTime())
    .slice(0, 3);

  if (accessLoading || (canViewBookings && bookingsLoading) || (canReadFinance && invoicesLoading)) {
    return <div className="p-8">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Dashboard</h1>
          <p className="text-gray-500">Welcome back, {user?.displayName}</p>
        </div>
        {access?.canRequest && (
          <Link to="/client/new-booking" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center">
            <PlusCircle size={18} className="mr-2" /> New Booking
          </Link>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {canViewBookings && (
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
        )}

        {canReadFinance && (
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
        )}

        {canViewBookings && (
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
        )}
      </div>

      {/* Upcoming Bookings Preview */}
      {canViewBookings && (
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
                      ${booking.status === BookingStatus.BOOKED ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {booking.status}
                  </span>
                  {canReadFinance && [BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICED, BookingStatus.PAID].includes(booking.status) && estimatedCosts[booking.id] && (
                    <div className="mt-1 text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                      Est. Billing: £{estimatedCosts[booking.id].toFixed(2)}
                    </div>
                  )}
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
      )}

      {!canViewBookings && canReadFinance && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Finance workspace</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review published invoices and outstanding balances for your organisation.</p>
          </div>
          <Link to="/client/invoices" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            Open invoices
          </Link>
        </div>
      )}
    </div>
  );
};
