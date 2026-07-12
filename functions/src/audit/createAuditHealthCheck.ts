import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { writeAuditEvent } from './auditWriter';

const db = admin.firestore();

export const createAuditHealthCheck = functions.https.onCall(async (_data, context) => {
  const uid = context.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required');

  const [actor, settings] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('system').doc('settings').get(),
  ]);
  const role = String(actor.data()?.role || '').toUpperCase();
  if (!actor.exists || actor.data()?.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only active administrators can run an audit health check');
  }

  const eventRef = db.collection('auditEvents').doc();
  const createdAt = new Date().toISOString();
  await writeAuditEvent(eventRef.id, {
    entityType: 'system',
    entityId: 'audit-ledger',
    action: 'AUDIT_HEALTH_CHECK',
    actorId: uid,
    actorRole: role,
    source: 'ADMIN_DIAGNOSTIC',
    communicationMode: String(settings.data()?.platformMode?.communicationMode || 'SUPPRESSED').toUpperCase(),
    syncRunId: '',
    changedFields: [],
    before: null,
    after: { status: 'HEALTHY' },
    organizationId: String(actor.data()?.organizationId || 'lingland-main'),
    bookingId: '',
    createdAt,
  });

  return { success: true, eventId: eventRef.id, createdAt };
});
