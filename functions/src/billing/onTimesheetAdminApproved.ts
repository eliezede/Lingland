import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { queueBookingStatusEmails } from '../mail/bookingEmail';

const db = admin.firestore();
const CALCULATION_VERSION = '2026-07-11';

const normalizeMode = (value: unknown) => {
  const mode = String(value || '').toUpperCase();
  if (['VIDEO', 'VIDEOCALL', 'ONLINE'].includes(mode)) return 'VIDEO';
  if (['PHONE', 'OVER THE PHONE'].includes(mode)) return 'PHONE';
  if (['CANCELLATION', 'CANCELLATION FEES'].includes(mode)) return 'CANCELLATION';
  return 'F2F';
};

const positive = (value: unknown) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

const assertAdmin = async (uid?: string) => {
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  const user = await db.collection('users').doc(uid).get();
  if (!user.exists || user.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(String(user.data()?.role || ''))) {
    throw new functions.https.HttpsError('permission-denied', 'Only administrators can approve timesheets');
  }
};

export const approveTimesheet = functions.https.onCall(async (data, context) => {
  await assertAdmin(context.auth?.uid);
  const timesheetId = String(data?.timesheetId || '').trim();
  if (!timesheetId) throw new functions.https.HttpsError('invalid-argument', 'timesheetId is required');

  const timesheetRef = db.collection('timesheets').doc(timesheetId);
  const timesheetSnap = await timesheetRef.get();
  if (!timesheetSnap.exists) throw new functions.https.HttpsError('not-found', 'Timesheet not found');
  const timesheet = timesheetSnap.data() || {};
  if (!timesheet.bookingId) throw new functions.https.HttpsError('failed-precondition', 'Timesheet is not linked to a booking');

  const bookingRef = db.collection('bookings').doc(String(timesheet.bookingId));
  const [bookingSnap, interpreterSnap, clientSnap, ratesSnap] = await Promise.all([
    bookingRef.get(),
    db.collection('interpreters').doc(String(timesheet.interpreterId || '')).get(),
    db.collection('clients').doc(String(timesheet.clientId || '')).get(),
    db.collection('rates').get(),
  ]);
  if (!bookingSnap.exists) throw new functions.https.HttpsError('not-found', 'Booking not found');
  const booking = bookingSnap.data() || {};
  const interpreter = interpreterSnap.data() || {};
  const client = clientSnap.data() || {};
  const mode = normalizeMode(timesheet.sessionMode || booking.sessionMode || booking.locationType);
  const isTranslation = booking.serviceCategory === 'TRANSLATION' || booking.serviceType === 'TRANSLATION';
  const isCancellation = mode === 'CANCELLATION' || Boolean(timesheet.nonExecutionReason);

  const start = new Date(timesheet.actualStart);
  const end = new Date(timesheet.actualEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new functions.https.HttpsError('failed-precondition', 'Timesheet start and end times are invalid');
  }
  const durationHours = Math.max(0, (end.getTime() - start.getTime()) / 3600000 - Number(timesheet.breakDurationMinutes || 0) / 60);
  const rateRecords = ratesSnap.docs.map(item => item.data());
  const serviceKeys = [booking.serviceType, booking.sessionMode, mode].map(value => String(value || '').toUpperCase());
  const findRate = (rateType: string) => rateRecords.find(rate =>
    String(rate.rateType || '').toUpperCase() === rateType
    && serviceKeys.includes(String(rate.serviceType || '').toUpperCase())
  );
  const clientRate = findRate('CLIENT');
  const interpreterRateRecord = findRate('INTERPRETER');
  const profileRates = interpreter.rates || {};
  const profileSessionRate = positive(
    booking.isOOH
      ? (mode === 'VIDEO' ? profileRates.oohVideo : mode === 'PHONE' ? profileRates.oohPhone : profileRates.oohF2F)
      : (mode === 'VIDEO' ? profileRates.stVideo : mode === 'PHONE' ? profileRates.stPhone : (profileRates.stF2F || profileRates.f2fRate))
  );
  const approvedBookingInterpreterAmount = positive(
    booking.interpreterAmountCalculated || booking.professionalCost || booking.interpreterCost
  );

  let unitsClient = durationHours;
  let unitsInterpreter = durationHours;
  let clientAmount = positive(data?.clientAmount);
  let interpreterAmount = positive(data?.interpreterAmount);
  let clientAmountSource = clientAmount ? 'ADMIN_OVERRIDE' : '';
  let interpreterAmountSource = interpreterAmount ? 'ADMIN_OVERRIDE' : '';

  if (isTranslation) {
    const quantity = positive(timesheet.wordCount || timesheet.unitsBillableToClient || booking.wordCount);
    if (!quantity) throw new functions.https.HttpsError('failed-precondition', 'Translation quantity is required');
    unitsClient = quantity;
    unitsInterpreter = quantity;
    if (!interpreterAmount) {
      if (approvedBookingInterpreterAmount) {
        interpreterAmount = approvedBookingInterpreterAmount;
        interpreterAmountSource = 'BOOKING_APPROVED_AMOUNT';
      } else {
        const configuredInterpreterRate = positive(interpreterRateRecord?.amountPerUnit);
        if (configuredInterpreterRate) {
          interpreterAmount = quantity * configuredInterpreterRate;
          interpreterAmountSource = 'RATE_CARD';
        }
      }
    }
    if (!clientAmount) {
      clientAmount = positive(timesheet.clientAmountCalculated || booking.finalQuote || booking.totalAmount);
      clientAmountSource = clientAmount ? 'APPROVED_QUOTE' : '';
    }
  } else if (isCancellation) {
    unitsClient = Number(timesheet.unitsBillableToClient || 0);
    unitsInterpreter = Number(timesheet.unitsPayableToInterpreter || 0);
    const cancellationIsBillable = Boolean(timesheet.billableCancellation);
    if (cancellationIsBillable && !interpreterAmount && timesheet.interpreterId && timesheet.interpreterId !== 'unassigned') {
      if (approvedBookingInterpreterAmount) {
        interpreterAmount = approvedBookingInterpreterAmount;
        interpreterAmountSource = 'BOOKING_APPROVED_AMOUNT';
      } else {
        const sessionRate = profileSessionRate || positive(interpreterRateRecord?.amountPerUnit);
        if (sessionRate) {
          unitsInterpreter = Math.max(Number(timesheet.unitsPayableToInterpreter || durationHours), positive(interpreterRateRecord?.minimumUnits) || 1);
          interpreterAmount = unitsInterpreter * sessionRate;
          interpreterAmountSource = profileSessionRate ? 'INTERPRETER_PROFILE_RATE' : 'RATE_CARD';
        }
      }
    }
    if (cancellationIsBillable && !clientAmount) {
      clientAmount = positive(timesheet.clientAmountCalculated || booking.totalAmount);
      clientAmountSource = clientAmount ? 'CANCELLATION_CHARGE' : '';
      if (!clientAmount) {
        const configuredClientRate = positive(clientRate?.amountPerUnit || client.billingRatePerHour || client?.rates?.[mode]);
        if (configuredClientRate) {
          unitsClient = Math.max(Number(timesheet.unitsBillableToClient || durationHours), positive(clientRate?.minimumUnits) || 1);
          clientAmount = unitsClient * configuredClientRate;
          clientAmountSource = 'RATE_CARD';
        }
      }
    }
  } else {
    if (!interpreterAmount) {
      if (approvedBookingInterpreterAmount) {
        interpreterAmount = approvedBookingInterpreterAmount;
        interpreterAmountSource = 'BOOKING_APPROVED_AMOUNT';
      } else {
        const sessionRate = profileSessionRate || positive(interpreterRateRecord?.amountPerUnit);
        if (sessionRate) {
          unitsInterpreter = Math.max(durationHours, positive(interpreterRateRecord?.minimumUnits) || 1);
          const travelMinutes = Number(timesheet.travelTimeMinutes || 0);
          const mileage = Number(timesheet.mileage || 0);
          const travelRate = positive(profileRates.travelTimeST);
          const mileageRate = positive(profileRates.mileageST);
          if (travelMinutes > 0 && !travelRate) {
            throw new functions.https.HttpsError('failed-precondition', 'Interpreter travel-time rate is missing');
          }
          if (mileage > 0 && !mileageRate) {
            throw new functions.https.HttpsError('failed-precondition', 'Interpreter mileage rate is missing');
          }
          interpreterAmount = unitsInterpreter * sessionRate
            + (travelMinutes / 60) * travelRate
            + mileage * mileageRate
            + Number(timesheet.parking || 0)
            + Number(timesheet.transport || 0);
          interpreterAmountSource = profileSessionRate ? 'INTERPRETER_PROFILE_RATE' : 'RATE_CARD';
        }
      }
    }
    if (!clientAmount) {
      const approvedBookingAmount = positive(timesheet.clientAmountCalculated || booking.totalAmount || booking.finalQuote);
      if (approvedBookingAmount) {
        clientAmount = approvedBookingAmount;
        clientAmountSource = 'BOOKING_AMOUNT';
      } else {
        const configuredClientRate = positive(clientRate?.amountPerUnit || client.billingRatePerHour || client?.rates?.[mode]);
        if (configuredClientRate) {
          unitsClient = Math.max(durationHours, positive(clientRate?.minimumUnits) || 1);
          clientAmount = unitsClient * configuredClientRate;
          clientAmountSource = 'RATE_CARD';
        }
      }
    }
  }

  const requiresClientAmount = !isCancellation || Boolean(timesheet.billableCancellation);
  const requiresInterpreterAmount = (!isCancellation || Boolean(timesheet.billableCancellation))
    && Boolean(timesheet.interpreterId && timesheet.interpreterId !== 'unassigned');
  if ((requiresInterpreterAmount && !interpreterAmount) || (requiresClientAmount && !clientAmount)) {
    const missing = [requiresInterpreterAmount && !interpreterAmount ? 'interpreter amount' : '', requiresClientAmount && !clientAmount ? 'client amount' : ''].filter(Boolean).join(' and ');
    throw new functions.https.HttpsError('failed-precondition', `Cannot approve: ${missing} must be configured or entered by staff`);
  }

  interpreterAmount = Number(interpreterAmount.toFixed(2));
  clientAmount = Number(clientAmount.toFixed(2));
  const now = new Date().toISOString();
  const result = await db.runTransaction(async transaction => {
    const [freshTimesheet, freshBooking] = await Promise.all([
      transaction.get(timesheetRef),
      transaction.get(bookingRef),
    ]);
    if (!freshTimesheet.exists || !freshBooking.exists) {
      throw new functions.https.HttpsError('not-found', 'Timesheet or booking no longer exists');
    }
    if (freshTimesheet.data()?.clientInvoiceId || freshTimesheet.data()?.interpreterInvoiceId) {
      throw new functions.https.HttpsError('failed-precondition', 'An invoiced timesheet cannot be re-approved');
    }
    if (freshTimesheet.data()?.adminApproved && freshTimesheet.data()?.billingCalculationVersion) {
      return { success: true, idempotent: true };
    }

    transaction.update(timesheetRef, {
      adminApproved: true,
      adminApprovedAt: now,
      adminApprovedBy: context.auth!.uid,
      status: 'INVOICING',
      unitsBillableToClient: Number(unitsClient.toFixed(4)),
      unitsPayableToInterpreter: Number(unitsInterpreter.toFixed(4)),
      clientAmountCalculated: clientAmount,
      interpreterAmountCalculated: interpreterAmount,
      readyForClientInvoice: clientAmount > 0,
      readyForInterpreterInvoice: Boolean(timesheet.interpreterId && timesheet.interpreterId !== 'unassigned' && interpreterAmount > 0),
      billingCalculationVersion: CALCULATION_VERSION,
      billingCalculationSources: { client: clientAmountSource, interpreter: interpreterAmountSource },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.update(bookingRef, {
      status: clientAmount > 0 || interpreterAmount > 0 ? 'READY_FOR_INVOICE' : 'SESSION_COMPLETED',
      timesheetId,
      timesheetStatus: 'APPROVED',
      timesheetVerifiedAt: now,
      billingReadyAt: clientAmount > 0 || interpreterAmount > 0 ? now : null,
      paymentStatus: clientAmount > 0 || interpreterAmount > 0 ? 'READY_FOR_INVOICE' : 'NOT_READY',
      billingIssueFlag: false,
      billingIssueReason: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.set(db.collection('jobEvents').doc(), {
      jobId: timesheet.bookingId,
      organizationId: booking.organizationId || 'lingland-main',
      type: 'TIMESHEET_VERIFIED',
      source: 'admin',
      metadata: {
        timesheetId,
        clientAmount,
        interpreterAmount,
        clientAmountSource,
        interpreterAmountSource,
      },
      createdAt: now,
    });
    return { success: true, idempotent: false };
  });

  await queueBookingStatusEmails(String(timesheet.bookingId), {
      ...booking,
      id: String(timesheet.bookingId),
      status: 'READY_FOR_INVOICE',
    }, 'READY_FOR_INVOICE', {
      interpreterEmail: String(interpreter.email || ''),
      interpreterName: String(interpreter.name || booking.interpreterName || ''),
    }, timesheetId);
  if (timesheet.interpreterId) {
    const interpreterUser = await db.collection('users').where('profileId', '==', String(timesheet.interpreterId)).limit(1).get();
    if (!interpreterUser.empty) {
      const userId = interpreterUser.docs[0].id;
      await db.collection('notifications').doc(`timesheet_approved_${timesheetId}_${userId}`).set({
          userId,
          title: 'Timesheet approved',
          message: `Your timesheet for ${booking.displayRef || booking.jobNumber || timesheet.bookingId} has been approved and moved to finance.`,
          type: 'SUCCESS',
          read: false,
          link: '/interpreter/timesheets',
          createdAt: now,
      }, { merge: true });
    }
  }

  return { ...result, timesheetId, clientAmount, interpreterAmount };
});

export const onTimesheetAdminApproved = functions.firestore
  .document('timesheets/{timesheetId}')
  .onUpdate(async change => {
    const before = change.before.data();
    const after = change.after.data();
    if (after.adminApproved === true && before.adminApproved !== true && !after.billingCalculationVersion) {
      await change.after.ref.update({
        adminApproved: false,
        adminApprovedAt: null,
        status: 'SUBMITTED',
        readyForClientInvoice: false,
        readyForInterpreterInvoice: false,
        billingCalculationError: 'Approval was rejected because it did not pass the server-side rate calculation',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    return null;
  });
