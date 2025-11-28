
import { 
  collection, getDocs, getDoc, doc, addDoc, updateDoc, 
  query, where, orderBy 
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Booking, BookingStatus, BookingAssignment, AssignmentStatus, Interpreter, GuestContact } from '../types';
import { MOCK_BOOKINGS, MOCK_INTERPRETERS, MOCK_CLIENTS, saveMockData } from './mockData';
import { convertDoc, safeFetch } from './utils';

export const BookingService = {
  getAll: async (): Promise<Booking[]> => {
    return safeFetch(async () => {
      const q = query(collection(db, 'bookings'), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => convertDoc<Booking>(d));
    }, MOCK_BOOKINGS);
  },
  
  getById: async (id: string): Promise<Booking | undefined> => {
    try {
      const snap = await getDoc(doc(db, 'bookings', id));
      return snap.exists() ? convertDoc<Booking>(snap) : MOCK_BOOKINGS.find(b => b.id === id);
    } catch {
      return MOCK_BOOKINGS.find(b => b.id === id);
    }
  },

  getByClientId: async (clientId: string): Promise<Booking[]> => {
    return safeFetch(async () => {
      const q = query(collection(db, 'bookings'), where('clientId', '==', clientId));
      const snap = await getDocs(q);
      return snap.docs.map(d => convertDoc<Booking>(d));
    }, MOCK_BOOKINGS.filter(b => b.clientId === clientId));
  },

  getInterpreterSchedule: async (interpreterId: string): Promise<Booking[]> => {
    return safeFetch(async () => {
      const q = query(
        collection(db, 'bookings'), 
        where('interpreterId', '==', interpreterId),
        where('status', '!=', BookingStatus.CANCELLED)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => convertDoc<Booking>(d));
    }, MOCK_BOOKINGS.filter(b => b.interpreterId === interpreterId));
  },

  // --- CONFLICT VALIDATION ---
  
  checkScheduleConflict: async (interpreterId: string, date: string, startTime: string, durationMinutes: number, excludeBookingId?: string): Promise<Booking | null> => {
    const schedule = await BookingService.getInterpreterSchedule(interpreterId);
    
    // Parse target times
    const targetStart = new Date(`${date}T${startTime}`);
    const targetEnd = new Date(targetStart.getTime() + durationMinutes * 60000);

    for (const existing of schedule) {
      if (existing.id === excludeBookingId) continue;
      if (existing.date !== date) continue;
      if (existing.status === BookingStatus.CANCELLED) continue;

      const existingStart = new Date(`${existing.date}T${existing.startTime}`);
      const existingEnd = new Date(existingStart.getTime() + existing.durationMinutes * 60000);

      // Check overlap: StartA < EndB && EndA > StartB
      if (targetStart < existingEnd && targetEnd > existingStart) {
        return existing; // Return the conflicting booking
      }
    }
    return null; // No conflict
  },

  // --- ACTIONS ---

  create: async (booking: Omit<Booking, 'id' | 'status'>): Promise<Booking> => {
    const newBooking = {
      ...booking,
      status: BookingStatus.REQUESTED,
      createdAt: new Date().toISOString()
    };
    try {
      const ref = await addDoc(collection(db, 'bookings'), newBooking);
      return { id: ref.id, ...newBooking } as Booking;
    } catch {
      const mockBooking = { id: `mock-${Date.now()}`, ...newBooking } as Booking;
      MOCK_BOOKINGS.push(mockBooking);
      saveMockData();
      return mockBooking;
    }
  },

  createGuestBooking: async (input: {
    guestContact: GuestContact;
    date: string;
    startTime: string;
    durationMinutes: number;
    languageFrom: string;
    languageTo: string;
    serviceType: any;
    locationType: 'ONLINE' | 'ONSITE';
    address?: string;
    postcode?: string;
    onlineLink?: string;
    costCode?: string;
    notes?: string;
    caseType?: string;
    genderPreference?: any;
  }): Promise<Booking> => {
    const bookingRef = `LL-${Math.floor(1000 + Math.random() * 9000)}`;
    const newBooking: Booking = {
      id: `guest-${Date.now()}`,
      clientId: null,
      clientName: input.guestContact.organisation || input.guestContact.name,
      guestContact: input.guestContact,
      bookingRef: bookingRef,
      status: BookingStatus.REQUESTED,
      ...input,
      expectedEndTime: new Date(new Date(`2000-01-01T${input.startTime}`).getTime() + input.durationMinutes * 60000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})
    };

    MOCK_BOOKINGS.push(newBooking);
    saveMockData();
    try { await addDoc(collection(db, 'bookings'), newBooking); } catch (e) {}
    
    return newBooking;
  },

  linkClientToBooking: async (bookingId: string, clientId: string): Promise<void> => {
    try {
      const client = MOCK_CLIENTS.find(c => c.id === clientId);
      const clientName = client ? client.companyName : 'Unknown';

      await updateDoc(doc(db, 'bookings', bookingId), { clientId, clientName });
      
      const b = MOCK_BOOKINGS.find(bk => bk.id === bookingId);
      if(b) {
        b.clientId = clientId;
        b.clientName = clientName;
        saveMockData();
      }
    } catch (e) {
      console.log("Link client offline");
      const b = MOCK_BOOKINGS.find(bk => bk.id === bookingId);
      if(b) {
        const client = MOCK_CLIENTS.find(c => c.id === clientId);
        b.clientId = clientId;
        b.clientName = client ? client.companyName : 'Unknown';
        saveMockData();
      }
    }
  },
  
  updateStatus: async (id: string, status: BookingStatus): Promise<void> => {
    try {
      await updateDoc(doc(db, 'bookings', id), { status });
    } catch (e) { 
      const b = MOCK_BOOKINGS.find(bk => bk.id === id);
      if(b) { b.status = status; saveMockData(); }
    }
  },

  // --- ASSIGNMENTS & MATCHING ---

  getAssignmentsForInterpreter: async (interpreterId: string): Promise<BookingAssignment[]> => {
    return safeFetch(async () => {
        const q = query(collection(db, 'assignments'), where('interpreterId', '==', interpreterId));
        const snap = await getDocs(q);
        return Promise.all(snap.docs.map(async d => {
            const data = convertDoc<BookingAssignment>(d);
            const bSnap = await getDoc(doc(db, 'bookings', data.bookingId));
            return { ...data, bookingSnapshot: bSnap.exists() ? bSnap.data() : {} };
        }));
    }, MOCK_BOOKINGS.filter(b => b.interpreterId === interpreterId).map(b => ({
        id: `mock-assign-${b.id}`, bookingId: b.id, interpreterId: interpreterId, status: AssignmentStatus.ACCEPTED, offeredAt: new Date().toISOString(), bookingSnapshot: b
    })));
  },
  
  getInterpreterOffers: async (interpreterId: string): Promise<BookingAssignment[]> => {
    return safeFetch(async () => {
      const q = query(collection(db, 'assignments'), where('interpreterId', '==', interpreterId), where('status', '==', AssignmentStatus.OFFERED));
      const snap = await getDocs(q);
      return Promise.all(snap.docs.map(async d => {
          const data = convertDoc<BookingAssignment>(d);
          const bSnap = await getDoc(doc(db, 'bookings', data.bookingId));
          return { ...data, bookingSnapshot: bSnap.exists() ? bSnap.data() : {} };
      }));
    }, []);
  },
  
  acceptAssignment: async (assignmentId: string): Promise<void> => {
    try {
      const assignmentRef = doc(db, 'assignments', assignmentId);
      const assignmentSnap = await getDoc(assignmentRef);
      if (!assignmentSnap.exists()) return;
      const assignmentData = assignmentSnap.data() as BookingAssignment;

      await updateDoc(assignmentRef, { status: AssignmentStatus.ACCEPTED, respondedAt: new Date().toISOString() });
      await updateDoc(doc(db, 'bookings', assignmentData.bookingId), { status: BookingStatus.CONFIRMED, interpreterId: assignmentData.interpreterId });
    } catch (e) { console.log("Accept assignment offline"); }
  },

  declineAssignment: async (assignmentId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'assignments', assignmentId), { status: AssignmentStatus.DECLINED, respondedAt: new Date().toISOString() });
    } catch (e) { console.log("Decline assignment offline"); }
  },
  
  acceptOffer: async (id: string) => BookingService.acceptAssignment(id),
  declineOffer: async (id: string) => BookingService.declineAssignment(id),

  findInterpretersByLanguage: async (language: string): Promise<Interpreter[]> => {
    return safeFetch(async () => {
      const q = query(collection(db, 'interpreters'), where('status', '==', 'ACTIVE'));
      const snap = await getDocs(q);
      const all = snap.docs.map(d => convertDoc<Interpreter>(d));
      return all.filter(i => i.languages.some(l => l.toLowerCase().includes(language.toLowerCase())));
    }, MOCK_INTERPRETERS.filter(i => i.languages.includes(language)));
  },

  getAssignmentsByBookingId: async (bookingId: string): Promise<BookingAssignment[]> => {
    try {
      const q = query(collection(db, 'assignments'), where('bookingId', '==', bookingId));
      const snap = await getDocs(q);
      return snap.docs.map(d => convertDoc<BookingAssignment>(d));
    } catch {
      return [];
    }
  },

  createAssignment: async (bookingId: string, interpreterId: string): Promise<BookingAssignment> => {
    try {
      const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
      const newAssignment = {
        bookingId,
        interpreterId,
        status: AssignmentStatus.OFFERED,
        offeredAt: new Date().toISOString(),
        bookingSnapshot: bookingSnap.exists() ? bookingSnap.data() : {}
      };
      const ref = await addDoc(collection(db, 'assignments'), newAssignment);
      if (bookingSnap.exists() && bookingSnap.data().status === BookingStatus.REQUESTED) {
        await updateDoc(doc(db, 'bookings', bookingId), { status: BookingStatus.OFFERED });
      }
      return { id: ref.id, ...newAssignment } as BookingAssignment;
    } catch {
       return { id: 'mock-assign', bookingId, interpreterId, status: AssignmentStatus.OFFERED, offeredAt: new Date().toISOString() };
    }
  },

  assignInterpreterToBooking: async (bookingId: string, interpreterId: string): Promise<void> => {
    try {
      const interpreterSnap = await getDoc(doc(db, 'interpreters', interpreterId));
      if (!interpreterSnap.exists()) throw new Error("Interpreter not found");

      await updateDoc(doc(db, 'bookings', bookingId), {
        status: BookingStatus.CONFIRMED,
        interpreterId: interpreterId,
        interpreterName: interpreterSnap.data().name
      });
    } catch (e) { console.log("Assign failed offline"); }
  }
};
