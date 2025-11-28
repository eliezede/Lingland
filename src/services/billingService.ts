import { 
  collection, query, where, getDocs, doc, getDoc, updateDoc, orderBy, addDoc 
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "./firebaseConfig";
import { ClientInvoice, InterpreterInvoice, Timesheet, InvoiceStatus } from "../types";
import { MOCK_TIMESHEETS, MOCK_CLIENT_INVOICES, MOCK_INTERPRETER_INVOICES, saveMockData } from "./mockData";
import { convertDoc, safeFetch } from './utils';

export const BillingService = {
  
  getDashboardStats: async () => {
    try {
      const clientInvQuery = query(collection(db, "clientInvoices"), where("status", "in", [InvoiceStatus.DRAFT, InvoiceStatus.SENT]));
      const clientInvSnap = await getDocs(clientInvQuery);
      
      const interpInvQuery = query(collection(db, "interpreterInvoices"), where("status", "==", InvoiceStatus.SUBMITTED));
      const interpInvSnap = await getDocs(interpInvQuery);

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

  // --- CLIENT INVOICES ---

  getClientInvoices: async (statusFilter?: string) => {
    try {
      let q = query(collection(db, "clientInvoices"), orderBy("issueDate", "desc"));
      if (statusFilter && statusFilter !== 'ALL') {
        q = query(collection(db, "clientInvoices"), where("status", "==", statusFilter), orderBy("issueDate", "desc"));
      }
      const snap = await getDocs(q);
      return snap.docs.map(d => convertDoc<ClientInvoice>(d));
    } catch (e) {
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
      const result = await generateFn({ clientId, periodStart, periodEnd });
      return result.data as any;
    } catch (e) {
      // Mock logic for offline dev
      const newInvoice = {
        id: `mock-inv-${Date.now()}`,
        clientId,
        clientName: 'Mock Client',
        reference: `INV-${Math.floor(Math.random() * 10000)}`,
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

  // --- INTERPRETER INVOICES ---

  getInterpreterInvoices: async (interpreterId?: string, statusFilter?: string) => {
    try {
      let q = query(collection(db, "interpreterInvoices"), orderBy("issueDate", "desc"));
      if(interpreterId) {
         q = query(collection(db, "interpreterInvoices"), where("interpreterId", "==", interpreterId), orderBy("issueDate", "desc"));
      }
      if (statusFilter && statusFilter !== 'ALL') {
        // Compound queries might require index, be careful in dev
      }
      const snap = await getDocs(q);
      return snap.docs.map(d => convertDoc<InterpreterInvoice>(d));
    } catch (e) {
       return interpreterId 
         ? MOCK_INTERPRETER_INVOICES.filter(i => i.interpreterId === interpreterId)
         : [...MOCK_INTERPRETER_INVOICES];
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
      const newInvoice: InterpreterInvoice = {
        id: `inv-i-${Date.now()}`,
        interpreterId,
        interpreterName: 'Interpreter', 
        model: 'UPLOAD',
        status: InvoiceStatus.SUBMITTED,
        externalInvoiceReference: ref,
        totalAmount: amount,
        issueDate: new Date().toISOString(),
        items: [],
        currency: 'GBP'
      };
      
      try {
        const ref = await addDoc(collection(db, 'interpreterInvoices'), newInvoice);
        // Link timesheets (batch in real app)
        timesheetIds.forEach(async tsId => {
           await updateDoc(doc(db, 'timesheets', tsId), { interpreterInvoiceId: ref.id });
        });
        return { ...newInvoice, id: ref.id };
      } catch {
        MOCK_INTERPRETER_INVOICES.push(newInvoice);
        timesheetIds.forEach(tsId => {
          const ts = MOCK_TIMESHEETS.find(t => t.id === tsId);
          if (ts) ts.interpreterInvoiceId = newInvoice.id;
        });
        saveMockData();
        return newInvoice;
      }
  },

  // --- TIMESHEETS ---

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
      return snap.docs.map(d => convertDoc<Timesheet>(d));
    } catch (e) {
      return MOCK_TIMESHEETS.filter(t => t.status === 'SUBMITTED' && !t.adminApproved);
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
      ...data,
      submittedAt: new Date().toISOString(),
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
        ts.adminApproved = true;
        ts.status = 'APPROVED';
        // Mock calculations
        ts.unitsBillableToClient = 1;
        ts.totalClientAmount = 40;
        ts.totalInterpreterAmount = 25;
        saveMockData();
      }
    }
  }
};