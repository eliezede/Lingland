import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import {
  buildClientFinanceBackfillPlan,
  buildClientHierarchyIntegrityAudit,
  ClientHierarchyIntegrityInput,
  IntegrityDocument,
} from './clientHierarchyIntegrityCore';
import { projectClientFinanceHierarchy, projectClientInvoiceLineHierarchy } from './clientFinanceScope';
import { resolveClientIdentity } from './clientIdentityResolution';

const db = admin.firestore();
const RUNTIME = { timeoutSeconds: 300, memory: '1GB' as const };
const MAX_RECORDS = 20000;
const text = (value: unknown) => String(value ?? '').trim();
const stringValues = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];

const assertAdmin = async (uid?: string, superAdminOnly = false) => {
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
  const user = await db.collection('users').doc(uid).get();
  const role = text(user.data()?.role).toUpperCase();
  if (!user.exists || text(user.data()?.status).toUpperCase() !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only active administrators can audit client hierarchy.');
  }
  if (superAdminOnly && role !== 'SUPER_ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Only an active Super Admin can apply hierarchy reconciliation.');
  }
  return { uid, role };
};

const documents = (snapshot: admin.firestore.QuerySnapshot): IntegrityDocument[] => snapshot.docs.map(document => ({
  id: document.id,
  data: document.data(),
}));

const loadIntegrityInput = async (): Promise<ClientHierarchyIntegrityInput> => {
  const snapshots = await Promise.all([
    db.collection('clients').limit(MAX_RECORDS + 1).get(),
    db.collection('clientDepartments').limit(MAX_RECORDS + 1).get(),
    db.collection('clientAgents').limit(MAX_RECORDS + 1).get(),
    db.collection('clientMemberships').limit(MAX_RECORDS + 1).get(),
    db.collection('users').limit(MAX_RECORDS + 1).get(),
    db.collection('bookings').limit(MAX_RECORDS + 1).get(),
    db.collection('clientInvoices').limit(MAX_RECORDS + 1).get(),
    db.collection('clientInvoiceLines').limit(MAX_RECORDS + 1).get(),
    db.collection('notifications').limit(MAX_RECORDS + 1).get(),
  ]);
  const truncated = snapshots.some(snapshot => snapshot.size > MAX_RECORDS);
  const [clients, departments, agents, memberships, users, bookings, invoices, invoiceLines, notifications] = snapshots;
  return {
    clients: documents(clients).slice(0, MAX_RECORDS),
    departments: documents(departments).slice(0, MAX_RECORDS),
    agents: documents(agents).slice(0, MAX_RECORDS),
    memberships: documents(memberships).slice(0, MAX_RECORDS),
    users: documents(users).slice(0, MAX_RECORDS),
    bookings: documents(bookings).slice(0, MAX_RECORDS),
    invoices: documents(invoices).slice(0, MAX_RECORDS),
    invoiceLines: documents(invoiceLines).slice(0, MAX_RECORDS),
    notifications: documents(notifications).slice(0, MAX_RECORDS),
    generatedAt: new Date().toISOString(),
    truncated,
  };
};

const commitInChunks = async (
  collectionName: 'clientInvoices' | 'clientInvoiceLines',
  updates: ReturnType<typeof buildClientFinanceBackfillPlan>['invoiceUpdates'],
  actorId: string,
  manifestId: string,
) => {
  let written = 0;
  for (let offset = 0; offset < updates.length; offset += 300) {
    const batch = db.batch();
    updates.slice(offset, offset + 300).forEach(update => {
      const patch: Record<string, unknown> = {
        ...update.patch,
        hierarchyReconciledAt: admin.firestore.FieldValue.serverTimestamp(),
        hierarchyReconciledBy: actorId,
        lastFinanceReconciliationManifestId: manifestId,
      };
      update.clearFields.forEach(field => {
        patch[field] = admin.firestore.FieldValue.delete();
      });
      batch.set(db.collection(collectionName).doc(update.id), patch, { merge: true });
    });
    await batch.commit();
    written += Math.min(300, updates.length - offset);
  }
  return written;
};

const backupUpdates = async (
  manifestRef: admin.firestore.DocumentReference,
  collectionName: 'clientInvoices' | 'clientInvoiceLines',
  updates: ReturnType<typeof buildClientFinanceBackfillPlan>['invoiceUpdates'],
  source: IntegrityDocument[],
) => {
  const sourceById = new Map(source.map(document => [document.id, document.data]));
  for (let offset = 0; offset < updates.length; offset += 300) {
    const batch = db.batch();
    updates.slice(offset, offset + 300).forEach(update => {
      const current = sourceById.get(update.id) || {};
      const touchedFields = Array.from(new Set([
        ...Object.keys(update.patch),
        ...update.clearFields,
        'hierarchyReconciledAt',
        'hierarchyReconciledBy',
        'lastFinanceReconciliationManifestId',
      ])).sort();
      const presentFields = touchedFields.filter(field => Object.prototype.hasOwnProperty.call(current, field));
      const previousValues = Object.fromEntries(presentFields.map(field => [field, current[field]]));
      batch.set(manifestRef.collection('documents').doc(`${collectionName}__${update.id}`), {
        collectionName,
        documentId: update.id,
        touchedFields,
        presentFields,
        previousValues,
      });
    });
    await batch.commit();
  }
};

export const getClientHierarchyIntegrityAudit = functions.runWith(RUNTIME).https.onCall(async (_data, context) => {
  await assertAdmin(context.auth?.uid);
  try {
    return buildClientHierarchyIntegrityAudit(await loadIntegrityInput());
  } catch (error) {
    console.error('Client hierarchy integrity audit failed', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', 'The client hierarchy integrity audit could not be completed.');
  }
});

export const reconcileClientFinanceHierarchy = functions.runWith(RUNTIME).https.onCall(async (data, context) => {
  const dryRun = data?.dryRun !== false;
  const actor = await assertAdmin(context.auth?.uid, !dryRun);
  const input = await loadIntegrityInput();
  const plan = buildClientFinanceBackfillPlan(input);
  const response = {
    dryRun,
    fingerprint: plan.fingerprint,
    invoicesScanned: plan.invoicesScanned,
    linesScanned: plan.linesScanned,
    invoiceUpdates: plan.invoiceUpdates.length,
    lineUpdates: plan.lineUpdates.length,
    blockedInvoiceCount: plan.blockedInvoiceIds.length,
    unlinkedInvoiceCount: plan.unlinkedInvoiceIds.length,
    inferredClientAssignmentCount: plan.inferredClientAssignments.length,
    blockedInvoiceIds: plan.blockedInvoiceIds.slice(0, 50),
    unlinkedInvoiceIds: plan.unlinkedInvoiceIds.slice(0, 50),
    inferredClientAssignments: plan.inferredClientAssignments.slice(0, 50),
    blockedInvoices: plan.blockedInvoices.slice(0, 50),
  };
  if (dryRun) return { success: true, applied: false, ...response };
  if (input.truncated) {
    throw new functions.https.HttpsError('failed-precondition', 'The audit exceeded its safety limit. No reconciliation was applied.');
  }
  if (text(data?.confirmation).toUpperCase() !== 'RECONCILE CLIENT FINANCE') {
    throw new functions.https.HttpsError('failed-precondition', 'Type RECONCILE CLIENT FINANCE to apply the reviewed plan.');
  }
  if (!text(data?.expectedFingerprint) || text(data.expectedFingerprint) !== plan.fingerprint) {
    throw new functions.https.HttpsError('aborted', 'Financial relationships changed after preview. Run a new dry run.');
  }
  if (plan.blockedInvoiceIds.length > 0) {
    throw new functions.https.HttpsError('failed-precondition', `${plan.blockedInvoiceIds.length} invoice relationship(s) require manual repair before reconciliation.`);
  }
  if (plan.invoiceUpdates.length === 0 && plan.lineUpdates.length === 0) {
    return { success: true, applied: false, idempotent: true, ...response };
  }

  const manifestRef = db.collection('clientFinanceReconciliationManifests').doc();
  await manifestRef.set({
    status: 'PREPARING',
    actorId: actor.uid,
    fingerprint: plan.fingerprint,
    invoiceUpdates: plan.invoiceUpdates.length,
    lineUpdates: plan.lineUpdates.length,
    createdAt: new Date().toISOString(),
  });
  try {
    await backupUpdates(manifestRef, 'clientInvoices', plan.invoiceUpdates, input.invoices);
    await backupUpdates(manifestRef, 'clientInvoiceLines', plan.lineUpdates, input.invoiceLines);
    await manifestRef.set({ status: 'APPLYING', backupsCompletedAt: new Date().toISOString() }, { merge: true });
    const invoicesWritten = await commitInChunks('clientInvoices', plan.invoiceUpdates, actor.uid, manifestRef.id);
    const linesWritten = await commitInChunks('clientInvoiceLines', plan.lineUpdates, actor.uid, manifestRef.id);
    await manifestRef.set({
      status: 'COMPLETED',
      invoicesWritten,
      linesWritten,
      completedAt: new Date().toISOString(),
      rollbackAvailable: true,
    }, { merge: true });
    await db.collection('auditEvents').add({
      type: 'CLIENT_FINANCE_HIERARCHY_RECONCILED',
      actorId: actor.uid,
      manifestId: manifestRef.id,
      fingerprint: plan.fingerprint,
      invoicesWritten,
      linesWritten,
      unlinkedInvoices: plan.unlinkedInvoiceIds.length,
      inferredClientAssignments: plan.inferredClientAssignments.length,
      occurredAt: new Date().toISOString(),
    });
    return { success: true, applied: true, manifestId: manifestRef.id, invoicesWritten, linesWritten, ...response };
  } catch (error) {
    console.error('Client finance hierarchy reconciliation failed', { manifestId: manifestRef.id, error });
    await manifestRef.set({
      status: 'FAILED',
      failedAt: new Date().toISOString(),
      rollbackAvailable: true,
      error: error instanceof Error ? error.message : String(error),
    }, { merge: true });
    throw new functions.https.HttpsError('internal', `Reconciliation stopped safely. Use manifest ${manifestRef.id} to inspect or roll back partial writes.`);
  }
});

export const resolveClientInvoiceIdentity = functions.runWith(RUNTIME).https.onCall(async (data, context) => {
  const actor = await assertAdmin(context.auth?.uid, true);
  const invoiceId = text(data?.invoiceId);
  const requestedClientId = text(data?.clientId);
  if (!invoiceId || !requestedClientId) {
    throw new functions.https.HttpsError('invalid-argument', 'Invoice and client are required.');
  }
  if (text(data?.confirmation).toUpperCase() !== 'LINK INVOICE TO CLIENT') {
    throw new functions.https.HttpsError('failed-precondition', 'Type LINK INVOICE TO CLIENT to confirm this identity repair.');
  }

  const input = await loadIntegrityInput();
  if (input.truncated) throw new functions.https.HttpsError('failed-precondition', 'The audit exceeded its safety limit.');
  const currentPlan = buildClientFinanceBackfillPlan(input);
  if (!text(data?.expectedFingerprint) || text(data.expectedFingerprint) !== currentPlan.fingerprint) {
    throw new functions.https.HttpsError('aborted', 'Financial relationships changed after preview. Run a new dry run.');
  }
  const blocker = currentPlan.blockedInvoices.find(item => item.invoiceId === invoiceId);
  if (!blocker) throw new functions.https.HttpsError('failed-precondition', 'This invoice is no longer blocked. Refresh the audit.');
  if (blocker.reason !== 'CLIENT_IDENTITY_UNRESOLVED') {
    throw new functions.https.HttpsError('failed-precondition', 'This invoice has job-scope conflicts and cannot be repaired by selecting a client.');
  }

  const selectedClient = resolveClientIdentity({ id: 'manual-selection', data: { clientId: requestedClientId } }, input.clients);
  if (selectedClient.status !== 'RESOLVED' || !selectedClient.clientId) {
    throw new functions.https.HttpsError('failed-precondition', 'Select a valid canonical client, not a merged or generic placeholder record.');
  }
  const invoice = input.invoices.find(item => item.id === invoiceId);
  if (!invoice) throw new functions.https.HttpsError('not-found', 'Client invoice not found.');
  const canonicalClientId = selectedClient.clientId;
  const hierarchy = projectClientFinanceHierarchy([]);
  const invoiceUpdate = {
    id: invoiceId,
    patch: {
      ...hierarchy,
      clientId: canonicalClientId,
      clientIdentityResolution: {
        status: 'RESOLVED',
        method: 'ADMIN_MANUAL',
        confidence: 'CONFIRMED',
        previousClientId: text(invoice.data.clientId),
        version: 1,
      },
    },
    clearFields: ['clientDepartmentId', 'requestedByAgentId'].filter(field => field in invoice.data),
  };
  const invoiceLines = input.invoiceLines.filter(line => text(line.data.invoiceId || line.data.clientInvoiceId) === invoiceId);
  const lineUpdates = invoiceLines.map(line => ({
    id: line.id,
    patch: {
      ...projectClientInvoiceLineHierarchy(null),
      clientId: canonicalClientId,
    },
    clearFields: ['clientDepartmentId', 'requestedByAgentId', 'requestedByUserId'].filter(field => field in line.data),
  }));

  const manifestRef = db.collection('clientFinanceReconciliationManifests').doc();
  await manifestRef.set({
    status: 'PREPARING',
    type: 'MANUAL_CLIENT_INVOICE_IDENTITY',
    actorId: actor.uid,
    fingerprint: currentPlan.fingerprint,
    invoiceId,
    previousClientId: text(invoice.data.clientId),
    clientId: canonicalClientId,
    invoiceUpdates: 1,
    lineUpdates: lineUpdates.length,
    createdAt: new Date().toISOString(),
  });
  try {
    await backupUpdates(manifestRef, 'clientInvoices', [invoiceUpdate], input.invoices);
    await backupUpdates(manifestRef, 'clientInvoiceLines', lineUpdates, input.invoiceLines);
    await manifestRef.set({ status: 'APPLYING', backupsCompletedAt: new Date().toISOString() }, { merge: true });
    const invoicesWritten = await commitInChunks('clientInvoices', [invoiceUpdate], actor.uid, manifestRef.id);
    const linesWritten = await commitInChunks('clientInvoiceLines', lineUpdates, actor.uid, manifestRef.id);
    await manifestRef.set({
      status: 'COMPLETED',
      invoicesWritten,
      linesWritten,
      completedAt: new Date().toISOString(),
      rollbackAvailable: true,
    }, { merge: true });
    await db.collection('auditEvents').add({
      type: 'CLIENT_INVOICE_IDENTITY_RESOLVED',
      actorId: actor.uid,
      manifestId: manifestRef.id,
      invoiceId,
      previousClientId: text(invoice.data.clientId),
      clientId: canonicalClientId,
      linesWritten,
      occurredAt: new Date().toISOString(),
    });
    return {
      success: true,
      invoiceId,
      clientId: canonicalClientId,
      manifestId: manifestRef.id,
      invoicesWritten,
      linesWritten,
    };
  } catch (error) {
    console.error('Client invoice identity resolution failed', { manifestId: manifestRef.id, invoiceId, error });
    await manifestRef.set({
      status: 'FAILED',
      failedAt: new Date().toISOString(),
      rollbackAvailable: true,
      error: error instanceof Error ? error.message : String(error),
    }, { merge: true });
    throw new functions.https.HttpsError('internal', `Identity repair stopped safely. Use manifest ${manifestRef.id} to inspect or roll back partial writes.`);
  }
});

export const rollbackClientFinanceHierarchyReconciliation = functions.runWith(RUNTIME).https.onCall(async (data, context) => {
  const actor = await assertAdmin(context.auth?.uid, true);
  const manifestId = text(data?.manifestId);
  if (!manifestId) throw new functions.https.HttpsError('invalid-argument', 'A reconciliation manifest is required.');
  if (text(data?.confirmation).toUpperCase() !== 'ROLLBACK CLIENT FINANCE') {
    throw new functions.https.HttpsError('failed-precondition', 'Type ROLLBACK CLIENT FINANCE to restore this reconciliation.');
  }
  const manifestRef = db.collection('clientFinanceReconciliationManifests').doc(manifestId);
  const manifest = await manifestRef.get();
  if (!manifest.exists) throw new functions.https.HttpsError('not-found', 'Reconciliation manifest not found.');
  const manifestData = manifest.data() || {};
  if (manifestData.status === 'ROLLED_BACK') return { success: true, idempotent: true, manifestId };
  if (!['COMPLETED', 'FAILED'].includes(text(manifestData.status).toUpperCase())) {
    throw new functions.https.HttpsError('failed-precondition', 'Only completed or failed reconciliations can be restored.');
  }
  const backups = await manifestRef.collection('documents').get();
  let restored = 0;
  let skipped = 0;
  for (let offset = 0; offset < backups.size; offset += 200) {
    const backupChunk = backups.docs.slice(offset, offset + 200);
    const currentDocuments = await db.getAll(...backupChunk.map(backup => {
      const backupData = backup.data();
      return db.collection(text(backupData.collectionName)).doc(text(backupData.documentId));
    }));
    const batch = db.batch();
    backupChunk.forEach((backup, index) => {
      const backupData = backup.data();
      const current = currentDocuments[index];
      if (!current.exists || text(current.data()?.lastFinanceReconciliationManifestId) !== manifestId) {
        skipped += 1;
        return;
      }
      const presentFields = new Set(stringValues(backupData.presentFields));
      const previousValues = backupData.previousValues && typeof backupData.previousValues === 'object'
        ? backupData.previousValues as Record<string, unknown>
        : {};
      const restorePatch: Record<string, unknown> = {};
      stringValues(backupData.touchedFields).forEach(field => {
        restorePatch[field] = presentFields.has(field)
          ? previousValues[field]
          : admin.firestore.FieldValue.delete();
      });
      batch.set(current.ref, restorePatch, { merge: true });
      restored += 1;
    });
    await batch.commit();
  }
  await manifestRef.set({
    status: 'ROLLED_BACK',
    rolledBackAt: new Date().toISOString(),
    rolledBackBy: actor.uid,
    restored,
    skipped,
    rollbackAvailable: false,
  }, { merge: true });
  await db.collection('auditEvents').add({
    type: 'CLIENT_FINANCE_HIERARCHY_ROLLED_BACK',
    actorId: actor.uid,
    manifestId,
    restored,
    skipped,
    occurredAt: new Date().toISOString(),
  });
  return { success: true, manifestId, restored, skipped };
});
