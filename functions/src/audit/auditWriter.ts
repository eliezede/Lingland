import * as admin from 'firebase-admin';

export interface AuditEventInput {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  actorRole: string;
  source: string;
  communicationMode: string;
  syncRunId: string;
  changedFields: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  organizationId?: string;
  bookingId?: string;
  createdAt: string;
}

export const writeAuditEvent = async (eventId: string, input: AuditEventInput) => {
  await admin.firestore().collection('auditEvents').doc(eventId).set({
    id: eventId,
    schemaVersion: 1,
    ...input,
    timestamp: input.createdAt,
  }, { merge: false });
};
