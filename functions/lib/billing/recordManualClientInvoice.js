"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordManualClientInvoice = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const clientFinanceScope_1 = require("../clients/clientFinanceScope");
const db = admin.firestore();
const assertAdmin = async (uid) => {
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
    const user = await db.collection('users').doc(uid).get();
    if (!user.exists || user.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(String(user.data()?.role || ''))) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can record client invoices');
    }
};
exports.recordManualClientInvoice = functions.https.onCall(async (data, context) => {
    await assertAdmin(context.auth?.uid);
    const bookingId = String(data?.bookingId || '').trim();
    const requestedReference = String(data?.reference || '').trim().slice(0, 120);
    if (!bookingId)
        throw new functions.https.HttpsError('invalid-argument', 'bookingId is required');
    const bookingRef = db.collection('bookings').doc(bookingId);
    const invoiceRef = db.collection('clientInvoices').doc(`manual_${bookingId}`);
    const now = new Date().toISOString();
    const result = await db.runTransaction(async (transaction) => {
        const [booking, existingInvoice, timesheets] = await Promise.all([
            transaction.get(bookingRef),
            transaction.get(invoiceRef),
            transaction.get(db.collection('timesheets').where('bookingId', '==', bookingId).limit(1)),
        ]);
        if (!booking.exists)
            throw new functions.https.HttpsError('not-found', 'Booking not found');
        if (existingInvoice.exists)
            return { id: invoiceRef.id, ...existingInvoice.data(), idempotent: true };
        const bookingData = booking.data() || {};
        if (String(bookingData.status || '') !== 'READY_FOR_INVOICE') {
            throw new functions.https.HttpsError('failed-precondition', 'The job must be ready for invoice');
        }
        if (timesheets.empty || !timesheets.docs[0].data().adminApproved) {
            throw new functions.https.HttpsError('failed-precondition', 'An approved timesheet is required');
        }
        const timesheet = timesheets.docs[0];
        const subtotal = Number(timesheet.data().clientAmountCalculated || 0);
        if (!Number.isFinite(subtotal) || subtotal <= 0) {
            throw new functions.https.HttpsError('failed-precondition', 'The approved client amount is missing');
        }
        const settings = await transaction.get(db.collection('system').doc('settings'));
        const client = bookingData.clientId
            ? await transaction.get(db.collection('clients').doc(String(bookingData.clientId)))
            : null;
        const configuredVatRate = Number(settings.data()?.finance?.vatRate ?? 0.20);
        const vatRate = configuredVatRate > 1 ? configuredVatRate / 100 : configuredVatRate;
        if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1) {
            throw new functions.https.HttpsError('failed-precondition', 'The VAT configuration is invalid');
        }
        const vatAmount = Number((subtotal * vatRate).toFixed(2));
        const totalAmount = Number((subtotal + vatAmount).toFixed(2));
        const paymentTermsDays = Number(client?.data()?.paymentTermsDays ?? settings.data()?.finance?.paymentTermsDays ?? 30);
        const dueDate = new Date(new Date(now).getTime() + Math.max(0, paymentTermsDays) * 86400000).toISOString();
        const reference = requestedReference || String(bookingData.clientInvoiceReference || bookingData.clientInvoiceNumber || `MANUAL-${bookingData.displayRef || bookingData.jobNumber || bookingId}`);
        const hierarchy = (0, clientFinanceScope_1.projectClientFinanceHierarchy)([{ id: bookingId, ...bookingData }]);
        const lineHierarchy = (0, clientFinanceScope_1.projectClientInvoiceLineHierarchy)(bookingData);
        const invoice = {
            organizationId: bookingData.organizationId || 'lingland-main',
            clientId: bookingData.clientId || '',
            clientName: bookingData.clientName || 'Client',
            reference,
            invoiceNumber: reference,
            externalInvoiceReference: reference,
            status: 'SENT',
            issueDate: now,
            dueDate,
            subtotal,
            vatRate,
            vatAmount,
            totalAmount,
            currency: bookingData.currency || 'GBP',
            lineCount: 1,
            financialIntegrityStatus: 'VERIFIED',
            referenceIntegrityStatus: 'VERIFIED',
            source: 'STAFF_MANUAL',
            ...hierarchy,
            createdBy: context.auth.uid,
            createdAt: now,
            updatedAt: now,
        };
        transaction.set(invoiceRef, invoice);
        transaction.set(db.collection('clientInvoiceLines').doc(`${invoiceRef.id}_${timesheet.id}`), {
            invoiceId: invoiceRef.id,
            timesheetId: timesheet.id,
            bookingId,
            description: bookingData.displayRef || bookingData.jobNumber || bookingId,
            units: Number(timesheet.data().unitsBillableToClient || 1),
            rate: 0,
            total: subtotal,
            ...lineHierarchy,
            createdAt: now,
        });
        transaction.update(timesheet.ref, {
            clientInvoiceId: invoiceRef.id,
            readyForClientInvoice: false,
            status: 'INVOICED',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(bookingRef, {
            status: 'INVOICED',
            clientInvoiceId: invoiceRef.id,
            clientInvoiceReference: reference,
            clientInvoiceNumber: reference,
            paymentStatus: 'INVOICED',
            invoicedAt: now,
            billingIssueFlag: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.set(db.collection('jobEvents').doc(), {
            jobId: bookingId,
            organizationId: bookingData.organizationId || 'lingland-main',
            type: 'CLIENT_INVOICE_GENERATED',
            source: 'admin',
            metadata: { clientInvoiceId: invoiceRef.id, reference, recordedByStaff: true },
            createdAt: now,
        });
        return { id: invoiceRef.id, ...invoice, idempotent: false };
    });
    return { success: true, invoice: result };
});
//# sourceMappingURL=recordManualClientInvoice.js.map