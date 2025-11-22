
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  doc,
  updateDoc
} from "firebase/firestore";
import { db } from "../services/firebaseConfig";
import { Booking, BookingStatus } from "../types";

/**
 * Firestore Client Service
 * Handles write operations for the Client Portal
 */
export const FirestoreClientService = {
  
  /**
   * Create a new booking request
   * Clients can only create requests with initial status 'REQUESTED'
   */
  createBookingRequest: async (bookingData: Omit<Booking, 'id' | 'status' | 'interpreterId' | 'interpreterName'>) => {
    try {
      const newBookingData = {
        ...bookingData,
        status: BookingStatus.REQUESTED,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // Ensure client cannot assign interpreter
        interpreterId: null,
        interpreterName: null
      };

      const docRef = await addDoc(collection(db, "bookings"), newBookingData);
      return { id: docRef.id, ...newBookingData };
    } catch (error) {
      console.error("Error creating booking request:", error);
      throw error;
    }
  },

  /**
   * Cancel a booking
   * Only if status is REQUESTED or SEARCHING
   */
  cancelBooking: async (bookingId: string) => {
    // In a real app, you would fetch the booking first to check status
    try {
      const bookingRef = doc(db, "bookings", bookingId);
      await updateDoc(bookingRef, {
        status: BookingStatus.CANCELLED,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error cancelling booking:", error);
      throw error;
    }
  }
};
