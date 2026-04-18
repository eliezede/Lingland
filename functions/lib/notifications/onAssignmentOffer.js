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
exports.onAssignmentOffer = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
/**
 * Trigger: onAssignmentOffer
 *
 * Watches for new documents in 'assignments'.
 * When a new assignment is created (status: OFFERED),
 * it creates a notification doc for the interpreter.
 */
exports.onAssignmentOffer = functions.firestore
    .document('assignments/{assignmentId}')
    .onCreate(async (snapshot, context) => {
    const data = snapshot.data();
    if (!data)
        return;
    // Only notify if it's an offer (Broadcast/Manual Offer)
    if (data.status === 'OFFERED') {
        const interpreterId = data.interpreterId;
        const bookingId = data.bookingId;
        console.log(`[AssignmentTrigger] New offer detected: Booking ${bookingId} to Interpreter ${interpreterId}`);
        try {
            // 1. Resolve Auth UID (userId) for this interpreter
            const userQuery = await admin.firestore()
                .collection('users')
                .where('profileId', '==', interpreterId)
                .limit(1)
                .get();
            if (userQuery.empty) {
                console.log(`[AssignmentTrigger] No user found with profileId: ${interpreterId}`);
                return;
            }
            const userId = userQuery.docs[0].id;
            // 2. Fetch booking details for a better message
            const bookingSnap = await admin.firestore().collection('bookings').doc(bookingId).get();
            const bookingData = bookingSnap.data() || {};
            // 3. Create the notification document
            // This will trigger the push notification via onNotificationCreated
            await admin.firestore().collection('notifications').add({
                userId: userId,
                title: 'New Job Offer',
                message: `You have a new offer for ${bookingData.languageTo || 'a new job'} on ${bookingData.date || 'a future date'}.`,
                type: 'JOB_OFFER',
                read: false,
                createdAt: new Date().toISOString(),
                data: {
                    bookingId: bookingId,
                    assignmentId: snapshot.id
                }
            });
            console.log(`[AssignmentTrigger] Notification generated for user: ${userId}`);
        }
        catch (error) {
            console.error('[AssignmentTrigger] Error processing assignment notification:', error);
        }
    }
});
//# sourceMappingURL=onAssignmentOffer.js.map