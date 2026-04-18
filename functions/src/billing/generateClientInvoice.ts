
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const generateClientInvoice = functions.https.onCall(async (data, context) => {
  // SEC-02: Enforce authentication and admin role
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in to generate invoices.');
  }

  // Verify admin role via Firestore (custom claims or user document)
  const callerDoc = await db.collection('users').doc(context.auth.uid).get();
  const callerRole = callerDoc.exists ? callerDoc.data()?.role : null;
  if (callerRole !== 'ADMIN' && callerRole !== 'SUPER_ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can generate client invoices.');
  }

  const { clientId, periodStart, periodEnd } = data;

  if (!clientId) {
    throw new functions.https.HttpsError('invalid-argument', 'Client ID is required');
  }

  // 1. Find eligible timesheets (approved, not yet invoiced, within period)
  const timesheetsSnapshot = await db.collection('timesheets')
    .where('clientId', '==', clientId)
    .where('readyForClientInvoice', '==', true)
    .where('clientInvoiceId', '==', null)
    .where('actualStart', '>=', periodStart)
    .where('actualStart', '<=', periodEnd)
    .get();

  if (timesheetsSnapshot.empty) {
    return { success: false, message: 'No eligible timesheets found for this period.' };
  }

  // 2. Get Client Details
  const clientDoc = await db.collection('clients').doc(clientId).get();
  const clientData = clientDoc.data();

  // 3. Get SystemSettings for invoice numbering and VAT
  const settingsDoc = await db.collection('systemSettings').doc('main').get();
  const settings = settingsDoc.exists ? settingsDoc.data() : null;
  const vatRate = settings?.finance?.vatRate ?? 0.20;
  const invoicePrefix = settings?.finance?.invoicePrefix ?? 'INV-';
  const paymentTermsDays = clientData?.paymentTermsDays ?? settings?.finance?.paymentTermsDays ?? 30;

  // CI-01: Atomic sequential invoice number using Firestore transaction
  const invoiceRef = db.collection('clientInvoices').doc();
  let invoiceNumber = `${invoicePrefix}00001`; // fallback

  if (settingsDoc.exists) {
    await db.runTransaction(async (tx) => {
      const settingsSnap = await tx.get(db.collection('systemSettings').doc('main'));
      const nextNum = settingsSnap.data()?.finance?.nextInvoiceNumber ?? 1;
      invoiceNumber = `${invoicePrefix}${String(nextNum).padStart(5, '0')}`;
      tx.update(db.collection('systemSettings').doc('main'), {
        'finance.nextInvoiceNumber': admin.firestore.FieldValue.increment(1)
      });
    });
  }

  // 4. Calculate totals and line items
  let subtotal = 0;
  const lineItems: any[] = [];
  const batch = db.batch();

  timesheetsSnapshot.docs.forEach(tsDoc => {
    const ts = tsDoc.data();
    const lineTotal = ts.clientAmountCalculated || 0;
    subtotal += lineTotal;

    // Create Line Item in sub-collection
    const lineRef = db.collection('clientInvoiceLines').doc();
    batch.set(lineRef, {
      invoiceId: invoiceRef.id,
      timesheetId: tsDoc.id,
      bookingId: ts.bookingId,
      interpreterId: ts.interpreterId,
      description: `Interpreting/Translation Service — Job: ${ts.bookingId.substring(0, 8).toUpperCase()} (${new Date(ts.actualStart).toLocaleDateString('en-GB')})`,
      units: ts.unitsBillableToClient || 0,
      rate: ts.unitsBillableToClient > 0 ? (ts.clientAmountCalculated / ts.unitsBillableToClient) : 0,
      lineAmount: lineTotal
    });

    // Link timesheet to this invoice
    batch.update(tsDoc.ref, {
      clientInvoiceId: invoiceRef.id,
      status: 'INVOICED',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    lineItems.push({ description: `Job ${ts.bookingId}`, amount: lineTotal });
  });

  // CI-04: Apply VAT
  const vatAmount = Number((subtotal * vatRate).toFixed(2));
  const totalWithVat = Number((subtotal + vatAmount).toFixed(2));

  // 5. Create Invoice Document
  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + paymentTermsDays * 24 * 60 * 60 * 1000);

  batch.set(invoiceRef, {
    id: invoiceRef.id,
    clientId,
    clientName: clientData?.companyName || 'Unknown Client',
    reference: invoiceNumber,
    invoiceNumber,
    issueDate: issueDate.toISOString(),
    dueDate: dueDate.toISOString(),
    periodStart,
    periodEnd,
    status: 'DRAFT',
    subtotal: Number(subtotal.toFixed(2)),
    vatRate: vatRate,
    vatAmount,
    totalAmount: totalWithVat,
    currency: settings?.finance?.currency || 'GBP',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: context.auth.uid
  });

  await batch.commit();

  // 6. Send email notification to client (EM-04)
  if (clientData?.email) {
    await db.collection('mail').add({
      to: [clientData.email],
      message: {
        subject: `Invoice ${invoiceNumber} — Lingland Language Services`,
        html: `Dear ${clientData.contactPerson || clientData.companyName},<br><br>Please find your invoice <strong>${invoiceNumber}</strong> attached.<br><br>
<strong>Amount Due:</strong> £${totalWithVat.toFixed(2)} (incl. VAT @ ${(vatRate * 100).toFixed(0)}%)<br>
<strong>Due Date:</strong> ${dueDate.toLocaleDateString('en-GB')}<br>
<strong>Reference:</strong> ${invoiceNumber}<br><br>
Please log in to your client portal to view the full invoice details.<br><br>
Kind regards,<br>The Lingland Finance Team`
      },
      invoiceId: invoiceRef.id,
      createdAt: new Date().toISOString()
    });
  }

  return {
    success: true,
    invoiceId: invoiceRef.id,
    invoiceNumber,
    count: timesheetsSnapshot.size,
    subtotal: Number(subtotal.toFixed(2)),
    vatAmount,
    total: totalWithVat
  };
});
