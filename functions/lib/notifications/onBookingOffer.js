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
exports.onBookingOffer = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
/**
 * Trigger: onBookingOffer
 *
 * Watches for status changes in 'bookings'.
 * If status changes to 'OPENED' and an interpreterId is present,
 * it creates a notification doc for the interpreter.
 */
exports.onBookingOffer = functions.firestore
    .document('bookings/{bookingId}')
    .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    // 1. Detect Direct Assignment transition
    // (Transition from any status to OPENED with an interpreter assigned)
    if (after.status === 'OPENED' && after.interpreterId && before.status !== 'OPENED') {
        const interpreterId = after.interpreterId;
        const bookingId = context.params.bookingId;
        console.log(`[NotificationTrigger] Detected direct assignment: ${bookingId} to ${interpreterId}`);
        try {
            // 2. Resolve Auth UID (userId) for this interpreter
            // In Lingland, interpreters are linked to users via the user's profileId field
            const userQuery = await admin.firestore()
                .collection('users')
                .where('profileId', '==', interpreterId)
                .limit(1)
                .get();
            if (userQuery.empty) {
                console.log(`[NotificationTrigger] No user found with profileId: ${interpreterId}`);
                return;
            }
            const userId = userQuery.docs[0].id;
            // 3. Create the notification document
            await admin.firestore().collection('notifications').add({
                userId: userId,
                title: 'New Direct Assignment',
                message: `You have been assigned to ${after.languageTo || 'a new job'} on ${after.date}. Tap to review details.`,
                type: 'JOB_OFFER',
                read: false,
                createdAt: new Date().toISOString(),
                data: {
                    bookingId: bookingId,
                    status: 'OPENED'
                }
            });
            console.log(`[NotificationTrigger] Notification created for user: ${userId}`);
        }
        catch (error) {
            console.error('[NotificationTrigger] Failed to process booking notification:', error);
        }
    }
});
//# sourceMappingURL=onBookingOffer.js.map