import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

const db = admin.firestore();

const AUDIT_FIELDS = [
  'id', 'status', 'paymentStatus', 'clientId', 'interpreterId', 'bookingId', 'jobNumber', 'bookingRef',
  'displayRef', 'invoiceNumber', 'reference', 'totalAmount', 'subtotal', 'vatAmount', 'clientInvoiceId',
  'interpreterInvoiceId', 'adminApproved', 'readyForClientInvoice', 'readyForInterpreterInvoice',
  'role', 'profileId', 'sourceSystem', 'sourceRecordId', 'updatedBy', 'createdBy', 'adminApprovedBy',
];

const snapshot = (value: FirebaseFirestore.DocumentData | undefined) => {
  if (!value) return null;
  return AUDIT_FIELDS.reduce<Record<string, unknown>>((result, field) => {
    if (value[field] !== undefined) result[field] = value[field];
    return result;
  }, {});
};

const changedFields = (before: FirebaseFirestore.DocumentData | undefined, after: FirebaseFirestore.DocumentData | undefined) => {
  const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return Array.from(fields).filter(field => JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field])).slice(0, 100);
};

const writeAudit = async (
  collectionName: string,
  change: functions.Change<functions.firestore.DocumentSnapshot>,
  context: functions.EventContext
) => {
  const before = change.before.exists ? change.before.data() : undefined;
  const after = change.after.exists ? change.after.data() : undefined;
  const action = !change.before.exists ? 'CREATED' : !change.after.exists ? 'DELETED' : 'UPDATED';
  const actorId = String(after?.updatedBy || after?.createdBy || after?.adminApprovedBy || before?.updatedBy || 'SYSTEM_OR_LEGACY_CLIENT');
  await db.collection('auditEvents').doc(context.eventId).set({
    id: context.eventId,
    entityType: collectionName,
    entityId: String(context.params.documentId || ''),
    action,
    actorId,
    source: String(after?.source || after?.sourceSystem || before?.source || before?.sourceSystem || 'PLATFORM'),
    changedFields: changedFields(before, after),
    before: snapshot(before),
    after: snapshot(after),
    createdAt: new Date().toISOString(),
  }, { merge: false });
};

const auditCollection = (collectionName: string) => functions.firestore
  .document(`${collectionName}/{documentId}`)
  .onWrite((change, context) => writeAudit(collectionName, change, context));

export const auditBookings = auditCollection('bookings');
export const auditAssignments = auditCollection('assignments');
export const auditTimesheets = auditCollection('timesheets');
export const auditClientInvoices = auditCollection('clientInvoices');
export const auditInterpreterInvoices = auditCollection('interpreterInvoices');
export const auditUsers = auditCollection('users');
export const auditClients = auditCollection('clients');
export const auditInterpreters = auditCollection('interpreters');
