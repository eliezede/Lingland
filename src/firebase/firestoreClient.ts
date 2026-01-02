
import { BookingService } from "../services/api";
import { Booking, BookingStatus } from "../types";

/**
 * Firestore Client Service (Mock Wrapper)
 * Redirects to Mock API for demo stability.
 */
export const FirestoreClientService = {
  
  createBookingRequest: async (bookingData: Omit<Booking, 'id' | 'status' | 'interpreterId' | 'interpreterName'>) => {
    return await BookingService.create(bookingData);
  },

  cancelBooking: async (bookingId: string) => {
    return await BookingService.updateStatus(bookingId, BookingStatus.CANCELLED);
  }
};
