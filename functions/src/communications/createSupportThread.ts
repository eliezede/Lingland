import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

const getSupportUser = async () => {
  for (const role of ['SUPER_ADMIN', 'ADMIN']) {
    const match = await db.collection('users')
      .where('role', '==', role)
      .where('status', '==', 'ACTIVE')
      .limit(1)
      .get();
    if (!match.empty) return match.docs[0];
  }
  return null;
};

const canAccessBooking = (user: FirebaseFirestore.DocumentData, booking: FirebaseFirestore.DocumentData) => {
  if (['ADMIN', 'SUPER_ADMIN'].includes(String(user.role || ''))) return true;
  const profileId = String(user.profileId || '');
  if (user.role === 'INTERPRETER') {
    const offeredIds = Array.isArray(booking.offeredInterpreterIds) ? booking.offeredInterpreterIds.map(String) : [];
    return String(booking.interpreterId || '') === profileId || offeredIds.includes(profileId);
  }
  return user.role === 'CLIENT' && String(booking.clientId || '') === profileId;
};

export const createSupportThread = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  const caller = await db.collection('users').doc(context.auth.uid).get();
  const callerData = caller.data() || {};
  if (!caller.exists || callerData.status !== 'ACTIVE') {
    throw new functions.https.HttpsError('permission-denied', 'An active platform account is required');
  }

  const bookingId = String(data?.bookingId || '').trim();
  let bookingData: FirebaseFirestore.DocumentData = {};
  if (bookingId) {
    const booking = await db.collection('bookings').doc(bookingId).get();
    if (!booking.exists) throw new functions.https.HttpsError('not-found', 'Booking not found');
    bookingData = booking.data() || {};
    if (!canAccessBooking(callerData, bookingData)) {
      throw new functions.https.HttpsError('permission-denied', 'This account cannot open a thread for that booking');
    }
  }

  const supportUser = await getSupportUser();
  if (!supportUser) throw new functions.https.HttpsError('failed-precondition', 'No active operations user is available');

  const threadId = bookingId ? `booking-${bookingId}` : `support-${context.auth.uid}`;
  const threadRef = db.collection('chatThreads').doc(threadId);
  const now = new Date().toISOString();
  const participants = [context.auth.uid, supportUser.id];
  const participantNames = {
    [context.auth.uid]: String(callerData.displayName || callerData.email || 'User'),
    [supportUser.id]: String(supportUser.data().displayName || 'Lingland Operations'),
  };

  await db.runTransaction(async transaction => {
    const existing = await transaction.get(threadRef);
    const current = existing.data() || {};
    const mergedParticipants = Array.from(new Set([...(current.participants || []), ...participants]));
    const unreadCount = { ...(current.unreadCount || {}) };
    mergedParticipants.forEach(participantId => {
      if (unreadCount[participantId] === undefined) unreadCount[participantId] = 0;
    });
    transaction.set(threadRef, {
      id: threadId,
      type: bookingId ? 'BOOKING' : 'DIRECT',
      participants: mergedParticipants,
      participantNames: { ...(current.participantNames || {}), ...participantNames },
      participantPhotos: current.participantPhotos || {},
      bookingId: bookingId || null,
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
