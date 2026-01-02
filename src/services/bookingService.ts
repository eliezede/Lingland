import { 
  collection, getDocs, getDoc, doc, addDoc, updateDoc, 
  query, where, orderBy, serverTimestamp, Timestamp 
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Booking, BookingStatus, BookingAssignment, AssignmentStatus, Interpreter, GuestContact } from '../types';
import { MOCK_INTERPRETERS, MOCK_ASSIGNMENTS, saveMockData, MOCK_BOOKINGS } from './mockData';

const COLLECTION_NAME = 'bookings';
const ASSIGNMENTS_COLLECTION = 'assignments';

export const BookingService = {
  /**
   * Busca todos os agendamentos (Visão Admin)
   */
  getAll: async (): Promise<Booking[]> => {
    try {
      const q = query(collection(db, COLLECTION_NAME), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
      return results.length > 0 ? results : MOCK_BOOKINGS;
    } catch (error) {
      console.error("Erro ao buscar todos os bookings:", error);
      return MOCK_BOOKINGS;
    }
  },
  
  /**
   * Busca um agendamento específico por ID
   */
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

  /**
   * Cria um novo agendamento
   */
  create: async (bookingData: Omit<Booking, 'id' | 'status'>): Promise<Booking> => {
    const newBooking = {
      ...bookingData,
      status: BookingStatus.REQUESTED,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
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

  /**
   * Fluxo específico para agendamentos de visitantes (Guest)
   */
  createGuestBooking: async (input: any): Promise<Booking> => {
    const bookingRef = `LL-${Math.floor(1000 + Math.random() * 9000)}`;
    const start = new Date(`2000-01-01T${input.startTime}`);
    const end = new Date(start.getTime() + input.durationMinutes * 60000);
    const expectedEndTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    const newBooking = {
      ...input,
      bookingRef,
      status: BookingStatus.REQUESTED,
      expectedEndTime,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

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

  /**
   * Atualiza o status de um agendamento
   */
  updateStatus: async (id: string, status: BookingStatus): Promise<void> => {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(docRef, { status, updatedAt: serverTimestamp() });
    } catch (e) {
      const b = MOCK_BOOKINGS.find(book => book.id === id);
      if (b) { b.status = status; saveMockData(); }
    }
  },

  /**
   * Atualiza dados de um agendamento
   */
  update: async (id: string, data: Partial<Booking>): Promise<void> => {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
    } catch (error) {
      const b = MOCK_BOOKINGS.find(book => book.id === id);
      if (b) { Object.assign(b, data); saveMockData(); }
    }
  },

  /**
   * Atribui um intérprete a um agendamento
   */
  assignInterpreterToBooking: async (bookingId: string, interpreterId: string): Promise<void> => {
    try {
      const docRef = doc(db, COLLECTION_NAME, bookingId);
      await updateDoc(docRef, {
        status: BookingStatus.CONFIRMED,
        interpreterId: interpreterId,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      const b = MOCK_BOOKINGS.find(book => book.id === bookingId);
      const i = MOCK_INTERPRETERS.find(inter => inter.id === interpreterId);
      if (b && i) {
        b.status = BookingStatus.CONFIRMED;
        b.interpreterId = interpreterId;
        b.interpreterName = i.name;
        saveMockData();
      }
    }
  },

  /**
   * Busca intérpretes por idioma
   */
  findInterpretersByLanguage: async (language: string): Promise<Interpreter[]> => {
    return MOCK_INTERPRETERS.filter(i => 
      i.languages.some(l => l.toLowerCase().includes(language.toLowerCase()))
    );
  },

  /**
   * Busca todas as ofertas de um agendamento
   */
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

  /**
   * Cria uma nova oferta para um intérprete
   */
  createAssignment: async (bookingId: string, interpreterId: string): Promise<BookingAssignment> => {
    const newAssignment = {
      bookingId,
      interpreterId,
      status: AssignmentStatus.OFFERED,
      offeredAt: new Date().toISOString(),
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

  /**
   * Verifica conflitos na agenda do intérprete
   */
  checkScheduleConflict: async (interpreterId: string, date: string, startTime: string, durationMinutes: number, excludeBookingId?: string): Promise<Booking | null> => {
    try {
      const targetStart = new Date(`${date}T${startTime}`);
      const targetEnd = new Date(targetStart.getTime() + durationMinutes * 60000);
      const checkList = MOCK_BOOKINGS.filter(b => b.interpreterId === interpreterId && b.date === date && b.status === BookingStatus.CONFIRMED);
      for (const existing of checkList) {
        if (existing.id === excludeBookingId) continue;
        const existingStart = new Date(`${existing.date}T${existing.startTime}`);
        const existingEnd = new Date(existingStart.getTime() + existing.durationMinutes * 60000);
        if (targetStart < existingEnd && targetEnd > existingStart) return existing;
      }
      return null;
    } catch (e) { return null; }
  },

  /**
   * Busca ofertas pendentes para um intérprete (Dashboard e Service)
   */
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

      // Preenche os snapshots para que o Dashboard também tenha dados reais
      const populated = await Promise.all(results.map(async (a) => {
        if (!a.bookingSnapshot || !a.bookingSnapshot.date) {
          const b = await BookingService.getById(a.bookingId);
          if (b) a.bookingSnapshot = b;
        }
        return a;
      }));

      // Apenas retorna ofertas que tenham dados de agendamento válidos
      return populated.filter(a => a.bookingSnapshot && a.bookingSnapshot.date);
    } catch (error) {
      return MOCK_ASSIGNMENTS.filter(a => a.interpreterId === interpreterId && a.status === AssignmentStatus.OFFERED);
    }
  },

  /**
   * Busca a agenda de um intérprete
   */
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
  
  acceptAssignment: async (assignmentId: string): Promise<void> => {
    try {
      const assignmentRef = doc(db, ASSIGNMENTS_COLLECTION, assignmentId);
      const assignmentSnap = await getDoc(assignmentRef);
      if (assignmentSnap.exists()) {
        const data = assignmentSnap.data() as BookingAssignment;
        await updateDoc(assignmentRef, { status: AssignmentStatus.ACCEPTED, respondedAt: new Date().toISOString() });
        await updateDoc(doc(db, COLLECTION_NAME, data.bookingId), { status: BookingStatus.CONFIRMED, interpreterId: data.interpreterId });
      }
    } catch (e) {
      const a = MOCK_ASSIGNMENTS.find(assign => assign.id === assignmentId);
      if (a) {
        a.status = AssignmentStatus.ACCEPTED;
        const b = MOCK_BOOKINGS.find(book => book.id === a.bookingId);
        if (b) { b.status = BookingStatus.CONFIRMED; b.interpreterId = a.interpreterId; }
        saveMockData();
      }
    }
  },

  declineAssignment: async (assignmentId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, ASSIGNMENTS_COLLECTION, assignmentId), { status: AssignmentStatus.DECLINED, respondedAt: new Date().toISOString() });
    } catch (e) {
      const a = MOCK_ASSIGNMENTS.find(assign => assign.id === assignmentId);
      if (a) { a.status = AssignmentStatus.DECLINED; saveMockData(); }
    }
  },
  
  acceptOffer: async (id: string) => BookingService.acceptAssignment(id),
  declineOffer: async (id: string) => BookingService.declineAssignment(id),
  
  linkClientToBooking: async (bookingId: string, clientId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, COLLECTION_NAME, bookingId), { clientId, updatedAt: serverTimestamp() });
    } catch (e) {
      const b = MOCK_BOOKINGS.find(book => book.id === bookingId);
      if (b) { b.clientId = clientId; saveMockData(); }
    }
  }
};