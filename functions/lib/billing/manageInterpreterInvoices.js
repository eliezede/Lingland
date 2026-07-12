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
exports.updateInterpreterInvoiceStatus = exports.createInterpreterInvoiceUpload = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
const db = admin.firestore();
const assertAdmin = async (uid) => {
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
    const user = await db.collection('users').doc(uid).get();
    if (!user.exists || user.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(String(user.data()?.role || ''))) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can manage interpreter invoices');
    }
};
const getInvoiceActor = async (uid) => {
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
    const user = await db.collection('users').doc(uid).get();
    const data = user.data() || {};
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(String(data.role || ''));
    const interpreterId = String(data.profileId || '');
    if (!user.exists || data.status !== 'ACTIVE' || (!isAdmin && (data.role !== 'INTERPRETER' || !interpreterId))) {
        throw new functions.https.HttpsError('permission-denied', 'An administrator or active interpreter account is required');
    }
    return { uid, isAdmin, interpreterId };
};
const cleanReference = (value) => String(value || '').trim().slice(0, 120);
const deterministicInvoiceId = (interpreterId, reference) => `upload_${(0, crypto_1.createHash)('sha256').update(`${interpreterId}|${reference.toLowerCase()}`).digest('hex').slice(0, 32)}`;
exports.createInterpreterInvoiceUpload = functions.https.onCall(async (data, context) => {
    const actor = await getInvoiceActor(context.auth?.uid);
    const requestedInterpreterId = String(data?.interpreterId || '').trim();
    const interpreterId = actor.isAdmin ? requestedInterpreterId : actor.interpreterId;
    if (!actor.isAdmin && requestedInterpreterId && requestedInterpreterId !== actor.interpreterId) {
        throw new functions.https.HttpsError('permission-denied', 'Interpreters can only submit their own invoice');
    }
    const timesheetIds = Array.from(new Set((Array.isArray(data?.timesheetIds) ? data.timesheetIds : []).map((value) => String(value)).filter(Boolean)));
    const externalReference = cleanReference(data?.reference);
    const submittedAmount = Number(data?.amount || 0);
    const uploadedPdfUrl = String(data?.uploadedPdfUrl || '').trim().slice(0, 2000);
    if (!interpreterId || !externalReference || timesheetIds.length === 0 || timesheetIds.length > 100) {
        throw new functions.https.HttpsError('invalid-argument', 'Interpreter, invoice reference and 1-100 timesheets are required');
    }
    if (!Number.isFinite(submittedAmount) || submittedAmount < 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Invoice amount is invalid');
    }
    const invoiceId = deterministicInvoiceId(interpreterId, externalReference);
    const invoiceRef = db.collection('interpreterInvoices').doc(invoiceId);
    const interpreterRef = db.collection('interpreters').doc(interpreterId);
    const timesheetRefs = timesheetIds.map(id => db.collection('timesheets').doc(id));
    const now = new Date().toISOString();
    const result = await db.runTransaction(async (transaction) => {
        const interpreter = await transaction.get(interpreterRef);
        if (!interpreter.exists)
            throw new functions.https.HttpsError('not-found', 'Interpreter not found');
        const existingInvoice = await transaction.get(invoiceRef);
        if (existingInvoice.exists)
            return { id: invoiceRef.id, ...existingInvoice.data(), idempotent: true };
        const timesheets = [];
        for (const ref of timesheetRefs)
            timesheets.push(await transaction.get(ref));
        const bookingRefs = timesheets
            .filter(item => item.exists && item.data()?.bookingId)
            .map(item => db.collection('bookings').doc(String(item.data().bookingId)));
        const bookings = [];
        for (const ref of bookingRefs)
            bookings.push(await transaction.get(ref));
        const payableTotal = Number(timesheets.reduce((total, item) => {
            if (!item.exists)
                throw new functions.https.HttpsError('not-found', `Timesheet ${item.id} not found`);
            const value = item.data() || {};
            if (String(value.interpreterId || '') !== interpreterId) {
                throw new functions.https.HttpsError('failed-precondition', 'All selected timesheets must belong to the same interpreter');
            }
            if (!value.adminApproved || !value.readyForInterpreterInvoice || value.interpreterInvoiceId) {
                throw new functions.https.HttpsError('failed-precondition', `Timesheet ${item.id} is not available for invoicing`);
            }
            const amount = Number(value.interpreterAmountCalculated || 0);
            if (!Number.isFinite(amount) || amount <= 0) {
                throw new functions.https.HttpsError('failed-precondition', `Timesheet ${item.id} has no approved payable amount`);
            }
            return total + amount;
        }, 0).toFixed(2));
        if (submittedAmount > 0 && Math.abs(submittedAmount - payableTotal) > 0.01) {
            throw new functions.https.HttpsError('failed-precondition', `Invoice total must match the approved payable total of GBP ${payableTotal.toFixed(2)}`);
        }
        const invoice = {
            organizationId: interpreter.data()?.organizationId || 'lingland-main',
            interpreterId,
            interpreterName: interpreter.data()?.name || 'Interpreter',
            model: 'UPLOAD',
            status: 'SUBMITTED',
            externalInvoiceReference: externalReference,
            totalAmount: payableTotal,
            issueDate: now,
            currency: 'GBP',
            timesheetIds,
            lineCount: timesheetIds.length,
            financialIntegrityStatus: 'VERIFIED',
            referenceIntegrityStatus: 'VERIFIED',
            uploadedPdfUrl: uploadedPdfUrl || null,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
            submittedByRole: actor.isAdmin ? 'ADMIN' : 'INTERPRETER',
        };
        transaction.set(invoiceRef, invoice);
        timesheets.forEach(item => {
            const value = item.data() || {};
            const lineRef = db.collection('interpreterInvoiceLines').doc(`${invoiceId}_${item.id}`);
            transaction.set(lineRef, {
                interpreterInvoiceId: invoiceId,
                interpreterId,
                timesheetId: item.id,
                bookingId: value.bookingId || null,
                description: `Timesheet ${value.bookingId || item.id}`,
                units: Number(value.unitsPayableToInterpreter || value.sessionDurationMinutes || value.wordCount || 1),
                rate: 0,
                total: Number(value.interpreterAmountCalculated),
                createdAt: now,
            });
            transaction.update(item.ref, {
                interpreterInvoiceId: invoiceId,
                readyForInterpreterInvoice: false,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
        bookings.forEach(booking => {
            transaction.update(booking.ref, {
                interpreterInvoiceId: invoiceId,
                interpreterInvoiceReference: externalReference,
                interpreterInvoiceNumber: externalReference,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            transaction.set(db.collection('jobEvents').doc(), {
                jobId: booking.id,
                organizationId: booking.data()?.organizationId || 'lingland-main',
                type: 'INTERPRETER_INVOICE_RECEIVED',
                source: actor.isAdmin ? 'admin' : 'interpreter_portal',
                metadata: { interpreterInvoiceId: invoiceId, externalReference },
                createdAt: now,
            });
        });
        return { id: invoiceId, ...invoice, idempotent: false };
    });
    return { success: true, invoice: result };
});
exports.updateInterpreterInvoiceStatus = functions.https.onCall(async (data, context) => {
    await assertAdmin(context.auth?.uid);
    const invoiceId = String(data?.invoiceId || '').trim();
    const nextStatus = String(data?.status || '').trim().toUpperCase();
    if (!invoiceId || !['APPROVED', 'REJECTED', 'CANCELLED', 'PAID'].includes(nextStatus)) {
        throw new functions.https.HttpsError('invalid-argument', 'invoiceId and a supported status are required');
    }
    const allowed = {
        DRAFT: ['APPROVED', 'REJECTED', 'CANCELLED'],
        SUBMITTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
        APPROVED: ['PAID', 'CANCELLED'],
    };
    const invoiceRef = db.collection('interpreterInvoices').doc(invoiceId);
    const now = new Date().toISOString();
    const result = await db.runTransaction(async (transaction) => {
        const invoice = await transaction.get(invoiceRef);
        if (!invoice.exists)
            throw new functions.https.HttpsError('not-found', 'Interpreter invoice not found');
        const invoiceData = invoice.data() || {};
        const current = String(invoiceData.status || '');
        if (current === nextStatus)
            return { idempotent: true, status: current };
        if (!allowed[current]?.includes(nextStatus)) {
            throw new functions.https.HttpsError('failed-precondition', `Interpreter invoice cannot move from ${current} to ${nextStatus}`);
        }
        const lines = await transaction.get(db.collection('interpreterInvoiceLines').where('interpreterInvoiceId', '==', invoiceId));
        if (['APPROVED', 'PAID'].includes(nextStatus)) {
            const totalAmount = Number(invoiceData.totalAmount || 0);
            const hasLinkedJob = lines.docs.some(line => Boolean(line.data().bookingId));
            const integrityIssues = [
                !Number.isFinite(totalAmount) || Math.abs(totalAmount) < 0.005 ? 'payable amount is missing' : '',
                lines.empty ? 'payable has no persisted lines' : '',
                invoiceData.financialIntegrityStatus === 'AMOUNT_MISSING' ? 'payable amount requires review' : '',
                invoiceData.financialIntegrityStatus === 'LINK_MISSING' ? 'linked work requires review' : '',
                invoiceData.referenceIntegrityStatus === 'MISSING' || invoiceData.externalInvoiceReference === 'Reference missing' ? 'supplier reference is missing' : '',
                invoiceData.sourceSystem === 'AIRTABLE' && !hasLinkedJob ? 'Airtable payable has no linked job' : '',
            ].filter(Boolean);
            if (integrityIssues.length) {
                throw new functions.https.HttpsError('failed-precondition', `Interpreter invoice cannot progress: ${integrityIssues.join('; ')}`);
            }
        }
        const timesheetRefs = lines.docs.filter(line => line.data().timesheetId).map(line => db.collection('timesheets').doc(String(line.data().timesheetId)));
        const bookingRefs = lines.docs.filter(line => line.data().bookingId).map(line => db.collection('bookings').doc(String(line.data().bookingId)));
        const timesheets = [];
        const bookings = [];
        for (const ref of timesheetRefs)
            timesheets.push(await transaction.get(ref));
        for (const ref of bookingRefs)
            bookings.push(await transaction.get(ref));
        const statusUpdate = { status: nextStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        if (nextStatus === 'APPROVED') {
            statusUpdate.approvedAt = now;
            statusUpdate.approvedBy = context.auth.uid;
        }
        if (nextStatus === 'PAID') {
            statusUpdate.paidAt = now;
            statusUpdate.paidBy = context.auth.uid;
        }
        if (['REJECTED', 'CANCELLED'].includes(nextStatus)) {
            statusUpdate.closedAt = now;
            statusUpdate.closedBy = context.auth.uid;
        }
        transaction.update(invoiceRef, statusUpdate);
        if (nextStatus === 'PAID') {
            bookings.forEach(booking => transaction.update(booking.ref, {
                interpreterPaymentStatus: 'PAID',
                interpreterPaidAt: now,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }));
        }
        if (['REJECTED', 'CANCELLED'].includes(nextStatus)) {
            timesheets.forEach(timesheet => transaction.update(timesheet.ref, {
                interpreterInvoiceId: admin.firestore.FieldValue.delete(),
                readyForInterpreterInvoice: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }));
            bookings.forEach(booking => transaction.update(booking.ref, {
                interpreterInvoiceId: admin.firestore.FieldValue.delete(),
                interpreterInvoiceReference: admin.firestore.FieldValue.delete(),
                interpreterInvoiceNumber: admin.firestore.FieldValue.delete(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }));
        }
        bookings.forEach(booking => transaction.set(db.collection('jobEvents').doc(), {
            jobId: booking.id,
            organizationId: booking.data()?.organizationId || 'lingland-main',
            type: nextStatus === 'PAID' ? 'INTERPRETER_PAYMENT_SENT' : 'INTERPRETER_INVOICE_STATUS_CHANGED',
            source: 'admin',
            metadata: { interpreterInvoiceId: invoiceId, fromStatus: current, toStatus: nextStatus },
            createdAt: now,
        }));
        return { idempotent: false, status: nextStatus };
    });
    return { success: true, ...result };
});
//# sourceMappingURL=manageInterpreterInvoices.js.map