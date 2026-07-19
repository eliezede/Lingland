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
exports.generateClientInvoice = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
const clientFinanceScope_1 = require("../clients/clientFinanceScope");
const db = admin.firestore();
const MAX_TIMESHEETS_PER_INVOICE = 150;
const assertAdmin = async (uid) => {
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'You must be signed in to generate invoices');
    const caller = await db.collection('users').doc(uid).get();
    if (!caller.exists || caller.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(String(caller.data()?.role || ''))) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can generate client invoices');
    }
};
const validPeriod = (value) => {
    const text = String(value || '');
    if (!text || Number.isNaN(new Date(text).getTime())) {
        throw new functions.https.HttpsError('invalid-argument', 'A valid invoice period is required');
    }
    return text;
};
exports.generateClientInvoice = functions.https.onCall(async (data, context) => {
    await assertAdmin(context.auth?.uid);
    const clientId = String(data?.clientId || '').trim();
    const periodStart = validPeriod(data?.periodStart);
    const periodEnd = validPeriod(data?.periodEnd);
    if (!clientId)
        throw new functions.https.HttpsError('invalid-argument', 'Client ID is required');
    if (new Date(periodStart) > new Date(periodEnd)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invoice period start must be before period end');
    }
    const eligibleQuery = db.collection('timesheets')
        .where('clientId', '==', clientId)
        .where('readyForClientInvoice', '==', true)
        .where('actualStart', '>=', periodStart)
        .where('actualStart', '<=', periodEnd)
        .limit(MAX_TIMESHEETS_PER_INVOICE);
    const initial = await eligibleQuery.get();
    const candidates = initial.docs.filter(item => !item.data().clientInvoiceId);
    if (candidates.length === 0) {
        return { success: false, message: 'No eligible timesheets found for this period' };
    }
    const generationKey = (0, crypto_1.createHash)('sha256')
        .update(`${clientId}:${candidates.map(item => item.id).sort().join(',')}`)
        .digest('hex');
    const invoiceRef = db.collection('clientInvoices').doc(`client_${generationKey.slice(0, 32)}`);
    const settingsRef = db.collection('systemSettings').doc('main');
    const clientRef = db.collection('clients').doc(clientId);
    const candidateBookingIds = Array.from(new Set(candidates
        .map(item => String(item.data().bookingId || '').trim())
        .filter(Boolean)));
    const bookingRefs = candidateBookingIds.map(bookingId => db.collection('bookings').doc(bookingId));
    const result = await db.runTransaction(async (transaction) => {
        const reads = await Promise.all([
            transaction.get(invoiceRef),
            transaction.get(settingsRef),
            transaction.get(clientRef),
            ...candidates.map(item => transaction.get(item.ref)),
            ...bookingRefs.map(ref => transaction.get(ref)),
        ]);
        const existingInvoice = reads[0];
        const settingsSnap = reads[1];
        const clientSnap = reads[2];
        const freshTimesheets = reads.slice(3, 3 + candidates.length);
        const freshBookings = reads.slice(3 + candidates.length);
        if (existingInvoice.exists) {
            const value = existingInvoice.data() || {};
            return {
                success: true,
                idempotent: true,
                invoiceId: invoiceRef.id,
                invoiceNumber: value.invoiceNumber,
                count: Number(value.timesheetCount || 0),
                subtotal: Number(value.subtotal || 0),
                vatAmount: Number(value.vatAmount || 0),
                total: Number(value.totalAmount || 0),
            };
        }
        if (!clientSnap.exists)
            throw new functions.https.HttpsError('not-found', 'Client not found');
        const timesheets = freshTimesheets.filter(item => {
            const value = item.data();
            return item.exists && value?.readyForClientInvoice === true && !value?.clientInvoiceId;
        });
        if (timesheets.length === 0) {
            throw new functions.https.HttpsError('already-exists', 'Eligible timesheets were claimed by another invoice');
        }
        const invalidAmounts = timesheets.filter(item => Number(item.data()?.clientAmountCalculated || 0) <= 0);
        if (invalidAmounts.length > 0) {
            throw new functions.https.HttpsError('failed-precondition', `${invalidAmounts.length} timesheet(s) have no approved client amount. Resolve rates before invoicing.`);
        }
        const settings = settingsSnap.data() || {};
        const finance = settings.finance || {};
        const nextNumber = Number(finance.nextInvoiceNumber || 1);
        const invoicePrefix = String(finance.invoicePrefix || 'INV-');
        const invoiceNumber = `${invoicePrefix}${String(nextNumber).padStart(5, '0')}`;
        const configuredVatRate = Number(finance.vatRate ?? 0.20);
        const vatRate = configuredVatRate > 1 ? configuredVatRate / 100 : configuredVatRate;
        if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1) {
            throw new functions.https.HttpsError('failed-precondition', 'Finance VAT configuration is invalid');
        }
        const subtotal = Number(timesheets.reduce((sum, item) => sum + Number(item.data().clientAmountCalculated), 0).toFixed(2));
        const vatAmount = Number((subtotal * vatRate).toFixed(2));
        const totalAmount = Number((subtotal + vatAmount).toFixed(2));
        const client = clientSnap.data() || {};
        const paymentTermsDays = Number(client.paymentTermsDays ?? finance.paymentTermsDays ?? 30);
        const issueDate = new Date();
        const dueDate = new Date(issueDate.getTime() + paymentTermsDays * 86400000);
        const bookingById = new Map(freshBookings
            .filter(booking => booking.exists)
            .map(booking => [booking.id, { id: booking.id, ...(booking.data() || {}) }]));
        const invoiceBookings = timesheets
            .map(timesheet => bookingById.get(String(timesheet.data()?.bookingId || '')))
            .filter((booking) => Boolean(booking));
        const hierarchy = (0, clientFinanceScope_1.projectClientFinanceHierarchy)(invoiceBookings);
        transaction.set(settingsRef, {
            finance: { ...finance, nextInvoiceNumber: nextNumber + 1 },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        timesheets.forEach(timesheet => {
            const value = timesheet.data();
            const booking = bookingById.get(String(value.bookingId || ''));
            const lineHierarchy = (0, clientFinanceScope_1.projectClientInvoiceLineHierarchy)(booking);
            const lineAmount = Number(value.clientAmountCalculated);
            const units = Number(value.unitsBillableToClient || 0);
            const lineRef = db.collection('clientInvoiceLines').doc(`${invoiceRef.id}_${timesheet.id}`);
            transaction.set(lineRef, {
                invoiceId: invoiceRef.id,
                timesheetId: timesheet.id,
                bookingId: value.bookingId,
                interpreterId: value.interpreterId || null,
                description: `Language service - job ${String(value.bookingId || '').slice(0, 12).toUpperCase()}`,
                units,
                rate: units > 0 ? Number((lineAmount / units).toFixed(4)) : lineAmount,
                lineAmount,
                total: lineAmount,
                ...lineHierarchy,
            });
            transaction.update(timesheet.ref, {
                clientInvoiceId: invoiceRef.id,
                readyForClientInvoice: false,
                status: 'INVOICING',
                ...(booking?.clientDepartmentId ? { clientDepartmentId: booking.clientDepartmentId } : {}),
                ...(booking?.requestedByAgentId ? { requestedByAgentId: booking.requestedByAgentId } : {}),
                ...(booking?.requestedByUserId ? { requestedByUserId: booking.requestedByUserId } : {}),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            if (value.bookingId) {
                transaction.set(db.collection('bookings').doc(String(value.bookingId)), {
                    status: 'INVOICED',
                    clientInvoiceId: invoiceRef.id,
                    clientInvoiceNumber: invoiceNumber,
                    clientInvoiceReference: invoiceNumber,
                    paymentStatus: 'INVOICED',
                    invoicedAt: new Date().toISOString(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
        });
        transaction.set(invoiceRef, {
            id: invoiceRef.id,
            generationKey,
            clientId,
            clientName: client.companyName || 'Unknown Client',
            clientEmail: client.invoiceEmail || client.email || '',
            reference: invoiceNumber,
            invoiceNumber,
            issueDate: issueDate.toISOString(),
            dueDate: dueDate.toISOString(),
            periodStart,
            periodEnd,
            status: 'DRAFT',
            subtotal,
            vatRate,
            vatAmount,
            totalAmount,
            currency: finance.currency || 'GBP',
            timesheetCount: timesheets.length,
            lineCount: timesheets.length,
            financialIntegrityStatus: 'VERIFIED',
            referenceIntegrityStatus: 'VERIFIED',
            ...hierarchy,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: context.auth.uid,
        });
        return {
            success: true,
            idempotent: false,
            invoiceId: invoiceRef.id,
            invoiceNumber,
            count: timesheets.length,
            subtotal,
            vatAmount,
            total: totalAmount,
            hasMore: initial.size === MAX_TIMESHEETS_PER_INVOICE,
        };
    });
    return result;
});
//# sourceMappingURL=generateClientInvoice.js.map