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
exports.cancelOwnBooking = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const bookingEmail_1 = require("../mail/bookingEmail");
const clientPortalAccess_1 = require("../clients/clientPortalAccess");
const clientPortalPolicy_1 = require("../clients/clientPortalPolicy");
const db = admin.firestore();
exports.cancelOwnBooking = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Client authentication is required');
    const user = await db.collection('users').doc(context.auth.uid).get();
    if (!user.exists)
        throw new functions.https.HttpsError('not-found', 'Platform user not found');
    const access = await (0, clientPortalAccess_1.resolveClientPortalAccess)(context.auth.uid, user.data() || {});
    if (!access.canViewBookings) {
        throw new functions.https.HttpsError('permission-denied', 'This membership does not include booking access');
    }
    const bookingId = String(data?.bookingId || '').trim();
    const reason = String(data?.reason || 'Cancelled by client').trim().slice(0, 500);
    if (!bookingId)
        throw new functions.https.HttpsError('invalid-argument', 'bookingId is required');
    const bookingRef = db.collection('bookings').doc(bookingId);
    const now = new Date().toISOString();
    let bookingForEmail = null;
    const result = await db.runTransaction(async (transaction) => {
        const booking = await transaction.get(bookingRef);
        if (!booking.exists)
            throw new functions.https.HttpsError('not-found', 'Booking not found');
        const current = booking.data() || {};
        if (!(0, clientPortalPolicy_1.canManageClientBooking)(current, access)) {
            throw new functions.https.HttpsError('permission-denied', 'This booking is outside your client membership scope');
        }
        if (current.status === 'CANCELLED')
            return { idempotent: true };
        if (!['INCOMING', 'OPENED', 'NEEDS_ASSIGNMENT', 'PENDING_ASSIGNMENT', 'ASSIGNMENT_PENDING', 'BOOKED', 'QUOTE_PENDING'].includes(String(current.status || ''))) {
            throw new functions.https.HttpsError('failed-precondition', 'This booking can no longer be cancelled online');
        }
        if (current.clientInvoiceId) {
            throw new functions.https.HttpsError('failed-precondition', 'An invoiced booking cannot be cancelled online');
        }
        const assignments = await transaction.get(db.collection('assignments').where('bookingId', '==', bookingId).where('status', '==', 'OFFERED'));
        assignments.docs.forEach(assignment => transaction.update(assignment.ref, {
            status: 'DECLINED',
            respondedAt: now,
            declineReason: 'CLIENT_CANCELLED',
        }));
        transaction.update(bookingRef, {
            status: 'CANCELLED',
            cancellationReason: reason,
            cancelledAt: now,
            cancelledBy: context.auth.uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.set(db.collection('jobEvents').doc(), {
            jobId: bookingId,
            organizationId: current.organizationId || 'lingland-main',
            type: 'BOOKING_CANCELLED',
            source: 'client_portal',
            actorUserId: context.auth.uid,
            metadata: { fromStatus: current.status, reason },
            createdAt: now,
        });
        bookingForEmail = { ...current, id: bookingId, status: 'CANCELLED', cancellationReason: reason };
        return { idempotent: false };
    });
    if (bookingForEmail)
        await (0, bookingEmail_1.queueBookingStatusEmails)(bookingId, bookingForEmail, 'CANCELLED', {}, bookingId);
    return { success: true, bookingId, status: 'CANCELLED', ...result };
});
//# sourceMappingURL=clientBookingActions.js.map