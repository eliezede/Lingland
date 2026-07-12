import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { queueBookingStatusEmails } from '../mail/bookingEmail';

const db = admin.firestore();

export const cancelOwnBooking = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Client authentication is required');
  const user = await db.collection('users').doc(context.auth.uid).get();
  if (!user.exists || user.data()?.status !== 'ACTIVE' || user.data()?.role !== 'CLIENT' || !user.data()?.profileId) {
    throw new functions.https.HttpsError('permission-denied', 'An active client account is required');
  }
  const bookingId = String(data?.bookingId || '').trim();
  const reason = String(data?.reason || 'Cancelled by client').trim().slice(0, 500);
  if (!bookingId) throw new functions.https.HttpsError('invalid-argument', 'bookingId is required');

  const bookingRef = db.collection('bookings').doc(bookingId);
  const now = new Date().toISOString();
  let bookingForEmail: FirebaseFirestore.DocumentData | null = null;
  const result = await db.runTransaction(async transaction => {
    const booking = await transaction.get(bookingRef);
    if (!booking.exists) throw new functions.https.HttpsError('not-found', 'Booking not found');
    const current = booking.data() || {};
    if (String(current.clientId || '') !== String(user.data()!.profileId)) {
      throw new functions.https.HttpsError('permission-denied', 'This booking belongs to another client');
    }
    if (current.status === 'CANCELLED') return { idempotent: true };
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
      cancelledBy: context.auth!.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.set(db.collection('jobEvents').doc(), {
      jobId: bookingId,
      organizationId: current.organizationId || 'lingland-main',
      type: 'BOOKING_CANCELLED',
      source: 'client_portal',
      actorUserId: context.auth!.uid,
      metadata: { fromStatus: current.status, reason },
      createdAt: now,
    });
    bookingForEmail = { ...current, id: bookingId, status: 'CANCELLED', cancellationReason: reason };
    return { idempotent: false };
  });

  if (bookingForEmail) await queueBookingStatusEmails(bookingId, bookingForEmail, 'CANCELLED', {}, bookingId);
  return { success: true, bookingId, status: 'CANCELLED', ...result };
});
