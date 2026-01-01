import { 
  collection, getDocs, getDoc, doc, addDoc, updateDoc, 
  query, where, orderBy, serverTimestamp, Timestamp 
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Booking, BookingStatus, BookingAssignment, AssignmentStatus, Interpreter, GuestContact } from '../types';
import { MOCK_INTERPRETERS, MOCK_ASSIGNMENTS, saveMockData, MOCK_BOOKINGS } from './mockData';

const COLLECTION_NAME = 'bookings';
/* Define the assignments collection name */
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
      console.error(`Erro ao buscar booking ${id}:`, error);
      return MOCK_BOOKINGS.find(b => b.id === id);
    }
  },

  /**
   * Cria um novo agendamento (Cliente ou Guest)
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
    
    // Calcular Expected End Time
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
      await updateDoc(docRef, { 
        status,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      const b = MOCK_BOOKINGS.find(book => book.id === id);
      if (b) {
        b.status = status;
        saveMockData();
      }
    }
  },

  /**
   * Atualiza dados de um agendamento (Edição Admin)
   */
  update: async (id: string, data: Partial<Booking>): Promise<void> => {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(docRef, { 
        ...data,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error(`Erro ao atualizar booking ${id}:`, error);
      const b = MOCK_BOOKINGS.find(book => book.id === id);
      if (b) {
        Object.assign(b, data);
        saveMockData();
      }
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
   * Busca intérpretes compatíveis por idioma
   */
  findInterpretersByLanguage: async (language: string): Promise<Interpreter[]> => {
    return MOCK_INTERPRETERS.filter(i => 
      i.languages.some(l => l.toLowerCase().includes(language.toLowerCase()))
    );
  },

  /**
   * Vincula um cliente a um agendamento (usado após criação de perfil de guest)
   */
  linkClientToBooking: async (bookingId: string, clientId: string): Promise<void> => {
    try {
      const docRef = doc(db, COLLECTION_NAME, bookingId);
      await updateDoc(docRef, { 
        clientId,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      const b = MOCK_BOOKINGS.find(book => book.id === bookingId);
      if (b) {
        b.clientId = clientId;
        saveMockData();
      }
    }
  },

  /**
   * Busca todas as ofertas/atribuições de um agendamento
   */
  getAssignmentsByBookingId: async (bookingId: string): Promise<BookingAssignment[]> => {
    try {
      const q = query(collection(db, ASSIGNMENTS_COLLECTION), where('bookingId', '==', bookingId));
      const snap = await getDocs(q);
      const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as BookingAssignment));
      if (results.length === 0) {
        return MOCK_ASSIGNMENTS.filter(a => a.bookingId === bookingId);
      }
      return results;
    } catch (error) {
      console.error("Erro ao buscar assignments:", error);
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
      
      const bookingRef = doc(db, COLLECTION_NAME, bookingId);
      const bookingSnap = await getDoc(bookingRef);
      if (bookingSnap.exists() && bookingSnap.data().status === BookingStatus.REQUESTED) {
        await updateDoc(bookingRef, { status: BookingStatus.OFFERED });
      }
      return { id: docRef.id, ...newAssignment } as BookingAssignment;
    } catch (e) {
      const mockAssignment = { id: `a-${Date.now()}`, ...newAssignment } as BookingAssignment;
      MOCK_ASSIGNMENTS.push(mockAssignment);
      const b = MOCK_BOOKINGS.find(book => book.id === bookingId);
      if (b && (b.status === BookingStatus.REQUESTED || b.status === BookingStatus.SEARCHING)) {
        b.status = BookingStatus.OFFERED;
      }
      saveMockData();
      return mockAssignment;
    }
  },

  /**
   * Verifica conflitos na agenda do intérprete
   */
  checkScheduleConflict: async (interpreterId: string, date: string, startTime: string, durationMinutes: number, excludeBookingId?: string): Promise<Booking | null> => {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('interpreterId', '==', interpreterId),
        where('date', '==', date),
        where('status', '==', BookingStatus.CONFIRMED)
      );
      
      const snap = await getDocs(q);
      const confirmedBookings = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
      const targetStart = new Date(`${date}T${startTime}`);
      const targetEnd = new Date(targetStart.getTime() + durationMinutes * 60000);

      const checkList = confirmedBookings.length > 0 ? confirmedBookings : MOCK_BOOKINGS.filter(b => b.interpreterId === interpreterId && b.date === date && b.status === BookingStatus.CONFIRMED);

      for (const existing of checkList) {
        if (existing.id === excludeBookingId) continue;
        const existingStart = new Date(`${existing.date}T${existing.startTime}`);
        const existingEnd = new Date(existingStart.getTime() + existing.durationMinutes * 60000);
        if (targetStart < existingEnd && targetEnd > existingStart) {
          return existing;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Busca ofertas pendentes para um intérprete
   */
  getInterpreterOffers: async (interpreterId: string): Promise<BookingAssignment[]> => {
    try {
      const q = query(
        collection(db, ASSIGNMENTS_COLLECTION),
        where('interpreterId', '==', interpreterId)
      );
      const snap = await getDocs(q);
      const allAssignments = snap.docs.map(d => ({ id: d.id, ...d.data() } as BookingAssignment));
      
      const filtered = allAssignments.length > 0 ? allAssignments : MOCK_ASSIGNMENTS.filter(a => a.interpreterId === interpreterId);
      const offered = filtered.filter(a => a.status === AssignmentStatus.OFFERED);

      const offersData = await Promise.all(offered.map(async (assignment) => {
        if (!assignment.bookingSnapshot || !assignment.bookingSnapshot.date) {
          const bookingDoc = await BookingService.getById(assignment.bookingId);
          if (bookingDoc) {
            assignment.bookingSnapshot = bookingDoc;
          }
        }
        return assignment;
      }));
      return offersData;
    } catch (error) {
      console.error("Error fetching interpreter offers:", error);
      return MOCK_ASSIGNMENTS.filter(a => a.interpreterId === interpreterId && a.status === AssignmentStatus.OFFERED);
    }
  },

  /**
   * Busca a agenda (jobs confirmados/completos) de um intérprete
   */
  getInterpreterSchedule: async (interpreterId: string): Promise<Booking[]> => {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('interpreterId', '==', interpreterId)
      );
      const snap = await getDocs(q);
      const allBookings = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
      
      const list = allBookings.length > 0 ? allBookings : MOCK_BOOKINGS.filter(b => b.interpreterId === interpreterId);
      
      return list
        .filter(b => [BookingStatus.CONFIRMED, BookingStatus.COMPLETED].includes(b.status))
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      console.error("Error fetching interpreter schedule:", error);
      return MOCK_BOOKINGS.filter(b => b.interpreterId === interpreterId && (b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.COMPLETED));
    }
  },
  
  acceptAssignment: async (assignmentId: string): Promise<void> => {
    try {
      const assignmentRef = doc(db, ASSIGNMENTS_COLLECTION, assignmentId);
      const assignmentSnap = await getDoc(assignmentRef);
      let bookingId = '';
      let interpreterId = '';

      if (assignmentSnap.exists()) {
        const data = assignmentSnap.data() as BookingAssignment;
        bookingId = data.bookingId;
        interpreterId = data.interpreterId;
        await updateDoc(assignmentRef, { status: AssignmentStatus.ACCEPTED, respondedAt: new Date().toISOString() });
        await updateDoc(doc(db, COLLECTION_NAME, bookingId), { status: BookingStatus.CONFIRMED, interpreterId: interpreterId });
      } else {
        const a = MOCK_ASSIGNMENTS.find(assign => assign.id === assignmentId);
        if (a) {
          a.status = AssignmentStatus.ACCEPTED;
          a.respondedAt = new Date().toISOString();
          const b = MOCK_BOOKINGS.find(book => book.id === a.bookingId);
          if (b) {
            b.status = BookingStatus.CONFIRMED;
            b.interpreterId = a.interpreterId;
          }
          saveMockData();
        }
      }
    } catch (e) { console.log("Accept assignment offline"); }
  },

  declineAssignment: async (assignmentId: string): Promise<void> => {
    console.log(`RETRACT/DECLINE Assignment: ${assignmentId}`);
    try {
      const assignmentRef = doc(db, ASSIGNMENTS_COLLECTION, assignmentId);
      const assignmentSnap = await getDoc(assignmentRef);
      
      if (assignmentSnap.exists()) {
        const assignmentData = assignmentSnap.data() as BookingAssignment;
        await updateDoc(assignmentRef, { 
          status: AssignmentStatus.DECLINED, 
          respondedAt: new Date().toISOString() 
        });
        
        // Se este for o último oferecido, voltar status do booking
        const q = query(collection(db, ASSIGNMENTS_COLLECTION), 
          where('bookingId', '==', assignmentData.bookingId),
          where('status', '==', AssignmentStatus.OFFERED)
        );
        const activeOffers = await getDocs(q);
        if (activeOffers.empty) {
          await updateDoc(doc(db, COLLECTION_NAME, assignmentData.bookingId), { status: BookingStatus.SEARCHING });
        }

        console.log("Firestore retraction successful");
      } else {
        throw new Error("Doc not found in Firestore, falling back to mock update.");
      }
    } catch (e) { 
      console.log("Decline assignment: Using mock data fallback", e); 
      const a = MOCK_ASSIGNMENTS.find(assign => assign.id === assignmentId);
      if (a) {
        a.status = AssignmentStatus.DECLINED;
        a.respondedAt = new Date().toISOString();
        
        const b = MOCK_BOOKINGS.find(book => book.id === a.bookingId);
        if (b && b.status === BookingStatus.OFFERED) {
           const hasOtherActive = MOCK_ASSIGNMENTS.some(as => as.bookingId === b.id && as.id !== a.id && as.status === AssignmentStatus.OFFERED);
           if (!hasOtherActive) {
              b.status = BookingStatus.SEARCHING;
           }
        }
        
        saveMockData();
        console.log("Mock assignment updated successfully to DECLINED.");
      }
    }
  },
  
  acceptOffer: async (id: string) => BookingService.acceptAssignment(id),
  declineOffer: async (id: string) => BookingService.declineAssignment(id)
};