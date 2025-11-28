
import { 
  collection, getDocs, getDoc, doc, addDoc, updateDoc, deleteDoc, 
  query, where, orderBy, setDoc 
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { 
  Booking, BookingStatus, Client, Interpreter, User, 
  BookingAssignment, AssignmentStatus, Timesheet, 
  ClientInvoice, InterpreterInvoice, InvoiceLineItem, InvoiceStatus 
} from '../types';

// === HELPERS ===

const convertDoc = <T>(doc: any): T => {
  return { id: doc.id, ...doc.data() } as T;
};

// === CORE SERVICES ===

export const UserService = {
  getUserById: async (id: string): Promise<User | undefined> => {
    const docRef = doc(db, 'users', id);
    const snap = await getDoc(docRef);
    return snap.exists() ? convertDoc<User>(snap) : undefined;
  }
};

export const StatsService = {
  getAdminStats: async () => {
    // In a real app, use aggregation queries or a stats document
    // This is a simplified fetch-all approach for the MVP
    const bookingsSnap = await getDocs(query(collection(db, 'bookings'), where('status', '==', BookingStatus.REQUESTED)));
    const interpretersSnap = await getDocs(query(collection(db, 'interpreters'), where('status', '==', 'ACTIVE')));
    const invoicesSnap = await getDocs(query(collection(db, 'clientInvoices'), where('status', '==', 'SENT')));
    
    return {
      pendingRequests: bookingsSnap.size,
      activeInterpreters: interpretersSnap.size,
      unpaidInvoices: invoicesSnap.size,
      revenueMonth: 12500 // Hardcoded for demo until billing implemented fully
    };
  }
};

export const BookingService = {
  getAll: async (): Promise<Booking[]> => {
    const q = query(collection(db, 'bookings'), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => convertDoc<Booking>(d));
  },
  
  getById: async (id: string): Promise<Booking | undefined> => {
    const snap = await getDoc(doc(db, 'bookings', id));
    return snap.exists() ? convertDoc<Booking>(snap) : undefined;
  },

  getByClientId: async (clientId: string): Promise<Booking[]> => {
    const q = query(collection(db, 'bookings'), where('clientId', '==', clientId));
    const snap = await getDocs(q);
    return snap.docs.map(d => convertDoc<Booking>(d));
  },

  getInterpreterSchedule: async (interpreterId: string): Promise<Booking[]> => {
    const q = query(
      collection(db, 'bookings'), 
      where('interpreterId', '==', interpreterId),
      where('status', '!=', BookingStatus.CANCELLED)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => convertDoc<Booking>(d));
  },
  
  // --- ASSIGNMENTS ---
  
  getAssignmentsForInterpreter: async (interpreterId: string): Promise<BookingAssignment[]> => {
    const q = query(collection(db, 'assignments'), where('interpreterId', '==', interpreterId));
    const snap = await getDocs(q);
    
    // Enrich with booking data
    const assignments = await Promise.all(snap.docs.map(async (d) => {
      const data = convertDoc<BookingAssignment>(d);
      const bookingSnap = await getDoc(doc(db, 'bookings', data.bookingId));
      return {
        ...data,
        bookingSnapshot: bookingSnap.exists() ? bookingSnap.data() : undefined
      } as BookingAssignment;
    }));
    
    return assignments;
  },

  getInterpreterOffers: async (interpreterId: string): Promise<BookingAssignment[]> => {
    const assignments = await BookingService.getAssignmentsForInterpreter(interpreterId);
    return assignments.filter(a => a.status === AssignmentStatus.OFFERED);
  },

  create: async (booking: Omit<Booking, 'id' | 'status'>): Promise<Booking> => {
    const newBooking = {
      ...booking,
      status: BookingStatus.REQUESTED,
      createdAt: new Date().toISOString()
    };
    const ref = await addDoc(collection(db, 'bookings'), newBooking);
    return { id: ref.id, ...newBooking } as Booking;
  },
  
  updateStatus: async (id: string, status: BookingStatus): Promise<void> => {
    await updateDoc(doc(db, 'bookings', id), { status });
  },

  acceptAssignment: async (assignmentId: string): Promise<void> => {
    const assignmentRef = doc(db, 'assignments', assignmentId);
    const assignmentSnap = await getDoc(assignmentRef);
    
    if (!assignmentSnap.exists()) return;
    const assignmentData = assignmentSnap.data() as BookingAssignment;

    // 1. Update this assignment
    await updateDoc(assignmentRef, {
      status: AssignmentStatus.ACCEPTED,
      respondedAt: new Date().toISOString()
    });

    // 2. Update Booking
    const bookingRef = doc(db, 'bookings', assignmentData.bookingId);
    // Fetch interpreter name for denormalization
    const interpreterSnap = await getDoc(doc(db, 'interpreters', assignmentData.interpreterId));
    const interpreterName = interpreterSnap.exists() ? interpreterSnap.data().name : 'Unknown';

    await updateDoc(bookingRef, {
      status: BookingStatus.CONFIRMED,
      interpreterId: assignmentData.interpreterId,
      interpreterName: interpreterName
    });

    // 3. Expire other offers for this booking (Simplified: Fetch all and update)
    const otherAssignmentsQ = query(
      collection(db, 'assignments'), 
      where('bookingId', '==', assignmentData.bookingId),
      where('status', '==', AssignmentStatus.OFFERED)
    );
    const otherSnaps = await getDocs(otherAssignmentsQ);
    otherSnaps.forEach(async (d) => {
      if (d.id !== assignmentId) {
        await updateDoc(doc(db, 'assignments', d.id), { status: AssignmentStatus.EXPIRED });
      }
    });
  },

  declineAssignment: async (assignmentId: string): Promise<void> => {
    await updateDoc(doc(db, 'assignments', assignmentId), {
      status: AssignmentStatus.DECLINED,
      respondedAt: new Date().toISOString()
    });
  },
  
  acceptOffer: async (id: string) => BookingService.acceptAssignment(id),
  declineOffer: async (id: string) => BookingService.declineAssignment(id),

  // --- MATCHING ---

  findInterpretersByLanguage: async (language: string): Promise<Interpreter[]> => {
    // Firestore doesn't support 'contains' in arrays natively like SQL 'LIKE'. 
    // We fetch active interpreters and filter in memory for MVP.
    const q = query(collection(db, 'interpreters'), where('status', '==', 'ACTIVE'));
    const snap = await getDocs(q);
    const all = snap.docs.map(d => convertDoc<Interpreter>(d));
    return all.filter(i => i.languages.some(l => l.toLowerCase().includes(language.toLowerCase())));
  },

  getAssignmentsByBookingId: async (bookingId: string): Promise<BookingAssignment[]> => {
    const q = query(collection(db, 'assignments'), where('bookingId', '==', bookingId));
    const snap = await getDocs(q);
    return snap.docs.map(d => convertDoc<BookingAssignment>(d));
  },

  createAssignment: async (bookingId: string, interpreterId: string): Promise<BookingAssignment> => {
    // Check existing
    const q = query(
      collection(db, 'assignments'), 
      where('bookingId', '==', bookingId), 
      where('interpreterId', '==', interpreterId)
    );
    const existing = await getDocs(q);
    if (!existing.empty) return convertDoc<BookingAssignment>(existing.docs[0]);

    const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
    
    const newAssignment = {
      bookingId,
      interpreterId,
      status: AssignmentStatus.OFFERED,
      offeredAt: new Date().toISOString(),
      bookingSnapshot: bookingSnap.exists() ? bookingSnap.data() : {}
    };

    const ref = await addDoc(collection(db, 'assignments'), newAssignment);
    
    // Update booking status to OFFERED if it was REQUESTED
    if (bookingSnap.exists() && bookingSnap.data().status === BookingStatus.REQUESTED) {
      await updateDoc(doc(db, 'bookings', bookingId), { status: BookingStatus.OFFERED });
    }

    return { id: ref.id, ...newAssignment } as BookingAssignment;
  },

  assignInterpreterToBooking: async (bookingId: string, interpreterId: string): Promise<void> => {
    const interpreterSnap = await getDoc(doc(db, 'interpreters', interpreterId));
    if (!interpreterSnap.exists()) throw new Error("Interpreter not found");

    await updateDoc(doc(db, 'bookings', bookingId), {
      status: BookingStatus.CONFIRMED,
      interpreterId: interpreterId,
      interpreterName: interpreterSnap.data().name
    });
    
    // Create/Update assignment to ACCEPTED
    // (Logic omitted for brevity - would reuse createAssignment + acceptAssignment flow)
  }
};

export const ClientService = {
  getAll: async (): Promise<Client[]> => {
    const snap = await getDocs(collection(db, 'clients'));
    return snap.docs.map(d => convertDoc<Client>(d));
  },
  
  getById: async (id: string) => {
    const snap = await getDoc(doc(db, 'clients', id));
    return snap.exists() ? convertDoc<Client>(snap) : undefined;
  },
  
  create: async (data: Omit<Client, 'id'>): Promise<Client> => {
    const ref = await addDoc(collection(db, 'clients'), data);
    return { id: ref.id, ...data } as Client;
  },

  update: async (id: string, data: Partial<Client>): Promise<Client | null> => {
    await updateDoc(doc(db, 'clients', id), data);
    return { id, ...data } as Client;
  },

  delete: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, 'clients', id));
  }
};

export const InterpreterService = {
  getAll: async (): Promise<Interpreter[]> => {
    const snap = await getDocs(collection(db, 'interpreters'));
    return snap.docs.map(d => convertDoc<Interpreter>(d));
  },
  
  getById: async (id: string) => {
    const snap = await getDoc(doc(db, 'interpreters', id));
    return snap.exists() ? convertDoc<Interpreter>(snap) : undefined;
  },
  
  updateProfile: async (id: string, data: Partial<Interpreter>) => {
    await updateDoc(doc(db, 'interpreters', id), data);
  },

  create: async (data: Omit<Interpreter, 'id'>): Promise<Interpreter> => {
    const ref = await addDoc(collection(db, 'interpreters'), {
      ...data,
      status: 'ONBOARDING'
    });
    return { id: ref.id, ...data, status: 'ONBOARDING' } as Interpreter;
  }
};

// === BILLING SERVICES (Hybrid/Firestore) ===

export const BillingService = {
  getAllTimesheets: async (): Promise<Timesheet[]> => {
    const snap = await getDocs(collection(db, 'timesheets'));
    return snap.docs.map(d => convertDoc<Timesheet>(d));
  },
  
  getInterpreterTimesheets: async (interpreterId: string): Promise<Timesheet[]> => {
    const q = query(collection(db, 'timesheets'), where('interpreterId', '==', interpreterId));
    const snap = await getDocs(q);
    return snap.docs.map(d => convertDoc<Timesheet>(d));
  },
  
  getUninvoicedTimesheetsForInterpreter: async (interpreterId: string): Promise<Timesheet[]> => {
    const q = query(
      collection(db, 'timesheets'), 
      where('interpreterId', '==', interpreterId),
      where('adminApproved', '==', true)
    );
    const snap = await getDocs(q);
    const all = snap.docs.map(d => convertDoc<Timesheet>(d));
    return all.filter(t => !t.interpreterInvoiceId); // Filter undefined locally if needed or add index
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
    const ref = await addDoc(collection(db, 'timesheets'), newTs);
    return { id: ref.id, ...newTs } as Timesheet;
  },

  approveTimesheet: async (timesheetId: string): Promise<void> => {
    // In a real app, logic for calculation is often in Cloud Functions
    // Here we will do a simple client-side calculation update for the demo
    const tsRef = doc(db, 'timesheets', timesheetId);
    await updateDoc(tsRef, {
      adminApproved: true,
      adminApprovedAt: new Date().toISOString(),
      status: 'APPROVED',
      // Simplified calculations
      unitsBillableToClient: 1, 
      unitsPayableToInterpreter: 1,
      totalClientAmount: 45.00,
      totalInterpreterAmount: 25.00,
      readyForClientInvoice: true,
      readyForInterpreterInvoice: true
    });
  },

  getClientInvoices: async (): Promise<ClientInvoice[]> => {
    const snap = await getDocs(query(collection(db, 'clientInvoices'), orderBy('issueDate', 'desc')));
    return snap.docs.map(d => convertDoc<ClientInvoice>(d));
  },

  getClientInvoiceById: async (id: string): Promise<ClientInvoice | undefined> => {
    const snap = await getDoc(doc(db, 'clientInvoices', id));
    return snap.exists() ? convertDoc<ClientInvoice>(snap) : undefined;
  },

  generateClientInvoice: async (clientId: string): Promise<ClientInvoice> => {
    // This requires complex logic usually handled by backend. 
    // We will simulate creating a document directly in Firestore.
    const clientSnap = await getDoc(doc(db, 'clients', clientId));
    const clientData = clientSnap.data() as Client;
    
    const newInvoice = {
      clientId,
      clientName: clientData?.companyName || 'Unknown',
      invoiceNumber: `INV-${Math.floor(Math.random() * 10000)}`,
      status: InvoiceStatus.DRAFT,
      issueDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
      totalAmount: 0, // Placeholder
      currency: 'GBP',
      items: []
    };
    
    const ref = await addDoc(collection(db, 'clientInvoices'), newInvoice);
    return { id: ref.id, ...newInvoice } as ClientInvoice;
  },

  getInterpreterInvoices: async (interpreterId: string): Promise<InterpreterInvoice[]> => {
    let q;
    if (interpreterId) {
        q = query(collection(db, 'interpreterInvoices'), where('interpreterId', '==', interpreterId));
    } else {
        q = query(collection(db, 'interpreterInvoices'));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => convertDoc<InterpreterInvoice>(d));
  },

  createInterpreterInvoiceUpload: async (interpreterId: string, timesheetIds: string[], refStr: string, amount: number): Promise<InterpreterInvoice> => {
    const interpreterSnap = await getDoc(doc(db, 'interpreters', interpreterId));
    
    const newInvoice = {
      interpreterId,
      interpreterName: interpreterSnap.exists() ? interpreterSnap.data().name : '',
      model: 'UPLOAD',
      status: 'SUBMITTED',
      externalInvoiceReference: refStr,
      totalAmount: amount,
      issueDate: new Date().toISOString(),
      items: []
    };
    
    const ref = await addDoc(collection(db, 'interpreterInvoices'), newInvoice);
    
    // Link timesheets
    timesheetIds.forEach(async (tsId) => {
      await updateDoc(doc(db, 'timesheets', tsId), { interpreterInvoiceId: ref.id });
    });

    return { id: ref.id, ...newInvoice } as InterpreterInvoice;
  }
};
