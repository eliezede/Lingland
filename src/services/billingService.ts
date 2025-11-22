
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc, 
  orderBy, 
  limit,
  Timestamp
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "./firebaseConfig";
import { ClientInvoice, InterpreterInvoice, Timesheet, InvoiceStatus } from "../types";

// Helper to convert Firestore timestamps to ISO strings if needed
// In this implementation, we assume data comes back compatible or we cast it.

export const BillingService = {
  
  /**
   * Get summary stats for the dashboard
   */
  getDashboardStats: async () => {
    // Note: In a real app, use aggregation queries or a dedicated stats document.
    // Here we fetch with limits to just check existence/counts roughly or use MOCK data pattern if firestore empty.
    
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
  },

  /**
   * Client Invoices
   */
  getClientInvoices: async (statusFilter?: string) => {
    let q = query(collection(db, "clientInvoices"), orderBy("issueDate", "desc"));
    if (statusFilter && statusFilter !== 'ALL') {
      q = query(collection(db, "clientInvoices"), where("status", "==", statusFilter), orderBy("issueDate", "desc"));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ClientInvoice));
  },

  getClientInvoiceById: async (id: string) => {
    const d = await getDoc(doc(db, "clientInvoices", id));
    if (!d.exists()) return null;
    
    // Fetch lines subcollection or separate collection
    const linesQ = query(collection(db, "clientInvoiceLines"), where("invoiceId", "==", id));
    const linesSnap = await getDocs(linesQ);
    const items = linesSnap.docs.map(l => ({ id: l.id, ...l.data() }));

    return { id: d.id, ...d.data(), items } as ClientInvoice;
  },

  updateClientInvoiceStatus: async (id: string, status: InvoiceStatus) => {
    await updateDoc(doc(db, "clientInvoices", id), { status });
  },

  generateClientInvoice: async (clientId: string, periodStart: string, periodEnd: string) => {
    const functions = getFunctions();
    const generateFn = httpsCallable(functions, 'generateClientInvoice');
    const result = await generateFn({ clientId, periodStart, periodEnd });
    return result.data as any; // Returns summary or invoice ID
  },

  /**
   * Interpreter Invoices
   */
  getInterpreterInvoices: async (statusFilter?: string) => {
    let q = query(collection(db, "interpreterInvoices"), orderBy("issueDate", "desc"));
    if (statusFilter && statusFilter !== 'ALL') {
      q = query(collection(db, "interpreterInvoices"), where("status", "==", statusFilter), orderBy("issueDate", "desc"));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as InterpreterInvoice));
  },

  getInterpreterInvoiceById: async (id: string) => {
    const d = await getDoc(doc(db, "interpreterInvoices", id));
    if (!d.exists()) return null;

    const linesQ = query(collection(db, "interpreterInvoiceLines"), where("interpreterInvoiceId", "==", id));
    const linesSnap = await getDocs(linesQ);
    const items = linesSnap.docs.map(l => ({ id: l.id, ...l.data() }));

    return { id: d.id, ...d.data(), items } as InterpreterInvoice;
  },

  updateInterpreterInvoiceStatus: async (id: string, status: InvoiceStatus) => {
    await updateDoc(doc(db, "interpreterInvoices", id), { status });
  },

  /**
   * Timesheets
   */
  getPendingTimesheets: async () => {
    const q = query(collection(db, "timesheets"), where("adminApproved", "==", false), where("status", "==", "SUBMITTED"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Timesheet));
  },

  approveTimesheet: async (id: string) => {
    // We update local doc, but the Cloud Function 'onTimesheetAdminApproved' 
    // should perform the calculations and set readyForInvoice flags.
    await updateDoc(doc(db, "timesheets", id), { 
      adminApproved: true, 
      adminApprovedAt: new Date().toISOString(),
      status: 'APPROVED' 
    });
  }
};
