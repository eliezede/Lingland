
import { collection, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { BookingStatus } from '../types';
import { safeFetch } from './utils';

export const StatsService = {
  getAdminStats: async () => {
    return safeFetch(async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const [
        allBookingsCount,
        pendingRequestsCount,
        activePoolCount,
        unpaidInvoicesCount,
        claimsReviewSnapshot,
        paidInvoicesSnapshot,
        onboardingStats,
      ] = await Promise.all([
        getCountFromServer(collection(db, 'bookings')),
        getCountFromServer(query(collection(db, 'bookings'), where('status', '==', BookingStatus.INCOMING))),
        getCountFromServer(query(collection(db, 'interpreters'), where('status', 'in', ['ACTIVE', 'IMPORTED']))),
        getCountFromServer(query(collection(db, 'clientInvoices'), where('status', '==', 'SENT'))),
        getDocs(query(collection(db, 'timesheets'), where('status', '==', 'SUBMITTED'))),
        getDocs(query(collection(db, 'clientInvoices'), where('status', '==', 'PAID'))),
        StatsService.getOnboardingStats(),
      ]);

      const toDate = (value: any): Date | null => {
        if (!value) return null;
        const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
      };
      const revenue = paidInvoicesSnapshot.docs.reduce((total, invoiceDoc) => {
        const invoice = invoiceDoc.data();
        const paidAt = toDate(invoice.paidAt || invoice.paymentDate || invoice.updatedAt || invoice.issueDate);
        if (!paidAt || paidAt < monthStart || paidAt >= nextMonthStart) return total;
        return total + Number(invoice.totalAmount || invoice.total || 0);
      }, 0);

      return {
        totalBookings: allBookingsCount.data().count,
        pendingRequests: pendingRequestsCount.data().count,
        activeInterpreters: activePoolCount.data().count,
        unpaidInvoices: unpaidInvoicesCount.data().count,
        claimsReviewCount: claimsReviewSnapshot.docs.filter(timesheetDoc => {
          const timesheet = timesheetDoc.data();
          return !timesheet.adminApproved && !timesheet.clientInvoiceId;
        }).length,
        claimsReviewBookingIds: claimsReviewSnapshot.docs.filter(timesheetDoc => {
          const timesheet = timesheetDoc.data();
          return !timesheet.adminApproved && !timesheet.clientInvoiceId;
        }).map(timesheetDoc => String(timesheetDoc.data().bookingId || '')).filter(Boolean),
        revenueMonth: revenue || 0,
        ...onboardingStats
      };
    }, {
      totalBookings: 0,
      pendingRequests: 0,
      activeInterpreters: 0,
      unpaidInvoices: 0,
      claimsReviewCount: 0,
      claimsReviewBookingIds: [],
      revenueMonth: 0,
      pendingApplications: 0,
      pendingOnboardingDocs: 0,
      totalOnboarding: 0
    });
  },

  getOnboardingStats: async () => {
    return safeFetch(async () => {
      const appsSnap = await getDocs(query(collection(db, 'applications'), where('status', '==', 'PENDING')));
      const onboardingInterpsSnap = await getDocs(query(
        collection(db, 'interpreters'),
        where('status', 'in', ['ONBOARDING', 'IMPORTED', 'APPLICANT'])
      ));
      
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
        completedBookings: bookings.filter(b => [
          BookingStatus.SESSION_COMPLETED,
          BookingStatus.TIMESHEET_SUBMITTED,
          BookingStatus.TIMESHEET_VERIFIED,
          BookingStatus.READY_FOR_INVOICE,
          BookingStatus.INVOICING,
          BookingStatus.INVOICED,
          BookingStatus.PAID,
        ].includes(b.status)).length,
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
        collection(db, 'assignments'),
        where('interpreterId', '==', interpreterId),
        where('status', '==', 'OFFERED')
      ));

      return {
        totalBookings: snap.size,
        upcomingBookings: bookings.filter(b => b.status === BookingStatus.BOOKED).length,
        completedBookings: bookings.filter(b => [
          BookingStatus.SESSION_COMPLETED,
          BookingStatus.TIMESHEET_SUBMITTED,
          BookingStatus.TIMESHEET_VERIFIED,
          BookingStatus.READY_FOR_INVOICE,
          BookingStatus.INVOICING,
          BookingStatus.INVOICED,
          BookingStatus.PAID,
        ].includes(b.status)).length,
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
