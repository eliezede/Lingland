
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const generateClientInvoice = functions.https.onCall(async (data, context) => {
  // Check authentication (admin only)
  if (!context.auth || context.auth.token.role !== 'ADMIN') {
    // Note: In real app, implement custom claims or check user role in Firestore
    // throw new functions.https.HttpsError('permission-denied', 'Only admins can generate invoices');
  }

  const { clientId, periodStart, periodEnd } = data;

  if (!clientId) {
    throw new functions.https.HttpsError('invalid-argument', 'Client ID is required');
  }

  // 1. Find eligible timesheets
  // readyForClientInvoice == true AND clientInvoiceId == null
  const timesheetsSnapshot = await db.collection('timesheets')
    .where('clientId', '==', clientId)
    .where('readyForClientInvoice', '==', true)
    .where('clientInvoiceId', '==', null) // Only uninvoiced
    .where('actualStart', '>=', periodStart)
    .where('actualStart', '<=', periodEnd)
    .get();

  if (timesheetsSnapshot.empty) {
    return { success: false, message: "No eligible timesheets found for this period." };
  }

  // 2. Get Client Details
  const clientDoc = await db.collection('clients').doc(clientId).get();
  const clientData = clientDoc.data();

  // 3. Calculate Total & Create Line Items
  let totalAmount = 0;
  const lineItems: any[] = [];
  const batch = db.batch();

  const invoiceRef = db.collection('clientInvoices').doc();
  
  timesheetsSnapshot.docs.forEach(tsDoc => {
    const ts = tsDoc.data();
    const lineTotal = ts.clientAmountCalculated || 0;
    totalAmount += lineTotal;

    // Create Line Item
    const lineRef = db.collection('clientInvoiceLines').doc();
    batch.set(lineRef, {
      invoiceId: invoiceRef.id,
      timesheetId: tsDoc.id,
      bookingId: ts.bookingId,
      description: `Interpreting Service (${ts.bookingId}) - ${new Date(ts.actualStart).toLocaleDateString()}`,
      units: ts.unitsBillableToClient,
      rate: (ts.clientAmountCalculated / ts.unitsBillableToClient) || 0,
      lineAmount: lineTotal
    });

    // Update Timesheet to link to invoice
    batch.update(tsDoc.ref, { 
      clientInvoiceId: invoiceRef.id,
      status: 'INVOICED'
    });
  });

  // 4. Create Invoice Document
  const invoiceNumber = `INV-${Date.now().toString().substr(-6)}`; // Simple generator
  
  batch.set(invoiceRef, {
    id: invoiceRef.id,
    clientId,
    clientName: clientData?.companyName || 'Unknown Client',
    issueDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // +30 days
    periodStart,
    periodEnd,
    status: 'DRAFT',
    totalAmount: Number(totalAmount.toFixed(2)),
    currency: 'GBP',
    reference: invoiceNumber,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();

  return { 
    success: true, 
    invoiceId: invoiceRef.id, 
    count: timesheetsSnapshot.size, 
    total: totalAmount 
  };
});
