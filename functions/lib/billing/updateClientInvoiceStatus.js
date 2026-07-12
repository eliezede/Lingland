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
exports.updateClientInvoiceStatus = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const transitions = {
    DRAFT: ['SENT', 'CANCELLED'],
    SENT: ['PAID'],
    PAID: [],
    CANCELLED: [],
};
const assertAdmin = async (uid) => {
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
    const user = await db.collection('users').doc(uid).get();
    if (!user.exists || user.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(String(user.data()?.role || ''))) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can update invoices');
    }
};
exports.updateClientInvoiceStatus = functions.https.onCall(async (data, context) => {
    await assertAdmin(context.auth?.uid);
    const invoiceId = String(data?.invoiceId || '').trim();
    const nextStatus = String(data?.status || '').trim().toUpperCase();
    if (!invoiceId || !['SENT', 'PAID', 'CANCELLED'].includes(nextStatus)) {
        throw new functions.https.HttpsError('invalid-argument', 'A valid invoice and status are required');
    }
    const invoiceRef = db.collection('clientInvoices').doc(invoiceId);
    let invoiceForEmail = null;
    await db.runTransaction(async (transaction) => {
        const invoice = await transaction.get(invoiceRef);
        if (!invoice.exists)
            throw new functions.https.HttpsError('not-found', 'Invoice not found');
        const current = invoice.data() || {};
        const currentStatus = String(current.status || 'DRAFT');
        if (currentStatus === nextStatus)
            return;
        if (!(transitions[currentStatus] || []).includes(nextStatus)) {
            throw new functions.https.HttpsError('failed-precondition', `Invoice cannot move from ${currentStatus} to ${nextStatus}`);
        }
        const lines = await transaction.get(db.collection('clientInvoiceLines').where('invoiceId', '==', invoiceId));
        if (nextStatus !== 'CANCELLED') {
            const totalAmount = Number(current.totalAmount || 0);
            const hasLinkedJob = lines.docs.some(line => Boolean(line.data().bookingId));
            const integrityIssues = [
                !Number.isFinite(totalAmount) || Math.abs(totalAmount) < 0.005 ? 'invoice amount is missing' : '',
                lines.empty ? 'invoice has no persisted lines' : '',
                current.financialIntegrityStatus === 'AMOUNT_MISSING' ? 'invoice amount requires review' : '',
                current.financialIntegrityStatus === 'LINK_MISSING' ? 'linked work requires review' : '',
                current.referenceIntegrityStatus === 'MISSING' || current.reference === 'Reference missing' ? 'invoice reference is missing' : '',
                current.sourceSystem === 'AIRTABLE' && !hasLinkedJob ? 'Airtable invoice has no linked job' : '',
            ].filter(Boolean);
            if (integrityIssues.length) {
                throw new functions.https.HttpsError('failed-precondition', `Invoice cannot progress: ${integrityIssues.join('; ')}`);
            }
        }
        invoiceForEmail = { ...current, id: invoiceId };
        const now = new Date().toISOString();
        const invoicePatch = {
            status: nextStatus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: context.auth.uid,
        };
        if (nextStatus === 'SENT')
            invoicePatch.sentAt = now;
        if (nextStatus === 'PAID')
            invoicePatch.paidAt = now;
        if (nextStatus === 'CANCELLED')
            invoicePatch.cancelledAt = now;
        transaction.update(invoiceRef, invoicePatch);
        lines.docs.forEach(line => {
            const value = line.data();
            if (nextStatus === 'CANCELLED' && value.timesheetId) {
                transaction.set(db.collection('timesheets').doc(String(value.timesheetId)), {
                    clientInvoiceId: null,
                    readyForClientInvoice: true,
                    status: 'INVOICING',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            if (value.bookingId) {
                const bookingPatch = {
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                };
                if (nextStatus === 'SENT') {
                    bookingPatch.status = 'INVOICED';
                    bookingPatch.paymentStatus = 'INVOICED';
                    bookingPatch.clientInvoiceId = invoiceId;
                    bookingPatch.clientInvoiceNumber = current.invoiceNumber || current.reference || invoiceId;
                    bookingPatch.clientInvoiceReference = current.reference || current.invoiceNumber || invoiceId;
                    bookingPatch.invoicedAt = now;
                }
                else if (nextStatus === 'PAID') {
                    bookingPatch.status = 'PAID';
                    bookingPatch.paymentStatus = 'PAID';
                    bookingPatch.paidAt = now;
                }
                else if (nextStatus === 'CANCELLED') {
                    bookingPatch.status = 'READY_FOR_INVOICE';
                    bookingPatch.paymentStatus = 'READY_FOR_INVOICE';
                    bookingPatch.clientInvoiceId = null;
                    bookingPatch.clientInvoiceNumber = null;
                    bookingPatch.clientInvoiceReference = null;
                }
                transaction.set(db.collection('bookings').doc(String(value.bookingId)), bookingPatch, { merge: true });
            }
        });
    });
    if (nextStatus === 'SENT' && invoiceForEmail) {
        const invoice = invoiceForEmail;
        const recipient = String(invoice.clientEmail || '').trim().toLowerCase();
        if (recipient) {
            const mailRef = db.collection('mail').doc(`client_invoice_${invoiceId}_sent`);
            await mailRef.create({
                to: [recipient],
                recipientType: 'CLIENT',
                templateId: 'CLIENT_INVOICE_SENT',
                invoiceId,
                message: {
                    subject: `Invoice ${invoice.invoiceNumber || invoice.reference} - Lingland Language Services`,
                    html: `Dear ${invoice.clientName || 'Client'},<br><br>Your Lingland invoice <strong>${invoice.invoiceNumber || invoice.reference}</strong> is now available in your client portal.<br><br><strong>Amount due:</strong> GBP ${Number(invoice.totalAmount || 0).toFixed(2)}<br><strong>Due date:</strong> ${String(invoice.dueDate || '')}<br><br>Kind regards,<br>The Lingland Finance Team`,
                },
                createdAt: new Date().toISOString(),
            }).catch((error) => {
                if (error?.code !== 6 && error?.code !== 'already-exists')
                    throw error;
            });
        }
    }
    return { success: true, invoiceId, status: nextStatus };
});
//# sourceMappingURL=updateClientInvoiceStatus.js.map