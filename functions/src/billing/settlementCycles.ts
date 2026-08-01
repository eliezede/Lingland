import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import {
  canTransitionSettlementCycle,
  londonPeriodKey,
  normalizeSettlementPeriod,
  normalizeSettlementService,
  SettlementCycleItemInput,
  SettlementCycleStatus,
  settlementCycleId,
  settlementPeriodBounds,
  summarizeSettlementItems,
} from './settlementCycleCore';

const db = admin.firestore();
const ORGANIZATION_ID = 'lingland-main';
const MAX_PERIOD_RECORDS = 5000;

type FinanceActor = { uid: string; role: string };

const assertFinanceActor = async (uid?: string): Promise<FinanceActor> => {
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');
  const user = await db.collection('users').doc(uid).get();
  const data = user.data() || {};
  const role = String(data.role || '');
  if (!user.exists || data.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'An active finance administrator is required');
  }
  return { uid, role };
};

const financeError = (error: unknown) => {
  if (error instanceof functions.https.HttpsError) return error;
  return new functions.https.HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid settlement request');
};

const normalizeBookingService = (value: unknown) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (['TRANSLATION', 'TRANSLATIONS', 'TRANSLATOR'].includes(normalized)) return 'TRANSLATION';
  return 'INTERPRETATION';
};

const getDocumentsById = async (collectionName: string, ids: string[]) => {
  const result = new Map<string, FirebaseFirestore.DocumentData>();
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const refs = uniqueIds.slice(offset, offset + 100).map(id => db.collection(collectionName).doc(id));
    const docs = refs.length ? await db.getAll(...refs) : [];
    docs.forEach(doc => {
      if (doc.exists) result.set(doc.id, doc.data() || {});
    });
  }
  return result;
};

const cycleItemStatus = (timesheet: FirebaseFirestore.DocumentData | undefined, booking: FirebaseFirestore.DocumentData) => {
  if (!timesheet) return { status: 'EXCEPTION' as const, reason: 'Missing timesheet' };
  if (!timesheet.adminApproved) return { status: 'EXCEPTION' as const, reason: 'Timesheet requires approval' };
  const amount = Number(timesheet.interpreterAmountCalculated || timesheet.totalToPay || 0);
  if (!timesheet.interpreterId || timesheet.interpreterId === 'unassigned') return { status: 'EXCEPTION' as const, reason: 'Professional is not linked' };
  if (!Number.isFinite(amount) || amount <= 0) return { status: 'EXCEPTION' as const, reason: 'Approved payable amount is missing' };
  if (String(booking.interpreterPaymentStatus || '').toUpperCase() === 'PAID') return { status: 'PAID' as const, reason: '' };
  if (timesheet.interpreterInvoiceId || booking.interpreterInvoiceId) return { status: 'INVOICED' as const, reason: '' };
  if (!timesheet.readyForInterpreterInvoice) return { status: 'EXCEPTION' as const, reason: 'Payable is not released for settlement' };
  return { status: 'READY' as const, reason: '' };
};

export const prepareSettlementCycle = functions.runWith({ timeoutSeconds: 540, memory: '1GB' }).https.onCall(async (data, context) => {
  const actor = await assertFinanceActor(context.auth?.uid);
  let periodKey: string;
  let serviceCategory: 'INTERPRETATION' | 'TRANSLATION';
  try {
    periodKey = normalizeSettlementPeriod(data?.periodKey);
    serviceCategory = normalizeSettlementService(data?.serviceCategory);
  } catch (error) {
    throw financeError(error);
  }
  const cycleId = settlementCycleId(periodKey, serviceCategory);
  const bounds = settlementPeriodBounds(periodKey);
  const cycleRef = db.collection('settlementCycles').doc(cycleId);

  const refreshVersion = await db.runTransaction(async transaction => {
    const existing = await transaction.get(cycleRef);
    const currentStatus = String(existing.data()?.status || 'OPEN');
    if (existing.exists && !['OPEN', 'PREPARING'].includes(currentStatus)) {
      throw new functions.https.HttpsError('failed-precondition', `A ${currentStatus} settlement cycle cannot be refreshed`);
    }
    const nextVersion = Number(existing.data()?.refreshVersion || 0) + 1;
    transaction.set(cycleRef, {
      id: cycleId,
      organizationId: ORGANIZATION_ID,
      periodKey,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      serviceCategory,
      status: 'PREPARING',
      currency: 'GBP',
      refreshVersion: nextVersion,
      preparedBy: actor.uid,
      preparedAt: new Date().toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: existing.exists ? existing.data()?.createdAt : admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return nextVersion;
  });

  try {
    const [timesheetSnapshot, bookingSnapshot] = await Promise.all([
      db.collection('timesheets')
        .where('actualStart', '>=', bounds.queryStart)
        .where('actualStart', '<', bounds.queryEnd)
        .limit(MAX_PERIOD_RECORDS + 1)
        .get(),
      db.collection('bookings')
        .where('date', '>=', bounds.periodStart)
        .where('date', '<=', bounds.periodEnd)
        .limit(MAX_PERIOD_RECORDS + 1)
        .get(),
    ]);
    if (timesheetSnapshot.size > MAX_PERIOD_RECORDS || bookingSnapshot.size > MAX_PERIOD_RECORDS) {
      throw new functions.https.HttpsError('resource-exhausted', 'This period is too large to prepare safely in one run');
    }

    const timesheetsByBooking = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    timesheetSnapshot.docs.forEach(doc => {
      const value = doc.data();
      if (londonPeriodKey(value.actualStart) === periodKey && value.bookingId) timesheetsByBooking.set(String(value.bookingId), doc);
    });

    const missingBookingIds = Array.from(timesheetsByBooking.keys()).filter(id => !bookingSnapshot.docs.some(doc => doc.id === id));
    const externalBookings = await getDocumentsById('bookings', missingBookingIds);
    const bookingsById = new Map<string, FirebaseFirestore.DocumentData>();
    bookingSnapshot.docs.forEach(doc => bookingsById.set(doc.id, doc.data()));
    externalBookings.forEach((value, key) => bookingsById.set(key, value));

    const candidateBookingIds = new Set<string>();
    bookingsById.forEach((booking, bookingId) => {
      if (String(booking.date || '').slice(0, 7) !== periodKey) return;
      if (normalizeBookingService(booking.serviceCategory || booking.serviceType) !== serviceCategory) return;
      const status = String(booking.status || '');
      const hasTimesheet = timesheetsByBooking.has(bookingId);
      const pastService = String(booking.date || '') <= new Date().toISOString().slice(0, 10);
      if (hasTimesheet || (pastService && !['CANCELLED'].includes(status))) candidateBookingIds.add(bookingId);
    });
    timesheetsByBooking.forEach((timesheet, bookingId) => {
      const booking = bookingsById.get(bookingId) || {};
      const category = normalizeBookingService(timesheet.data().serviceCategory || booking.serviceCategory || booking.serviceType);
      if (category === serviceCategory) candidateBookingIds.add(bookingId);
    });

    const items = Array.from(candidateBookingIds).map(bookingId => {
      const booking = bookingsById.get(bookingId) || {};
      const timesheetDoc = timesheetsByBooking.get(bookingId);
      const timesheet = timesheetDoc?.data();
      const eligibility = cycleItemStatus(timesheet, booking);
      const interpreterId = String(timesheet?.interpreterId || booking.interpreterId || '');
      const amount = Number(timesheet?.interpreterAmountCalculated || timesheet?.totalToPay || 0);
      return {
        id: `${cycleId}_${timesheetDoc?.id || `booking_${bookingId}`}`,
        organizationId: String(booking.organizationId || timesheet?.organizationId || ORGANIZATION_ID),
        cycleId,
        periodKey,
        serviceCategory,
        bookingId,
        bookingRef: String(booking.displayRef || booking.jobNumber || booking.bookingRef || bookingId),
        timesheetId: timesheetDoc?.id || null,
        interpreterId,
        interpreterName: String(timesheet?.interpreterName || booking.interpreterName || 'Unassigned'),
        serviceDate: String(booking.date || timesheet?.actualStart || '').slice(0, 10),
        amount: Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0,
        status: eligibility.status,
        exceptionReason: eligibility.reason || null,
        interpreterInvoiceId: String(timesheet?.interpreterInvoiceId || booking.interpreterInvoiceId || '') || null,
        sourceSystem: String(booking.sourceSystem || timesheet?.sourceSystem || 'PLATFORM'),
        refreshVersion,
        updatedAt: new Date().toISOString(),
      };
    });

    const summary = summarizeSettlementItems(items as SettlementCycleItemInput[]);
    const existingItems = await db.collection('settlementCycleItems').where('cycleId', '==', cycleId).get();
    const writer = db.bulkWriter();
    existingItems.docs.forEach(doc => writer.delete(doc.ref));
    items.forEach(item => writer.set(db.collection('settlementCycleItems').doc(item.id), item));
    await writer.close();

    await cycleRef.set({
      status: 'OPEN',
      summary,
      refreshVersion,
      preparedBy: actor.uid,
      preparedAt: new Date().toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await db.collection('auditLogs').add({
      action: 'SETTLEMENT_CYCLE_PREPARED',
      actorUserId: actor.uid,
      cycleId,
      periodKey,
      serviceCategory,
      summary,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, cycleId, cycle: { id: cycleId, periodKey, serviceCategory, status: 'OPEN', summary, ...bounds } };
  } catch (error) {
    await cycleRef.set({
      status: 'PREPARING',
      preparationError: error instanceof Error ? error.message : 'Settlement preparation failed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    throw error;
  }
});

export const getSettlementCycle = functions.https.onCall(async (data, context) => {
  await assertFinanceActor(context.auth?.uid);
  let periodKey: string;
  let serviceCategory: 'INTERPRETATION' | 'TRANSLATION';
  try {
    periodKey = normalizeSettlementPeriod(data?.periodKey);
    serviceCategory = normalizeSettlementService(data?.serviceCategory);
  } catch (error) {
    throw financeError(error);
  }
  const cycleId = settlementCycleId(periodKey, serviceCategory);
  const [cycle, items] = await Promise.all([
    db.collection('settlementCycles').doc(cycleId).get(),
    db.collection('settlementCycleItems').where('cycleId', '==', cycleId).get(),
  ]);
  if (!cycle.exists) return { success: true, cycle: null, payees: [] };
  const payees = new Map<string, { interpreterId: string; interpreterName: string; jobCount: number; readyCount: number; exceptionCount: number; totalAmount: number }>();
  items.docs.forEach(doc => {
    const item = doc.data();
    const key = String(item.interpreterId || 'unassigned');
    const current = payees.get(key) || {
      interpreterId: key,
      interpreterName: String(item.interpreterName || 'Unassigned'),
      jobCount: 0,
      readyCount: 0,
      exceptionCount: 0,
      totalAmount: 0,
    };
    current.jobCount += 1;
    current.readyCount += item.status === 'READY' ? 1 : 0;
    current.exceptionCount += item.status === 'EXCEPTION' ? 1 : 0;
    current.totalAmount = Number((current.totalAmount + Math.max(0, Number(item.amount || 0))).toFixed(2));
    payees.set(key, current);
  });
  return {
    success: true,
    cycle: { id: cycle.id, ...cycle.data() },
    payees: Array.from(payees.values()).sort((a, b) => b.totalAmount - a.totalAmount || a.interpreterName.localeCompare(b.interpreterName)),
  };
});

export const transitionSettlementCycle = functions.https.onCall(async (data, context) => {
  const actor = await assertFinanceActor(context.auth?.uid);
  const cycleId = String(data?.cycleId || '').trim();
  const nextStatus = String(data?.status || '').trim().toUpperCase() as SettlementCycleStatus;
  if (!cycleId || !['OPEN', 'REVIEW', 'APPROVED', 'POSTED', 'CLOSED'].includes(nextStatus)) {
    throw new functions.https.HttpsError('invalid-argument', 'Cycle and a supported target status are required');
  }
  if (nextStatus === 'APPROVED' && actor.role !== 'SUPER_ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Final settlement approval requires a super administrator');
  }
  const cycleRef = db.collection('settlementCycles').doc(cycleId);
  const now = new Date().toISOString();
  const result = await db.runTransaction(async transaction => {
    const cycle = await transaction.get(cycleRef);
    if (!cycle.exists) throw new functions.https.HttpsError('not-found', 'Settlement cycle not found');
    const current = String(cycle.data()?.status || '') as SettlementCycleStatus;
    if (current === nextStatus) return { idempotent: true, status: current };
    if (!canTransitionSettlementCycle(current, nextStatus)) {
      throw new functions.https.HttpsError('failed-precondition', `Settlement cycle cannot move from ${current} to ${nextStatus}`);
    }
    if (nextStatus === 'APPROVED' && Number(cycle.data()?.summary?.exceptionCount || 0) > 0) {
      throw new functions.https.HttpsError('failed-precondition', 'Resolve every settlement exception before approval');
    }
    const fieldPrefix = nextStatus.toLowerCase();
    transaction.update(cycleRef, {
      status: nextStatus,
      [`${fieldPrefix}At`]: now,
      [`${fieldPrefix}By`]: actor.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { idempotent: false, status: nextStatus, periodKey: cycle.data()?.periodKey };
  });

  if (nextStatus === 'APPROVED') {
    const items = await db.collection('settlementCycleItems').where('cycleId', '==', cycleId).get();
    const writer = db.bulkWriter();
    items.docs.filter(item => ['READY', 'INVOICED', 'PAID'].includes(String(item.data().status))).forEach(item => {
      const value = item.data();
      if (value.timesheetId) writer.set(db.collection('timesheets').doc(String(value.timesheetId)), {
        settlementCycleId: cycleId,
        interpreterSettlementPeriod: result.periodKey,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      if (value.bookingId) writer.set(db.collection('bookings').doc(String(value.bookingId)), {
        settlementCycleId: cycleId,
        interpreterSettlementPeriod: result.periodKey,
        interpreterPayableStatus: value.status === 'READY' ? 'STATEMENT_READY' : value.status === 'PAID' ? 'PAID' : 'INVOICE_RECEIVED',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await writer.close();
  }
  await db.collection('auditLogs').add({
    action: 'SETTLEMENT_CYCLE_STATUS_CHANGED',
    actorUserId: actor.uid,
    cycleId,
    status: nextStatus,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { success: true, ...result };
});
