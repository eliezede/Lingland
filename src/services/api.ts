
import { 
  collection, getDocs, getDoc, doc, addDoc, updateDoc, deleteDoc, 
  query, where, orderBy, setDoc 
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { 
  Booking, BookingStatus, Client, Interpreter, User, 
  BookingAssignment, AssignmentStatus, Timesheet, 
  ClientInvoice, InterpreterInvoice, InvoiceStatus, UserRole, SystemSettings, GuestContact 
} from '../types';
import { 
  MOCK_CLIENTS, MOCK_INTERPRETERS, MOCK_BOOKINGS, MOCK_USERS, 
  MOCK_TIMESHEETS, MOCK_CLIENT_INVOICES, MOCK_INTERPRETER_INVOICES, 
  MOCK_SETTINGS, saveMockData 
} from './mockData';

// === HELPERS ===

const convertDoc = <T>(doc: any): T => {
  return { id: doc.id, ...doc.data() } as T;
};

// Helper to fallback to mock data if Firestore fails
const safeFetch = async <T>(operation: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    if (error?.message && error.message.includes('offline')) {
      console.log("App is offline, using mock data fallback.");
    } else {
      console.warn("Firestore operation failed, using fallback data:", error);
    }
    return fallback;
  }
};

// === SYSTEM SERVICES ===

export const SystemService = {
  checkConnection: async (): Promise<boolean> => {
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1500));
      const check = getDoc(doc(db, 'system', 'ping'));
      await Promise.race([check, timeout]);
      return true;
    } catch (error) {
      return false;
    }
  },

  seedDatabase: async () => {
    console.log("Starting Database Seed...");
    try {
      for (const client of MOCK_CLIENTS) await setDoc(doc(db, 'clients', client.id), client);
      for (const interpreter of MOCK_INTERPRETERS) await setDoc(doc(db, 'interpreters', interpreter.id), interpreter);
      for (const booking of MOCK_BOOKINGS) await setDoc(doc(db, 'bookings', booking.id), booking);
      for (const user of MOCK_USERS) await setDoc(doc(db, 'users', user.id), user);
      await setDoc(doc(db, 'system', 'settings'), MOCK_SETTINGS);
      return true;
    } catch (e) {
      console.error("Seeding failed:", e);
      throw e;
    }
  },

  getSettings: async (): Promise<SystemSettings> => {
    return safeFetch(async () => {
      const snap = await getDoc(doc(db, 'system', 'settings'));
      return snap.exists() ? snap.data() as SystemSettings : MOCK_SETTINGS;
    }, MOCK_SETTINGS);
  },

  updateSettings: async (settings: Partial<SystemSettings>) => {
    try {
      await setDoc(doc(db, 'system', 'settings'), settings, { merge: true });
      Object.assign(MOCK_SETTINGS, settings);
      saveMockData();
    } catch (e) {
      console.log("Update settings offline");
      Object.assign(MOCK_SETTINGS, settings);
      saveMockData();
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
    try {
      const ref = await addDoc(collection(db, 'users'), data);
      return { id: ref.id, ...data };
    } catch (e) { 
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
      // Default / calculated fields
      expectedEndTime: new Date(new Date(`2000-01-01T${input.startTime}`).getTime() + input.durationMinutes * 60000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})
    };

    MOCK_BOOKINGS.push(newBooking);
    saveMockData();
    // Simulate Firestore add if we were online
    try { await addDoc(collection(db, 'bookings'), newBooking); } catch (e) {}
    
    return newBooking;
  },

  linkClientToBooking: async (bookingId: string, clientId: string): Promise<void> => {
    try {
      // Get client name
      const client = MOCK_CLIENTS.find(c => c.id === clientId);
      const clientName = client ? client.companyName : 'Unknown';

      // Update Firestore
      await updateDoc(doc(db, 'bookings', bookingId), { clientId, clientName });
      
      // Update Mock
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

  // ... Assignment methods ...
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
      // Mock implementation
      return []; 
  },
  
  acceptAssignment: async (id: string) => {},
  declineAssignment: async (id: string) => {},
  acceptOffer: async (id: string) => {},
  declineOffer: async (id: string) => {},
  findInterpretersByLanguage: async (lang: string) => MOCK_INTERPRETERS.filter(i => i.languages.includes(lang)),
  getAssignmentsByBookingId: async (id: string) => [],
  createAssignment: async (bid: string, iid: string) => ({} as any),
  assignInterpreterToBooking: async (bid: string, iid: string) => {}
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
      const newClient = { id: `c-${Date.now()}`, ...data } as Client;
      MOCK_CLIENTS.push(newClient);
      saveMockData();
      return newClient;
    }
  },

  update: async (id: string, data: Partial<Client>): Promise<Client | null> => {
    try {
      await updateDoc(doc(db, 'clients', id), data);
      return { id, ...data } as Client;
    } catch {
      const idx = MOCK_CLIENTS.findIndex(c => c.id === id);
      if(idx >= 0) {
          MOCK_CLIENTS[idx] = { ...MOCK_CLIENTS[idx], ...data };
          saveMockData();
      }
      return { id, ...data } as Client;
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'clients', id));
    } catch (e) {
      const idx = MOCK_CLIENTS.findIndex(c => c.id === id);
      if(idx >= 0) { MOCK_CLIENTS.splice(idx, 1); saveMockData(); }
    }
  },

  createClientFromGuest: async (guest: GuestContact): Promise<Client> => {
    const newClient: Client = {
      id: `c-${Date.now()}`,
      companyName: guest.organisation || guest.name,
      contactPerson: guest.name,
      email: guest.email,
      billingAddress: 'Address Pending Update',
      paymentTermsDays: 30,
      defaultCostCodeType: 'PO'
    };
    
    MOCK_CLIENTS.push(newClient);
    saveMockData();
    // Try to sync with Firestore
    try { await setDoc(doc(db, 'clients', newClient.id), newClient); } catch(e) {}
    
    return newClient;
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
    } catch (e) { 
        const i = MOCK_INTERPRETERS.find(inter => inter.id === id);
        if(i) Object.assign(i, data);
        saveMockData();
    }
  },

  create: async (data: Omit<Interpreter, 'id'>): Promise<Interpreter> => {
    try {
      const ref = await addDoc(collection(db, 'interpreters'), { ...data, status: 'ONBOARDING' });
      return { id: ref.id, ...data, status: 'ONBOARDING' } as Interpreter;
    } catch {
      const newInt = { id: `mock-${Date.now()}`, ...data, status: 'ONBOARDING' } as Interpreter;
      MOCK_INTERPRETERS.push(newInt);
      saveMockData();
      return newInt;
    }
  }
};

export const BillingService = {
  getAllTimesheets: async () => MOCK_TIMESHEETS,
  getInterpreterTimesheets: async () => [],
  getUninvoicedTimesheetsForInterpreter: async () => [],
  submitTimesheet: async () => ({} as any),
  approveTimesheet: async () => {},
  getClientInvoices: async () => MOCK_CLIENT_INVOICES,
  getClientInvoiceById: async () => undefined,
  generateClientInvoice: async () => ({} as any),
  getInterpreterInvoices: async () => MOCK_INTERPRETER_INVOICES,
  getInterpreterInvoiceById: async () => undefined,
  updateClientInvoiceStatus: async () => {},
  updateInterpreterInvoiceStatus: async () => {},
  createInterpreterInvoiceUpload: async () => ({} as any)
};
