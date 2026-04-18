
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { BookingStatus } from '../types';
import { MOCK_BOOKINGS, MOCK_INTERPRETERS } from './mockData';
import { safeFetch } from './utils';

export const StatsService = {
  getAdminStats: async () => {
    return safeFetch(async () => {
      const allBookingsSnap = await getDocs(collection(db, 'bookings'));
      const bookingsSnap = await getDocs(query(collection(db, 'bookings'), where('status', '==', BookingStatus.INCOMING)));
      const interpretersSnap = await getDocs(query(collection(db, 'interpreters'), where('status', '==', 'ACTIVE')));
      const invoicesSnap = await getDocs(query(collection(db, 'clientInvoices'), where('status', '==', 'SENT')));
      
      const onboardingStats = await StatsService.getOnboardingStats();

      // Calculate revenue from confirmed/completed/paid bookings this month
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const paidBookingsSnapshot = await getDocs(query(
        collection(db, 'bookings'),
        where('status', 'in', [BookingStatus.BOOKED, BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICED, BookingStatus.PAID])
      ));

      const revenue = paidBookingsSnapshot.docs
        .map(d => d.data())
        .filter(d => d.date >= firstDay.split('T')[0])
        .reduce((acc, d) => acc + (d.totalAmount || 0), 0);

      return {
        totalBookings: allBookingsSnap.size,
        pendingRequests: bookingsSnap.size,
        activeInterpreters: interpretersSnap.size,
        unpaidInvoices: invoicesSnap.size,
        revenueMonth: revenue || 0,
        ...onboardingStats
      };
    }, {
      totalBookings: 0,
      pendingRequests: 0,
      activeInterpreters: 0,
      unpaidInvoices: 0,
      revenueMonth: 0,
      pendingApplications: 0,
      pendingOnboardingDocs: 0,
      totalOnboarding: 0
    });
  },

  getOnboardingStats: async () => {
    return safeFetch(async () => {
      const appsSnap = await getDocs(query(collection(db, 'applications'), where('status', '==', 'PENDING')));
      const onboardingInterpsSnap = await getDocs(query(collection(db, 'interpreters'), where('status', '==', 'ONBOARDING')));
      
      let pendingDocs = 0;
      onboardingInterpsSnap.forEach(doc => {
        const i = doc.data();
        const ob = i.onboarding;
        if (ob) {
          const hasPending = [ob.dbs, ob.idCheck, ob.certifications, ob.rightToWork].some(d => d?.status === 'IN_REVIEW');
          if (hasPending) pendingDocs++;
        }
      });

      return {
        pendingApplications: appsSnap.size,
        pendingOnboardingDocs: pendingDocs,
        totalOnboarding: onboardingInterpsSnap.size
      };
    }, {
      pendingApplications: 0,
      pendingOnboardingDocs: 0,
      totalOnboarding: 0
    });
  },

  getClientStats: async (clientId: string) => {
    return safeFetch(async () => {
      const q = query(collection(db, 'bookings'), where('clientId', '==', clientId));
      const snap = await getDocs(q);
      const bookings = snap.docs.map(d => d.data());

      const invoicesSnap = await getDocs(query(
        collection(db, 'clientInvoices'),
        where('clientId', '==', clientId),
        where('status', '==', 'SENT')
      ));

      return {
        totalBookings: snap.size,
        upcomingBookings: bookings.filter(b => b.status === BookingStatus.BOOKED).length,
        completedBookings: bookings.filter(b => [BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICED, BookingStatus.PAID].includes(b.status)).length,
        unpaidInvoices: invoicesSnap.size
      };
    }, {
      totalBookings: 0,
      upcomingBookings: 0,
      completedBookings: 0,
      unpaidInvoices: 0
    });
  },

  getInterpreterStats: async (interpreterId: string) => {
    return safeFetch(async () => {
      const q = query(collection(db, 'bookings'), where('interpreterId', '==', interpreterId));
      const snap = await getDocs(q);
      const bookings = snap.docs.map(d => d.data());

      const offersSnap = await getDocs(query(
        collection(db, 'bookingAssignments'),
        where('interpreterId', '==', interpreterId),
        where('status', '==', 'OFFERED')
      ));

      return {
        totalBookings: snap.size,
        upcomingBookings: bookings.filter(b => b.status === BookingStatus.BOOKED).length,
        completedBookings: bookings.filter(b => [BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICED, BookingStatus.PAID].includes(b.status)).length,
        liveOffers: offersSnap.size
      };
    }, {
      totalBookings: 0,
      upcomingBookings: 0,
      completedBookings: 0,
      liveOffers: 0
    });
  }
};
