import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import {
  deriveActorId,
  deriveAuditAction,
  deriveAuditSource,
  deriveEmbeddedActorRole,
  deriveEmbeddedCommunicationMode,
  deriveSyncRunId,
} from './auditPolicy';
import { writeAuditEvent } from './auditWriter';

const AUDIT_FIELDS = [
  'id', 'type', 'status', 'paymentStatus', 'resolutionStatus', 'pushStatus', 'delivery',
  'clientId', 'interpreterId', 'bookingId', 'jobId', 'organizationId', 'jobNumber', 'bookingRef',
  'displayRef', 'invoiceNumber', 'reference', 'totalAmount', 'subtotal', 'vatAmount', 'clientInvoiceId',
  'interpreterInvoiceId', 'adminApproved', 'readyForClientInvoice', 'readyForInterpreterInvoice',
  'role', 'profileId', 'source', 'sourceSystem', 'sourceRecordId', 'sourceTable', 'updatedBy', 'createdBy',
  'actorUserId', 'actorRole', 'adminApprovedBy', 'communicationMode', 'syncRunId', 'lastSyncRunId',
  'runId', 'kind', 'success', 'dryRun', 'stats', 'metadata', 'platformMode', 'checklist',
  'lastReadinessAudit', 'lastRollbackAt', 'lastRollbackBy', 'createdAt', 'updatedAt', 'finishedAt',
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

let cachedCommunicationMode = 'SUPPRESSED';
let communicationModeExpiresAt = 0;

const getCommunicationMode = async () => {
  if (Date.now() < communicationModeExpiresAt) return cachedCommunicationMode;
  try {
    const settings = await admin.firestore().collection('system').doc('settings').get();
    cachedCommunicationMode = String(settings.data()?.platformMode?.communicationMode || 'SUPPRESSED').toUpperCase();
    communicationModeExpiresAt = Date.now() + 60_000;
  } catch {
    cachedCommunicationMode = 'SUPPRESSED';
  }
  return cachedCommunicationMode;
};

const actorRoleCache = new Map<string, string>();

const getActorRole = async (actorId: string, embeddedRole: string, source: string) => {
  if (embeddedRole) return embeddedRole;
  if (actorId.startsWith('SYSTEM') || source.includes('AIRTABLE')) return 'SYSTEM';
  if (actorRoleCache.has(actorId)) return actorRoleCache.get(actorId)!;
  try {
    const actor = await admin.firestore().collection('users').doc(actorId).get();
    const role = String(actor.data()?.role || 'UNKNOWN').toUpperCase();
    actorRoleCache.set(actorId, role);
    return role;
  } catch {
    return 'UNKNOWN';
  }
};

const writeAudit = async (
  collectionName: string,
  change: functions.Change<functions.firestore.DocumentSnapshot>,
  context: functions.EventContext
) => {
  const before = change.before.exists ? change.before.data() : undefined;
  const after = change.after.exists ? change.after.data() : undefined;
  const source = deriveAuditSource(before, after);
  const actorId = deriveActorId(collectionName, before, after);
  const actorRole = await getActorRole(actorId, deriveEmbeddedActorRole(before, after), source);
  const communicationMode = deriveEmbeddedCommunicationMode(before, after) || await getCommunicationMode();
  const createdAt = new Date().toISOString();

  await writeAuditEvent(context.eventId, {
    entityType: collectionName,
    entityId: String(context.params.documentId || ''),
    action: deriveAuditAction(collectionName, before, after),
    actorId,
    actorRole,
    source,
    communicationMode,
    syncRunId: deriveSyncRunId(before, after),
    changedFields: changedFields(before, after),
    before: snapshot(before),
    after: snapshot(after),
    organizationId: String(after?.organizationId || before?.organizationId || ''),
    bookingId: String(after?.bookingId || after?.jobId || before?.bookingId || before?.jobId || ''),
    createdAt,
  });
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
export const auditJobEvents = auditCollection('jobEvents');
export const auditMail = auditCollection('mail');
export const auditEmailDelivery = auditCollection('emailAudit');
export const auditNotifications = auditCollection('notifications');
export const auditSyncRuns = auditCollection('syncRuns');
export const auditSyncConflicts = auditCollection('syncConflicts');
export const auditSystemSettings = auditCollection('system');
export const auditGoLiveControl = auditCollection('goLiveControl');
