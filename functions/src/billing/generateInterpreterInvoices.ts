import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const generateInterpreterInvoices = functions.https.onCall(async (data, context) => {
  // SEC-02: Enforce authentication and admin role
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in to generate invoices.');
  }

  // Verify admin role via Firestore
  const callerDoc = await db.collection('users').doc(context.auth.uid).get();
  const callerRole = callerDoc.exists ? callerDoc.data()?.role : null;
  if (callerRole !== 'ADMIN' && callerRole !== 'SUPER_ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can generate interpreter invoices.');
  }

  const { interpreterId, periodStart, periodEnd } = data;

  if (!interpreterId) {
    throw new functions.https.HttpsError('invalid-argument', 'Interpreter ID is required');
  }

  // 1. Find eligible timesheets (approved, not yet invoiced, within period)
  // For interpreter invoices we query by readyForInterpreterInvoice
  const timesheetsSnapshot = await db.collection('timesheets')
    .where('interpreterId', '==', interpreterId)
    .where('readyForInterpreterInvoice', '==', true)
    .where('interpreterInvoiceId', '==', null)
    .where('actualStart', '>=', periodStart)
    .where('actualStart', '<=', periodEnd)
    .get();

  if (timesheetsSnapshot.empty) {
    return { success: false, message: 'No eligible timesheets found for this period.' };
  }

  // 2. Get Interpreter Details
  const interpDoc = await db.collection('interpreters').doc(interpreterId).get();
  const interpData = interpDoc.data() || {};

  // 3. Get SystemSettings for invoice numbering
  const settingsDoc = await db.collection('systemSettings').doc('main').get();
  const settings = settingsDoc.exists ? settingsDoc.data() : null;
  const invoicePrefix = settings?.finance?.interpreterInvoicePrefix ?? 'INV-INT-';

  // II-01: Atomic sequential invoice number using Firestore transaction
  const invoiceRef = db.collection('interpreterInvoices').doc();
  let invoiceNumber = `${invoicePrefix}00001`; // fallback

  if (settingsDoc.exists) {
    await db.runTransaction(async (tx) => {
      const settingsSnap = await tx.get(db.collection('systemSettings').doc('main'));
      const nextNum = settingsSnap.data()?.finance?.nextInterpreterInvoiceNumber ?? 1;
      invoiceNumber = `${invoicePrefix}${String(nextNum).padStart(5, '0')}`;
      tx.update(db.collection('systemSettings').doc('main'), {
        'finance.nextInterpreterInvoiceNumber': admin.firestore.FieldValue.increment(1)
      });
    });
  }

  // 4. Calculate totals and line items
  let subtotal = 0;
  const batch = db.batch();

  timesheetsSnapshot.docs.forEach(tsDoc => {
    const ts = tsDoc.data();
    const lineTotal = ts.interpreterAmountCalculated || 0;
    subtotal += lineTotal;

    // Create Line Item in sub-collection
    const lineRef = db.collection('interpreterInvoiceLines').doc();
    batch.set(lineRef, {
      invoiceId: invoiceRef.id,
      timesheetId: tsDoc.id,
      bookingId: ts.bookingId,
      clientId: ts.clientId,
      description: `Interpreting Service Remuneration — Job: ${ts.bookingId.substring(0, 8).toUpperCase()} (${new Date(ts.actualStart).toLocaleDateString('en-GB')})`,
      units: ts.unitsPayableToInterpreter || 0,
      rate: ts.unitsPayableToInterpreter > 0 ? (lineTotal / ts.unitsPayableToInterpreter) : 0,
      lineAmount: lineTotal
    });

    // Link timesheet to this invoice
    batch.update(tsDoc.ref, {
      interpreterInvoiceId: invoiceRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  // Calculate final amount. We do not apply VAT to interpreters by default, unless they are VAT registered. (Skipped for MVP self-billing)
  const totalAmount = Number(subtotal.toFixed(2));

  // 5. Create the Master Invoice Document
  const invoiceData = {
    invoiceNumber,
    interpreterId,
    interpreterName: interpData.name || 'Unknown',
    interpreterEmail: interpData.email || '',
    dateGenerated: admin.firestore.FieldValue.serverTimestamp(),
    periodStart: new Date(periodStart).toISOString(),
    periodEnd: new Date(periodEnd).toISOString(),
    subtotal: totalAmount,
    totalAmount,
    status: 'GENERATED',
    paymentStatus: 'UNPAID',
    timesheetCount: timesheetsSnapshot.size,
    createdBy: context.auth.uid
  };

  batch.set(invoiceRef, invoiceData);

  // 6. Execute batch
  await batch.commit();

  return {
    success: true,
    invoiceId: invoiceRef.id,
    invoiceNumber,
    message: `Generated self-billing invoice for ${timesheetsSnapshot.size} timesheets.`
  };
});
