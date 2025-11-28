
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc, 
  orderBy,
  addDoc
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "./firebaseConfig";
import { ClientInvoice, InterpreterInvoice, Timesheet, InvoiceStatus } from "../types";
import { MOCK_TIMESHEETS, MOCK_CLIENT_INVOICES, MOCK_INTERPRETER_INVOICES, saveMockData, MOCK_BOOKINGS, MOCK_RATES } from "./mockData";
import { convertDoc, safeFetch } from './utils';

export const BillingService = {
  
  /**
   * Get summary stats for the dashboard
   */
  getDashboardStats: async () => {
    // MOCK IMPLEMENTATION FOR DASHBOARD IF DB FAILS OR EMPTY
    // In real implementation, use the Firestore logic below
    try {
      // 1. Pending Client Invoices
      const clientInvQuery = query(collection(db, "clientInvoices"), where("status", "in", [InvoiceStatus.DRAFT, InvoiceStatus.SENT]));
      const clientInvSnap = await getDocs(clientInvQuery);
      
      // 2. Pending Interpreter Invoices
      const interpInvQuery = query(collection(db, "interpreterInvoices"), where("status", "==", InvoiceStatus.SUBMITTED));
      const interpInvSnap = await getDocs(interpInvQuery);

      // 3. Timesheets awaiting approval
      const tsQuery = query(collection(db, "timesheets"), where("adminApproved", "==", false), where("status", "==", "SUBMITTED"));
      const tsSnap = await getDocs(tsQuery);

      return {
        pendingClientInvoices: clientInvSnap.size,
        pendingClientAmount: clientInvSnap.docs.reduce((acc, d) => acc + (d.data().totalAmount || 0), 0),
        pendingInterpreterInvoices: interpInvSnap.size,
        pendingTimesheets: tsSnap.size
      };
    } catch (e) {
      console.warn("Firestore billing stats failed, falling back to mock data", e);
      return {
        pendingClientInvoices: 5,
        pendingClientAmount: 1250.00,
        pendingInterpreterInvoices: 2,
        pendingTimesheets: 3
      };
    }
  },

  /**
   * Client Invoices
   */
  getClientInvoices: async (statusFilter?: string) => {
    try {
      let q = query(collection(db, "clientInvoices"), orderBy("issueDate", "desc"));
      if (statusFilter && statusFilter !== 'ALL') {
        q = query(collection(db, "clientInvoices"), where("status", "==", statusFilter), orderBy("issueDate", "desc"));
      }
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as ClientInvoice));
    } catch (e) {
      console.warn("Using Mock Client Invoices");
      return [...MOCK_CLIENT_INVOICES];
    }
  },

  getClientInvoiceById: async (id: string) => {
    try {
      const d = await getDoc(doc(db, "clientInvoices", id));
      if (!d.exists()) return MOCK_CLIENT_INVOICES.find(i => i.id === id) || null;
      
      const linesQ = query(collection(db, "clientInvoiceLines"), where("invoiceId", "==", id));
      const linesSnap = await getDocs(linesQ);
      const items = linesSnap.docs.map(l => ({ id: l.id, ...l.data() }));

      return { id: d.id, ...d.data(), items } as any as ClientInvoice;
    } catch (e) {
      return MOCK_CLIENT_INVOICES.find(i => i.id === id) || null;
    }
  },

  updateClientInvoiceStatus: async (id: string, status: InvoiceStatus) => {
    try {
      await updateDoc(doc(db, "clientInvoices", id), { status });
    } catch (e) {
      const inv = MOCK_CLIENT_INVOICES.find(i => i.id === id);
      if (inv) { inv.status = status; saveMockData(); }
    }
  },

  generateClientInvoice: async (clientId: string, periodStart?: string, periodEnd?: string) => {
    try {
      const functions = getFunctions();
      const generateFn = httpsCallable(functions, 'generateClientInvoice');
      const start = periodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const end = periodEnd || new Date().toISOString();
      const result = await generateFn({ clientId, periodStart: start, periodEnd: end });
      return result.data as any;
    } catch (e) {
      console.error("Function call failed, falling back to mock generation", e);
      // Mock logic for offline dev
      const ref = `INV-${Math.floor(Math.random() * 10000)}`;
      const newInvoice = {
        id: `mock-inv-${Date.now()}`,
        clientId,
        clientName: 'Mock Client',
        reference: ref,
        invoiceNumber: ref, // Ensure legacy support
        status: InvoiceStatus.DRAFT,
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
        periodStart: periodStart || new Date().toISOString(),
        periodEnd: periodEnd || new Date().toISOString(),
        totalAmount: 150.00,
        currency: 'GBP',
        items: []
      } as ClientInvoice;
      MOCK_CLIENT_INVOICES.push(newInvoice);
      saveMockData();
      return { success: true, total: 150.00, invoiceId: newInvoice.id };
    }
  },

  /**
   * Interpreter Invoices
   */
  getInterpreterInvoices: async (statusFilter?: string) => {
    try {
      let q = query(collection(db, "interpreterInvoices"), orderBy("issueDate", "desc"));
      if (statusFilter && statusFilter !== 'ALL') {
        q = query(collection(db, "interpreterInvoices"), where("status", "==", statusFilter), orderBy("issueDate", "desc"));
      }
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as InterpreterInvoice));
    } catch (e) {
       return [...MOCK_INTERPRETER_INVOICES];
    }
  },

  getInterpreterInvoiceById: async (id: string) => {
    try {
      const d = await getDoc(doc(db, "interpreterInvoices", id));
      if (!d.exists()) return MOCK_INTERPRETER_INVOICES.find(i => i.id === id) || null;

      const linesQ = query(collection(db, "interpreterInvoiceLines"), where("interpreterInvoiceId", "==", id));
      const linesSnap = await getDocs(linesQ);
      const items = linesSnap.docs.map(l => ({ id: l.id, ...l.data() }));

      return { id: d.id, ...d.data(), items } as any as InterpreterInvoice;
    } catch (e) {
      return MOCK_INTERPRETER_INVOICES.find(i => i.id === id) || null;
    }
  },

  updateInterpreterInvoiceStatus: async (id: string, status: InvoiceStatus) => {
    try {
      await updateDoc(doc(db, "interpreterInvoices", id), { status });
    } catch (e) {
       const inv = MOCK_INTERPRETER_INVOICES.find(i => i.id === id);
       if (inv) { inv.status = status; saveMockData(); }
    }
  },

  createInterpreterInvoiceUpload: async (interpreterId: string, timesheetIds: string[], ref: string, amount: number): Promise<InterpreterInvoice> => {
      // Mock Implementation
      const newInvoice: InterpreterInvoice = {
        id: `inv-i-${Date.now()}`,
        interpreterId,
        interpreterName: 'Interpreter', // Mock
        model: 'UPLOAD',
        status: InvoiceStatus.SUBMITTED,
        externalInvoiceReference: ref,
        totalAmount: amount,
        issueDate: new Date().toISOString(),
        items: [],
        currency: 'GBP'
      };
  
      timesheetIds.forEach(tsId => {
        const ts = MOCK_TIMESHEETS.find(t => t.id === tsId);
        if (ts) ts.interpreterInvoiceId = newInvoice.id;
      });
  
      MOCK_INTERPRETER_INVOICES.push(newInvoice);
      saveMockData();
      return newInvoice;
  },

  /**
   * Timesheets
   */
  getAllTimesheets: async (): Promise<Timesheet[]> => {
    return safeFetch(async () => {
      const snap = await getDocs(collection(db, 'timesheets'));
      return snap.docs.map(d => convertDoc<Timesheet>(d));
    }, MOCK_TIMESHEETS);
  },

  getPendingTimesheets: async () => {
    try {
      const q = query(collection(db, "timesheets"), where("adminApproved", "==", false), where("status", "==", "SUBMITTED"));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Timesheet));
    } catch (e) {
      return MOCK_TIMESHEETS.filter(t => t.status === 'SUBMITTED' && !t.adminApproved);
    }
  },

  approveTimesheet: async (id: string) => {
    try {
      await updateDoc(doc(db, "timesheets", id), { 
        adminApproved: true, 
        adminApprovedAt: new Date().toISOString(),
        status: 'APPROVED' 
      });
    } catch (e) {
      const ts = MOCK_TIMESHEETS.find(t => t.id === id);
      if (ts) {
        // Mock logic
        ts.adminApproved = true;
        ts.status = 'APPROVED';
        // Calculate simple mock amounts
        ts.unitsBillableToClient = 1;
        ts.unitsPayableToInterpreter = 1;
        ts.totalClientAmount = 40;
        ts.totalInterpreterAmount = 25;
        ts.clientAmountCalculated = 40;
        ts.interpreterAmountCalculated = 25;
        ts.readyForClientInvoice = true;
        ts.readyForInterpreterInvoice = true;
        saveMockData();
      }
    }
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
    }, MOCK_TIMESHEETS.filter(t => t.interpreterId === interpreterId && t.adminApproved && !t.interpreterInvoiceId));
  },

  submitTimesheet: async (data: Partial<Timesheet>): Promise<Timesheet> => {
    const newTs = {
      bookingId: data.bookingId!,
      interpreterId: data.interpreterId!,
      clientId: data.clientId!,
      submittedAt: new Date().toISOString(),
      actualStart: data.actualStart!,
      actualEnd: data.actualEnd!,
      breakDurationMinutes: data.breakDurationMinutes || 0,
      adminApproved: false,
      status: 'SUBMITTED' as const,
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
      const mockTs = { id: `ts-${Date.now()}`, ...newTs } as Timesheet;
      MOCK_TIMESHEETS.push(mockTs);
      saveMockData();
      return mockTs;
    }
  }
};
