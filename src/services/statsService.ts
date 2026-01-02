
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { BookingStatus } from '../types';
import { MOCK_BOOKINGS, MOCK_INTERPRETERS } from './mockData';
import { safeFetch } from './utils';

export const StatsService = {
  getAdminStats: async () => {
    return safeFetch(async () => {
      const bookingsSnap = await getDocs(query(collection(db, 'bookings'), where('status', '==', BookingStatus.REQUESTED)));
      const interpretersSnap = await getDocs(query(collection(db, 'interpreters'), where('status', '==', 'ACTIVE')));
      const invoicesSnap = await getDocs(query(collection(db, 'clientInvoices'), where('status', '==', 'SENT')));
      
      return {
        pendingRequests: bookingsSnap.size,
        activeInterpreters: interpretersSnap.size,
        unpaidInvoices: invoicesSnap.size,
        revenueMonth: 12500
      };
    }, {
        pendingRequests: MOCK_BOOKINGS.filter(b => b.status === BookingStatus.REQUESTED).length,
        activeInterpreters: MOCK_INTERPRETERS.length,
        unpaidInvoices: 3,
        revenueMonth: 12500
    });
  }
};
