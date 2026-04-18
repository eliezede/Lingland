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
exports.onBookingDeclined = exports.onAssignmentDeclined = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
/**
 * Trigger: onAssignmentDeclined
 * Watches assignments collection for status change to DECLINED.
 */
exports.onAssignmentDeclined = functions.firestore
    .document('assignments/{assignmentId}')
    .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    console.log(`[onAssignmentDeclined] Change detected. Status: ${before.status} -> ${after.status}`);
    if (after.status === 'DECLINED' && before.status !== 'DECLINED') {
        const assignmentId = context.params.assignmentId;
        const { bookingId, interpreterId } = after;
        console.log(`[onAssignmentDeclined] Assignment ${assignmentId} declined by ${interpreterId}`);
        try {
            // 1. Fetch details
            const [bookingSnap, interpreterSnap] = await Promise.all([
                db.collection('bookings').doc(bookingId).get(),
                db.collection('interpreters').doc(interpreterId).get()
            ]);
            const bookingData = bookingSnap.data() || {};
            const interpreterData = interpreterSnap.data() || {};
            const interpreterName = interpreterData.name || 'An interpreter';
            const jobDate = bookingData.date || 'TBC';
            const languages = `${bookingData.languageFrom} → ${bookingData.languageTo}`;
            // 2. Fetch all Admins
            const adminsSnap = await db.collection('users')
                .where('role', 'in', ['ADMIN', 'SUPER_ADMIN'])
                .get();
            const batch = db.batch();
            adminsSnap.docs.forEach(adminDoc => {
                const adminData = adminDoc.data();
                // A. Create In-App Notification
                const notifRef = db.collection('notifications').doc();
                batch.set(notifRef, {
                    userId: adminDoc.id,
                    title: '❌ Offer Declined',
                    message: `${interpreterName} declined the offer for ${languages} on ${jobDate}.`,
                    type: 'ALERT',
                    read: false,
                    link: `/admin/bookings?id=${bookingId}`,
                    createdAt: new Date().toISOString()
                });
                // B. Create Email document (handled by onEmailCreated)
                const mailRef = db.collection('mail').doc();
                batch.set(mailRef, {
                    to: [adminData.email],
                    message: {
                        subject: `Offer Declined: ${languages} (${jobDate})`,
                        html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                  <h2 style="color: #ef4444;">Offer Declined</h2>
                  <p><strong>${interpreterName}</strong> has declined the assignment for the following job:</p>
                  <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Reference:</strong> ${bookingId}</p>
                    <p><strong>Languages:</strong> ${languages}</p>
                    <p><strong>Date:</strong> ${jobDate}</p>
                    <p><strong>Time:</strong> ${bookingData.startTime || 'TBC'}</p>
                  </div>
                  <p>Please review the marketplace to re-assign or broadcast this job again.</p>
                  <a href="https://lingland.io/admin/bookings?id=${bookingId}" style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">Review Booking</a>
                </div>
              `
                    },
                    source: 'on_offer_declined',
                    createdAt: new Date().toISOString()
                });
            });
            await batch.commit();
            console.log(`[onAssignmentDeclined] Notified ${adminsSnap.size} admins.`);
        }
        catch (error) {
            console.error('[onAssignmentDeclined] Error:', error);
        }
    }
});
/**
 * Trigger: onBookingDeclined
 * Watches bookings collection for status change from OPENED back to INCOMING.
 * This happens when a direct offer is declined in the mobile app.
 */
exports.onBookingDeclined = functions.firestore
    .document('bookings/{bookingId}')
    .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    console.log(`[onBookingDeclined] Change detected. Status: ${before.status} -> ${after.status}, Interpreter: ${before.interpreterId} -> ${after.interpreterId}`);
    // Condition: status reverted to INCOMING and an interpreter was removed
    if (after.status === 'INCOMING' && before.interpreterId && !after.interpreterId) {
        const bookingId = context.params.bookingId;
        const interpreterId = before.interpreterId;
        console.log(`[onBookingDeclined] Direct offer for ${bookingId} declined by ${interpreterId}`);
        try {
            // 1. Fetch details
            const interpreterSnap = await db.collection('interpreters').doc(interpreterId).get();
            const interpreterData = interpreterSnap.data() || {};
            const interpreterName = interpreterData.name || 'An interpreter';
            const jobDate = after.date || 'TBC';
            const languages = `${after.languageFrom} → ${after.languageTo}`;
            // 2. Fetch all Admins
            const adminsSnap = await db.collection('users')
                .where('role', 'in', ['ADMIN', 'SUPER_ADMIN'])
                .get();
            const batch = db.batch();
            adminsSnap.docs.forEach(adminDoc => {
                const adminData = adminDoc.data();
                // A. Create In-App Notification
                const notifRef = db.collection('notifications').doc();
                batch.set(notifRef, {
                    userId: adminDoc.id,
                    title: '❌ Direct Assignment Declined',
                    message: `${interpreterName} declined the direct assignment for ${languages} on ${jobDate}.`,
                    type: 'ALERT',
                    read: false,
                    link: `/admin/bookings?id=${bookingId}`,
                    createdAt: new Date().toISOString()
                });
                // B. Create Email document
                const mailRef = db.collection('mail').doc();
                batch.set(mailRef, {
                    to: [adminData.email],
                    message: {
                        subject: `Direct Assignment Declined: ${languages} (${jobDate})`,
                        html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                  <h2 style="color: #ef4444;">Direct Assignment Declined</h2>
                  <p><strong>${interpreterName}</strong> has declined the direct assignment for the following job:</p>
                  <div style="background: #fef2f2; padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 20px 0;">
                    <p><strong>Reference:</strong> ${bookingId}</p>
                    <p><strong>Languages:</strong> ${languages}</p>
                    <p><strong>Date:</strong> ${jobDate}</p>
                  </div>
                  <p>This job is now back to <strong>INCOMING</strong> status. Please assign a new interpreter.</p>
                  <a href="https://lingland.io/admin/bookings?id=${bookingId}" style="display: inline-block; padding: 12px 24px; background: #000; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">Assign Now</a>
                </div>
              `
                    },
                    source: 'on_booking_declined',
                    createdAt: new Date().toISOString()
                });
            });
            await batch.commit();
            console.log(`[onBookingDeclined] Notified ${adminsSnap.size} admins.`);
        }
        catch (error) {
            console.error('[onBookingDeclined] Error:', error);
        }
    }
});
//# sourceMappingURL=onOfferDeclined.js.map