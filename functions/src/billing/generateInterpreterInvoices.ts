import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

const db = admin.firestore();
const MAX_TIMESHEETS_PER_INVOICE = 200;
const MAX_TIMESHEETS_SCANNED = 500;

const normalizeServiceCategory = (value: unknown) => (
  String(value || '').trim().toUpperCase() === 'TRANSLATION' ? 'TRANSLATION' : 'INTERPRETATION'
);

const assertAdmin = async (uid?: string) => {
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'You must be signed in to generate invoices');
  const caller = await db.collection('users').doc(uid).get();
  if (!caller.exists || caller.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(String(caller.data()?.role || ''))) {
    throw new functions.https.HttpsError('permission-denied', 'Only administrators can generate interpreter invoices');
  }
};

export const generateInterpreterInvoices = functions.https.onCall(async (data, context) => {
  await assertAdmin(context.auth?.uid);
  const interpreterId = String(data?.interpreterId || '').trim();
  const periodStart = String(data?.periodStart || '');
  const periodEnd = String(data?.periodEnd || '');
  const requestedServiceCategory = data?.serviceCategory
    ? normalizeServiceCategory(data.serviceCategory)
    : undefined;
  const settlementCycleId = String(data?.settlementCycleId || '').trim() || undefined;
  if (!interpreterId || Number.isNaN(new Date(periodStart).getTime()) || Number.isNaN(new Date(periodEnd).getTime())) {
    throw new functions.https.HttpsError('invalid-argument', 'Interpreter and a valid invoice period are required');
  }

  const periodStartQuery = /^\d{4}-\d{2}-\d{2}$/.test(periodStart) ? `${periodStart}T00:00:00.000Z` : periodStart;
  const periodEndQuery = /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ? `${periodEnd}T23:59:59.999Z` : periodEnd;

  const initial = await db.collection('timesheets')
    .where('interpreterId', '==', interpreterId)
    .where('readyForInterpreterInvoice', '==', true)
    .where('actualStart', '>=', periodStartQuery)
    .where('actualStart', '<=', periodEndQuery)
    .limit(MAX_TIMESHEETS_SCANNED)
    .get();
  const unclassifiedCandidates = initial.docs.filter(item => !item.data().interpreterInvoiceId);
  const candidateBookingIds = Array.from(new Set(unclassifiedCandidates.map(item => String(item.data().bookingId || '')).filter(Boolean)));
  const bookingDocs = candidateBookingIds.length
    ? await db.getAll(...candidateBookingIds.map(id => db.collection('bookings').doc(id)))
    : [];
  const bookingById = new Map(bookingDocs.filter(item => item.exists).map(item => [item.id, item.data() || {}]));
  const candidates = unclassifiedCandidates.filter(item => {
    const value = item.data();
    const booking = bookingById.get(String(value.bookingId || '')) || {};
    const category = normalizeServiceCategory(value.serviceCategory || booking.serviceCategory || booking.serviceType);
    if (requestedServiceCategory && category !== requestedServiceCategory) return false;
    if (settlementCycleId && String(value.settlementCycleId || '') !== settlementCycleId) return false;
    return true;
  }).slice(0, MAX_TIMESHEETS_PER_INVOICE);
  if (candidates.length === 0) return { success: false, message: 'No eligible timesheets found for this period' };

  const generationKey = createHash('sha256')
    .update(`${interpreterId}:${requestedServiceCategory || 'ALL'}:${settlementCycleId || 'NO_CYCLE'}:${candidates.map(item => item.id).sort().join(',')}`)
    .digest('hex');
  const invoiceRef = db.collection('interpreterInvoices').doc(`interpreter_${generationKey.slice(0, 32)}`);
  const interpreterRef = db.collection('interpreters').doc(interpreterId);
  const settingsRef = db.collection('systemSettings').doc('main');
  const cycleRef = settlementCycleId ? db.collection('settlementCycles').doc(settlementCycleId) : null;

  return db.runTransaction(async transaction => {
    const [existingInvoice, interpreterSnap, settingsSnap, cycleSnap, ...freshTimesheets] = await Promise.all([
      transaction.get(invoiceRef),
      transaction.get(interpreterRef),
      transaction.get(settingsRef),
      cycleRef ? transaction.get(cycleRef) : Promise.resolve(null),
      ...candidates.map(item => transaction.get(item.ref)),
    ]);
    if (existingInvoice.exists) {
      const value = existingInvoice.data() || {};
      return { success: true, idempotent: true, invoiceId: invoiceRef.id, invoiceNumber: value.invoiceNumber };
    }
    if (!interpreterSnap.exists) throw new functions.https.HttpsError('not-found', 'Interpreter not found');
    if (cycleRef) {
      if (!cycleSnap?.exists) throw new functions.https.HttpsError('not-found', 'Settlement cycle not found');
      const cycle = cycleSnap.data() || {};
      if (cycle.status !== 'APPROVED') {
        throw new functions.https.HttpsError('failed-precondition', 'Settlement cycle must be approved before generating documents');
      }
      if (requestedServiceCategory && cycle.serviceCategory !== requestedServiceCategory) {
        throw new functions.https.HttpsError('failed-precondition', 'Settlement cycle service does not match the requested document');
      }
    }

    const timesheets = freshTimesheets.filter(item => {
      const value = item.data();
      return item.exists && value?.readyForInterpreterInvoice === true && !value?.interpreterInvoiceId;
    });
    if (timesheets.length === 0) {
      throw new functions.https.HttpsError('already-exists', 'Eligible timesheets were claimed by another invoice');
    }
    const invalid = timesheets.filter(item => Number(item.data()?.interpreterAmountCalculated || 0) <= 0);
    if (invalid.length > 0) {
      throw new functions.https.HttpsError('failed-precondition', `${invalid.length} timesheet(s) have no approved interpreter amount`);
    }

    const settings = settingsSnap.data() || {};
    const finance = settings.finance || {};
    const nextNumber = Number(finance.nextInterpreterInvoiceNumber || 1);
    const prefix = String(finance.interpreterInvoicePrefix || 'INV-INT-');
    const invoiceNumber = `${prefix}${String(nextNumber).padStart(5, '0')}`;
    const totalAmount = Number(timesheets.reduce((sum, item) => sum + Number(item.data()!.interpreterAmountCalculated), 0).toFixed(2));
    const interpreter = interpreterSnap.data() || {};
    const serviceCategories = Array.from(new Set(timesheets.map(item => {
      const value = item.data() || {};
      const booking = bookingById.get(String(value.bookingId || '')) || {};
      return String(value.serviceCategory || booking.serviceCategory || '').toUpperCase() === 'TRANSLATION' ? 'TRANSLATION' : 'INTERPRETATION';
    })));
    const settlementPeriods = Array.from(new Set(timesheets.map(item => String(item.data()?.servicePeriod || item.data()?.actualStart || periodStart).slice(0, 7)).filter(Boolean)));

    transaction.set(settingsRef, {
      finance: { ...finance, nextInterpreterInvoiceNumber: nextNumber + 1 },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    timesheets.forEach(timesheet => {
      const value = timesheet.data()!;
      const lineAmount = Number(value.interpreterAmountCalculated);
      const units = Number(value.unitsPayableToInterpreter || 0);
      transaction.set(db.collection('interpreterInvoiceLines').doc(`${invoiceRef.id}_${timesheet.id}`), {
        invoiceId: invoiceRef.id,
        interpreterInvoiceId: invoiceRef.id,
        timesheetId: timesheet.id,
        bookingId: value.bookingId,
        clientId: value.clientId,
        interpreterId,
        description: `Language service remuneration - job ${String(value.bookingId || '').slice(0, 12).toUpperCase()}`,
        units,
        rate: units > 0 ? Number((lineAmount / units).toFixed(4)) : lineAmount,
        lineAmount,
        total: lineAmount,
      });
      transaction.update(timesheet.ref, {
        interpreterInvoiceId: invoiceRef.id,
        readyForInterpreterInvoice: false,
        interpreterSettlementPeriod: settlementPeriods.length === 1 ? settlementPeriods[0] : String(periodStart).slice(0, 7),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (settlementCycleId) {
        transaction.set(db.collection('settlementCycleItems').doc(`${settlementCycleId}_${timesheet.id}`), {
          status: 'INVOICED',
          interpreterInvoiceId: invoiceRef.id,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
      if (value.bookingId) {
        transaction.set(db.collection('bookings').doc(String(value.bookingId)), {
          interpreterInvoiceId: invoiceRef.id,
          interpreterInvoiceNumber: invoiceNumber,
          interpreterInvoiceReference: invoiceNumber,
          interpreterPayableStatus: 'STATEMENT_READY',
          interpreterPaymentStatus: 'UNPAID',
          interpreterSettlementPeriod: String(value.servicePeriod || value.actualStart || periodStart).slice(0, 7),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    });

    transaction.set(invoiceRef, {
      id: invoiceRef.id,
      generationKey,
      invoiceNumber,
      reference: invoiceNumber,
      interpreterId,
      interpreterName: interpreter.name || 'Unknown',
      interpreterEmail: interpreter.email || '',
      issueDate: new Date().toISOString(),
      periodStart,
      periodEnd,
      subtotal: totalAmount,
      totalAmount,
      currency: finance.currency || 'GBP',
      model: 'SELF_BILL',
      status: 'DRAFT',
      paymentStatus: 'UNPAID',
      settlementPeriod: settlementPeriods.length === 1 ? settlementPeriods[0] : undefined,
      settlementPeriods,
      ...(settlementCycleId ? { settlementCycleId } : {}),
      serviceCategories,
      ...(serviceCategories.length === 1 ? { primaryServiceCategory: serviceCategories[0] } : {}),
      timesheetCount: timesheets.length,
      lineCount: timesheets.length,
      financialIntegrityStatus: 'VERIFIED',
      referenceIntegrityStatus: 'VERIFIED',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth!.uid,
    });

    if (cycleRef) {
      transaction.update(cycleRef, {
        'summary.readyCount': admin.firestore.FieldValue.increment(-timesheets.length),
        'summary.invoicedCount': admin.firestore.FieldValue.increment(timesheets.length),
        'summary.readyAmount': admin.firestore.FieldValue.increment(-totalAmount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return {
      success: true,
      idempotent: false,
      invoiceId: invoiceRef.id,
      invoiceNumber,
      count: timesheets.length,
      total: totalAmount,
      hasMore: unclassifiedCandidates.length > candidates.length || initial.size === MAX_TIMESHEETS_SCANNED,
    };
  });
});
