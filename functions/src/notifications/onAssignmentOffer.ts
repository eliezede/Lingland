import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

/**
 * Trigger: onAssignmentOffer
 * 
 * Watches for new documents in 'assignments'.
 * When a new assignment is created (status: OFFERED),
 * it creates a notification doc for the interpreter.
 */
export const onAssignmentOffer = functions.firestore
  .document('assignments/{assignmentId}')
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data();
    if (!data) return;

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

      } catch (error) {
        console.error('[AssignmentTrigger] Error processing assignment notification:', error);
      }
    }
  });
