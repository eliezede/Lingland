import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

/**
 * Trigger: onBookingOffer
 * 
 * Watches for status changes in 'bookings'.
 * If status changes to 'OPENED' and an interpreterId is present,
 * it creates a notification doc for the interpreter.
 */
export const onBookingOffer = functions.firestore
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

      } catch (error) {
        console.error('[NotificationTrigger] Failed to process booking notification:', error);
      }
    }
  });
