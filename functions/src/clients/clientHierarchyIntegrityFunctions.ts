import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import {
  buildClientFinanceBackfillPlan,
  buildClientHierarchyIntegrityAudit,
  createBookingHierarchyFingerprint,
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
const BOOKING_HIERARCHY_FIELDS = [
  'clientId',
  'clientName',
  'clientDepartmentId',
  'clientDepartmentSource',
  'requestedByAgentId',
  'requestedByAgentSource',
  'requestedByUserId',
  'clientSnapshot',
  'clientIdentityStatus',
  'requesterIdentityStatus',
  'lastHierarchyRepairManifestId',
] as const;

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
    blockedInvoices: plan.blockedInvoices.slice(0, 100),
    blockerReasonCounts: plan.blockedInvoices.reduce<Record<string, number>>((counts, blocker) => ({
      ...counts,
      [blocker.reason]: (counts[blocker.reason] || 0) + 1,
    }), {}),
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

export const getClientBookingHierarchyRepairPreview = functions.runWith(RUNTIME).https.onCall(async (data, context) => {
  await assertAdmin(context.auth?.uid);
  const bookingId = text(data?.bookingId);
  if (!bookingId) throw new functions.https.HttpsError('invalid-argument', 'A job is required.');
  const booking = await db.collection('bookings').doc(bookingId).get();
  if (!booking.exists) throw new functions.https.HttpsError('not-found', 'Job not found.');
  const linkedLines = await db.collection('clientInvoiceLines').where('bookingId', '==', bookingId).limit(101).get();
  if (linkedLines.size > 100) {
    throw new functions.https.HttpsError('failed-precondition', 'This job has more than 100 invoice links and requires manual engineering review.');
  }
  const linkedInvoiceIds = Array.from(new Set(linkedLines.docs
    .map(line => text(line.data().invoiceId || line.data().clientInvoiceId))
    .filter(Boolean)));
  const bookingData = booking.data() || {};
  const directInvoiceId = text(bookingData.clientInvoiceId);
  if (directInvoiceId) linkedInvoiceIds.push(directInvoiceId);
  const uniqueLinkedInvoiceIds = Array.from(new Set(linkedInvoiceIds)).sort();
  return {
    success: true,
    bookingId,
    hierarchyFingerprint: createBookingHierarchyFingerprint(bookingId, bookingData),
    linkedInvoiceIds: uniqueLinkedInvoiceIds,
    requiresFinanceReview: uniqueLinkedInvoiceIds.length > 0,
    current: {
      clientId: text(bookingData.clientId),
      clientDepartmentId: text(bookingData.clientDepartmentId),
      requestedByAgentId: text(bookingData.requestedByAgentId),
      requestedByUserId: text(bookingData.requestedByUserId),
    },
  };
});

export const repairClientBookingHierarchy = functions.runWith(RUNTIME).https.onCall(async (data, context) => {
  const actor = await assertAdmin(context.auth?.uid);
  const bookingId = text(data?.bookingId);
  const requestedClientId = text(data?.clientId);
  const requestedDepartmentId = text(data?.clientDepartmentId);
  const requestedAgentId = text(data?.requestedByAgentId);
  const expectedBookingFingerprint = text(data?.expectedBookingFingerprint);
  const reason = text(data?.reason).slice(0, 500);
  if (!bookingId || !requestedClientId || !expectedBookingFingerprint) {
    throw new functions.https.HttpsError('invalid-argument', 'Job, canonical client and current job fingerprint are required.');
  }
  if (reason.length < 5) {
    throw new functions.https.HttpsError('invalid-argument', 'Record a short operational reason for this hierarchy repair.');
  }

  const input = await loadIntegrityInput();
  if (input.truncated) throw new functions.https.HttpsError('failed-precondition', 'The hierarchy audit exceeded its safety limit.');
  const booking = input.bookings.find(item => item.id === bookingId);
  if (!booking) throw new functions.https.HttpsError('not-found', 'Job not found.');
  if (createBookingHierarchyFingerprint(booking.id, booking.data) !== expectedBookingFingerprint) {
    throw new functions.https.HttpsError('aborted', 'The job hierarchy changed after it was opened. Refresh the repair case.');
  }

  const financePlan = buildClientFinanceBackfillPlan(input);
  const directInvoiceId = text(booking.data.clientInvoiceId);
  const linkedInvoiceIds = Array.from(new Set([
    ...input.invoiceLines
    .filter(line => text(line.data.bookingId) === bookingId)
    .map(line => text(line.data.invoiceId || line.data.clientInvoiceId))
    .filter(Boolean),
    directInvoiceId,
  ].filter(Boolean))).sort();
  if (linkedInvoiceIds.length > 0) {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new functions.https.HttpsError('permission-denied', 'Only an active Super Admin can repair a job already linked to finance.');
    }
    if (text(data?.confirmation).toUpperCase() !== 'REPAIR BOOKING HIERARCHY') {
      throw new functions.https.HttpsError('failed-precondition', 'Type REPAIR BOOKING HIERARCHY to confirm this financial-scope repair.');
    }
    if (!text(data?.expectedFinanceFingerprint) || text(data.expectedFinanceFingerprint) !== financePlan.fingerprint) {
      throw new functions.https.HttpsError('aborted', 'The financial reconciliation plan changed. Run a new dry run.');
    }
    const isBlockedRepair = financePlan.blockedInvoices.some(blocker => (
      linkedInvoiceIds.includes(blocker.invoiceId)
      && (blocker.bookings.some(item => item.bookingId === bookingId) || directInvoiceId === blocker.invoiceId)
    ));
    if (!isBlockedRepair) {
      throw new functions.https.HttpsError('failed-precondition', 'This invoiced job is not in the current blocked repair queue. Refresh the dry run.');
    }
  }

  const selectedClientIdentity = resolveClientIdentity({ id: 'manual-booking-client', data: { clientId: requestedClientId } }, input.clients);
  if (selectedClientIdentity.status !== 'RESOLVED' || !selectedClientIdentity.clientId) {
    throw new functions.https.HttpsError('failed-precondition', 'Select a valid canonical client, not a merged or generic placeholder record.');
  }
  const canonicalClientId = selectedClientIdentity.clientId;
  const client = input.clients.find(item => item.id === canonicalClientId);
  if (!client) throw new functions.https.HttpsError('not-found', 'Canonical client not found.');

  const department = requestedDepartmentId
    ? input.departments.find(item => item.id === requestedDepartmentId)
    : undefined;
  if (requestedDepartmentId) {
    const departmentClient = department
      ? resolveClientIdentity({ id: department.id, data: { clientId: department.data.clientId } }, input.clients)
      : null;
    if (!department || text(department.data.status).toUpperCase() === 'ARCHIVED' || departmentClient?.clientId !== canonicalClientId) {
      throw new functions.https.HttpsError('failed-precondition', 'Selected department does not belong to the canonical client.');
    }
  }

  const agent = requestedAgentId ? input.agents.find(item => item.id === requestedAgentId) : undefined;
  let membership: IntegrityDocument | undefined;
  if (requestedAgentId) {
    if (!agent || text(agent.data.status).toUpperCase() === 'INACTIVE') {
      throw new functions.https.HttpsError('failed-precondition', 'Selected requester is not an active client identity.');
    }
    if (text(agent.data.agentType).toUpperCase() === 'SHARED_MAILBOX') {
      throw new functions.https.HttpsError('failed-precondition', 'A shared mailbox cannot be recorded as the job requester.');
    }
    membership = input.memberships.find(item => {
      if (text(item.data.agentId) !== requestedAgentId || text(item.data.status).toUpperCase() === 'INACTIVE') return false;
      const membershipClient = resolveClientIdentity({ id: item.id, data: { clientId: item.data.clientId } }, input.clients);
      return membershipClient.clientId === canonicalClientId;
    });
    if (!membership) {
      throw new functions.https.HttpsError('failed-precondition', 'Selected requester has no active membership for this client.');
    }
    const membershipDepartments = stringValues(membership.data.departmentIds);
    const accessLevel = text(membership.data.accessLevel).toUpperCase();
    if (requestedDepartmentId && membershipDepartments.length > 0
      && !membershipDepartments.includes(requestedDepartmentId)
      && accessLevel !== 'CLIENT_MASTER') {
      throw new functions.https.HttpsError('failed-precondition', 'Selected requester is outside the chosen department scope.');
    }
    const membershipUserId = text(membership.data.userId);
    const agentUserId = text(agent.data.userId);
    if (membershipUserId && agentUserId && membershipUserId !== agentUserId) {
      throw new functions.https.HttpsError('failed-precondition', 'Requester membership and agent identity point to different user accounts.');
    }
  }

  const requestedByUserId = requestedAgentId
    ? text(membership?.data.userId || agent?.data.userId)
    : '';
  const organizationName = text(client.data.companyName || client.data.name || canonicalClientId);
  const departmentName = text(department?.data.name);
  const requesterName = text(agent?.data.displayName || agent?.data.name);
  const requesterEmail = text(agent?.data.email).toLowerCase();
  const manifestRef = db.collection('clientHierarchyRepairManifests').doc();
  const auditRef = db.collection('auditEvents').doc();
  const eventRef = db.collection('jobEvents').doc();
  const bookingRef = db.collection('bookings').doc(bookingId);

  const appliedFingerprint = await db.runTransaction(async transaction => {
    const current = await transaction.get(bookingRef);
    if (!current.exists) throw new functions.https.HttpsError('not-found', 'Job not found.');
    const currentData = current.data() || {};
    const currentFingerprint = createBookingHierarchyFingerprint(bookingId, currentData);
    if (currentFingerprint !== expectedBookingFingerprint) {
      throw new functions.https.HttpsError('aborted', 'The job hierarchy changed after preview. Refresh the repair case.');
    }
    const presentFields = BOOKING_HIERARCHY_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(currentData, field));
    const previousValues = Object.fromEntries(presentFields.map(field => [field, currentData[field]]));
    const nextHierarchyData: Record<string, unknown> = {
      ...currentData,
      clientId: canonicalClientId,
      clientName: organizationName,
      clientIdentityStatus: 'RESOLVED',
      clientSnapshot: {
        organizationName,
        ...(departmentName ? { departmentName } : {}),
        ...(requesterName ? { requesterName } : {}),
        ...(requesterEmail ? { requesterEmail } : {}),
      },
    };
    if (requestedDepartmentId) nextHierarchyData.clientDepartmentId = requestedDepartmentId;
    else delete nextHierarchyData.clientDepartmentId;
    if (requestedAgentId) {
      nextHierarchyData.requestedByAgentId = requestedAgentId;
      if (requestedByUserId) nextHierarchyData.requestedByUserId = requestedByUserId;
      else delete nextHierarchyData.requestedByUserId;
    } else {
      delete nextHierarchyData.requestedByAgentId;
      delete nextHierarchyData.requestedByUserId;
    }
    const nextFingerprint = createBookingHierarchyFingerprint(bookingId, nextHierarchyData);
    const patch: Record<string, unknown> = {
      clientId: canonicalClientId,
      clientName: organizationName,
      clientIdentityStatus: 'RESOLVED',
      clientSnapshot: nextHierarchyData.clientSnapshot,
      clientDepartmentId: requestedDepartmentId || admin.firestore.FieldValue.delete(),
      clientDepartmentSource: requestedDepartmentId ? 'STAFF_MANUAL' : admin.firestore.FieldValue.delete(),
      requestedByAgentId: requestedAgentId || admin.firestore.FieldValue.delete(),
      requestedByAgentSource: requestedAgentId ? 'STAFF_MANUAL' : admin.firestore.FieldValue.delete(),
      requestedByUserId: requestedByUserId || admin.firestore.FieldValue.delete(),
      requesterIdentityStatus: requestedAgentId ? 'RESOLVED' : admin.firestore.FieldValue.delete(),
      lastHierarchyRepairManifestId: manifestRef.id,
      hierarchyRepairedAt: admin.firestore.FieldValue.serverTimestamp(),
      hierarchyRepairedBy: actor.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    transaction.set(manifestRef, {
      type: 'BOOKING_HIERARCHY_REPAIR',
      status: 'COMPLETED',
      bookingId,
      actorId: actor.uid,
      reason,
      linkedInvoiceIds,
      financeFingerprint: financePlan.fingerprint,
      previousFingerprint: currentFingerprint,
      appliedFingerprint: nextFingerprint,
      touchedFields: [...BOOKING_HIERARCHY_FIELDS],
      presentFields,
      previousValues,
      target: {
        clientId: canonicalClientId,
        clientDepartmentId: requestedDepartmentId,
        requestedByAgentId: requestedAgentId,
        requestedByUserId,
      },
      createdAt: new Date().toISOString(),
      rollbackAvailable: true,
    });
    transaction.set(bookingRef, patch, { merge: true });
    transaction.set(auditRef, {
      type: 'CLIENT_BOOKING_HIERARCHY_REPAIRED',
      actorId: actor.uid,
      manifestId: manifestRef.id,
      bookingId,
      linkedInvoiceIds,
      reason,
      previousFingerprint: currentFingerprint,
      appliedFingerprint: nextFingerprint,
      occurredAt: new Date().toISOString(),
    });
    transaction.set(eventRef, {
      type: 'CLIENT_HIERARCHY_REPAIRED',
      jobId: bookingId,
      actorId: actor.uid,
      manifestId: manifestRef.id,
      reason,
      createdAt: new Date().toISOString(),
    });
    return nextFingerprint;
  });

  return {
    success: true,
    bookingId,
    clientId: canonicalClientId,
    clientDepartmentId: requestedDepartmentId,
    requestedByAgentId: requestedAgentId,
    manifestId: manifestRef.id,
    linkedInvoiceIds,
    appliedFingerprint,
  };
});

export const rollbackClientBookingHierarchyRepair = functions.runWith(RUNTIME).https.onCall(async (data, context) => {
  const actor = await assertAdmin(context.auth?.uid, true);
  const manifestId = text(data?.manifestId);
  if (!manifestId) throw new functions.https.HttpsError('invalid-argument', 'A booking hierarchy repair manifest is required.');
  if (text(data?.confirmation).toUpperCase() !== 'ROLLBACK BOOKING HIERARCHY') {
    throw new functions.https.HttpsError('failed-precondition', 'Type ROLLBACK BOOKING HIERARCHY to restore the previous job scope.');
  }
  const manifestRef = db.collection('clientHierarchyRepairManifests').doc(manifestId);
  const auditRef = db.collection('auditEvents').doc();
  const eventRef = db.collection('jobEvents').doc();
  return db.runTransaction(async transaction => {
    const manifest = await transaction.get(manifestRef);
    if (!manifest.exists) throw new functions.https.HttpsError('not-found', 'Booking hierarchy repair manifest not found.');
    const manifestData = manifest.data() || {};
    if (text(manifestData.type) !== 'BOOKING_HIERARCHY_REPAIR') {
      throw new functions.https.HttpsError('failed-precondition', 'This manifest does not belong to a booking hierarchy repair.');
    }
    if (text(manifestData.status).toUpperCase() === 'ROLLED_BACK') {
      return { success: true, idempotent: true, manifestId, bookingId: text(manifestData.bookingId) };
    }
    if (text(manifestData.status).toUpperCase() !== 'COMPLETED') {
      throw new functions.https.HttpsError('failed-precondition', 'Only a completed booking hierarchy repair can be restored.');
    }
    const bookingId = text(manifestData.bookingId);
    const bookingRef = db.collection('bookings').doc(bookingId);
    const current = await transaction.get(bookingRef);
    if (!current.exists) throw new functions.https.HttpsError('not-found', 'The repaired job no longer exists.');
    const currentData = current.data() || {};
    if (text(currentData.lastHierarchyRepairManifestId) !== manifestId
      || createBookingHierarchyFingerprint(bookingId, currentData) !== text(manifestData.appliedFingerprint)) {
      throw new functions.https.HttpsError('aborted', 'The job hierarchy changed after this repair. Rollback was stopped to protect newer work.');
    }
    const presentFields = new Set(stringValues(manifestData.presentFields));
    const previousValues = manifestData.previousValues && typeof manifestData.previousValues === 'object'
      ? manifestData.previousValues as Record<string, unknown>
      : {};
    const restorePatch: Record<string, unknown> = {
      hierarchyRepairedAt: admin.firestore.FieldValue.serverTimestamp(),
      hierarchyRepairedBy: actor.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    stringValues(manifestData.touchedFields).forEach(field => {
      restorePatch[field] = presentFields.has(field)
        ? previousValues[field]
        : admin.firestore.FieldValue.delete();
    });
    transaction.set(bookingRef, restorePatch, { merge: true });
    transaction.set(manifestRef, {
      status: 'ROLLED_BACK',
      rolledBackAt: new Date().toISOString(),
      rolledBackBy: actor.uid,
      rollbackAvailable: false,
    }, { merge: true });
    transaction.set(auditRef, {
      type: 'CLIENT_BOOKING_HIERARCHY_REPAIR_ROLLED_BACK',
      actorId: actor.uid,
      manifestId,
      bookingId,
      occurredAt: new Date().toISOString(),
    });
    transaction.set(eventRef, {
      type: 'CLIENT_HIERARCHY_REPAIR_ROLLED_BACK',
      jobId: bookingId,
      actorId: actor.uid,
      manifestId,
      createdAt: new Date().toISOString(),
    });
    return { success: true, manifestId, bookingId };
  });
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
