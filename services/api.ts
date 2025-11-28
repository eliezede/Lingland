import { 
  collection, getDocs, getDoc, doc, addDoc, updateDoc, deleteDoc, 
  query, where, orderBy, setDoc 
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { 
  Booking, BookingStatus, Client, Interpreter, User, 
  BookingAssignment, AssignmentStatus, Timesheet, 
  ClientInvoice, InterpreterInvoice, InvoiceStatus, UserRole 
} from '../types';
import { MOCK_CLIENTS, MOCK_INTERPRETERS, MOCK_BOOKINGS, MOCK_USERS, MOCK_TIMESHEETS, MOCK_CLIENT_INVOICES, MOCK_INTERPRETER_INVOICES } from './mockData';

// === HELPERS ===

const convertDoc = <T>(doc: any): T => {
  return { id: doc.id, ...doc.data() } as T;
};

// Helper to fallback to mock data if Firestore fails
const safeFetch = async <T>(operation: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    // Suppress offline errors to keep console clean, but warn for others
    if (error?.message && error.message.includes('offline')) {
      console.log("App is offline, using mock data fallback.");
    } else {
      console.warn("Firestore operation failed, using fallback data:", error);
    }
    return fallback;
  }
};

// === SYSTEM SERVICES (Diagnostics & Seeding) ===

export const SystemService = {
  checkConnection: async (): Promise<boolean> => {
    try {
      // Short timeout for connection check
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1500));
      // Using a simple read
      const check = getDoc(doc(db, 'system', 'ping'));
      await Promise.race([check, timeout]);
      return true;
    } catch (error) {
      // This is expected if offline or not configured
      return false;
    }
  },

  seedDatabase: async () => {
    console.log("Starting Database Seed...");
    try {
      // 1. Seed Clients
      for (const client of MOCK_CLIENTS) {
        await setDoc(doc(db, 'clients', client.id), client);
      }
      console.log("Clients Seeded");

      // 2. Seed Interpreters
      for (const interpreter of MOCK_INTERPRETERS) {
        await setDoc(doc(db, 'interpreters', interpreter.id), interpreter);
      }
      console.log("Interpreters Seeded");

      // 3. Seed Bookings
      for (const booking of MOCK_BOOKINGS) {
        await setDoc(doc(db, 'bookings', booking.id), booking);
      }
      console.log("Bookings Seeded");

      // 4. Seed User Profiles
      for (const user of MOCK_USERS) {
        await setDoc(doc(db, 'users', user.id), user);
      }
      console.log("User Profiles Seeded");
      return true;
    } catch (e) {
      console.error("Seeding failed:", e);
      throw e;
    }
  }
};

// === CORE SERVICES ===

export const UserService = {
  getUserById: async (id: string): Promise<User | undefined> => {
    try {
      const docRef = doc(db, 'users', id);
      const snap = await getDoc(docRef);
      return snap.exists() ? convertDoc<User>(snap) : MOCK_USERS.find(u => u.id === id);
    } catch (e) {
      return MOCK_USERS.find(u => u.id === id);
    }
  },

  getAll: async (): Promise<User[]> => {
    return safeFetch(async () => {
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs.map(d => convertDoc<User>(d));
    }, MOCK_USERS);
  },

  update: async (id: string, data: Partial<User>) => {
    try {
      await updateDoc(doc(db, 'users', id), data);
    } catch (e) { console.log("Update user offline"); }
  },

  create: async (data: Omit<User, 'id'>) => {
    // Note: In a real app, you'd use Firebase Admin SDK to create Auth users.
    // Here we just create the Firestore profile record.
    try {
      const ref = await addDoc(collection(db, 'users'), data);
      return { id: ref.id, ...data };
    } catch (e) { 
      console.log("Create user offline"); 
      return { id: `mock-u-${Date.now()}`, ...data };
    }
  }
};

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
  
  // --- ASSIGNMENTS ---
  
  getAssignmentsForInterpreter: async (interpreterId: string): Promise<BookingAssignment[]> => {
    return safeFetch(async () => {
      const q = query(collection(db, 'assignments'), where('interpreterId', '==', interpreterId));
      const snap = await getDocs(q);
      
      const assignments = await Promise.all(snap.docs.map(async (d) => {
        const data = convertDoc<BookingAssignment>(d);
        // Try fetch booking snapshot, if fails use empty
        let bookingSnapshot = {};
        try {
           const bookingSnap = await getDoc(doc(db, 'bookings', data.bookingId));
           if(bookingSnap.exists()) bookingSnapshot = bookingSnap.data();
        } catch(e) {
           // ignore
        }
        return { ...data, bookingSnapshot } as BookingAssignment;
      }));
      return assignments;
    }, []); 
  },

  getInterpreterOffers: async (interpreterId: string): Promise<BookingAssignment[]> => {
    try {
      const assignments = await BookingService.getAssignmentsForInterpreter(interpreterId);
      return assignments.filter(a => a.status === AssignmentStatus.OFFERED);
    } catch {
      return [];
    }
  },

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
      console.log("Create booking offline mode");
      return { id: `mock-${Date.now()}`, ...newBooking } as Booking;
    }
  },
  
  updateStatus: async (id: string, status: BookingStatus): Promise<void> => {
    try {
      await updateDoc(doc(db, 'bookings', id), { status });
    } catch (e) { console.log("Update status offline"); }
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

  // --- MATCHING ---

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

export const ClientService = {
  getAll: async (): Promise<Client[]> => {
    return safeFetch(async () => {
      const snap = await getDocs(collection(db, 'clients'));
      return snap.docs.map(d => convertDoc<Client>(d));
    }, MOCK_CLIENTS);
  },
  
  getById: async (id: string) => {
    try {
      const snap = await getDoc(doc(db, 'clients', id));
      return snap.exists() ? convertDoc<Client>(snap) : MOCK_CLIENTS.find(c => c.id === id);
    } catch {
      return MOCK_CLIENTS.find(c => c.id === id);
    }
  },
  
  create: async (data: Omit<Client, 'id'>): Promise<Client> => {
    try {
      const ref = await addDoc(collection(db, 'clients'), data);
      return { id: ref.id, ...data } as Client;
    } catch {
      return { id: `mock-${Date.now()}`, ...data } as Client;
    }
  },

  update: async (id: string, data: Partial<Client>): Promise<Client | null> => {
    try {
      await updateDoc(doc(db, 'clients', id), data);
      return { id, ...data } as Client;
    } catch {
      return { id, ...data } as Client;
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'clients', id));
    } catch (e) { console.log("Delete failed offline"); }
  }
};

export const InterpreterService = {
  getAll: async (): Promise<Interpreter[]> => {
    return safeFetch(async () => {
      const snap = await getDocs(collection(db, 'interpreters'));
      return snap.docs.map(d => convertDoc<Interpreter>(d));
    }, MOCK_INTERPRETERS);
  },
  
  getById: async (id: string) => {
    try {
      const snap = await getDoc(doc(db, 'interpreters', id));
      return snap.exists() ? convertDoc<Interpreter>(snap) : MOCK_INTERPRETERS.find(i => i.id === id);
    } catch {
      return MOCK_INTERPRETERS.find(i => i.id === id);
    }
  },
  
  updateProfile: async (id: string, data: Partial<Interpreter>) => {
    try {
      await updateDoc(doc(db, 'interpreters', id), data);
    } catch (e) { console.log("Update failed offline"); }
  },

  create: async (data: Omit<Interpreter, 'id'>): Promise<Interpreter> => {
    try {
      const ref = await addDoc(collection(db, 'interpreters'), { ...data, status: 'ONBOARDING' });
      return { id: ref.id, ...data, status: 'ONBOARDING' } as Interpreter;
    } catch {
      return { id: `mock-${Date.now()}`, ...data, status: 'ONBOARDING' } as Interpreter;
    }
  }
};

// === BILLING SERVICES ===

export const BillingService = {
  getAllTimesheets: async (): Promise<Timesheet[]> => {
    return safeFetch(async () => {
      const snap = await getDocs(collection(db, 'timesheets'));
      return snap.docs.map(d => convertDoc<Timesheet>(d));
    }, MOCK_TIMESHEETS);
  },
  
  getInterpreterTimesheets: async (interpreterId: string): Promise<Timesheet[]> => {
    return safeFetch(async () => {
      const q = query(collection(db, 'timesheets'), where('interpreterId', '==', interpreterId));
      const snap = await getDocs(q);
      return snap.docs.map(d => convertDoc<Timesheet>(d));
    }, MOCK_TIMESHEETS.filter(t => t.interpreterId === interpreterId));
  },
  
  getUninvoicedTimesheetsForInterpreter: async (interpreterId: string): Promise<Timesheet[]> => {
    return safeFetch(async () => {
      const q = query(
        collection(db, 'timesheets'), 
        where('interpreterId', '==', interpreterId),
        where('adminApproved', '==', true)
      );
      const snap = await getDocs(q);
      const all = snap.docs.map(d => convertDoc<Timesheet>(d));
      return all.filter(t => !t.interpreterInvoiceId);
    }, []);
  },
  
  submitTimesheet: async (data: Partial<Timesheet>): Promise<Timesheet> => {
    const newTs = {
      ...data,
      submittedAt: new Date().toISOString(),
      adminApproved: false,
      status: 'SUBMITTED',
      readyForClientInvoice: false,
      readyForInterpreterInvoice: false,
      unitsBillableToClient: 0,
      unitsPayableToInterpreter: 0,
      clientAmountCalculated: 0,
      interpreterAmountCalculated: 0
    };
    try {
      const ref = await addDoc(collection(db, 'timesheets'), newTs);
      return { id: ref.id, ...newTs } as Timesheet;
    } catch {
      return { id: `mock-${Date.now()}`, ...newTs } as Timesheet;
    }
  },

  approveTimesheet: async (timesheetId: string): Promise<void> => {
    try {
      const tsRef = doc(db, 'timesheets', timesheetId);
      await updateDoc(tsRef, {
        adminApproved: true,
        adminApprovedAt: new Date().toISOString(),
        status: 'APPROVED',
        unitsBillableToClient: 1, 
        unitsPayableToInterpreter: 1,
        totalClientAmount: 45.00,
        totalInterpreterAmount: 25.00,
        readyForClientInvoice: true,
        readyForInterpreterInvoice: true
      });
    } catch (e) { console.log("Approve timesheet failed offline"); }
  },

  getClientInvoices: async (): Promise<ClientInvoice[]> => {
    return safeFetch(async () => {
      const snap = await getDocs(query(collection(db, 'clientInvoices'), orderBy('issueDate', 'desc')));
      return snap.docs.map(d => convertDoc<ClientInvoice>(d));
    }, MOCK_CLIENT_INVOICES);
  },

  getClientInvoiceById: async (id: string): Promise<ClientInvoice | undefined> => {
    try {
      const snap = await getDoc(doc(db, 'clientInvoices', id));
      return snap.exists() ? convertDoc<ClientInvoice>(snap) : MOCK_CLIENT_INVOICES.find(i => i.id === id);
    } catch {
      return MOCK_CLIENT_INVOICES.find(i => i.id === id);
    }
  },

  generateClientInvoice: async (clientId: string): Promise<ClientInvoice> => {
    // Mock logic
    const newInvoice = {
      clientId,
      clientName: 'Mock Client',
      invoiceNumber: `INV-${Math.floor(Math.random() * 10000)}`,
      status: InvoiceStatus.DRAFT,
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
      totalAmount: 150.00,
      currency: 'GBP',
      items: []
    };
    try {
      const ref = await addDoc(collection(db, 'clientInvoices'), newInvoice);
      return { id: ref.id, ...newInvoice } as ClientInvoice;
    } catch {
      return { id: `mock-inv-${Date.now()}`, ...newInvoice } as ClientInvoice;
    }
  },

  getInterpreterInvoices: async (interpreterId?: string): Promise<InterpreterInvoice[]> => {
    return safeFetch(async () => {
      let q;
      if (interpreterId) {
          q = query(collection(db, 'interpreterInvoices'), where('interpreterId', '==', interpreterId));
      } else {
          q = query(collection(db, 'interpreterInvoices'));
      }
      const snap = await getDocs(q);
      return snap.docs.map(d => convertDoc<InterpreterInvoice>(d));
    }, MOCK_INTERPRETER_INVOICES);
  },

  createInterpreterInvoiceUpload: async (interpreterId: string, timesheetIds: string[], refStr: string, amount: number): Promise<InterpreterInvoice> => {
    const newInvoice = {
      interpreterId,
      interpreterName: 'Unknown',
      model: 'UPLOAD',
      status: 'SUBMITTED',
      externalInvoiceReference: refStr,
      totalAmount: amount,
      issueDate: new Date().toISOString(),
      items: []
    };
    try {
      const ref = await addDoc(collection(db, 'interpreterInvoices'), newInvoice);
      timesheetIds.forEach(async (tsId) => {
        await updateDoc(doc(db, 'timesheets', tsId), { interpreterInvoiceId: ref.id });
      });
      return { id: ref.id, ...newInvoice } as InterpreterInvoice;
    } catch {
      return { id: `mock-${Date.now()}`, ...newInvoice } as InterpreterInvoice;
    }
  }
};