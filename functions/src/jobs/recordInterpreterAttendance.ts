import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { parseLondonSchedule } from './londonSchedule';

const db = admin.firestore();

const attendanceIso = (value: unknown) => {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as admin.firestore.Timestamp).toDate().toISOString();
  }
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

const getScheduledWindow = (booking: FirebaseFirestore.DocumentData) => {
  const date = String(booking.date || '').slice(0, 10);
  const time = String(booking.startTime || '00:00').slice(0, 5);
  const start = parseLondonSchedule(date, `${time}:00`);
  if (!date || start == null) return null;
  const duration = Math.max(Number(booking.durationMinutes || 60), 1);
  return {
    opensAt: start - (2 * 60 * 60 * 1000),
    closesAt: start + (duration * 60 * 1000) + (24 * 60 * 60 * 1000),
  };
};

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
    if (String(current.serviceCategory || '').toUpperCase() === 'TRANSLATION') {
      throw new functions.https.HttpsError('failed-precondition', 'Attendance is only available for interpreting sessions');
    }

    const scheduledWindow = getScheduledWindow(current);
    const nowMillis = Date.now();
    if (!scheduledWindow || nowMillis < scheduledWindow.opensAt || nowMillis > scheduledWindow.closesAt) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Attendance can be recorded from two hours before the session until 24 hours after it ends'
      );
    }

    if (action === 'CHECK_IN') {
      if (String(current.status || '') !== 'BOOKED') {
        throw new functions.https.HttpsError('failed-precondition', 'Only a confirmed job can be checked in');
      }
      if (current.checkInAt) return { status: current.status, checkInAt: attendanceIso(current.checkInAt), idempotent: true };
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
      if (current.checkOutAt) return { status: current.status, checkOutAt: attendanceIso(current.checkOutAt), idempotent: true };
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
