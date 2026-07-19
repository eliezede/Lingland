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
exports.createSupportThread = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const clientPortalAccess_1 = require("../clients/clientPortalAccess");
const clientPortalPolicy_1 = require("../clients/clientPortalPolicy");
const db = admin.firestore();
const getSupportUser = async () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN']) {
        const match = await db.collection('users')
            .where('role', '==', role)
            .where('status', '==', 'ACTIVE')
            .limit(1)
            .get();
        if (!match.empty)
            return match.docs[0];
    }
    return null;
};
const canAccessBooking = (user, booking) => {
    if (['ADMIN', 'SUPER_ADMIN'].includes(String(user.role || '')))
        return true;
    const profileId = String(user.profileId || '');
    if (user.role === 'INTERPRETER') {
        const offeredIds = Array.isArray(booking.offeredInterpreterIds) ? booking.offeredInterpreterIds.map(String) : [];
        return String(booking.interpreterId || '') === profileId || offeredIds.includes(profileId);
    }
    return false;
};
exports.createSupportThread = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
    const caller = await db.collection('users').doc(context.auth.uid).get();
    const callerData = caller.data() || {};
    if (!caller.exists || callerData.status !== 'ACTIVE') {
        throw new functions.https.HttpsError('permission-denied', 'An active platform account is required');
    }
    const bookingId = String(data?.bookingId || '').trim();
    let bookingData = {};
    if (bookingId) {
        const booking = await db.collection('bookings').doc(bookingId).get();
        if (!booking.exists)
            throw new functions.https.HttpsError('not-found', 'Booking not found');
        bookingData = booking.data() || {};
        const clientAccess = callerData.role === 'CLIENT'
            ? await (0, clientPortalAccess_1.resolveClientPortalAccess)(context.auth.uid, callerData)
            : null;
        const allowed = clientAccess
            ? clientAccess.canViewBookings && (0, clientPortalPolicy_1.canManageClientBooking)(bookingData, clientAccess)
            : canAccessBooking(callerData, bookingData);
        if (!allowed) {
            throw new functions.https.HttpsError('permission-denied', 'This account cannot open a thread for that booking');
        }
    }
    const supportUser = await getSupportUser();
    if (!supportUser)
        throw new functions.https.HttpsError('failed-precondition', 'No active operations user is available');
    const threadId = bookingId ? `booking-${bookingId}` : `support-${context.auth.uid}`;
    const threadRef = db.collection('chatThreads').doc(threadId);
    const now = new Date().toISOString();
    const participants = [context.auth.uid, supportUser.id];
    const participantNames = {
        [context.auth.uid]: String(callerData.displayName || callerData.email || 'User'),
        [supportUser.id]: String(supportUser.data().displayName || 'Lingland Operations'),
    };
    await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(threadRef);
        const current = existing.data() || {};
        const mergedParticipants = Array.from(new Set([...(current.participants || []), ...participants]));
        const unreadCount = { ...(current.unreadCount || {}) };
        mergedParticipants.forEach(participantId => {
            if (unreadCount[participantId] === undefined)
                unreadCount[participantId] = 0;
        });
        transaction.set(threadRef, {
            id: threadId,
            type: bookingId ? 'BOOKING' : 'DIRECT',
            participants: mergedParticipants,
            participantNames: { ...(current.participantNames || {}), ...participantNames },
            participantPhotos: current.participantPhotos || {},
            bookingId: bookingId || null,
            clientId: bookingId ? String(bookingData.clientId || '') : null,
            departmentId: bookingId ? String(bookingData.clientDepartmentId || '') : null,
            requestedByAgentId: bookingId ? String(bookingData.requestedByAgentId || '') : null,
            metadata: {
                ...(current.metadata || {}),
                name: bookingId
                    ? String(bookingData.displayRef || bookingData.jobNumber || bookingData.bookingRef || bookingId)
                    : 'Operations support',
            },
            unreadCount,
            createdAt: current.createdAt || now,
            updatedAt: now,
        }, { merge: true });
    });
    return {
        success: true,
        threadId,
        supportUser: {
            id: supportUser.id,
            displayName: String(supportUser.data().displayName || 'Lingland Operations'),
            role: String(supportUser.data().role || 'ADMIN'),
        },
    };
});
//# sourceMappingURL=createSupportThread.js.map