import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

const numberValue = (value: unknown, max = 1000000) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    throw new functions.https.HttpsError('invalid-argument', 'A numeric timesheet value is invalid');
  }
  return parsed;
};

const optionalText = (value: unknown, maxLength = 500) => {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
};

export const submitTimesheet = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Interpreter authentication is required');
  const user = await db.collection('users').doc(context.auth.uid).get();
  const role = String(user.data()?.role || '');
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(role);
  if (!user.exists || user.data()?.status !== 'ACTIVE' || (!isAdmin && (role !== 'INTERPRETER' || !user.data()?.profileId))) {
    throw new functions.https.HttpsError('permission-denied', 'An interpreter or administrator account is required');
  }

  const interpreterId = isAdmin ? String(data?.interpreterId || '') : String(user.data()!.profileId);
  const bookingId = String(data?.bookingId || '').trim();
  if (!bookingId) throw new functions.https.HttpsError('invalid-argument', 'bookingId is required');
  const bookingRef = db.collection('bookings').doc(bookingId);
  const booking = await bookingRef.get();
  if (!booking.exists) throw new functions.https.HttpsError('not-found', 'Booking not found');
  const bookingData = booking.data() || {};
  const isExceptionClaim = isAdmin && Boolean(data?.nonExecutionReason || data?.exceptionType || data?.billableCancellation);
  const isMissingClaimReconciliation = isAdmin && String(bookingData.status || '') === 'TIMESHEET_SUBMITTED';
  const assignmentMatches = String(bookingData.interpreterId || '') === interpreterId
    || (isAdmin && !bookingData.interpreterId && interpreterId === 'unassigned');
  if (!assignmentMatches) {
    throw new functions.https.HttpsError('permission-denied', 'This booking is assigned to another interpreter');
  }
  const initialAllowedStatuses = isExceptionClaim
    ? ['BOOKED', 'SESSION_COMPLETED', 'CANCELLED']
    : ['BOOKED', 'SESSION_COMPLETED', ...(isMissingClaimReconciliation ? ['TIMESHEET_SUBMITTED'] : [])];
  if (!initialAllowedStatuses.includes(String(bookingData.status || ''))) {
    throw new functions.https.HttpsError('failed-precondition', 'Only confirmed or completed jobs can receive a timesheet');
  }

  const actualStart = new Date(String(data?.actualStart || ''));
  const actualEnd = new Date(String(data?.actualEnd || ''));
  if (Number.isNaN(actualStart.getTime()) || Number.isNaN(actualEnd.getTime()) || actualEnd <= actualStart) {
    throw new functions.https.HttpsError('invalid-argument', 'Actual session start and end are invalid');
  }
  if (!isExceptionClaim && actualStart.getTime() > Date.now() + 15 * 60000) {
    throw new functions.https.HttpsError('failed-precondition', 'A timesheet cannot be submitted for a future session');
  }

  const claimedAmount = numberValue(data?.interpreterAmountCalculated ?? data?.totalToPay, 100000);
  const now = new Date().toISOString();
  const timesheetRef = db.collection('timesheets').doc();
  const result = await db.runTransaction(async transaction => {
    const [freshBooking, existing] = await Promise.all([
      transaction.get(bookingRef),
      transaction.get(db.collection('timesheets').where('bookingId', '==', bookingId).limit(1)),
    ]);
    const allowedStatuses = isExceptionClaim
      ? ['BOOKED', 'SESSION_COMPLETED', 'CANCELLED']
      : ['BOOKED', 'SESSION_COMPLETED', ...(isMissingClaimReconciliation ? ['TIMESHEET_SUBMITTED'] : [])];
    if (!freshBooking.exists || !allowedStatuses.includes(String(freshBooking.data()?.status || ''))) {
      throw new functions.https.HttpsError('failed-precondition', 'The job is no longer ready for timesheet submission');
    }
    if (!existing.empty) {
      throw new functions.https.HttpsError('already-exists', 'A timesheet has already been submitted for this job');
    }

    const freshBookingData = freshBooking.data() || {};
    const timesheet = {
      id: timesheetRef.id,
      organizationId: freshBookingData.organizationId || 'lingland-main',
      bookingId,
      interpreterId,
      interpreterName: freshBookingData.interpreterName || '',
      clientId: freshBookingData.clientId || '',
      clientDepartmentId: freshBookingData.clientDepartmentId || null,
      requestedByAgentId: freshBookingData.requestedByAgentId || null,
      requestedByUserId: freshBookingData.requestedByUserId || null,
      submittedAt: now,
      sessionMode: String(data?.sessionMode || bookingData.sessionMode || (bookingData.locationType === 'ONLINE' ? 'VIDEO' : 'F2F')),
      actualStart: actualStart.toISOString(),
      actualEnd: actualEnd.toISOString(),
      sessionDurationMinutes: numberValue(data?.sessionDurationMinutes, 24 * 60),
      sessionFees: 0,
      travelTimeMinutes: numberValue(data?.travelTimeMinutes, 24 * 60),
      travelFees: 0,
      mileage: numberValue(data?.mileage, 5000),
      mileageFees: 0,
      parking: numberValue(data?.parking, 10000),
      transport: numberValue(data?.transport, 10000),
      totalToPay: claimedAmount,
      breakDurationMinutes: numberValue(data?.breakDurationMinutes, 24 * 60),
      wordCount: numberValue(data?.wordCount, 10000000),
      unitPrice: numberValue(data?.unitPrice, 10000),
      units: String(data?.units || 'hours').slice(0, 30),
      interpreterAmountCalculated: claimedAmount,
      clientAmountCalculated: 0,
      adminApproved: false,
      status: 'SUBMITTED',
      readyForClientInvoice: false,
      readyForInterpreterInvoice: false,
      unitsBillableToClient: 0,
      unitsPayableToInterpreter: 0,
      clientInvoiceId: null,
      interpreterInvoiceId: null,
      nonExecutionReason: optionalText(data?.nonExecutionReason, 500),
      billableCancellation: Boolean(data?.billableCancellation),
      exceptionType: data?.exceptionType ? String(data.exceptionType).slice(0, 40) : null,
      supportingDocumentUrl: optionalText(data?.supportingDocumentUrl, 2000),
      clientSignatureUrl: optionalText(data?.clientSignatureUrl, 2000),
      clientNameSigned: optionalText(data?.clientNameSigned, 200),
      source: isAdmin ? 'STAFF_MANUAL' : 'INTERPRETER_APP',
      recordedByStaff: isAdmin,
      createdAt: now,
      updatedAt: now,
    };
    transaction.set(timesheetRef, timesheet);
    transaction.update(bookingRef, {
      status: 'TIMESHEET_SUBMITTED',
      timesheetId: timesheetRef.id,
      timesheetStatus: 'SUBMITTED',
      timesheetSubmittedAt: now,
      paymentStatus: 'NOT_READY',
      clientInvoiceId: null,
      interpreterInvoiceId: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.set(db.collection('jobEvents').doc(), {
      jobId: bookingId,
      organizationId: bookingData.organizationId || 'lingland-main',
      type: 'TIMESHEET_SUBMITTED',
      source: isAdmin ? 'admin' : 'interpreter_portal',
      metadata: { timesheetId: timesheetRef.id, interpreterId },
      createdAt: now,
    });
    return timesheet;
  });

  return { success: true, timesheet: result };
});
