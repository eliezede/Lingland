
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "./firebaseConfig";
import { 
  ClientInvoice, 
  InterpreterInvoice, 
  Timesheet, 
  InvoiceStatus, 
  BookingStatus, 
  ServiceCategory, 
  SessionMode, 
  SageCode,
  Booking
} from "../types";
import { convertDoc } from './utils';
import { InterpreterService } from "./interpreterService";
import { getTimesheetInterpreterAmount } from "../utils/interpreterFlow";
import { SystemService } from "./systemService";

const getInvoiceDateMillis = (value: unknown) => {
  if (!value) return 0;
  if (typeof (value as any)?.toDate === 'function') return (value as any).toDate().getTime();
  if (typeof (value as any)?.seconds === 'number') return Number((value as any).seconds) * 1000;
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const sortInvoiceDocsNewestFirst = <T extends { data: () => Record<string, any> }>(docs: T[]) => (
  [...docs].sort((a, b) => {
    const aData = a.data();
    const bData = b.data();
    return getInvoiceDateMillis(bData.issueDate || bData.createdAt)
      - getInvoiceDateMillis(aData.issueDate || aData.createdAt);
  })
);

export const BillingService = {

  /**
   * Get summary stats for the dashboard
   */
  getDashboardStats: async () => {
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
      console.error('Firestore billing stats failed', e);
      throw e;
    }
  },

  /**
   * Client Invoices
   */
  getClientInvoices: async (statusOrClientId?: string) => {
    const invoiceStatuses = Object.values(InvoiceStatus) as string[];
    const statusFilter = statusOrClientId && invoiceStatuses.includes(statusOrClientId) ? statusOrClientId : undefined;
    const clientIdFilter = statusOrClientId && !statusFilter && statusOrClientId !== 'ALL' ? statusOrClientId : undefined;
    try {
      const source = clientIdFilter
        ? query(collection(db, "clientInvoices"), where('clientId', '==', clientIdFilter))
        : statusFilter && statusFilter !== 'ALL'
          ? query(collection(db, "clientInvoices"), where('status', '==', statusFilter))
          : collection(db, "clientInvoices");
      const snap = await getDocs(source);
      let filteredDocs = sortInvoiceDocsNewestFirst(snap.docs);
      if (statusFilter && statusFilter !== 'ALL') {
        filteredDocs = filteredDocs.filter(d => d.data().status === statusFilter);
      }
      if (clientIdFilter) {
        filteredDocs = filteredDocs.filter(d => d.data().clientId === clientIdFilter);
      }
      return filteredDocs.map(d => ({ id: d.id, ...d.data() } as ClientInvoice));
    } catch (e) {
      console.error('Failed to load client invoices', e);
      throw e;
    }
  },

  getClientInvoiceById: async (id: string) => {
    try {
      const d = await getDoc(doc(db, "clientInvoices", id));
      if (!d.exists()) return null;

      const linesQ = query(collection(db, "clientInvoiceLines"), where("invoiceId", "==", id));
      const linesSnap = await getDocs(linesQ);
      const items = linesSnap.docs.map(l => {
        const line = { id: l.id, ...l.data() } as any;
        return {
          ...line,
          total: Number(line.total ?? line.lineAmount ?? line.amount ?? 0),
          rate: Number(line.rate ?? 0),
          units: Number(line.units ?? line.quantity ?? 0)
        };
      });

      return { id: d.id, ...d.data(), items } as any as ClientInvoice;
    } catch (e) {
      console.error('Failed to load client invoice', e);
      throw e;
    }
  },

  updateClientInvoiceStatus: async (id: string, status: InvoiceStatus) => {
    const updateStatus = httpsCallable(getFunctions(), 'updateClientInvoiceStatus');
    await updateStatus({ invoiceId: id, status });
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
      console.error('Client invoice generation failed', e);
      throw e;
    }
  },

  getInterpreterInvoices: async (statusOrInterpreterId?: string) => {
    const invoiceStatuses = Object.values(InvoiceStatus) as string[];
    const statusFilter = statusOrInterpreterId && invoiceStatuses.includes(statusOrInterpreterId) ? statusOrInterpreterId : undefined;
    const interpreterIdFilter = statusOrInterpreterId && !statusFilter && statusOrInterpreterId !== 'ALL' ? statusOrInterpreterId : undefined;
    try {
      const source = interpreterIdFilter
        ? query(collection(db, "interpreterInvoices"), where('interpreterId', '==', interpreterIdFilter))
        : statusFilter && statusFilter !== 'ALL'
          ? query(collection(db, "interpreterInvoices"), where('status', '==', statusFilter))
          : collection(db, "interpreterInvoices");
      const [photoMap, snap] = await Promise.all([
        InterpreterService.getPhotoMap().catch((): Record<string, string> => ({})),
        getDocs(source)
      ]);
      
      let filteredDocs = sortInvoiceDocsNewestFirst(snap.docs);
      if (statusFilter && statusFilter !== 'ALL') {
        filteredDocs = filteredDocs.filter(d => d.data().status === statusFilter);
      }
      if (interpreterIdFilter) {
        filteredDocs = filteredDocs.filter(d => d.data().interpreterId === interpreterIdFilter);
      }
      
      return filteredDocs.map((docSnap: any) => {
        const data = docSnap.data() as InterpreterInvoice;
        return { 
          ...data,
          id: docSnap.id, 
          interpreterPhotoUrl: data.interpreterPhotoUrl || photoMap[data.interpreterId]
        } as InterpreterInvoice;
      });
    } catch (e) {
      console.error('Failed to load interpreter invoices', e);
      throw e;
    }
  },

  getInterpreterInvoiceById: async (id: string) => {
    try {
      const [photoMap, d] = await Promise.all([
        InterpreterService.getPhotoMap().catch((): Record<string, string> => ({})),
        getDoc(doc(db, "interpreterInvoices", id))
      ]);
      
      if (!d.exists()) {
        return null;
      }

      const [linesSnap, legacyLinesSnap] = await Promise.all([
        getDocs(query(collection(db, "interpreterInvoiceLines"), where("interpreterInvoiceId", "==", id))),
        getDocs(query(collection(db, "interpreterInvoiceLines"), where("invoiceId", "==", id)))
      ]);
      const linesById = new Map<string, any>();
      [...linesSnap.docs, ...legacyLinesSnap.docs].forEach(l => linesById.set(l.id, l));
      const items = Array.from(linesById.values()).map(l => {
        const line = { id: l.id, ...l.data() } as any;
        return {
          ...line,
          total: Number(line.total ?? line.lineAmount ?? line.amount ?? 0),
          rate: Number(line.rate ?? 0),
          units: Number(line.units ?? line.quantity ?? 0)
        };
      });
      const data = d.data() as InterpreterInvoice;

      return { 
        ...data, 
        id: d.id, 
        items,
        interpreterPhotoUrl: data.interpreterPhotoUrl || photoMap[data.interpreterId]
      } as any as InterpreterInvoice;
    } catch (e) {
      console.error('Failed to load interpreter invoice', e);
      throw e;
    }
  },

  updateInterpreterInvoiceStatus: async (id: string, status: InvoiceStatus) => {
    await httpsCallable(getFunctions(), 'updateInterpreterInvoiceStatus')({ invoiceId: id, status });
  },

  createInterpreterInvoiceUpload: async (interpreterId: string, timesheetIds: string[], ref: string, amount: number, uploadedPdfUrl?: string): Promise<InterpreterInvoice> => {
    const createUpload = httpsCallable(getFunctions(), 'createInterpreterInvoiceUpload');
    const response = await createUpload({ interpreterId, timesheetIds, reference: ref, amount, uploadedPdfUrl });
    const invoice = (response.data as any)?.invoice as InterpreterInvoice;
    if (!invoice?.id) throw new Error('Interpreter invoice was not persisted');
    return invoice;
  },

  /**
   * Timesheets
   */
  getAllTimesheets: async (): Promise<Timesheet[]> => {
    const snap = await getDocs(collection(db, 'timesheets'));
    return snap.docs.map(d => convertDoc<Timesheet>(d));
  },

  getTimesheetByBookingId: async (bookingId: string): Promise<Timesheet | null> => {
    try {
      const q = query(collection(db, "timesheets"), where("bookingId", "==", bookingId));
      const snap = await getDocs(q);
      if (snap.empty) {
        return null;
      }
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as Timesheet;
    } catch (e) {
      throw e;
    }
  },

  getPendingTimesheets: async () => {
    try {
      const q = query(collection(db, "timesheets"), where("adminApproved", "==", false), where("status", "==", "SUBMITTED"));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Timesheet));
    } catch (e) {
      throw e;
    }
  },

  approveTimesheet: async (id: string, overrides?: { clientAmount?: number; interpreterAmount?: number }) => {
    try {
      const approve = httpsCallable(getFunctions(), 'approveTimesheet');
      const result = await approve({ timesheetId: id, ...(overrides || {}) });
      if (!(result.data as any)?.success) throw new Error('Timesheet approval was not persisted');
    } catch (e) {
      console.error("Error approving timesheet:", e);
      throw e;
    }
  },

  approveTimesheetByBookingId: async (bookingId: string) => {
    try {
      const q = query(collection(db, "timesheets"), where("bookingId", "==", bookingId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await BillingService.approveTimesheet(snap.docs[0].id);
      } else {
        throw new Error('Timesheet required before verification. Create a timesheet or exception claim first.');
      }
    } catch (e) {
      throw e;
    }
  },

  recordManualInvoiceIssued: async (bookingId: string): Promise<void> => {
    await httpsCallable(getFunctions(), 'recordManualClientInvoice')({ bookingId });
  },

  recordManualInterpreterInvoiceReceived: async (bookingId: string): Promise<void> => {
    const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
    if (!bookingSnap.exists()) throw new Error('Booking not found');
    const booking = { id: bookingSnap.id, ...bookingSnap.data() } as Booking;
    const timesheet = await BillingService.getTimesheetByBookingId(bookingId);
    if (!timesheet?.adminApproved) throw new Error('Approved timesheet required before recording an interpreter invoice.');
    const interpreterId = booking.interpreterId || timesheet.interpreterId;
    if (!interpreterId) throw new Error('Interpreter required before recording an interpreter invoice.');
    const reference = booking.interpreterInvoiceReference || booking.interpreterInvoiceNumber || `INT-${booking.displayRef || booking.jobNumber || booking.bookingRef || booking.id.slice(0, 8)}`;
    await BillingService.createInterpreterInvoiceUpload(interpreterId, [timesheet.id], reference, getTimesheetInterpreterAmount(timesheet));
  },

  recordManualInterpreterPaymentSent: async (bookingId: string): Promise<void> => {
    const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
    if (!bookingSnap.exists()) throw new Error('Booking not found');
    const invoiceId = String(bookingSnap.data().interpreterInvoiceId || '');
    if (!invoiceId) throw new Error('Interpreter invoice must be recorded before marking it paid.');
    await BillingService.updateInterpreterInvoiceStatus(invoiceId, InvoiceStatus.PAID);
  },

  recordManualPaymentReceived: async (bookingId: string): Promise<void> => {
    const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
    if (!bookingSnap.exists()) throw new Error('Booking not found');
    const invoiceId = String(bookingSnap.data().clientInvoiceId || '');
    if (!invoiceId) throw new Error('Client invoice must be recorded before marking payment received.');
    await BillingService.updateClientInvoiceStatus(invoiceId, InvoiceStatus.PAID);
  },

  getInterpreterTimesheets: async (interpreterId: string): Promise<Timesheet[]> => {
    const q = query(collection(db, 'timesheets'), where('interpreterId', '==', interpreterId));
    const snap = await getDocs(q);
    return snap.docs.map(d => convertDoc<Timesheet>(d));
  },

  getInterpreterEarnings: async (interpreterId: string): Promise<number> => {
    try {
      const q = query(
        collection(db, "timesheets"),
        where("interpreterId", "==", interpreterId),
        where("adminApproved", "==", true)
      );
      const snap = await getDocs(q);
      const total = snap.docs.reduce((acc, d) => acc + getTimesheetInterpreterAmount(d.data() as Timesheet), 0);
      return total;
    } catch (e) {
      throw e;
    }
  },

  getUninvoicedTimesheetsForInterpreter: async (interpreterId: string): Promise<Timesheet[]> => {
    const q = query(
      collection(db, 'timesheets'),
      where('interpreterId', '==', interpreterId),
      where('adminApproved', '==', true)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => convertDoc<Timesheet>(d)).filter(t => !t.interpreterInvoiceId);
  },

  submitTimesheet: async (data: Partial<Timesheet>): Promise<Timesheet> => {
    const submit = httpsCallable(getFunctions(), 'submitTimesheet');
    const response = await submit(data);
    const createdTimesheet = (response.data as any)?.timesheet as Timesheet;
    if (!createdTimesheet?.id) throw new Error('Timesheet submission was not persisted');
    return createdTimesheet;
  },

  recordManualTimesheetReceived: async (bookingId: string): Promise<Timesheet> => {
    const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
    const booking = bookingSnap.exists()
      ? ({ id: bookingSnap.id, ...bookingSnap.data() } as Booking)
      : null;

    if (!booking) throw new Error('Booking not found');
    if (!booking.clientId) throw new Error('Booking has no client linked');
    if (!booking.interpreterId) throw new Error('Booking has no interpreter assigned');
    if (![BookingStatus.SESSION_COMPLETED, BookingStatus.TIMESHEET_SUBMITTED].includes(booking.status)) {
      throw new Error('The job must be completed or awaiting its missing claim before recording a timesheet.');
    }

    const actualStart = `${booking.date}T${booking.startTime || '00:00'}:00`;
    const actualEnd = new Date(new Date(actualStart).getTime() + (booking.durationMinutes || 60) * 60000).toISOString();
    const durationMinutes = booking.durationMinutes || 60;

    const timesheet = await BillingService.submitTimesheet({
      bookingId: booking.id,
      interpreterId: booking.interpreterId,
      clientId: booking.clientId,
      sessionMode: booking.sessionMode || (booking.locationType === 'ONLINE' ? SessionMode.VIDEO : SessionMode.F2F),
      actualStart,
      actualEnd,
      sessionDurationMinutes: durationMinutes,
      breakDurationMinutes: 0,
      units: 'hours',
      unitsBillableToClient: Math.max(durationMinutes / 60, 1),
      unitsPayableToInterpreter: Math.max(durationMinutes / 60, 1),
      sessionFees: 0,
      totalToPay: 0,
      interpreterAmountCalculated: 0,
      clientAmountCalculated: booking.totalAmount || 0,
      source: 'STAFF_MANUAL',
      recordedByStaff: true
    });

    return timesheet;
  },

  createNonExecutedJobClaim: async (bookingId: string, reason: string = 'Job was not executed'): Promise<Timesheet> => {
    const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
    const booking = bookingSnap.exists()
      ? ({ id: bookingSnap.id, ...bookingSnap.data() } as Booking)
      : null;

    if (!booking) throw new Error('Booking not found');
    if (!booking.clientId) throw new Error('Booking has no client linked');

    const settings = await SystemService.getSettings();
    const windowHours = settings?.operations?.cancellationWindowHours ?? 24;
    const scheduledStart = new Date(`${booking.date}T${booking.startTime || '00:00'}:00`);
    const hoursUntilStart = (scheduledStart.getTime() - Date.now()) / 36e5;
    const billableCancellation = hoursUntilStart <= windowHours;
    const durationMinutes = booking.durationMinutes || 60;
    const actualStart = `${booking.date}T${booking.startTime || '00:00'}:00`;
    const actualEnd = new Date(new Date(actualStart).getTime() + durationMinutes * 60000).toISOString();
    return BillingService.submitTimesheet({
      bookingId: booking.id,
      interpreterId: booking.interpreterId || 'unassigned',
      clientId: booking.clientId,
      sessionMode: SessionMode.CANCELLATION,
      actualStart,
      actualEnd,
      sessionDurationMinutes: durationMinutes,
      breakDurationMinutes: 0,
      totalToPay: 0,
      interpreterAmountCalculated: 0,
      clientAmountCalculated: 0,
      nonExecutionReason: reason,
      billableCancellation,
      exceptionType: 'CANCELLATION',
      source: 'STAFF_MANUAL',
      recordedByStaff: true
    });
  },

  calculateBookingTotal: async (bookingId: string): Promise<number> => {
    const [bookingDoc, timesheet] = await Promise.all([
      getDoc(doc(db, 'bookings', bookingId)),
      BillingService.getTimesheetByBookingId(bookingId)
    ]);
    if (!bookingDoc.exists()) return 0;
    const data = bookingDoc.data();
    return Number(timesheet?.clientAmountCalculated || data.totalAmount || data.finalQuote || 0);
  },

  calculateBookingTotalSync: (booking: Booking): number => {
    if (!booking) return 0;
    return Number(booking.totalAmount || booking.finalQuote || 0);
  },

  getSageCode: (category: ServiceCategory, mode: SessionMode, isOOH: boolean): SageCode => {
    if (category === ServiceCategory.TRANSLATION) return SageCode.I010;
    
    if (mode === SessionMode.VIDEO) return isOOH ? SageCode.I008 : SageCode.I002;
    if (mode === SessionMode.PHONE) return isOOH ? SageCode.I009 : SageCode.I003;
    
    // Default F2F
    return isOOH ? SageCode.I007 : SageCode.I001;
  }
};
