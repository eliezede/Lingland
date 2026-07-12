
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebaseConfig';
import { Booking } from "../types";

/**
 * Client booking gateway backed by the production booking service.
 */
export const FirestoreClientService = {
  
  createBookingRequest: async (bookingData: Omit<Booking, 'id' | 'status' | 'interpreterId' | 'interpreterName'>) => {
    const response = await httpsCallable(functions, 'submitClientBookingRequest')(bookingData);
    const result = response.data as { success: boolean; booking: Booking };
    if (!result?.success || !result.booking?.id) throw new Error('Booking request was not persisted.');
    return result.booking;
  },

  cancelBooking: async (bookingId: string) => {
    return await httpsCallable(functions, 'cancelOwnBooking')({ bookingId });
  }
};
