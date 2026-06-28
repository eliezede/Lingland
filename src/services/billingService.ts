
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  orderBy,
  addDoc,
  writeBatch,
  serverTimestamp
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "./firebaseConfig";
import { 
  ClientInvoice, 
  InterpreterInvoice, 
  Timesheet, 
  InvoiceStatus, 
  BookingStatus, 
  NotificationType, 
  ServiceCategory, 
  SessionMode, 
  SageCode,
  Booking
} from "../types";
import { MOCK_TIMESHEETS, MOCK_CLIENT_INVOICES, MOCK_INTERPRETER_INVOICES, saveMockData, MOCK_BOOKINGS, MOCK_RATES, MOCK_USERS } from "./mockData";
import { convertDoc, safeFetch } from './utils';
import { NotificationService } from "./notificationService";
import { InterpreterService } from "./interpreterService";
import { getTimesheetInterpreterAmount } from "../utils/interpreterFlow";
import { SystemService } from "./systemService";
import { EmailService } from "./emailService";

const getBookingForBillingComms = async (bookingId?: string, status?: BookingStatus): Promise<Booking | null> => {
  if (!bookingId) return null;

  try {
    const bookingDoc = await getDoc(doc(db, 'bookings', bookingId));
    if (bookingDoc.exists()) {
      return {
        id: bookingDoc.id,
        ...bookingDoc.data(),
        ...(status ? { status } : {})
      } as Booking;
    }
  } catch (e) {
    console.warn('[BillingService] Failed to fetch booking for billing communications', e);
  }

  const mockBooking = MOCK_BOOKINGS.find(b => b.id === bookingId);
  return mockBooking ? { ...mockBooking, ...(status ? { status } : {}) } : null;
};

const getInterpreterEmailData = async (interpreterId?: string) => {
  if (!interpreterId || interpreterId === 'unassigned') return {};

  try {
    const interpreter = await InterpreterService.getById(interpreterId);
    if (interpreter) {
      return {
        interpreterId,
        interpreterName: interpreter.name,
        interpreterEmail: interpreter.email
      };
    }
  } catch (e) {
    console.warn('[BillingService] Failed to resolve interpreter email data', e);
  }

  return {
    interpreterId,
    interpreterName: MOCK_USERS.find(u => u.profileId === interpreterId)?.displayName,
    interpreterEmail: MOCK_USERS.find(u => u.profileId === interpreterId)?.email
  };
};

const notifyInterpreterUser = async (
  interpreterId: string | undefined,
  title: string,
  message: string,
  type: NotificationType,
  link: string
) => {
  if (!interpreterId || interpreterId === 'unassigned') return;

  try {
    const q = query(collection(db, 'users'), where('profileId', '==', interpreterId));
    const userSnap = await getDocs(q);
    const userId = !userSnap.empty
      ? userSnap.docs[0].id
      : MOCK_USERS.find(u => u.profileId === interpreterId)?.id;

    if (userId) await NotificationService.notify(userId, title, message, type, link);
  } catch (e) {
    console.warn('[BillingService] Failed to notify interpreter user', e);
  }
};

const dispatchTimesheetSubmittedComms = async (booking: Booking, timesheet: Timesheet) => {
  const ref = booking.displayRef || booking.jobNumber || booking.bookingRef || booking.id.slice(0, 8);
  const interpreterData = await getInterpreterEmailData(timesheet.interpreterId || booking.interpreterId);

  await Promise.allSettled([
    NotificationService.notifyAdmins(
      'Timesheet submitted',
      `Job ${ref} has a timesheet waiting for verification.`,
      NotificationType.PAYMENT,
      `/admin/bookings/${booking.id}`
    ),
    notifyInterpreterUser(
      timesheet.interpreterId || booking.interpreterId,
      'Timesheet received',
      `Your timesheet for job ${ref} has been received and is waiting for verification.`,
      NotificationType.SUCCESS,
      '/interpreter/timesheets'
    ),
    EmailService.sendStatusEmail(
      { ...booking, status: BookingStatus.TIMESHEET_SUBMITTED },
      BookingStatus.TIMESHEET_SUBMITTED,
      interpreterData
    )
  ]);
};

const dispatchReadyForInvoiceComms = async (booking: Booking, timesheet?: Timesheet | null) => {
  const ref = booking.displayRef || booking.jobNumber || booking.bookingRef || booking.id.slice(0, 8);
  const interpreterData = await getInterpreterEmailData(timesheet?.interpreterId || booking.interpreterId);

  await Promise.allSettled([
    NotificationService.notifyAdmins(
      'Ready for invoice',
      `Job ${ref} has been verified and is ready for invoicing.`,
      NotificationType.PAYMENT,
      `/admin/bookings/${booking.id}`
    ),
    notifyInterpreterUser(
      timesheet?.interpreterId || booking.interpreterId,
      'Timesheet approved',
      `Your timesheet for job ${ref} has been approved and moved to finance.`,
      NotificationType.SUCCESS,
      '/interpreter/timesheets'
    ),
    EmailService.sendStatusEmail(
      { ...booking, status: BookingStatus.READY_FOR_INVOICE },
      BookingStatus.READY_FOR_INVOICE,
      interpreterData
    )
  ]);
};

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
  getClientInvoices: async (statusOrClientId?: string) => {
    const invoiceStatuses = Object.values(InvoiceStatus) as string[];
    const statusFilter = statusOrClientId && invoiceStatuses.includes(statusOrClientId) ? statusOrClientId : undefined;
    const clientIdFilter = statusOrClientId && !statusFilter && statusOrClientId !== 'ALL' ? statusOrClientId : undefined;
    try {
      const snap = await getDocs(query(collection(db, "clientInvoices"), orderBy("issueDate", "desc")));
      let filteredDocs = snap.docs;
      if (statusFilter && statusFilter !== 'ALL') {
        filteredDocs = filteredDocs.filter(d => d.data().status === statusFilter);
      }
      if (clientIdFilter) {
        filteredDocs = filteredDocs.filter(d => d.data().clientId === clientIdFilter);
      }
      return filteredDocs.map(d => ({ id: d.id, ...d.data() } as ClientInvoice));
    } catch (e) {
      console.warn("Using Mock Client Invoices");
      return MOCK_CLIENT_INVOICES
        .filter(inv => !statusFilter || statusFilter === 'ALL' || inv.status === statusFilter)
        .filter(inv => !clientIdFilter || inv.clientId === clientIdFilter);
    }
  },

  getClientInvoiceById: async (id: string) => {
    try {
      const d = await getDoc(doc(db, "clientInvoices", id));
      if (!d.exists()) return MOCK_CLIENT_INVOICES.find(i => i.id === id) || null;

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
      return MOCK_CLIENT_INVOICES.find(i => i.id === id) || null;
    }
  },

  updateClientInvoiceStatus: async (id: string, status: InvoiceStatus) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "clientInvoices", id), { status, updatedAt: serverTimestamp() });

      if (status === InvoiceStatus.PAID) {
        const linesQ = query(collection(db, "clientInvoiceLines"), where("invoiceId", "==", id));
        const linesSnap = await getDocs(linesQ);
        linesSnap.docs.forEach(lineDoc => {
          const line = lineDoc.data() as any;
          if (line.timesheetId) {
            batch.update(doc(db, 'timesheets', line.timesheetId), {
              status: 'INVOICED',
              updatedAt: serverTimestamp()
            });
          }
          if (line.bookingId) {
            batch.update(doc(db, 'bookings', line.bookingId), {
              status: BookingStatus.PAID,
              clientInvoiceId: id,
              paymentStatus: 'PAID',
              paidAt: new Date().toISOString(),
              updatedAt: serverTimestamp()
            });
          }
        });
      }

      await batch.commit();
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
      // Mock data for client and total/dueDate are not available in this scope,
      // so we'll use placeholders that match the original mock logic where possible.
      // The instruction implies these variables exist in the context of the full function.
      // For now, we'll use the original mock values for clientName, total, and dueDate.
      const client = { companyName: 'Mock Client' }; // Placeholder for client object
      const total = 150.00; // Placeholder for total amount
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Placeholder for dueDate
      const newInvoice: ClientInvoice = {
        id: `inv-c-${Date.now()}`,
        organizationId: 'org-123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        clientId,
        clientName: client?.companyName || 'Client',
        reference: `INV-${Date.now()}`,
        invoiceNumber: `INV-${Date.now()}`,
        status: InvoiceStatus.DRAFT,
        issueDate: new Date().toISOString(),
        dueDate: dueDate.toISOString(),
        periodStart: periodStart || new Date().toISOString(),
        periodEnd: periodEnd || new Date().toISOString(),
        totalAmount: total,
        currency: 'GBP',
        items: []
      } as ClientInvoice;
      MOCK_CLIENT_INVOICES.push(newInvoice);
      saveMockData();
      return { success: true, total: 150.00, invoiceId: newInvoice.id };
    }
  },

  getInterpreterInvoices: async (statusOrInterpreterId?: string) => {
    const invoiceStatuses = Object.values(InvoiceStatus) as string[];
    const statusFilter = statusOrInterpreterId && invoiceStatuses.includes(statusOrInterpreterId) ? statusOrInterpreterId : undefined;
    const interpreterIdFilter = statusOrInterpreterId && !statusFilter && statusOrInterpreterId !== 'ALL' ? statusOrInterpreterId : undefined;
    try {
      const [photoMap, snap] = await Promise.all([
        InterpreterService.getPhotoMap(),
        getDocs(query(collection(db, "interpreterInvoices"), orderBy("issueDate", "desc")))
      ]);
      
      let filteredDocs = snap.docs;
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
      const photoMap = await InterpreterService.getPhotoMap();
      return MOCK_INTERPRETER_INVOICES
        .filter(inv => !statusFilter || statusFilter === 'ALL' || inv.status === statusFilter)
        .filter(inv => !interpreterIdFilter || inv.interpreterId === interpreterIdFilter)
        .map(inv => ({
        ...inv,
        interpreterPhotoUrl: inv.interpreterPhotoUrl || photoMap[inv.interpreterId]
      }));
    }
  },

  getInterpreterInvoiceById: async (id: string) => {
    try {
      const [photoMap, d] = await Promise.all([
        InterpreterService.getPhotoMap(),
        getDoc(doc(db, "interpreterInvoices", id))
      ]);
      
      if (!d.exists()) {
        const mockInv = MOCK_INTERPRETER_INVOICES.find(i => i.id === id);
        if (mockInv) return { ...mockInv, interpreterPhotoUrl: mockInv.interpreterPhotoUrl || photoMap[mockInv.interpreterId] };
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
      const photoMap = await InterpreterService.getPhotoMap();
      const inv = MOCK_INTERPRETER_INVOICES.find(i => i.id === id);
      if (inv) return { ...inv, interpreterPhotoUrl: inv.interpreterPhotoUrl || photoMap[inv.interpreterId] };
      return null;
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

  createInterpreterInvoiceUpload: async (interpreterId: string, timesheetIds: string[], ref: string, amount: number, uploadedPdfUrl?: string): Promise<InterpreterInvoice> => {
    const interpreter = await InterpreterService.getById(interpreterId);
    const invoicePayload = {
      organizationId: interpreter?.organizationId || 'lingland-main',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      interpreterId,
      interpreterName: interpreter?.name || 'Interpreter',
      model: 'UPLOAD' as const,
      status: InvoiceStatus.SUBMITTED,
      externalInvoiceReference: ref,
      totalAmount: amount,
      issueDate: new Date().toISOString(),
      items: [],
      currency: 'GBP',
      ...(uploadedPdfUrl ? { uploadedPdfUrl } : {})
    };

    try {
      const selectedTimesheets = await Promise.all(timesheetIds.map(async tsId => {
        const tsDoc = await getDoc(doc(db, 'timesheets', tsId));
        return tsDoc.exists() ? { id: tsDoc.id, ...tsDoc.data() } as Timesheet : null;
      }));

      const invoiceRef = doc(collection(db, 'interpreterInvoices'));
      const batch = writeBatch(db);
      batch.set(invoiceRef, invoicePayload);

      selectedTimesheets.filter(Boolean).forEach((timesheet) => {
        const ts = timesheet as Timesheet;
        const lineRef = doc(collection(db, 'interpreterInvoiceLines'));
        batch.set(lineRef, {
          interpreterInvoiceId: invoiceRef.id,
          timesheetId: ts.id,
          bookingId: ts.bookingId,
          description: `Timesheet ${ts.bookingId}`,
          units: ts.unitsPayableToInterpreter || ts.sessionDurationMinutes || ts.wordCount || 1,
          rate: 0,
          total: getTimesheetInterpreterAmount(ts),
          createdAt: new Date().toISOString()
        });
        batch.update(doc(db, 'timesheets', ts.id), {
          interpreterInvoiceId: invoiceRef.id,
          readyForInterpreterInvoice: false,
          updatedAt: serverTimestamp()
        });
        if (ts.bookingId) {
          batch.update(doc(db, 'bookings', ts.bookingId), {
            interpreterInvoiceId: invoiceRef.id,
            interpreterInvoiceReference: ref,
            interpreterInvoiceNumber: ref,
            updatedAt: serverTimestamp()
          });
        }
      });

      await batch.commit();
      return { id: invoiceRef.id, ...invoicePayload } as InterpreterInvoice;
    } catch (e) {
      console.warn("Interpreter invoice upload fell back to mock data", e);
    }

    const newInvoice: InterpreterInvoice = {
      id: `inv-i-${Date.now()}`,
      ...invoicePayload
    };

    timesheetIds.forEach(tsId => {
      const ts = MOCK_TIMESHEETS.find(t => t.id === tsId);
      if (ts) {
        ts.interpreterInvoiceId = newInvoice.id;
        ts.readyForInterpreterInvoice = false;
      }
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

  getTimesheetByBookingId: async (bookingId: string): Promise<Timesheet | null> => {
    try {
      const q = query(collection(db, "timesheets"), where("bookingId", "==", bookingId));
      const snap = await getDocs(q);
      if (snap.empty) {
        return MOCK_TIMESHEETS.find(t => t.bookingId === bookingId) || null;
      }
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as Timesheet;
    } catch (e) {
      return MOCK_TIMESHEETS.find(t => t.bookingId === bookingId) || null;
    }
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
      const tsDoc = await getDoc(doc(db, "timesheets", id));
      if (!tsDoc.exists()) throw new Error("Timesheet not found");
      const ts = tsDoc.data() as Timesheet;

      const batch = writeBatch(db);
      batch.update(tsDoc.ref, {
        adminApproved: true,
        adminApprovedAt: new Date().toISOString(),
        status: 'INVOICING',
        readyForClientInvoice: true,
        readyForInterpreterInvoice: true,
        updatedAt: serverTimestamp()
      });

      if (ts.bookingId) {
        batch.update(doc(db, 'bookings', ts.bookingId), {
          status: BookingStatus.READY_FOR_INVOICE,
          timesheetId: id,
          timesheetStatus: 'APPROVED',
          timesheetVerifiedAt: new Date().toISOString(),
          billingReadyAt: new Date().toISOString(),
          paymentStatus: 'READY_FOR_INVOICE',
          billingIssueFlag: false,
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();

      const booking = await getBookingForBillingComms(ts.bookingId, BookingStatus.READY_FOR_INVOICE);
      if (booking) await dispatchReadyForInvoiceComms(booking, { ...ts, id } as Timesheet);

    } catch (e) {
      console.error("Error approving timesheet:", e);
      const ts = MOCK_TIMESHEETS.find(t => t.id === id);
      if (ts) {
        ts.adminApproved = true;
        ts.status = 'INVOICING';
        ts.readyForClientInvoice = true;
        ts.readyForInterpreterInvoice = true;

        const b = MOCK_BOOKINGS.find(book => book.id === ts.bookingId);
        if (b) {
          b.status = BookingStatus.READY_FOR_INVOICE;
          b.timesheetId = id;
          b.timesheetStatus = 'APPROVED';
          b.timesheetVerifiedAt = new Date().toISOString();
          b.billingReadyAt = new Date().toISOString();
          b.paymentStatus = 'READY_FOR_INVOICE';
          b.billingIssueFlag = false;
        }

        saveMockData();
      }
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
      // Mock fallback
      const ts = MOCK_TIMESHEETS.find(t => t.bookingId === bookingId);
      if (ts) await BillingService.approveTimesheet(ts.id);
      else {
        throw new Error('Timesheet required before verification. Create a timesheet or exception claim first.');
      }
    }
  },

  recordManualInvoiceIssued: async (bookingId: string): Promise<void> => {
    try {
      const bookingRef = doc(db, 'bookings', bookingId);
      const bookingSnap = await getDoc(bookingRef);
      if (!bookingSnap.exists()) throw new Error('Booking not found');
      const booking = { id: bookingSnap.id, ...bookingSnap.data() } as Booking;
      if (booking.status !== BookingStatus.READY_FOR_INVOICE) {
        throw new Error('Job must be ready for invoice before marking it invoiced.');
      }
      const manualInvoiceRef = booking.clientInvoiceReference || booking.clientInvoiceNumber || `MANUAL-${booking.displayRef || booking.jobNumber || booking.bookingRef || booking.id.slice(0, 8)}`;

      await updateDoc(bookingRef, {
        status: BookingStatus.INVOICED,
        clientInvoiceReference: manualInvoiceRef,
        clientInvoiceNumber: manualInvoiceRef,
        paymentStatus: 'INVOICED',
        billingIssueFlag: false,
        invoicedAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'jobEvents'), {
        jobId: booking.id,
        organizationId: booking.organizationId || 'lingland-main',
        type: 'CLIENT_INVOICE_GENERATED',
        source: 'admin',
        description: 'Invoice issue was recorded manually by staff.',
        metadata: {
          fromStatus: booking.status,
          toStatus: BookingStatus.INVOICED,
          recordedByStaff: true,
          source: 'manual_staff'
        },
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      const mockBooking = MOCK_BOOKINGS.find(b => b.id === bookingId);
      if (mockBooking && mockBooking.status === BookingStatus.READY_FOR_INVOICE) {
        const manualInvoiceRef = mockBooking.clientInvoiceReference || mockBooking.clientInvoiceNumber || `MANUAL-${mockBooking.displayRef || mockBooking.jobNumber || mockBooking.bookingRef || mockBooking.id.slice(0, 8)}`;
        mockBooking.status = BookingStatus.INVOICED;
        mockBooking.clientInvoiceReference = manualInvoiceRef;
        mockBooking.clientInvoiceNumber = manualInvoiceRef;
        mockBooking.paymentStatus = 'INVOICED';
        mockBooking.billingIssueFlag = false;
        mockBooking.invoicedAt = new Date().toISOString();
        saveMockData();
        return;
      }
      throw e;
    }
  },

  recordManualPaymentReceived: async (bookingId: string): Promise<void> => {
    try {
      const bookingRef = doc(db, 'bookings', bookingId);
      const bookingSnap = await getDoc(bookingRef);
      if (!bookingSnap.exists()) throw new Error('Booking not found');
      const booking = { id: bookingSnap.id, ...bookingSnap.data() } as Booking;
      if (booking.status !== BookingStatus.INVOICED) {
        throw new Error('Job must be invoiced before marking payment received.');
      }

      await updateDoc(bookingRef, {
        status: BookingStatus.PAID,
        paymentStatus: 'PAID',
        paidAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'jobEvents'), {
        jobId: booking.id,
        organizationId: booking.organizationId || 'lingland-main',
        type: 'CLIENT_PAYMENT_RECEIVED',
        source: 'admin',
        description: 'Client payment was recorded manually by staff.',
        metadata: {
          fromStatus: booking.status,
          toStatus: BookingStatus.PAID,
          recordedByStaff: true,
          source: 'manual_staff'
        },
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      const mockBooking = MOCK_BOOKINGS.find(b => b.id === bookingId);
      if (mockBooking && mockBooking.status === BookingStatus.INVOICED) {
        mockBooking.status = BookingStatus.PAID;
        mockBooking.paymentStatus = 'PAID';
        mockBooking.paidAt = new Date().toISOString();
        saveMockData();
        return;
      }
      throw e;
    }
  },

  getInterpreterTimesheets: async (interpreterId: string): Promise<Timesheet[]> => {
    return safeFetch(async () => {
      const q = query(collection(db, 'timesheets'), where('interpreterId', '==', interpreterId));
      const snap = await getDocs(q);
      return snap.docs.map(d => convertDoc<Timesheet>(d));
    }, MOCK_TIMESHEETS.filter(t => t.interpreterId === interpreterId));
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
      return 340.50; // Mock fallback
    }
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
    const now = new Date().toISOString();
    const newTs: Omit<Timesheet, 'id'> = {
      organizationId: data.organizationId || 'lingland-main',
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      bookingId: data.bookingId!,
      interpreterId: data.interpreterId!,
      clientId: data.clientId!,
      submittedAt: now,
      sessionMode: data.sessionMode || SessionMode.F2F,
      actualStart: data.actualStart || new Date().toISOString(),
      actualEnd: data.actualEnd || new Date().toISOString(),
      sessionDurationMinutes: data.sessionDurationMinutes || 0,
      sessionFees: data.sessionFees || 0,
      travelTimeMinutes: data.travelTimeMinutes || 0,
      travelFees: data.travelFees || 0,
      mileage: data.mileage || 0,
      mileageFees: data.mileageFees || 0,
      parking: data.parking || 0,
      transport: data.transport || 0,
      totalToPay: data.totalToPay || 0,
      breakDurationMinutes: data.breakDurationMinutes || 0,
      // Translation-specific fields
      wordCount: data.wordCount || 0,
      unitPrice: data.unitPrice || 0,
      units: data.units || 'hours',
      interpreterAmountCalculated: data.interpreterAmountCalculated || 0,
      clientAmountCalculated: data.clientAmountCalculated || 0,
      adminApproved: false,
      status: 'SUBMITTED' as const,
      readyForClientInvoice: false,
      readyForInterpreterInvoice: false,
      unitsBillableToClient: data.unitsBillableToClient || data.wordCount || data.sessionDurationMinutes || 0,
      unitsPayableToInterpreter: data.unitsPayableToInterpreter || data.wordCount || data.sessionDurationMinutes || 0,
      clientInvoiceId: null,
      interpreterInvoiceId: null,
      supportingDocumentUrl: data.supportingDocumentUrl,
      clientSignatureUrl: data.clientSignatureUrl,
      clientNameSigned: data.clientNameSigned,
      source: data.source || 'INTERPRETER_APP',
      recordedByStaff: Boolean(data.recordedByStaff)
    };
    try {
      const existingQ = query(collection(db, 'timesheets'), where('bookingId', '==', data.bookingId));
      const existingSnap = await getDocs(existingQ);
      if (!existingSnap.empty) {
        throw new Error('A timesheet has already been submitted for this booking.');
      }

      const batch = writeBatch(db);
      const tsRef = doc(collection(db, 'timesheets'));
      const cleanNewTs = Object.fromEntries(Object.entries(newTs).filter(([, value]) => value !== undefined));
      batch.set(tsRef, cleanNewTs);

      if (data.bookingId) {
        batch.update(doc(db, 'bookings', data.bookingId), {
          status: 'TIMESHEET_SUBMITTED',
          timesheetId: tsRef.id,
          timesheetStatus: 'SUBMITTED',
          timesheetSubmittedAt: new Date().toISOString(),
          paymentStatus: 'NOT_READY',
          clientInvoiceId: null,
          interpreterInvoiceId: null,
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();
      const createdTimesheet = { id: tsRef.id, ...cleanNewTs } as Timesheet;
      const booking = await getBookingForBillingComms(data.bookingId, BookingStatus.TIMESHEET_SUBMITTED);
      if (booking) await dispatchTimesheetSubmittedComms(booking, createdTimesheet);
      return createdTimesheet;
    } catch (e: any) {
      if (e?.message?.includes('already been submitted')) throw e;
      const mockTs = { id: `ts-${Date.now()}`, ...newTs } as Timesheet;
      MOCK_TIMESHEETS.push(mockTs);
      const mockBooking = MOCK_BOOKINGS.find(b => b.id === data.bookingId);
      if (mockBooking) {
        mockBooking.status = BookingStatus.TIMESHEET_SUBMITTED;
        mockBooking.timesheetId = mockTs.id;
        mockBooking.timesheetStatus = 'SUBMITTED';
        mockBooking.timesheetSubmittedAt = new Date().toISOString();
        mockBooking.paymentStatus = 'NOT_READY';
        mockBooking.clientInvoiceId = null;
        mockBooking.interpreterInvoiceId = null;
      }
      saveMockData();
      return mockTs;
    }
  },

  recordManualTimesheetReceived: async (bookingId: string): Promise<Timesheet> => {
    const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
    const booking = bookingSnap.exists()
      ? ({ id: bookingSnap.id, ...bookingSnap.data() } as Booking)
      : MOCK_BOOKINGS.find(b => b.id === bookingId);

    if (!booking) throw new Error('Booking not found');
    if (!booking.clientId) throw new Error('Booking has no client linked');
    if (!booking.interpreterId) throw new Error('Booking has no interpreter assigned');
    if (booking.status !== BookingStatus.SESSION_COMPLETED) {
      throw new Error('Session must be marked completed before recording a timesheet.');
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

    try {
      await addDoc(collection(db, 'jobEvents'), {
        jobId: booking.id,
        organizationId: booking.organizationId || 'lingland-main',
        type: 'TIMESHEET_SUBMITTED',
        source: 'admin',
        description: 'Timesheet receipt was recorded manually by staff.',
        metadata: {
          timesheetId: timesheet.id,
          recordedByStaff: true,
          source: 'manual_staff'
        },
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn('[BillingService] Failed to write manual timesheet event', e);
    }

    return timesheet;
  },

  createNonExecutedJobClaim: async (bookingId: string, reason: string = 'Job was not executed'): Promise<Timesheet> => {
    const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
    const booking = bookingSnap.exists()
      ? ({ id: bookingSnap.id, ...bookingSnap.data() } as Booking)
      : MOCK_BOOKINGS.find(b => b.id === bookingId);

    if (!booking) throw new Error('Booking not found');
    if (!booking.clientId) throw new Error('Booking has no client linked');

    const settings = await SystemService.getSettings();
    const windowHours = settings?.operations?.cancellationWindowHours ?? 24;
    const scheduledStart = new Date(`${booking.date}T${booking.startTime || '00:00'}:00`);
    const hoursUntilStart = (scheduledStart.getTime() - Date.now()) / 36e5;
    const billableCancellation = hoursUntilStart <= windowHours;
    const durationMinutes = booking.durationMinutes || 60;
    const durationHours = Math.max(durationMinutes / 60, 1);
    const clientAmount = billableCancellation ? Number((durationHours * 40).toFixed(2)) : 0;
    const interpreterAmount = billableCancellation && booking.interpreterId ? Number((durationHours * 25).toFixed(2)) : 0;
    const actualStart = `${booking.date}T${booking.startTime || '00:00'}:00`;
    const actualEnd = new Date(new Date(actualStart).getTime() + durationMinutes * 60000).toISOString();

    const now = new Date().toISOString();
    const newTs: Omit<Timesheet, 'id'> = {
      organizationId: booking.organizationId || 'lingland-main',
      createdAt: now,
      updatedAt: now,
      bookingId: booking.id,
      interpreterId: booking.interpreterId || 'unassigned',
      clientId: booking.clientId,
      submittedAt: now,
      sessionMode: SessionMode.CANCELLATION,
      actualStart,
      actualEnd,
      sessionDurationMinutes: durationMinutes,
      sessionFees: interpreterAmount,
      travelTimeMinutes: 0,
      travelFees: 0,
      mileage: 0,
      mileageFees: 0,
      parking: 0,
      transport: 0,
      totalToPay: interpreterAmount,
      breakDurationMinutes: 0,
      wordCount: 0,
      unitPrice: 0,
      units: 'hours' as const,
      interpreterAmountCalculated: interpreterAmount,
      clientAmountCalculated: clientAmount,
      adminApproved: false,
      status: 'SUBMITTED' as const,
      readyForClientInvoice: false,
      readyForInterpreterInvoice: false,
      unitsBillableToClient: billableCancellation ? durationHours : 0,
      unitsPayableToInterpreter: billableCancellation && booking.interpreterId ? durationHours : 0,
      clientInvoiceId: null,
      interpreterInvoiceId: null,
      nonExecutionReason: reason,
      billableCancellation,
      exceptionType: 'CANCELLATION' as const,
      source: 'STAFF_MANUAL',
      recordedByStaff: true
    };

    try {
      const existingQ = query(collection(db, 'timesheets'), where('bookingId', '==', booking.id));
      const existingSnap = await getDocs(existingQ);
      if (!existingSnap.empty) throw new Error('A timesheet or exception claim already exists for this booking.');

      const batch = writeBatch(db);
      const tsRef = doc(collection(db, 'timesheets'));
      batch.set(tsRef, newTs);
      batch.update(doc(db, 'bookings', booking.id), {
        status: BookingStatus.TIMESHEET_SUBMITTED,
        timesheetId: tsRef.id,
        timesheetStatus: 'SUBMITTED',
        timesheetSubmittedAt: new Date().toISOString(),
        paymentStatus: 'NOT_READY',
        clientInvoiceId: null,
        interpreterInvoiceId: null,
        adminNotes: `${booking.adminNotes ? `${booking.adminNotes}\n` : ''}Not executed: ${reason}`,
        updatedAt: serverTimestamp()
      });
      await batch.commit();
      const createdTimesheet = { id: tsRef.id, ...newTs } as Timesheet;
      await dispatchTimesheetSubmittedComms(
        { ...booking, status: BookingStatus.TIMESHEET_SUBMITTED },
        createdTimesheet
      );
      return createdTimesheet;
    } catch (e: any) {
      if (e?.message?.includes('already exists')) throw e;
      const mockTs = { id: `ts-ex-${Date.now()}`, ...newTs } as Timesheet;
      MOCK_TIMESHEETS.push(mockTs);
      const mockBooking = MOCK_BOOKINGS.find(b => b.id === booking.id);
      if (mockBooking) {
        mockBooking.status = BookingStatus.TIMESHEET_SUBMITTED;
        mockBooking.timesheetId = mockTs.id;
        mockBooking.timesheetStatus = 'SUBMITTED';
        mockBooking.timesheetSubmittedAt = new Date().toISOString();
        mockBooking.paymentStatus = 'NOT_READY';
        mockBooking.clientInvoiceId = null;
        mockBooking.interpreterInvoiceId = null;
        mockBooking.adminNotes = `${mockBooking.adminNotes ? `${mockBooking.adminNotes}\n` : ''}Not executed: ${reason}`;
      }
      saveMockData();
      return mockTs;
    }
  },

  calculateBookingTotal: async (bookingId: string): Promise<number> => {
    try {
      const bookingDoc = await getDoc(doc(db, 'bookings', bookingId));
      if (!bookingDoc.exists()) return 0;
      const data = bookingDoc.data();
      
      // Markup logic from Airtable: interpreterCost + margin
      // margin is GBP 21 for OOH, GBP 17 for standard
      const margin = data.isOOH ? 21 : 17;
      
      // Calculate based on duration (h) * interpreterRate + margin
      const durationHours = (data.durationMinutes || 60) / 60;
      const interpreterRate = 25; // Default mock; in reality fetch from interpreter/rates
      
      const subtotal = (durationHours * interpreterRate) + margin;
      const vat = subtotal * 0.20;
      
      return Number((subtotal + vat).toFixed(2));
    } catch {
      const b = MOCK_BOOKINGS.find(book => book.id === bookingId);
      if (!b) return 0;
      const margin = b.isOOH ? 21 : 17;
      const subtotal = (b.durationMinutes / 60 * 25) + margin;
      return Number((subtotal * 1.20).toFixed(2));
    }
  },

  calculateBookingTotalSync: (booking: Booking): number => {
    if (!booking) return 0;
    // Markup logic from Airtable: interpreterCost + margin
    const margin = booking.isOOH ? 21 : 17;
    
    // Calculate based on duration (h) * interpreterRate + margin
    const durationHours = (booking.durationMinutes || 60) / 60;
    const interpreterRate = 25; // Default mock; in reality fetch from interpreter/rates
    
    const subtotal = (durationHours * interpreterRate) + margin;
    const vat = subtotal * 0.20;
    
    return Number((subtotal + vat).toFixed(2));
  },

  getSageCode: (category: ServiceCategory, mode: SessionMode, isOOH: boolean): SageCode => {
    if (category === ServiceCategory.TRANSLATION) return SageCode.I010;
    
    if (mode === SessionMode.VIDEO) return isOOH ? SageCode.I008 : SageCode.I002;
    if (mode === SessionMode.PHONE) return isOOH ? SageCode.I009 : SageCode.I003;
    
    // Default F2F
    return isOOH ? SageCode.I007 : SageCode.I001;
  }
};
