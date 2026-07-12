import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { queueBookingStatusEmails } from '../mail/bookingEmail';

const db = admin.firestore();
const ACTIVE_OFFER_STATUSES = ['ASSIGNMENT_PENDING', 'PENDING_ASSIGNMENT', 'OPENED', 'NEEDS_ASSIGNMENT', 'INCOMING'];

const getInterpreterIdentity = async (uid?: string) => {
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Interpreter authentication is required');
  const user = await db.collection('users').doc(uid).get();
  if (!user.exists || user.data()?.status !== 'ACTIVE' || user.data()?.role !== 'INTERPRETER' || !user.data()?.profileId) {
    throw new functions.https.HttpsError('permission-denied', 'An interpreter profile is required');
  }
  return { uid, interpreterId: String(user.data()!.profileId) };
};

export const ensureOwnAssignment = functions.https.onCall(async (data, context) => {
  const identity = await getInterpreterIdentity(context.auth?.uid);
  const bookingId = String(data?.bookingId || '').trim();
  if (!bookingId) throw new functions.https.HttpsError('invalid-argument', 'bookingId is required');

  const bookingRef = db.collection('bookings').doc(bookingId);
  const assignmentRef = db.collection('assignments').doc();
  const result = await db.runTransaction(async transaction => {
    const booking = await transaction.get(bookingRef);
    if (!booking.exists) throw new functions.https.HttpsError('not-found', 'Booking not found');
    const bookingData = booking.data() || {};
    const offeredIds = Array.isArray(bookingData.offeredInterpreterIds) ? bookingData.offeredInterpreterIds.map(String) : [];
    if (String(bookingData.interpreterId || '') !== identity.interpreterId && !offeredIds.includes(identity.interpreterId)) {
      throw new functions.https.HttpsError('permission-denied', 'This booking was not offered to the authenticated interpreter');
    }

    const existingQuery = db.collection('assignments')
      .where('bookingId', '==', bookingId)
      .where('interpreterId', '==', identity.interpreterId)
      .limit(1);
    const existing = await transaction.get(existingQuery);
    if (!existing.empty) return { id: existing.docs[0].id, ...existing.docs[0].data() };

    const assignment = {
      bookingId,
      interpreterId: identity.interpreterId,
      status: 'OFFERED',
      offeredAt: new Date().toISOString(),
      assignmentType: 'RECOVERED_DIRECT',
    };
    transaction.set(assignmentRef, assignment);
    return { id: assignmentRef.id, ...assignment };
  });
  return result;
});

export const respondToAssignment = functions.https.onCall(async (data, context) => {
  const identity = await getInterpreterIdentity(context.auth?.uid);
  const assignmentId = String(data?.assignmentId || '').trim();
  const response = String(data?.response || '').trim().toUpperCase();
  if (!assignmentId || !['ACCEPTED', 'DECLINED'].includes(response)) {
    throw new functions.https.HttpsError('invalid-argument', 'assignmentId and a valid response are required');
  }

  const assignmentRef = db.collection('assignments').doc(assignmentId);
  const now = new Date().toISOString();
  let bookingForEmail: FirebaseFirestore.DocumentData | null = null;
  let interpreterForEmail: FirebaseFirestore.DocumentData | null = null;
  let bookingId = '';

  await db.runTransaction(async transaction => {
    const assignment = await transaction.get(assignmentRef);
    if (!assignment.exists) throw new functions.https.HttpsError('not-found', 'Assignment not found');
    const assignmentData = assignment.data() || {};
    if (String(assignmentData.interpreterId || '') !== identity.interpreterId) {
      throw new functions.https.HttpsError('permission-denied', 'This assignment belongs to another interpreter');
    }
    if (assignmentData.status !== 'OFFERED') {
      if (assignmentData.status === response) return;
      throw new functions.https.HttpsError('failed-precondition', 'This offer has already been answered');
    }

    bookingId = String(assignmentData.bookingId || '');
    const bookingRef = db.collection('bookings').doc(bookingId);
    const interpreterRef = db.collection('interpreters').doc(identity.interpreterId);
    const [booking, interpreter] = await Promise.all([
      transaction.get(bookingRef),
      transaction.get(interpreterRef),
    ]);
    if (!booking.exists) throw new functions.https.HttpsError('not-found', 'Booking not found');
    const bookingData = booking.data() || {};
    bookingForEmail = { ...bookingData, id: bookingId };
    interpreterForEmail = interpreter.data() || {};
    const offeredAssignments = await transaction.get(
      db.collection('assignments').where('bookingId', '==', bookingId).where('status', '==', 'OFFERED')
    );
    const admins = response === 'ACCEPTED'
      ? await transaction.get(db.collection('users').where('role', 'in', ['ADMIN', 'SUPER_ADMIN']))
      : null;

    transaction.update(assignmentRef, { status: response, respondedAt: now });

    if (response === 'ACCEPTED') {
      if (!ACTIVE_OFFER_STATUSES.includes(String(bookingData.status || ''))) {
        throw new functions.https.HttpsError('failed-precondition', 'This job is no longer available');
      }

      offeredAssignments.docs.forEach(other => {
        if (other.id !== assignmentId) {
          transaction.update(other.ref, { status: 'DECLINED', respondedAt: now, declineReason: 'ANOTHER_OFFER_ACCEPTED' });
        }
      });
      transaction.update(bookingRef, {
        status: 'BOOKED',
        interpreterId: identity.interpreterId,
        interpreterName: interpreter.data()?.name || bookingData.interpreterName || 'Interpreter',
        interpreterPhotoUrl: interpreter.data()?.photoUrl || null,
        offeredInterpreterIds: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      const remainingAfterResponse = offeredAssignments.docs.filter(item => item.id !== assignmentId);
      const offeredIds = (Array.isArray(bookingData.offeredInterpreterIds) ? bookingData.offeredInterpreterIds : [])
        .map(String)
        .filter((id: string) => id !== identity.interpreterId);
      const update: Record<string, unknown> = {
        offeredInterpreterIds: offeredIds,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (remainingAfterResponse.length === 0) {
        update.status = 'NEEDS_ASSIGNMENT';
        if (String(bookingData.interpreterId || '') === identity.interpreterId) {
          update.interpreterId = null;
          update.interpreterName = null;
          update.interpreterPhotoUrl = null;
        }
      }
      transaction.update(bookingRef, update);
    }

    const eventRef = db.collection('jobEvents').doc();
    transaction.set(eventRef, {
      jobId: bookingId,
      organizationId: bookingData.organizationId || 'lingland-main',
      type: response === 'ACCEPTED' ? 'ASSIGNMENT_ACCEPTED' : 'ASSIGNMENT_DECLINED',
      source: 'interpreter_portal',
      metadata: { interpreterId: identity.interpreterId, assignmentId, response },
      createdAt: now,
    });

    if (response === 'ACCEPTED') {
      admins?.docs.forEach(adminUser => {
        const notification = db.collection('notifications').doc();
        transaction.set(notification, {
          userId: adminUser.id,
          title: 'Interpreter accepted offer',
          message: `${interpreter.data()?.name || 'Interpreter'} confirmed ${bookingData.displayRef || bookingData.jobNumber || bookingId}.`,
          type: 'SUCCESS',
          read: false,
          link: `/admin/bookings/${bookingId}`,
          createdAt: now,
        });
      });
    }
  });

  if (response === 'ACCEPTED' && bookingForEmail && interpreterForEmail) {
    const emailInterpreter: any = interpreterForEmail;
    await queueBookingStatusEmails(bookingId, bookingForEmail, 'BOOKED', {
      interpreterName: String(emailInterpreter.name || ''),
      interpreterEmail: String(emailInterpreter.email || ''),
    }, assignmentId);
  }

  return { success: true, bookingId, status: response === 'ACCEPTED' ? 'BOOKED' : 'DECLINED' };
});
