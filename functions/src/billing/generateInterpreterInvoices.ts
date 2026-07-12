import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

const db = admin.firestore();
const MAX_TIMESHEETS_PER_INVOICE = 200;

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
  if (!interpreterId || Number.isNaN(new Date(periodStart).getTime()) || Number.isNaN(new Date(periodEnd).getTime())) {
    throw new functions.https.HttpsError('invalid-argument', 'Interpreter and a valid invoice period are required');
  }

  const initial = await db.collection('timesheets')
    .where('interpreterId', '==', interpreterId)
    .where('readyForInterpreterInvoice', '==', true)
    .where('actualStart', '>=', periodStart)
    .where('actualStart', '<=', periodEnd)
    .limit(MAX_TIMESHEETS_PER_INVOICE)
    .get();
  const candidates = initial.docs.filter(item => !item.data().interpreterInvoiceId);
  if (candidates.length === 0) return { success: false, message: 'No eligible timesheets found for this period' };

  const generationKey = createHash('sha256')
    .update(`${interpreterId}:${candidates.map(item => item.id).sort().join(',')}`)
    .digest('hex');
  const invoiceRef = db.collection('interpreterInvoices').doc(`interpreter_${generationKey.slice(0, 32)}`);
  const interpreterRef = db.collection('interpreters').doc(interpreterId);
  const settingsRef = db.collection('systemSettings').doc('main');

  return db.runTransaction(async transaction => {
    const [existingInvoice, interpreterSnap, settingsSnap, ...freshTimesheets] = await Promise.all([
      transaction.get(invoiceRef),
      transaction.get(interpreterRef),
      transaction.get(settingsRef),
      ...candidates.map(item => transaction.get(item.ref)),
    ]);
    if (existingInvoice.exists) {
      const value = existingInvoice.data() || {};
      return { success: true, idempotent: true, invoiceId: invoiceRef.id, invoiceNumber: value.invoiceNumber };
    }
    if (!interpreterSnap.exists) throw new functions.https.HttpsError('not-found', 'Interpreter not found');

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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
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
      timesheetCount: timesheets.length,
      lineCount: timesheets.length,
      financialIntegrityStatus: 'VERIFIED',
      referenceIntegrityStatus: 'VERIFIED',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth!.uid,
    });

    return {
      success: true,
      idempotent: false,
      invoiceId: invoiceRef.id,
      invoiceNumber,
      count: timesheets.length,
      total: totalAmount,
      hasMore: initial.size === MAX_TIMESHEETS_PER_INVOICE,
    };
  });
});
