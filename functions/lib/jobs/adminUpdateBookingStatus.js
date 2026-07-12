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
exports.adminUpdateBookingStatus = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const bookingEmail_1 = require("../mail/bookingEmail");
const db = admin.firestore();
const allowedTransitions = {
    DRAFT: ['INCOMING', 'CANCELLED'],
    INCOMING: ['NEEDS_ASSIGNMENT', 'OPENED', 'PENDING_ASSIGNMENT', 'ASSIGNMENT_PENDING', 'QUOTE_PENDING', 'ADMIN_HOLD', 'ADMIN', 'CANCELLED'],
    NEEDS_ASSIGNMENT: ['OPENED', 'PENDING_ASSIGNMENT', 'ASSIGNMENT_PENDING', 'QUOTE_PENDING', 'ADMIN_HOLD', 'ADMIN', 'CANCELLED'],
    OPENED: ['NEEDS_ASSIGNMENT', 'INCOMING', 'ADMIN_HOLD', 'ADMIN', 'CANCELLED'],
    PENDING_ASSIGNMENT: ['NEEDS_ASSIGNMENT', 'INCOMING', 'OPENED', 'QUOTE_PENDING', 'ADMIN_HOLD', 'ADMIN', 'CANCELLED'],
    ASSIGNMENT_PENDING: ['NEEDS_ASSIGNMENT', 'INCOMING', 'OPENED', 'ADMIN_HOLD', 'ADMIN', 'CANCELLED'],
    QUOTE_PENDING: ['NEEDS_ASSIGNMENT', 'PENDING_ASSIGNMENT', 'ASSIGNMENT_PENDING', 'ADMIN_HOLD', 'ADMIN', 'CANCELLED'],
    BOOKED: ['ADMIN_HOLD', 'ADMIN', 'CANCELLED'],
    ADMIN: ['NEEDS_ASSIGNMENT', 'PENDING_ASSIGNMENT', 'ASSIGNMENT_PENDING', 'BOOKED', 'SESSION_COMPLETED', 'CANCELLED'],
    ADMIN_HOLD: ['NEEDS_ASSIGNMENT', 'PENDING_ASSIGNMENT', 'ASSIGNMENT_PENDING', 'BOOKED', 'SESSION_COMPLETED', 'CANCELLED'],
};
const assertAdmin = async (uid) => {
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
    const user = await db.collection('users').doc(uid).get();
    if (!user.exists || user.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(String(user.data()?.role || ''))) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can change job status');
    }
};
exports.adminUpdateBookingStatus = functions.https.onCall(async (data, context) => {
    await assertAdmin(context.auth?.uid);
    const bookingId = String(data?.bookingId || '').trim();
    const nextStatus = String(data?.status || '').trim().toUpperCase();
    if (!bookingId || !nextStatus)
        throw new functions.https.HttpsError('invalid-argument', 'bookingId and status are required');
    if (['BOOKED', 'SESSION_COMPLETED', 'TIMESHEET_SUBMITTED', 'READY_FOR_INVOICE', 'INVOICED', 'PAID'].includes(nextStatus)) {
        throw new functions.https.HttpsError('failed-precondition', `${nextStatus} must be reached through its dedicated workflow action`);
    }
    const bookingRef = db.collection('bookings').doc(bookingId);
    const now = new Date().toISOString();
    let bookingForEmail = null;
    let eventId = '';
    const result = await db.runTransaction(async (transaction) => {
        const booking = await transaction.get(bookingRef);
        if (!booking.exists)
            throw new functions.https.HttpsError('not-found', 'Booking not found');
        const current = booking.data() || {};
        const currentStatus = String(current.status || 'INCOMING').toUpperCase();
        if (currentStatus === nextStatus)
            return { idempotent: true, status: currentStatus };
        if (!(allowedTransitions[currentStatus] || []).includes(nextStatus)) {
            throw new functions.https.HttpsError('failed-precondition', `Job cannot move from ${currentStatus} to ${nextStatus}`);
        }
        const assignments = nextStatus === 'CANCELLED'
            ? await transaction.get(db.collection('assignments').where('bookingId', '==', bookingId).where('status', '==', 'OFFERED'))
            : null;
        assignments?.docs.forEach(assignment => transaction.update(assignment.ref, {
            status: 'DECLINED',
            respondedAt: now,
            declineReason: 'JOB_CANCELLED',
        }));
        const patch = {
            status: nextStatus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (nextStatus === 'CANCELLED') {
            patch.cancelledAt = now;
            patch.cancelledBy = context.auth.uid;
            patch.cancellationReason = String(data?.reason || 'Cancelled by staff').trim().slice(0, 500);
        }
        transaction.update(bookingRef, patch);
        const eventRef = db.collection('jobEvents').doc();
        eventId = eventRef.id;
        transaction.set(eventRef, {
            jobId: bookingId,
            organizationId: current.organizationId || 'lingland-main',
            type: nextStatus === 'CANCELLED' ? 'BOOKING_CANCELLED' : 'STATUS_CHANGED',
            source: 'admin',
            actorUserId: context.auth.uid,
            metadata: { fromStatus: currentStatus, toStatus: nextStatus, reason: data?.reason || null },
            createdAt: now,
        });
        bookingForEmail = { ...current, id: bookingId, status: nextStatus };
        return { idempotent: false, status: nextStatus };
    });
    if (bookingForEmail && ['CANCELLED'].includes(nextStatus)) {
        await (0, bookingEmail_1.queueBookingStatusEmails)(bookingId, bookingForEmail, nextStatus, {}, eventId);
    }
    return { success: true, bookingId, ...result };
});
//# sourceMappingURL=adminUpdateBookingStatus.js.map