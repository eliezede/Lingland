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
exports.recordInterpreterAttendance = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const getInterpreterIdentity = async (uid) => {
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Interpreter authentication is required');
    const user = await db.collection('users').doc(uid).get();
    if (!user.exists || user.data()?.status !== 'ACTIVE' || user.data()?.role !== 'INTERPRETER' || !user.data()?.profileId) {
        throw new functions.https.HttpsError('permission-denied', 'An active interpreter profile is required');
    }
    return String(user.data().profileId);
};
exports.recordInterpreterAttendance = functions.https.onCall(async (data, context) => {
    const interpreterId = await getInterpreterIdentity(context.auth?.uid);
    const bookingId = String(data?.bookingId || '').trim();
    const action = String(data?.action || '').trim().toUpperCase();
    if (!bookingId || !['CHECK_IN', 'CHECK_OUT'].includes(action)) {
        throw new functions.https.HttpsError('invalid-argument', 'bookingId and a valid attendance action are required');
    }
    const bookingRef = db.collection('bookings').doc(bookingId);
    const now = new Date().toISOString();
    const result = await db.runTransaction(async (transaction) => {
        const booking = await transaction.get(bookingRef);
        if (!booking.exists)
            throw new functions.https.HttpsError('not-found', 'Booking not found');
        const current = booking.data() || {};
        if (String(current.interpreterId || '') !== interpreterId) {
            throw new functions.https.HttpsError('permission-denied', 'This job is assigned to another interpreter');
        }
        if (action === 'CHECK_IN') {
            if (!['BOOKED', 'SESSION_COMPLETED'].includes(String(current.status || ''))) {
                throw new functions.https.HttpsError('failed-precondition', 'Only a confirmed job can be checked in');
            }
            if (current.checkInAt)
                return { status: current.status, checkInAt: current.checkInAt, idempotent: true };
            transaction.update(bookingRef, {
                checkInAt: now,
                checkInBy: context.auth.uid,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        else {
            if (!['BOOKED', 'SESSION_COMPLETED'].includes(String(current.status || ''))) {
                throw new functions.https.HttpsError('failed-precondition', 'Only a confirmed job can be checked out');
            }
            if (!current.checkInAt) {
                throw new functions.https.HttpsError('failed-precondition', 'Check in before checking out');
            }
            if (current.checkOutAt)
                return { status: current.status, checkOutAt: current.checkOutAt, idempotent: true };
            transaction.update(bookingRef, {
                checkOutAt: now,
                checkOutBy: context.auth.uid,
                status: 'SESSION_COMPLETED',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        transaction.set(db.collection('jobEvents').doc(), {
            jobId: bookingId,
            organizationId: current.organizationId || 'lingland-main',
            type: action,
            source: 'interpreter_app',
            metadata: { interpreterId },
            createdAt: now,
        });
        return {
            status: action === 'CHECK_OUT' ? 'SESSION_COMPLETED' : String(current.status || 'BOOKED'),
            [action === 'CHECK_OUT' ? 'checkOutAt' : 'checkInAt']: now,
            idempotent: false,
        };
    });
    return { success: true, ...result };
});
//# sourceMappingURL=recordInterpreterAttendance.js.map