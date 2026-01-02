import { 
  collection, getDocs, getDoc, doc, addDoc, updateDoc, 
  query, where, orderBy, serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Booking, BookingStatus, BookingAssignment, AssignmentStatus, Interpreter, GuestContact } from '../types';
import { MOCK_INTERPRETERS, MOCK_ASSIGNMENTS, saveMockData, MOCK_BOOKINGS } from './mockData';

const COLLECTION_NAME = 'bookings';
const ASSIGNMENTS_COLLECTION = 'assignments';

export const BookingService = {
  getAll: async (): Promise<Booking[]> => {
    try {
      const q = query(collection(db, COLLECTION_NAME), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
      return results.length > 0 ? results : MOCK_BOOKINGS;
    } catch (error) {
      return MOCK_BOOKINGS;
    }
  },
  
  getById: async (id: string): Promise<Booking | undefined> => {
    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, id));
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as Booking;
      }
      return MOCK_BOOKINGS.find(b => b.id === id);
    } catch (error) {
      return MOCK_BOOKINGS.find(b => b.id === id);
    }
  },

  create: async (bookingData: Omit<Booking, 'id' | 'status'>): Promise<Booking> => {
    const newBooking = { ...bookingData, status: BookingStatus.REQUESTED, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    try {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), newBooking);
      return { id: docRef.id, ...newBooking } as unknown as Booking;
    } catch (e) {
      const mockBooking = { id: `b-${Date.now()}`, ...newBooking, createdAt: new Date().toISOString() } as unknown as Booking;
      MOCK_BOOKINGS.push(mockBooking);
      saveMockData();
      return mockBooking;
    }
  },

  createGuestBooking: async (input: any): Promise<Booking> => {
    const bookingRef = `LL-${Math.floor(1000 + Math.random() * 9000)}`;
    const start = new Date(`2000-01-01T${input.startTime}`);
    const end = new Date(start.getTime() + input.durationMinutes * 60000);
    const expectedEndTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    const newBooking = { ...input, bookingRef, status: BookingStatus.REQUESTED, expectedEndTime, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    try {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), newBooking);
      return { id: docRef.id, ...newBooking } as unknown as Booking;
    } catch (e) {
      const mockBooking = { id: `b-g-${Date.now()}`, ...newBooking, createdAt: new Date().toISOString() } as unknown as Booking;
      MOCK_BOOKINGS.push(mockBooking);
      saveMockData();
      return mockBooking;
    }
  },

  updateStatus: async (id: string, status: BookingStatus): Promise<void> => {
    try {
      await updateDoc(doc(db, COLLECTION_NAME, id), { status, updatedAt: serverTimestamp() });
    } catch (e) {
      const b = MOCK_BOOKINGS.find(book => book.id === id);
      if (b) { b.status = status; saveMockData(); }
    }
  },

  update: async (id: string, data: Partial<Booking>): Promise<void> => {
    try {
      await updateDoc(doc(db, COLLECTION_NAME, id), { ...data, updatedAt: serverTimestamp() });
    } catch (error) {
      const b = MOCK_BOOKINGS.find(book => book.id === id);
      if (b) { Object.assign(b, data); saveMockData(); }
    }
  },

  assignInterpreterToBooking: async (bookingId: string, interpreterId: string): Promise<void> => {
    try {
      const interpreter = await getDoc(doc(db, 'interpreters', interpreterId));
      const interpreterName = interpreter.exists() ? interpreter.data().name : 'Interpreter';
      
      await updateDoc(doc(db, COLLECTION_NAME, bookingId), { 
        status: BookingStatus.CONFIRMED, 
        interpreterId: interpreterId, 
        interpreterName: interpreterName,
        updatedAt: serverTimestamp() 
      });
    } catch (e) {
      const b = MOCK_BOOKINGS.find(book => book.id === bookingId);
      const i = MOCK_INTERPRETERS.find(inter => inter.id === interpreterId);
      if (b && i) { b.status = BookingStatus.CONFIRMED; b.interpreterId = interpreterId; b.interpreterName = i.name; saveMockData(); }
    }
  },

  findInterpretersByLanguage: async (language: string): Promise<Interpreter[]> => {
    return MOCK_INTERPRETERS.filter(i => i.languages.some(l => l.toLowerCase().includes(language.toLowerCase())));
  },

  getAssignmentsByBookingId: async (bookingId: string): Promise<BookingAssignment[]> => {
    try {
      const q = query(collection(db, ASSIGNMENTS_COLLECTION), where('bookingId', '==', bookingId));
      const snap = await getDocs(q);
      const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as BookingAssignment));
      return results.length > 0 ? results : MOCK_ASSIGNMENTS.filter(a => a.bookingId === bookingId);
    } catch (error) {
      return MOCK_ASSIGNMENTS.filter(a => a.bookingId === bookingId);
    }
  },

  createAssignment: async (bookingId: string, interpreterId: string): Promise<BookingAssignment> => {
    // CRITICAL: Busca dados do booking para garantir que a oferta nasça com o snapshot
    const booking = await BookingService.getById(bookingId);
    
    const newAssignment = { 
      bookingId, 
      interpreterId, 
      status: AssignmentStatus.OFFERED, 
      offeredAt: new Date().toISOString(),
      bookingSnapshot: booking ? {
        id: booking.id,
        languageTo: booking.languageTo,
        languageFrom: booking.languageFrom,
        date: booking.date,
        startTime: booking.startTime,
        durationMinutes: booking.durationMinutes,
        locationType: booking.locationType,
        postcode: booking.postcode,
        clientName: booking.clientName,
        serviceType: booking.serviceType
      } : {}
    };

    try {
      const docRef = await addDoc(collection(db, ASSIGNMENTS_COLLECTION), newAssignment);
      await updateDoc(doc(db, COLLECTION_NAME, bookingId), { status: BookingStatus.OFFERED });
      return { id: docRef.id, ...newAssignment } as BookingAssignment;
    } catch (e) {
      const mockAssignment = { id: `a-${Date.now()}`, ...newAssignment } as BookingAssignment;
      MOCK_ASSIGNMENTS.push(mockAssignment);
      const b = MOCK_BOOKINGS.find(book => book.id === bookingId);
      if (b && b.status === BookingStatus.REQUESTED) b.status = BookingStatus.OFFERED;
      saveMockData();
      return mockAssignment;
    }
  },

  checkScheduleConflict: async (interpreterId: string, date: string, startTime: string, durationMinutes: number, excludeBookingId?: string): Promise<Booking | null> => {
    try {
      const targetStart = new Date(`${date}T${startTime}`);
      const targetEnd = new Date(targetStart.getTime() + durationMinutes * 60000);
      
      const q = query(collection(db, COLLECTION_NAME), where('interpreterId', '==', interpreterId), where('date', '==', date), where('status', '==', BookingStatus.CONFIRMED));
      const snap = await getDocs(q);
      const checkList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
      
      const list = checkList.length > 0 ? checkList : MOCK_BOOKINGS.filter(b => b.interpreterId === interpreterId && b.date === date && b.status === BookingStatus.CONFIRMED);
      
      for (const existing of list) {
        if (existing.id === excludeBookingId) continue;
        const existingStart = new Date(`${existing.date}T${existing.startTime}`);
        const existingEnd = new Date(existingStart.getTime() + (existing.durationMinutes || 60) * 60000);
        if (targetStart < existingEnd && targetEnd > existingStart) return existing;
      }
      return null;
    } catch (e) { return null; }
  },

  getInterpreterOffers: async (interpreterId: string): Promise<BookingAssignment[]> => {
    try {
      const q = query(
        collection(db, ASSIGNMENTS_COLLECTION), 
        where('interpreterId', '==', interpreterId), 
        where('status', '==', AssignmentStatus.OFFERED)
      );
      const snap = await getDocs(q);
      const assignments = snap.docs.map(d => ({ id: d.id, ...d.data() } as BookingAssignment));
      
      const results = assignments.length > 0 ? assignments : MOCK_ASSIGNMENTS.filter(a => a.interpreterId === interpreterId && a.status === AssignmentStatus.OFFERED);

      // Popula snapshots se estiverem vazios para garantir renderização dos cards
      const populated = await Promise.all(results.map(async (a) => {
        if (!a.bookingSnapshot || !a.bookingSnapshot.date) {
          const b = await BookingService.getById(a.bookingId);
          if (b) {
            a.bookingSnapshot = {
              id: b.id,
              languageTo: b.languageTo,
              languageFrom: b.languageFrom,
              date: b.date,
              startTime: b.startTime,
              durationMinutes: b.durationMinutes,
              locationType: b.locationType,
              postcode: b.postcode,
              clientName: b.clientName,
              serviceType: b.serviceType
            };
          }
        }
        return a;
      }));

      return populated;
    } catch (error) {
      return MOCK_ASSIGNMENTS.filter(a => a.interpreterId === interpreterId && a.status === AssignmentStatus.OFFERED);
    }
  },

  getInterpreterSchedule: async (interpreterId: string): Promise<Booking[]> => {
    try {
      const q = query(collection(db, COLLECTION_NAME), where('interpreterId', '==', interpreterId));
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
      return all.filter(b => [BookingStatus.CONFIRMED, BookingStatus.COMPLETED].includes(b.status)).sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      return MOCK_BOOKINGS.filter(b => b.interpreterId === interpreterId && (b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.COMPLETED));
    }
  },
  
  acceptOffer: async (assignmentId: string): Promise<void> => {
    try {
      const assignmentRef = doc(db, ASSIGNMENTS_COLLECTION, assignmentId);
      const snap = await getDoc(assignmentRef);
      if (snap.exists()) {
        const data = snap.data() as BookingAssignment;
        
        // 1. Atualiza o Assignment
        await updateDoc(assignmentRef, { 
          status: AssignmentStatus.ACCEPTED, 
          respondedAt: new Date().toISOString() 
        });
        
        // 2. Vincula o Intérprete ao Booking e muda status para CONFIRMED
        // Buscamos o nome do intérprete para manter consistência denormalizada
        const interpreterSnap = await getDoc(doc(db, 'interpreters', data.interpreterId));
        const interpreterName = interpreterSnap.exists() ? interpreterSnap.data().name : 'Interpreter';

        await updateDoc(doc(db, COLLECTION_NAME, data.bookingId), { 
          status: BookingStatus.CONFIRMED, 
          interpreterId: data.interpreterId,
          interpreterName: interpreterName,
          updatedAt: serverTimestamp()
        });
      }
    } catch (e) {
      const a = MOCK_ASSIGNMENTS.find(assign => assign.id === assignmentId);
      if (a) {
        a.status = AssignmentStatus.ACCEPTED;
        const b = MOCK_BOOKINGS.find(book => book.id === a.bookingId);
        if (b) { 
          b.status = BookingStatus.CONFIRMED; 
          b.interpreterId = a.interpreterId; 
          const int = MOCK_INTERPRETERS.find(i => i.id === a.interpreterId);
          if (int) b.interpreterName = int.name;
        }
        saveMockData();
      }
    }
  },

  declineOffer: async (assignmentId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, ASSIGNMENTS_COLLECTION, assignmentId), { status: AssignmentStatus.DECLINED, respondedAt: new Date().toISOString() });
    } catch (e) {
      const a = MOCK_ASSIGNMENTS.find(assign => assign.id === assignmentId);
      if (a) { a.status = AssignmentStatus.DECLINED; saveMockData(); }
    }
  },

  linkClientToBooking: async (bookingId: string, clientId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, COLLECTION_NAME, bookingId), { clientId, updatedAt: serverTimestamp() });
    } catch (e) {
      const b = MOCK_BOOKINGS.find(book => book.id === bookingId);
      if (b) { b.clientId = clientId; saveMockData(); }
    }
  }
};