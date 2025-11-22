
import { 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import { Booking, BookingStatus, BookingAssignment, AssignmentStatus } from "../types";

export const BookingService = {
  
  // --- READS ---

  getAll: async (): Promise<Booking[]> => {
    const q = query(collection(db, "bookings"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
  },

  getById: async (id: string): Promise<Booking | null> => {
    const docRef = doc(db, "bookings", id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...docSnap.data() } as Booking;
  },

  getByClientId: async (clientId: string): Promise<Booking[]> => {
    const q = query(collection(db, "bookings"), where("clientId", "==", clientId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
  },

  getInterpreterSchedule: async (interpreterId: string): Promise<Booking[]> => {
    const q = query(collection(db, "bookings"), where("interpreterId", "==", interpreterId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
  },

  getInterpreterOffers: async (interpreterId: string): Promise<BookingAssignment[]> => {
    const q = query(
      collection(db, "assignments"), 
      where("interpreterId", "==", interpreterId),
      where("status", "==", AssignmentStatus.OFFERED)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BookingAssignment));
  },

  // --- WRITES ---

  create: async (booking: Omit<Booking, 'id' | 'status'>): Promise<Booking> => {
    const newBooking = {
      ...booking,
      status: BookingStatus.REQUESTED,
      createdAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, "bookings"), newBooking);
    return { id: docRef.id, ...newBooking } as Booking;
  },

  updateStatus: async (id: string, status: BookingStatus): Promise<void> => {
    const docRef = doc(db, "bookings", id);
    await updateDoc(docRef, { status, updatedAt: serverTimestamp() });
  },

  acceptOffer: async (assignmentId: string): Promise<void> => {
    const assignRef = doc(db, "assignments", assignmentId);
    const assignSnap = await getDoc(assignRef);
    
    if (!assignSnap.exists()) throw new Error("Assignment not found");
    const assignment = assignSnap.data() as BookingAssignment;

    // Transaction would be better here in production
    await updateDoc(assignRef, { 
      status: AssignmentStatus.ACCEPTED, 
      respondedAt: new Date().toISOString() 
    });

    const bookingRef = doc(db, "bookings", assignment.bookingId);
    await updateDoc(bookingRef, {
      status: BookingStatus.CONFIRMED,
      interpreterId: assignment.interpreterId,
      // In real app, fetch interpreter name too
      updatedAt: serverTimestamp()
    });
  },

  declineOffer: async (assignmentId: string): Promise<void> => {
    const assignRef = doc(db, "assignments", assignmentId);
    await updateDoc(assignRef, { 
      status: AssignmentStatus.DECLINED, 
      respondedAt: new Date().toISOString() 
    });
  }
};
