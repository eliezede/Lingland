import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { queueBookingStatusEmails } from '../mail/bookingEmail';

const db = admin.firestore();
const TERMINAL_STATUSES = ['CANCELLED', 'TIMESHEET_SUBMITTED', 'READY_FOR_INVOICE', 'INVOICED', 'PAID'];

const assertAdmin = async (uid?: string) => {
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  const user = await db.collection('users').doc(uid).get();
  if (!user.exists || user.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(String(user.data()?.role || ''))) {
    throw new functions.https.HttpsError('permission-denied', 'Only administrators can manage assignments');
  }
};

export const adminAssignmentAction = functions.https.onCall(async (data, context) => {
  await assertAdmin(context.auth?.uid);
  const action = String(data?.action || '').trim().toUpperCase();
  const bookingId = String(data?.bookingId || '').trim();
  const requestedInterpreterId = String(data?.interpreterId || '').trim();
  const accepted = Boolean(data?.accepted);
  const reason = String(data?.reason || '').trim().slice(0, 500);
  if (!bookingId || !['ASSIGN', 'UNASSIGN', 'RECORD_RESPONSE', 'COMPLETE_SESSION'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'bookingId and a supported action are required');
  }

  const bookingRef = db.collection('bookings').doc(bookingId);
  const now = new Date().toISOString();
  let emailStatus = '';
  let bookingForEmail: FirebaseFirestore.DocumentData | null = null;
  let interpreterForEmail: FirebaseFirestore.DocumentData | null = null;
  let eventId = '';

  const result = await db.runTransaction(async transaction => {
    const booking = await transaction.get(bookingRef);
    if (!booking.exists) throw new functions.https.HttpsError('not-found', 'Booking not found');
    const current = booking.data() || {};
    const currentStatus = String(current.status || '');
    const interpreterId = action === 'ASSIGN' ? requestedInterpreterId : String(current.interpreterId || '');
    const interpreterRef = interpreterId ? db.collection('interpreters').doc(interpreterId) : null;
    const interpreter = interpreterRef ? await transaction.get(interpreterRef) : null;
    if (action === 'ASSIGN' && (!interpreterId || !interpreter?.exists)) {
      throw new functions.https.HttpsError('not-found', 'Selected interpreter not found');
    }
    if (['ASSIGN', 'UNASSIGN', 'RECORD_RESPONSE'].includes(action) && TERMINAL_STATUSES.includes(currentStatus)) {
      throw new functions.https.HttpsError('failed-precondition', `Assignments cannot be changed while the job is ${currentStatus}`);
    }

    const assignments = await transaction.get(db.collection('assignments').where('bookingId', '==', bookingId));
    const eventRef = db.collection('jobEvents').doc();
    eventId = eventRef.id;

    if (action === 'ASSIGN') {
      const selectedAssignment = assignments.docs.find(item => String(item.data().interpreterId || '') === interpreterId);
      let selectedAssignmentId = selectedAssignment?.id || '';
      if (!selectedAssignmentId) {
        const assignmentRef = db.collection('assignments').doc();
        selectedAssignmentId = assignmentRef.id;
        transaction.set(assignmentRef, {
          bookingId,
          interpreterId,
          status: 'OFFERED',
          offeredAt: now,
          assignmentType: 'DIRECT',
          createdBy: context.auth!.uid,
        });
      }
      assignments.docs.forEach(item => transaction.update(item.ref,
        String(item.data().interpreterId || '') === interpreterId
          ? { status: 'OFFERED', offeredAt: now, respondedAt: null }
          : { status: 'DECLINED', respondedAt: now, declineReason: 'REASSIGNED_BY_STAFF' }
      ));
      transaction.update(bookingRef, {
        status: 'PENDING_ASSIGNMENT',
        interpreterId,
        interpreterName: interpreter!.data()?.name || 'Interpreter',
        interpreterPhotoUrl: interpreter!.data()?.photoUrl || null,
        offeredInterpreterIds: [interpreterId],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(eventRef, {
        jobId: bookingId,
        organizationId: current.organizationId || 'lingland-main',
        type: 'DIRECT_ASSIGNMENT_SENT',
        source: 'admin',
        actorUserId: context.auth!.uid,
        metadata: { fromStatus: currentStatus, toStatus: 'PENDING_ASSIGNMENT', interpreterId, assignmentId: selectedAssignmentId },
        createdAt: now,
      });
      emailStatus = 'PENDING_ASSIGNMENT';
    }

    if (action === 'UNASSIGN') {
      if (!interpreterId) return { status: currentStatus, idempotent: true };
      assignments.docs.filter(item => String(item.data().interpreterId || '') === interpreterId).forEach(item => transaction.update(item.ref, {
        status: 'REMOVED',
        respondedAt: now,
        removalReason: reason || 'Administrative reassignment',
        recordedByStaff: true,
      }));
      transaction.update(bookingRef, {
        status: 'NEEDS_ASSIGNMENT',
        interpreterId: null,
        interpreterName: null,
        interpreterPhotoUrl: null,
        offeredInterpreterIds: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(eventRef, {
        jobId: bookingId,
        organizationId: current.organizationId || 'lingland-main',
        type: 'ASSIGNMENT_REMOVED',
        source: 'admin',
        actorUserId: context.auth!.uid,
        metadata: { fromStatus: currentStatus, toStatus: 'NEEDS_ASSIGNMENT', interpreterId, reason },
        createdAt: now,
      });
      emailStatus = 'ASSIGNMENT_REMOVED';
    }

    if (action === 'RECORD_RESPONSE') {
      if (!interpreterId || !interpreter?.exists) throw new functions.https.HttpsError('failed-precondition', 'No interpreter is assigned');
      let matching = assignments.docs.filter(item => String(item.data().interpreterId || '') === interpreterId);
      if (matching.length === 0) {
        const assignmentRef = db.collection('assignments').doc();
        transaction.set(assignmentRef, {
          bookingId,
          interpreterId,
          status: accepted ? 'ACCEPTED' : 'DECLINED',
          offeredAt: now,
          respondedAt: now,
          assignmentType: 'STAFF_MANUAL',
          recordedByStaff: true,
        });
      } else {
        matching.forEach(item => transaction.update(item.ref, {
          status: accepted ? 'ACCEPTED' : 'DECLINED',
          respondedAt: now,
          recordedByStaff: true,
        }));
      }
      if (accepted) {
        assignments.docs.filter(item => String(item.data().interpreterId || '') !== interpreterId && item.data().status === 'OFFERED')
          .forEach(item => transaction.update(item.ref, { status: 'DECLINED', respondedAt: now, declineReason: 'ANOTHER_OFFER_ACCEPTED' }));
        transaction.update(bookingRef, {
          status: 'BOOKED',
          interpreterName: interpreter.data()?.name || current.interpreterName || 'Interpreter',
          interpreterPhotoUrl: interpreter.data()?.photoUrl || null,
          offeredInterpreterIds: [],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.update(bookingRef, {
          status: 'NEEDS_ASSIGNMENT',
          interpreterId: null,
          interpreterName: null,
          interpreterPhotoUrl: null,
          offeredInterpreterIds: [],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      transaction.set(eventRef, {
        jobId: bookingId,
        organizationId: current.organizationId || 'lingland-main',
        type: accepted ? 'ASSIGNMENT_ACCEPTED' : 'ASSIGNMENT_DECLINED',
        source: 'admin',
        actorUserId: context.auth!.uid,
        metadata: { fromStatus: currentStatus, toStatus: accepted ? 'BOOKED' : 'NEEDS_ASSIGNMENT', interpreterId, recordedByStaff: true },
        createdAt: now,
      });
      if (accepted) emailStatus = 'BOOKED';
    }

    if (action === 'COMPLETE_SESSION') {
      if (currentStatus === 'SESSION_COMPLETED') return { status: currentStatus, idempotent: true };
      if (currentStatus !== 'BOOKED') {
        throw new functions.https.HttpsError('failed-precondition', 'Only a booked job can be completed');
      }
      transaction.update(bookingRef, {
        status: 'SESSION_COMPLETED',
        sessionCompletedAt: now,
        sessionCompletedBy: context.auth!.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(eventRef, {
        jobId: bookingId,
        organizationId: current.organizationId || 'lingland-main',
        type: 'SESSION_COMPLETED',
        source: 'admin',
        actorUserId: context.auth!.uid,
        metadata: { fromStatus: currentStatus, toStatus: 'SESSION_COMPLETED', recordedByStaff: true },
        createdAt: now,
      });
    }

    bookingForEmail = { ...current, id: bookingId, status: emailStatus || currentStatus };
    interpreterForEmail = interpreter?.data() || null;
    return {
      status: action === 'ASSIGN' ? 'PENDING_ASSIGNMENT'
        : action === 'UNASSIGN' || (action === 'RECORD_RESPONSE' && !accepted) ? 'NEEDS_ASSIGNMENT'
          : action === 'RECORD_RESPONSE' ? 'BOOKED'
            : 'SESSION_COMPLETED',
      idempotent: false,
    };
  });

  if (emailStatus && bookingForEmail) {
    const interpreter: any = interpreterForEmail || {};
    await queueBookingStatusEmails(bookingId, bookingForEmail, emailStatus, {
      interpreterEmail: String(interpreter.email || ''),
      interpreterName: String(interpreter.name || ''),
    }, eventId);
  }
  return { success: true, bookingId, ...result };
});
