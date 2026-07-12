import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

const getInterpreterIdentity = async (uid?: string) => {
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Interpreter authentication is required');
  const user = await db.collection('users').doc(uid).get();
  if (!user.exists || user.data()?.status !== 'ACTIVE' || user.data()?.role !== 'INTERPRETER' || !user.data()?.profileId) {
    throw new functions.https.HttpsError('permission-denied', 'An active interpreter profile is required');
  }
  return String(user.data()!.profileId);
};

export const recordInterpreterAttendance = functions.https.onCall(async (data, context) => {
  const interpreterId = await getInterpreterIdentity(context.auth?.uid);
  const bookingId = String(data?.bookingId || '').trim();
  const action = String(data?.action || '').trim().toUpperCase();
  if (!bookingId || !['CHECK_IN', 'CHECK_OUT'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'bookingId and a valid attendance action are required');
  }

  const bookingRef = db.collection('bookings').doc(bookingId);
  const now = new Date().toISOString();
  const result = await db.runTransaction(async transaction => {
    const booking = await transaction.get(bookingRef);
    if (!booking.exists) throw new functions.https.HttpsError('not-found', 'Booking not found');
    const current = booking.data() || {};
    if (String(current.interpreterId || '') !== interpreterId) {
      throw new functions.https.HttpsError('permission-denied', 'This job is assigned to another interpreter');
    }

    if (action === 'CHECK_IN') {
      if (!['BOOKED', 'SESSION_COMPLETED'].includes(String(current.status || ''))) {
        throw new functions.https.HttpsError('failed-precondition', 'Only a confirmed job can be checked in');
      }
      if (current.checkInAt) return { status: current.status, checkInAt: current.checkInAt, idempotent: true };
      transaction.update(bookingRef, {
        checkInAt: now,
        checkInBy: context.auth!.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      if (!['BOOKED', 'SESSION_COMPLETED'].includes(String(current.status || ''))) {
        throw new functions.https.HttpsError('failed-precondition', 'Only a confirmed job can be checked out');
      }
      if (!current.checkInAt) {
        throw new functions.https.HttpsError('failed-precondition', 'Check in before checking out');
      }
      if (current.checkOutAt) return { status: current.status, checkOutAt: current.checkOutAt, idempotent: true };
      transaction.update(bookingRef, {
        checkOutAt: now,
        checkOutBy: context.auth!.uid,
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
