import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import {
  buildClientIdentityAudit,
  ClientIdentityAuditResult,
  ClientIdentityCandidate,
  ClientIdentitySourceRecord,
} from './clientIdentityAuditCore';
import {
  buildClientMergePreview,
  ClientMergeDependencyRecord,
  ClientMergeHierarchyDocument,
  ClientMergePreview,
  ClientMergeSourceDocument,
} from './clientMergeCore';
import { buildClientHierarchySeedPreview } from './clientHierarchyCore';
import {
  buildExcludedOrganizationPairs,
  ClientIdentityDecisionRecord,
  ClientIdentityDecisionType,
  normalizeDecisionPartitions,
} from './clientIdentityDecisionCore';
import {
  ClientMergeApprovalRecord,
  ClientMergeApprovalStatus,
  clientMergeApprovalStatus,
  validateClientMergeApproval,
} from './clientMergeApprovalCore';

const db = admin.firestore();
const MAX_CLIENT_RECORDS = 5000;
const MAX_DEPENDENCY_RECORDS = 20000;
const SAFE_RUNTIME = { timeoutSeconds: 120, memory: '512MB' as const };
const MERGE_RUNTIME = { timeoutSeconds: 300, memory: '1GB' as const };
const DEPENDENCY_COLLECTIONS = [
  'bookings',
  'clientInvoices',
  'timesheets',
  'interpreterInvoiceLines',
] as const;

interface ActiveAdmin {
  uid: string;
  role: 'ADMIN' | 'SUPER_ADMIN';
  displayName: string;
}

interface ClientIdentityDecisionView extends ClientIdentityDecisionRecord {
  stale: boolean;
}

interface ClientIdentityReviewState {
  decision: ClientIdentityDecisionType;
  reason: string;
  notes: string;
  revisitAt: string;
  decidedBy: string;
  decidedAt: string;
}

interface ClientIdentityAuditPayload extends ClientIdentityAuditResult {
  organizationCandidates: Array<ClientIdentityCandidate & { reviewDecision?: ClientIdentityReviewState }>;
  agentCandidates: Array<ClientIdentityCandidate & { reviewDecision?: ClientIdentityReviewState }>;
  decisions: ClientIdentityDecisionView[];
  decisionSummary: {
    deferred: number;
    rejected: number;
    split: number;
    stale: number;
  };
}

interface AuditContext {
  audit: ClientIdentityAuditPayload;
  clientDocuments: admin.firestore.QueryDocumentSnapshot[];
}

interface MergeContext {
  candidate: ClientIdentityCandidate;
  documents: ClientMergeSourceDocument[];
  documentSnapshots: Map<string, admin.firestore.DocumentSnapshot>;
  dependencies: ClientMergeDependencyRecord[];
  dependencySnapshots: Map<string, admin.firestore.QueryDocumentSnapshot>;
  hierarchySnapshots: Map<string, admin.firestore.DocumentSnapshot>;
  linkedSourceUsers: admin.firestore.QueryDocumentSnapshot[];
  preview: ClientMergePreview;
}

interface ClientMergeApprovalView {
  id: string;
  status: ClientMergeApprovalStatus;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  reviewedBy: string;
  reviewedByName: string;
  reviewedAt: string;
  reviewNote: string;
  expiresAt: string;
}

const text = (value: unknown) => String(value ?? '').trim();
const nowIso = () => new Date().toISOString();
const versionFor = (document: admin.firestore.DocumentSnapshot) => {
  const updateTime = (document as admin.firestore.DocumentSnapshot & { updateTime?: admin.firestore.Timestamp }).updateTime;
  return updateTime?.toDate().toISOString() || '';
};

const assertActiveAdmin = async (uid?: string, superAdminOnly = false): Promise<ActiveAdmin> => {
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
  const user = await db.collection('users').doc(uid).get();
  const data = user.data() || {};
  const role = String(data.role || '').toUpperCase();
  if (!user.exists || data.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only active administrators can audit client identity.');
  }
  if (superAdminOnly && role !== 'SUPER_ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Only an active Super Admin can merge or restore client records.');
  }
  return {
    uid,
    role: role as ActiveAdmin['role'],
    displayName: text(data.displayName || data.name || data.email || uid),
  };
};

const increment = (target: Record<string, number>, key: unknown) => {
  const cleanKey = text(key);
  if (!cleanKey) return;
  target[cleanKey] = (target[cleanKey] || 0) + 1;
};

const chunks = <T>(values: T[], size: number) => {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
};

const decisionFromDocument = (document: admin.firestore.QueryDocumentSnapshot): ClientIdentityDecisionRecord => {
  const data = document.data() || {};
  return {
    id: document.id,
    candidateId: text(data.candidateId || document.id),
    candidateFingerprint: text(data.candidateFingerprint),
    kind: text(data.kind).toUpperCase() === 'AGENT' ? 'AGENT' : 'ORGANIZATION',
    decision: ['REJECTED', 'SPLIT'].includes(text(data.decision).toUpperCase())
      ? text(data.decision).toUpperCase() as ClientIdentityDecisionType
      : 'DEFERRED',
    candidateLabel: text(data.candidateLabel),
    clientIds: uniqueStrings(Array.isArray(data.clientIds) ? data.clientIds : []),
    partitions: Array.isArray(data.partitions)
      ? data.partitions.filter(Array.isArray).map((partition: unknown[]) => uniqueStrings(partition))
      : [],
    reason: text(data.reason),
    notes: text(data.notes),
    revisitAt: text(data.revisitAt),
    active: data.active === true,
    decidedBy: text(data.decidedBy),
    decidedByName: text(data.decidedByName),
    decidedAt: text(data.decidedAt),
    updatedBy: text(data.updatedBy),
    updatedByName: text(data.updatedByName),
    updatedAt: text(data.updatedAt),
  };
};

const sameIds = (left: string[], right: string[]) => uniqueStrings(left).join('|') === uniqueStrings(right).join('|');

const loadAuditContext = async (applyDecisions = true): Promise<AuditContext> => {
  const [clientSnapshot, bookingSnapshot, invoiceSnapshot, userSnapshot, decisionSnapshot] = await Promise.all([
    db.collection('clients').limit(MAX_CLIENT_RECORDS + 1).get(),
    db.collection('bookings').select('clientId').get(),
    db.collection('clientInvoices').select('clientId').get(),
    db.collection('users').where('role', '==', 'CLIENT').select('profileId').get(),
    db.collection('clientIdentityDecisions').limit(MAX_CLIENT_RECORDS).get(),
  ]);
  const truncated = clientSnapshot.size > MAX_CLIENT_RECORDS;
  const clientDocuments = clientSnapshot.docs.slice(0, MAX_CLIENT_RECORDS);
  const clients = clientDocuments.map(document => ({
    id: document.id,
    ...document.data(),
  })) as ClientIdentitySourceRecord[];
  const bookingCounts: Record<string, number> = {};
  const invoiceCounts: Record<string, number> = {};
  const linkedUserCounts: Record<string, number> = {};
  bookingSnapshot.docs.forEach(document => increment(bookingCounts, document.data().clientId));
  invoiceSnapshot.docs.forEach(document => increment(invoiceCounts, document.data().clientId));
  userSnapshot.docs.forEach(document => increment(linkedUserCounts, document.data().profileId));

  const decisions = decisionSnapshot.docs.map(decisionFromDocument);
  const baseline = buildClientIdentityAudit({
    clients,
    bookingCounts,
    invoiceCounts,
    linkedUserCounts,
    generatedAt: nowIso(),
    truncated,
  });
  const excludedOrganizationPairs = applyDecisions
    ? buildExcludedOrganizationPairs(decisions)
    : [];
  const resolved = excludedOrganizationPairs.length > 0
    ? buildClientIdentityAudit({
      clients,
      bookingCounts,
      invoiceCounts,
      linkedUserCounts,
      excludedOrganizationPairs,
      generatedAt: baseline.generatedAt,
      truncated,
    })
    : baseline;
  const activeDeferred = new Map(decisions
    .filter(decision => applyDecisions && decision.active && decision.decision === 'DEFERRED')
    .map(decision => [decision.candidateId, decision]));
  const annotateCandidate = (candidate: ClientIdentityCandidate) => {
    const decision = activeDeferred.get(candidate.id);
    if (!decision || !sameIds(decision.clientIds, candidate.clientIds)) return candidate;
    return {
      ...candidate,
      reviewDecision: {
        decision: decision.decision,
        reason: decision.reason,
        notes: decision.notes,
        revisitAt: decision.revisitAt,
        decidedBy: decision.decidedBy,
        decidedAt: decision.decidedAt,
      },
    };
  };
  const baselineCandidates = new Map([
    ...baseline.organizationCandidates,
    ...baseline.agentCandidates,
  ].map(candidate => [candidate.id, candidate]));
  const decisionViews = decisions
    .filter(decision => decision.active)
    .map(decision => ({
      ...decision,
      stale: !sameIds(decision.clientIds, baselineCandidates.get(decision.candidateId)?.clientIds || []),
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return {
    clientDocuments,
    audit: {
      ...resolved,
      organizationCandidates: resolved.organizationCandidates.map(annotateCandidate),
      agentCandidates: resolved.agentCandidates.map(annotateCandidate),
      decisions: decisionViews,
      decisionSummary: {
        deferred: decisionViews.filter(decision => decision.decision === 'DEFERRED').length,
        rejected: decisionViews.filter(decision => decision.decision === 'REJECTED').length,
        split: decisionViews.filter(decision => decision.decision === 'SPLIT').length,
        stale: decisionViews.filter(decision => decision.stale).length,
      },
    },
  };
};

const queryByValues = async (
  collectionName: string,
  field: string,
  values: string[],
) => {
  const results: admin.firestore.QueryDocumentSnapshot[] = [];
  for (const valueChunk of chunks(Array.from(new Set(values.filter(Boolean))), 30)) {
    if (valueChunk.length === 0) continue;
    const snapshot = await db.collection(collectionName).where(field, 'in', valueChunk).get();
    results.push(...snapshot.docs);
  }
  return Array.from(new Map(results.map(document => [document.id, document])).values());
};

const prepareMergeContext = async (
  candidateId: string,
  canonicalClientId: string,
  fieldSelections: Record<string, string> = {},
): Promise<MergeContext> => {
  const { audit, clientDocuments } = await loadAuditContext();
  if (audit.truncated) {
    throw new functions.https.HttpsError('failed-precondition', 'The client audit is truncated. Merge preparation is disabled.');
  }
  const sourceCandidate = audit.organizationCandidates.find(candidate => candidate.id === candidateId);
  if (!sourceCandidate) {
    throw new functions.https.HttpsError('not-found', 'This candidate no longer exists. Refresh the identity audit.');
  }
  if (!sourceCandidate.clientIds.includes(canonicalClientId)) {
    throw new functions.https.HttpsError('invalid-argument', 'Select a canonical client from this candidate.');
  }
  if (sourceCandidate.reviewDecision?.decision === 'DEFERRED') {
    throw new functions.https.HttpsError('failed-precondition', 'This candidate is deferred. Reopen the review before preparing a merge.');
  }
  const sourceIds = sourceCandidate.clientIds.filter(id => id !== canonicalClientId);
  const documentSnapshots = new Map(clientDocuments
    .filter(document => sourceCandidate.clientIds.includes(document.id))
    .map(document => [document.id, document]));
  if (documentSnapshots.size !== sourceCandidate.clientIds.length) {
    throw new functions.https.HttpsError('failed-precondition', 'One or more client records changed during preparation. Refresh the audit.');
  }
  const documents: ClientMergeSourceDocument[] = sourceCandidate.clientIds.map(id => {
    const document = documentSnapshots.get(id)!;
    return { id, data: document.data(), version: versionFor(document) };
  });

  const dependencySnapshots = new Map<string, admin.firestore.QueryDocumentSnapshot>();
  const dependencies: ClientMergeDependencyRecord[] = [];
  for (const collectionName of DEPENDENCY_COLLECTIONS) {
    const relationshipIds = collectionName === 'bookings' ? sourceCandidate.clientIds : sourceIds;
    const matches = await queryByValues(collectionName, 'clientId', relationshipIds);
    matches.forEach(document => {
      const key = `${collectionName}/${document.id}`;
      dependencySnapshots.set(key, document);
      dependencies.push({
        collection: collectionName,
        id: document.id,
        clientId: text(document.data().clientId),
        version: versionFor(document),
      });
    });
  }
  if (dependencies.length > MAX_DEPENDENCY_RECORDS) {
    throw new functions.https.HttpsError('resource-exhausted', 'This candidate exceeds the safe dependency limit and requires a staged migration.');
  }

  const linkedSourceUsers = await queryByValues('users', 'profileId', sourceIds);
  let candidate = sourceCandidate;
  if (linkedSourceUsers.length > 0 && candidate.executionEligibility !== 'BLOCKED') {
    const blocker = `${linkedSourceUsers.length} user account${linkedSourceUsers.length === 1 ? '' : 's'} would change client access scope.`;
    candidate = {
      ...candidate,
      executionEligibility: 'BLOCKED',
      mergeRisk: 'HIGH',
      blockers: [...candidate.blockers, blocker],
      conflicts: [...candidate.conflicts, blocker],
    };
  }

  const hierarchySeed = buildClientHierarchySeedPreview(documents, canonicalClientId);
  const hierarchyRefs = [
    ...hierarchySeed.departments.map(department => db.collection('clientDepartments').doc(department.id)),
    ...hierarchySeed.agents.map(agent => db.collection('clientAgents').doc(agent.id)),
    ...hierarchySeed.memberships.map(membership => db.collection('clientMemberships').doc(membership.id)),
  ];
  const hierarchyDocuments = hierarchyRefs.length > 0 ? await db.getAll(...hierarchyRefs) : [];
  const hierarchySnapshots = new Map(hierarchyDocuments.map(document => [
    `${document.ref.parent.id}/${document.id}`,
    document,
  ]));
  const hierarchyVersions: ClientMergeHierarchyDocument[] = hierarchyDocuments.map(document => ({
    collection: document.ref.parent.id as ClientMergeHierarchyDocument['collection'],
    id: document.id,
    version: versionFor(document),
  }));

  return {
    candidate,
    documents,
    documentSnapshots,
    dependencies,
    dependencySnapshots,
    hierarchySnapshots,
    linkedSourceUsers,
    preview: buildClientMergePreview(candidate, canonicalClientId, documents, dependencies, hierarchyVersions, fieldSelections),
  };
};

const persistAuditEvent = async (data: Record<string, unknown>) => {
  await db.collection('clientIdentityAuditEvents').add({
    ...data,
    occurredAt: nowIso(),
  });
};

const restoreFieldPatch = (original: Record<string, unknown>, touchedFields: string[]) => {
  const patch: Record<string, unknown> = {};
  touchedFields.forEach(field => {
    patch[field] = Object.prototype.hasOwnProperty.call(original, field)
      ? original[field]
      : admin.firestore.FieldValue.delete();
  });
  return patch;
};

const uniqueStrings = (values: unknown[]) => Array.from(new Set(values.flatMap(value => (
  Array.isArray(value) ? value : [value]
)).map(text).filter(Boolean))).sort((left, right) => left.localeCompare(right));

const normalizeFieldSelections = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([field, clientId]) => [text(field), text(clientId)])
    .filter(([field, clientId]) => Boolean(field && clientId)));
};

const approvalRefFor = (expectedFingerprint: string) => db.collection('clientMergeApprovals').doc(expectedFingerprint);

const approvalRecordFromData = (data: Record<string, unknown>): ClientMergeApprovalRecord => ({
  status: text(data.status),
  candidateId: text(data.candidateId),
  candidateFingerprint: text(data.candidateFingerprint),
  expectedFingerprint: text(data.expectedFingerprint),
  canonicalClientId: text(data.canonicalClientId),
  fieldSelections: normalizeFieldSelections(data.fieldSelections),
  requestedBy: text(data.requestedBy),
  reviewedBy: text(data.reviewedBy),
  expiresAt: text(data.expiresAt),
  consumedByManifestId: text(data.consumedByManifestId),
});

const approvalView = (document: admin.firestore.DocumentSnapshot): ClientMergeApprovalView | null => {
  if (!document.exists) return null;
  const data = document.data() || {};
  return {
    id: document.id,
    status: clientMergeApprovalStatus(approvalRecordFromData(data)),
    requestedBy: text(data.requestedBy),
    requestedByName: text(data.requestedByName),
    requestedAt: text(data.requestedAt),
    reviewedBy: text(data.reviewedBy),
    reviewedByName: text(data.reviewedByName),
    reviewedAt: text(data.reviewedAt),
    reviewNote: text(data.reviewNote),
    expiresAt: text(data.expiresAt),
  };
};

/**
 * Read-only discovery endpoint. It never writes canonical mappings or changes
 * client, booking, invoice, or user documents.
 */
export const getClientIdentityAudit = functions
  .runWith(SAFE_RUNTIME)
  .https.onCall(async (_data, context) => {
    await assertActiveAdmin(context.auth?.uid);
    try {
      return (await loadAuditContext()).audit;
    } catch (error) {
      console.error('Client identity audit failed', error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError('internal', 'The client identity audit could not be completed.');
    }
  });

export const saveClientIdentityDecision = functions
  .runWith(SAFE_RUNTIME)
  .https.onCall(async (data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid);
    const candidateId = text(data?.candidateId);
    const expectedFingerprint = text(data?.expectedFingerprint);
    const requestedDecision = text(data?.decision).toUpperCase();
    const reason = text(data?.reason).slice(0, 500);
    const notes = text(data?.notes).slice(0, 3000);
    const revisitAt = text(data?.revisitAt).slice(0, 40);
    if (!candidateId || !['DEFERRED', 'REJECTED', 'SPLIT', 'REOPEN'].includes(requestedDecision)) {
      throw new functions.https.HttpsError('invalid-argument', 'Candidate and a valid review decision are required.');
    }
    const decisionRef = db.collection('clientIdentityDecisions').doc(candidateId);
    const changedAt = nowIso();
    if (requestedDecision === 'REOPEN') {
      const current = await decisionRef.get();
      if (!current.exists || current.data()?.active !== true) {
        throw new functions.https.HttpsError('failed-precondition', 'This candidate does not have an active review decision.');
      }
      await decisionRef.set({
        active: false,
        reopenedBy: actor.uid,
        reopenedByName: actor.displayName,
        reopenedAt: changedAt,
        updatedBy: actor.uid,
        updatedAt: changedAt,
      }, { merge: true });
      await persistAuditEvent({
        action: 'CLIENT_IDENTITY_DECISION_REOPENED',
        candidateId,
        actorId: actor.uid,
        actorName: actor.displayName,
      });
      return { success: true, candidateId, active: false };
    }
    if (!expectedFingerprint || reason.length < 5) {
      throw new functions.https.HttpsError('invalid-argument', 'A current candidate fingerprint and a review reason are required.');
    }
    const baseline = (await loadAuditContext(false)).audit;
    const candidate = [...baseline.organizationCandidates, ...baseline.agentCandidates]
      .find(item => item.id === candidateId);
    if (!candidate) {
      throw new functions.https.HttpsError('not-found', 'This candidate changed or no longer exists. Refresh the audit.');
    }
    if (candidate.fingerprint !== expectedFingerprint) {
      throw new functions.https.HttpsError('aborted', 'The candidate changed after review. Refresh and inspect it again.');
    }
    const decision = requestedDecision as ClientIdentityDecisionType;
    if (candidate.kind !== 'ORGANIZATION' && decision !== 'DEFERRED') {
      throw new functions.https.HttpsError('failed-precondition', 'Agent candidates can be deferred, but organisation separation must be managed from an organisation candidate.');
    }
    if (revisitAt && (!Number.isFinite(Date.parse(revisitAt)) || Date.parse(revisitAt) <= Date.now())) {
      throw new functions.https.HttpsError('invalid-argument', 'The revisit date must be in the future.');
    }
    const partitions = decision === 'SPLIT'
      ? normalizeDecisionPartitions(candidate.clientIds, data?.partitions)
      : [];
    if (decision === 'SPLIT' && partitions.length < 2) {
      throw new functions.https.HttpsError('invalid-argument', 'Assign every source record to at least two non-overlapping groups.');
    }
    const record: ClientIdentityDecisionRecord = {
      id: candidateId,
      candidateId,
      candidateFingerprint: candidate.fingerprint,
      kind: candidate.kind,
      decision,
      candidateLabel: candidate.label,
      clientIds: candidate.clientIds,
      partitions,
      reason,
      notes,
      revisitAt: decision === 'DEFERRED' ? revisitAt : '',
      active: true,
      decidedBy: actor.uid,
      decidedByName: actor.displayName,
      decidedAt: changedAt,
      updatedBy: actor.uid,
      updatedByName: actor.displayName,
      updatedAt: changedAt,
    };
    await decisionRef.set(record, { merge: false });
    await persistAuditEvent({
      action: 'CLIENT_IDENTITY_DECISION_SAVED',
      candidateId,
      candidateFingerprint: candidate.fingerprint,
      decision,
      clientIds: candidate.clientIds,
      partitions,
      reason,
      actorId: actor.uid,
      actorName: actor.displayName,
    });
    return { success: true, ...record };
  });

export const getClientMergePreview = functions
  .runWith(MERGE_RUNTIME)
  .https.onCall(async (data, context) => {
    await assertActiveAdmin(context.auth?.uid);
    const candidateId = text(data?.candidateId);
    const canonicalClientId = text(data?.canonicalClientId);
    const fieldSelections = normalizeFieldSelections(data?.fieldSelections);
    if (!candidateId || !canonicalClientId) {
      throw new functions.https.HttpsError('invalid-argument', 'Candidate and canonical client are required.');
    }
    try {
      const merge = await prepareMergeContext(candidateId, canonicalClientId, fieldSelections);
      const approvalDocument = merge.preview.requiresSecondApproval
        ? await approvalRefFor(merge.preview.expectedFingerprint).get()
        : null;
      return {
        ...merge.preview,
        approval: approvalDocument ? approvalView(approvalDocument) : null,
      };
    } catch (error) {
      console.error('Client merge preview failed', error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError('internal', 'The merge preview could not be prepared.');
    }
  });

export const requestClientMergeApproval = functions
  .runWith(MERGE_RUNTIME)
  .https.onCall(async (data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid, true);
    const candidateId = text(data?.candidateId);
    const canonicalClientId = text(data?.canonicalClientId);
    const expectedFingerprint = text(data?.expectedFingerprint);
    const fieldSelections = normalizeFieldSelections(data?.fieldSelections);
    if (!candidateId || !canonicalClientId || !expectedFingerprint) {
      throw new functions.https.HttpsError('invalid-argument', 'Candidate, canonical client and fingerprint are required.');
    }
    const merge = await prepareMergeContext(candidateId, canonicalClientId, fieldSelections);
    if (merge.preview.expectedFingerprint !== expectedFingerprint) {
      throw new functions.https.HttpsError('aborted', 'The preview changed. Refresh it before requesting approval.');
    }
    if (!merge.preview.canExecute) {
      throw new functions.https.HttpsError('failed-precondition', merge.preview.blockers.join(' ') || 'This merge is blocked.');
    }
    if (!merge.preview.requiresSecondApproval) {
      return { success: true, required: false, approval: null };
    }
    const approvalRef = approvalRefFor(expectedFingerprint);
    const requestedAt = nowIso();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const createdRequest = await db.runTransaction(async transaction => {
      const current = await transaction.get(approvalRef);
      const currentView = approvalView(current);
      if (currentView && ['PENDING', 'APPROVED', 'IN_PROGRESS'].includes(currentView.status)) return false;
      transaction.set(approvalRef, {
        candidateId,
        candidateFingerprint: merge.preview.candidateFingerprint,
        expectedFingerprint,
        canonicalClientId,
        fieldSelections: merge.preview.fieldSelections,
        status: 'PENDING',
        reasons: merge.preview.secondApprovalReasons,
        requestedBy: actor.uid,
        requestedByName: actor.displayName,
        requestedAt,
        reviewedBy: '',
        reviewedByName: '',
        reviewedAt: '',
        reviewNote: '',
        expiresAt,
        consumedByManifestId: '',
        reservedByManifestId: '',
      }, { merge: false });
      return true;
    });
    const currentApproval = await approvalRef.get();
    if (createdRequest) {
      await persistAuditEvent({
        action: 'CLIENT_MERGE_APPROVAL_REQUESTED',
        candidateId,
        expectedFingerprint,
        canonicalClientId,
        reasons: merge.preview.secondApprovalReasons,
        actorId: actor.uid,
        actorName: actor.displayName,
      });
    }
    return { success: true, required: true, approval: approvalView(currentApproval) };
  });

export const reviewClientMergeApproval = functions
  .runWith(MERGE_RUNTIME)
  .https.onCall(async (data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid, true);
    const approvalId = text(data?.approvalId);
    const reviewDecision = text(data?.decision).toUpperCase();
    const reviewNote = text(data?.note).slice(0, 1000);
    if (!approvalId || !['APPROVE', 'REJECT'].includes(reviewDecision)) {
      throw new functions.https.HttpsError('invalid-argument', 'Approval and review decision are required.');
    }
    const approvalRef = db.collection('clientMergeApprovals').doc(approvalId);
    const approvalDocument = await approvalRef.get();
    if (!approvalDocument.exists) throw new functions.https.HttpsError('not-found', 'Merge approval request not found.');
    const approvalData = approvalDocument.data() || {};
    const currentView = approvalView(approvalDocument)!;
    if (currentView.status !== 'PENDING') {
      throw new functions.https.HttpsError('failed-precondition', `This approval is ${currentView.status.toLowerCase()}.`);
    }
    if (text(approvalData.requestedBy) === actor.uid) {
      throw new functions.https.HttpsError('permission-denied', 'A different Super Admin must review this merge.');
    }
    if (reviewDecision === 'APPROVE') {
      const merge = await prepareMergeContext(
        text(approvalData.candidateId),
        text(approvalData.canonicalClientId),
        normalizeFieldSelections(approvalData.fieldSelections),
      );
      if (merge.preview.expectedFingerprint !== text(approvalData.expectedFingerprint)) {
        throw new functions.https.HttpsError('aborted', 'The merge changed after approval was requested. Create a new preview.');
      }
    }
    const reviewedAt = nowIso();
    await db.runTransaction(async transaction => {
      const latest = await transaction.get(approvalRef);
      if (!latest.exists) throw new functions.https.HttpsError('not-found', 'Merge approval request not found.');
      const latestData = latest.data() || {};
      const latestView = approvalView(latest)!;
      if (latestView.status !== 'PENDING') {
        throw new functions.https.HttpsError('failed-precondition', `This approval is ${latestView.status.toLowerCase()}.`);
      }
      if (text(latestData.requestedBy) === actor.uid) {
        throw new functions.https.HttpsError('permission-denied', 'A different Super Admin must review this merge.');
      }
      if (
        text(latestData.expectedFingerprint) !== text(approvalData.expectedFingerprint)
        || text(latestData.candidateId) !== text(approvalData.candidateId)
        || text(latestData.canonicalClientId) !== text(approvalData.canonicalClientId)
      ) {
        throw new functions.https.HttpsError('aborted', 'The approval request changed while it was being reviewed.');
      }
      transaction.set(approvalRef, {
        status: reviewDecision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        reviewedBy: actor.uid,
        reviewedByName: actor.displayName,
        reviewedAt,
        reviewNote,
      }, { merge: true });
    });
    await persistAuditEvent({
      action: reviewDecision === 'APPROVE' ? 'CLIENT_MERGE_APPROVAL_GRANTED' : 'CLIENT_MERGE_APPROVAL_REJECTED',
      approvalId,
      candidateId: text(approvalData.candidateId),
      expectedFingerprint: text(approvalData.expectedFingerprint),
      actorId: actor.uid,
      actorName: actor.displayName,
      reviewNote,
    });
    return { success: true, approval: approvalView(await approvalRef.get()) };
  });

export const executeClientMerge = functions
  .runWith(MERGE_RUNTIME)
  .https.onCall(async (data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid, true);
    const candidateId = text(data?.candidateId);
    const canonicalClientId = text(data?.canonicalClientId);
    const expectedFingerprint = text(data?.expectedFingerprint);
    const fieldSelections = normalizeFieldSelections(data?.fieldSelections);
    const confirmation = text(data?.confirmation).toUpperCase();
    const reviewAcknowledged = data?.reviewAcknowledged === true;
    if (!candidateId || !canonicalClientId || !expectedFingerprint) {
      throw new functions.https.HttpsError('invalid-argument', 'Candidate, canonical client, and preview fingerprint are required.');
    }

    const prior = await db.collection('clientMergeManifests')
      .where('expectedFingerprint', '==', expectedFingerprint)
      .limit(1)
      .get();
    if (!prior.empty && prior.docs[0].data().status === 'COMPLETED') {
      return { success: true, idempotent: true, manifestId: prior.docs[0].id, ...prior.docs[0].data().result };
    }

    const merge = await prepareMergeContext(candidateId, canonicalClientId, fieldSelections);
    const { preview } = merge;
    if (preview.expectedFingerprint !== expectedFingerprint) {
      throw new functions.https.HttpsError('aborted', 'The candidate changed after preview. Refresh and review it again.');
    }
    if (!preview.canExecute || preview.blockers.length > 0 || merge.linkedSourceUsers.length > 0) {
      throw new functions.https.HttpsError('failed-precondition', preview.blockers.join(' ') || 'This candidate is blocked from merge.');
    }
    if (confirmation !== preview.confirmationPhrase) {
      throw new functions.https.HttpsError('failed-precondition', `Type ${preview.confirmationPhrase} to confirm this merge.`);
    }
    if (preview.requiresReviewAcknowledgement && !reviewAcknowledged) {
      throw new functions.https.HttpsError('failed-precondition', 'Review acknowledgement is required for this candidate.');
    }

    const manifestRef = db.collection('clientMergeManifests').doc();
    const executionRef = db.collection('clientMergeExecutionLocks').doc(expectedFingerprint);
    const mergeApprovalRef = preview.requiresSecondApproval ? approvalRefFor(expectedFingerprint) : null;
    const createdAt = nowIso();
    const canonicalSnapshot = merge.documentSnapshots.get(canonicalClientId)!;
    const canonicalTouchedFields = Array.from(new Set([
      ...Object.keys(preview.canonicalPatch),
      'lastClientMergeManifestId',
      'identityMergedAt',
    ]));
    const sourceTouchedFields = ['recordState', 'mergedIntoClientId', 'mergeManifestId', 'mergedAt'];

    const claim = await db.runTransaction(async transaction => {
      const execution = await transaction.get(executionRef);
      const executionData = execution.data() || {};
      const executionStatus = text(executionData.status).toUpperCase();
      if (executionStatus === 'COMPLETED') {
        return { state: 'COMPLETED' as const, manifestId: text(executionData.manifestId) };
      }
      if (['IN_PROGRESS', 'FAILED'].includes(executionStatus)) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          `This merge already has a ${executionStatus.toLowerCase().replace('_', ' ')} execution. Inspect or restore manifest ${text(executionData.manifestId) || 'unknown'}.`,
        );
      }

      let approvalDocument: admin.firestore.DocumentSnapshot | null = null;
      let approvalRecord: ClientMergeApprovalRecord | null = null;
      let approvalReviewer: admin.firestore.DocumentSnapshot | null = null;
      if (mergeApprovalRef) {
        approvalDocument = await transaction.get(mergeApprovalRef);
        if (!approvalDocument.exists) {
          throw new functions.https.HttpsError('failed-precondition', 'A second Super Admin must approve this merge before execution.');
        }
        approvalRecord = approvalRecordFromData(approvalDocument.data() || {});
        const validation = validateClientMergeApproval(approvalRecord, {
          candidateId,
          candidateFingerprint: preview.candidateFingerprint,
          expectedFingerprint,
          canonicalClientId,
          fieldSelections: preview.fieldSelections,
        });
        if (!validation.valid) {
          throw new functions.https.HttpsError('failed-precondition', validation.reason);
        }
        approvalReviewer = await transaction.get(db.collection('users').doc(approvalRecord.reviewedBy));
        const reviewerData = approvalReviewer.data() || {};
        if (
          !approvalReviewer.exists
          || reviewerData.status !== 'ACTIVE'
          || text(reviewerData.role).toUpperCase() !== 'SUPER_ADMIN'
        ) {
          throw new functions.https.HttpsError('failed-precondition', 'The approving Super Admin is no longer active. Request a new approval.');
        }
      }

      transaction.set(manifestRef, {
        status: 'PREPARING',
        candidateId,
        candidateFingerprint: preview.candidateFingerprint,
        expectedFingerprint,
        canonicalClientId,
        sourceClientIds: preview.sourceClientIds,
        eligibility: preview.eligibility,
        fieldSelections: preview.fieldSelections,
        counts: preview.totals,
        canonicalTouchedFields,
        sourceTouchedFields,
        approvalId: mergeApprovalRef?.id || '',
        secondApprovalRequired: preview.requiresSecondApproval,
        secondApprovalReasons: preview.secondApprovalReasons,
        createdAt,
        createdBy: actor.uid,
        rollbackAvailable: false,
      });
      transaction.set(executionRef, {
        status: 'IN_PROGRESS',
        manifestId: manifestRef.id,
        candidateId,
        expectedFingerprint,
        canonicalClientId,
        startedAt: createdAt,
        startedBy: actor.uid,
      }, { merge: false });
      if (mergeApprovalRef && approvalDocument && approvalRecord && approvalReviewer) {
        transaction.set(mergeApprovalRef, {
          status: 'IN_PROGRESS',
          reservedByManifestId: manifestRef.id,
          reservedAt: createdAt,
          executionStartedBy: actor.uid,
        }, { merge: true });
      }
      return { state: 'CLAIMED' as const, manifestId: manifestRef.id };
    });

    if (claim.state === 'COMPLETED') {
      if (!claim.manifestId) throw new functions.https.HttpsError('internal', 'The completed merge execution is missing its manifest.');
      const completedManifest = await db.collection('clientMergeManifests').doc(claim.manifestId).get();
      const completedData = completedManifest.data() || {};
      return { success: true, idempotent: true, manifestId: claim.manifestId, ...(completedData.result || {}) };
    }

    try {
      const clientBackupBatch = db.batch();
      merge.documents.forEach(document => {
        const touchedFields = document.id === canonicalClientId ? canonicalTouchedFields : sourceTouchedFields;
        clientBackupBatch.set(manifestRef.collection('clientSnapshots').doc(document.id), {
          clientId: document.id,
          data: document.data,
          version: document.version,
          touchedFields,
        });
      });
      await clientBackupBatch.commit();

      const hierarchyWrites: Array<{
        collection: 'clientDepartments' | 'clientAgents' | 'clientMemberships';
        id: string;
        patch: Record<string, unknown>;
        touchedFields: string[];
      }> = [];
      preview.hierarchy.departments.forEach(department => {
        const collection = 'clientDepartments' as const;
        const current = merge.hierarchySnapshots.get(`${collection}/${department.id}`);
        const currentData = current?.data() || {};
        const touchedFields = [
          'clientId', 'name', 'normalizedName', 'aliases', 'status', 'sourceClientIds',
          'identityConfidence', 'identityEvidence', 'lastClientMergeManifestId', 'updatedAt', 'createdAt',
        ];
        hierarchyWrites.push({
          collection,
          id: department.id,
          touchedFields,
          patch: {
            clientId: department.clientId,
            name: text(currentData.name) || department.name,
            normalizedName: department.normalizedName,
            aliases: uniqueStrings([currentData.aliases, department.name]),
            status: text(currentData.status) || 'ACTIVE',
            sourceClientIds: uniqueStrings([currentData.sourceClientIds, department.sourceClientIds]),
            identityConfidence: department.confidence,
            identityEvidence: uniqueStrings([currentData.identityEvidence, department.evidence]),
            lastClientMergeManifestId: manifestRef.id,
            updatedAt: createdAt,
            ...(!current?.exists ? { createdAt } : {}),
          },
        });
      });
      preview.hierarchy.agents.forEach(agent => {
        const collection = 'clientAgents' as const;
        const current = merge.hierarchySnapshots.get(`${collection}/${agent.id}`);
        const currentData = current?.data() || {};
        const touchedFields = [
          'displayName', 'names', 'email', 'normalizedEmail', 'phoneNumbers', 'agentType',
          'roles', 'sourceClientIds', 'status', 'lastClientMergeManifestId', 'updatedAt', 'createdAt',
        ];
        hierarchyWrites.push({
          collection,
          id: agent.id,
          touchedFields,
          patch: {
            displayName: text(currentData.displayName) || agent.displayName,
            names: uniqueStrings([currentData.names, agent.names]),
            email: text(currentData.email) || agent.email,
            normalizedEmail: agent.normalizedEmail,
            phoneNumbers: uniqueStrings([currentData.phoneNumbers, agent.phoneNumbers]),
            agentType: text(currentData.agentType) || agent.agentType,
            roles: uniqueStrings([currentData.roles, agent.roles]),
            sourceClientIds: uniqueStrings([currentData.sourceClientIds, agent.sourceClientIds]),
            status: text(currentData.status) || 'ACTIVE',
            lastClientMergeManifestId: manifestRef.id,
            updatedAt: createdAt,
            ...(!current?.exists ? { createdAt } : {}),
          },
        });
      });
      preview.hierarchy.memberships.forEach(membership => {
        const collection = 'clientMemberships' as const;
        const current = merge.hierarchySnapshots.get(`${collection}/${membership.id}`);
        const currentData = current?.data() || {};
        const touchedFields = [
          'clientId', 'agentId', 'accessLevel', 'roles', 'departmentIds', 'sourceClientIds',
          'status', 'lastClientMergeManifestId', 'updatedAt', 'createdAt',
        ];
        hierarchyWrites.push({
          collection,
          id: membership.id,
          touchedFields,
          patch: {
            clientId: membership.clientId,
            agentId: membership.agentId,
            accessLevel: text(currentData.accessLevel) || membership.accessLevel,
            roles: uniqueStrings([currentData.roles, membership.roles]),
            departmentIds: uniqueStrings([currentData.departmentIds, membership.departmentIds]),
            sourceClientIds: uniqueStrings([currentData.sourceClientIds, membership.sourceClientIds]),
            status: text(currentData.status) || 'ACTIVE',
            lastClientMergeManifestId: manifestRef.id,
            updatedAt: createdAt,
            ...(!current?.exists ? { createdAt } : {}),
          },
        });
      });

      for (const hierarchyChunk of chunks(hierarchyWrites, 200)) {
        const batch = db.batch();
        hierarchyChunk.forEach(write => {
          const ref = db.collection(write.collection).doc(write.id);
          const current = merge.hierarchySnapshots.get(`${write.collection}/${write.id}`);
          batch.set(manifestRef.collection('hierarchySnapshots').doc(`${write.collection}__${write.id}`), {
            collection: write.collection,
            documentId: write.id,
            existed: current?.exists === true,
            data: current?.data() || {},
            version: current ? versionFor(current) : '',
            touchedFields: write.touchedFields,
          });
          batch.set(ref, write.patch, { merge: true });
        });
        await batch.commit();
      }

      let migratedDependencies = 0;
      let linkedBookingAgents = 0;
      let linkedBookingDepartments = 0;
      for (const dependencyChunk of chunks(merge.dependencies, 225)) {
        const batch = db.batch();
        dependencyChunk.forEach(dependency => {
          const key = `${dependency.collection}/${dependency.id}`;
          const document = merge.dependencySnapshots.get(key)!;
          const currentData = document.data() || {};
          const backupId = `${dependency.collection}__${dependency.id}`;
          const bookingAgentId = dependency.collection === 'bookings' && !text(currentData.requestedByAgentId)
            ? preview.hierarchy.bookingAgentBySourceClientId[dependency.clientId]
            : '';
          const bookingDepartmentId = dependency.collection === 'bookings' && !text(currentData.clientDepartmentId)
            ? preview.hierarchy.departmentBySourceClientId[dependency.clientId]
            : '';
          const touchedFields = [
            'clientId',
            'clientMergeManifestId',
            'clientIdentityMigratedAt',
            ...(bookingAgentId ? ['requestedByAgentId', 'requestedByAgentSource'] : []),
            ...(bookingDepartmentId ? ['clientDepartmentId', 'clientDepartmentSource'] : []),
          ];
          const previousValues = Object.fromEntries(touchedFields
            .filter(field => Object.prototype.hasOwnProperty.call(currentData, field))
            .map(field => [field, currentData[field]]));
          batch.set(manifestRef.collection('dependencies').doc(backupId), {
            collection: dependency.collection,
            documentId: dependency.id,
            previousClientId: dependency.clientId,
            previousValues,
            touchedFields,
            version: dependency.version,
          });
          batch.update(document.ref, {
            clientId: canonicalClientId,
            clientMergeManifestId: manifestRef.id,
            clientIdentityMigratedAt: createdAt,
            ...(bookingAgentId ? {
              requestedByAgentId: bookingAgentId,
              requestedByAgentSource: 'CLIENT_IDENTITY_MIGRATION',
            } : {}),
            ...(bookingDepartmentId ? {
              clientDepartmentId: bookingDepartmentId,
              clientDepartmentSource: 'CLIENT_IDENTITY_MIGRATION',
            } : {}),
          });
          if (bookingAgentId) linkedBookingAgents += 1;
          if (bookingDepartmentId) linkedBookingDepartments += 1;
        });
        await batch.commit();
        migratedDependencies += dependencyChunk.length;
        await manifestRef.set({ migratedDependencies, linkedBookingAgents, linkedBookingDepartments }, { merge: true });
      }

      const finalBatch = db.batch();
      finalBatch.set(canonicalSnapshot.ref, {
        ...preview.canonicalPatch,
        lastClientMergeManifestId: manifestRef.id,
        identityMergedAt: createdAt,
      }, { merge: true });
      preview.sourceClientIds.forEach(sourceId => {
        const source = merge.documentSnapshots.get(sourceId)!;
        finalBatch.set(source.ref, {
          recordState: 'MERGED',
          mergedIntoClientId: canonicalClientId,
          mergeManifestId: manifestRef.id,
          mergedAt: createdAt,
        }, { merge: true });
      });
      const result = {
        canonicalClientId,
        mergedClientIds: preview.sourceClientIds,
        migratedDependencies,
        linkedBookingAgents,
        linkedBookingDepartments,
        hierarchy: preview.hierarchy.totals,
        counts: preview.totals,
      };
      finalBatch.set(manifestRef, {
        status: 'COMPLETED',
        completedAt: nowIso(),
        rollbackAvailable: true,
        result,
      }, { merge: true });
      finalBatch.set(executionRef, {
        status: 'COMPLETED',
        completedAt: nowIso(),
        result,
      }, { merge: true });
      if (mergeApprovalRef) {
        finalBatch.set(mergeApprovalRef, {
          status: 'CONSUMED',
          consumedByManifestId: manifestRef.id,
          consumedAt: nowIso(),
        }, { merge: true });
      }
      await finalBatch.commit();
      await persistAuditEvent({
        action: 'CLIENT_MERGE_COMPLETED',
        manifestId: manifestRef.id,
        canonicalClientId,
        sourceClientIds: preview.sourceClientIds,
        actorId: actor.uid,
        counts: preview.totals,
      });
      return { success: true, idempotent: false, manifestId: manifestRef.id, ...result };
    } catch (error) {
      console.error('Client merge execution failed', { manifestId: manifestRef.id, error });
      const failedAt = nowIso();
      const failedBatch = db.batch();
      failedBatch.set(manifestRef, {
        status: 'FAILED',
        failedAt,
        rollbackAvailable: true,
        error: error instanceof Error ? error.message : String(error),
      }, { merge: true });
      failedBatch.set(executionRef, {
        status: 'FAILED',
        failedAt,
        error: error instanceof Error ? error.message : String(error),
      }, { merge: true });
      if (mergeApprovalRef) {
        failedBatch.set(mergeApprovalRef, {
          executionFailedAt: failedAt,
          executionError: error instanceof Error ? error.message : String(error),
        }, { merge: true });
      }
      await failedBatch.commit();
      await persistAuditEvent({
        action: 'CLIENT_MERGE_FAILED',
        manifestId: manifestRef.id,
        canonicalClientId,
        actorId: actor.uid,
      });
      throw new functions.https.HttpsError('internal', `The merge stopped safely. Use manifest ${manifestRef.id} to inspect or roll back partial writes.`);
    }
  });

export const rollbackClientMerge = functions
  .runWith(MERGE_RUNTIME)
  .https.onCall(async (data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid, true);
    const manifestId = text(data?.manifestId);
    const confirmation = text(data?.confirmation).toUpperCase();
    if (!manifestId) throw new functions.https.HttpsError('invalid-argument', 'A merge manifest is required.');
    if (confirmation !== 'ROLLBACK CLIENT MERGE') {
      throw new functions.https.HttpsError('failed-precondition', 'Type ROLLBACK CLIENT MERGE to confirm restoration.');
    }
    const manifestRef = db.collection('clientMergeManifests').doc(manifestId);
    const manifest = await manifestRef.get();
    if (!manifest.exists) throw new functions.https.HttpsError('not-found', 'Merge manifest not found.');
    const manifestData = manifest.data() || {};
    if (manifestData.status === 'ROLLED_BACK') return { success: true, idempotent: true, manifestId };
    if (!['COMPLETED', 'FAILED'].includes(String(manifestData.status || ''))) {
      throw new functions.https.HttpsError('failed-precondition', 'Only completed or failed merges can be rolled back.');
    }

    const [clientBackups, dependencyBackups, hierarchyBackups] = await Promise.all([
      manifestRef.collection('clientSnapshots').get(),
      manifestRef.collection('dependencies').get(),
      manifestRef.collection('hierarchySnapshots').get(),
    ]);
    let restoredDependencies = 0;
    let skippedDependencies = 0;
    for (const dependencyChunk of chunks(dependencyBackups.docs, 400)) {
      const refs = dependencyChunk.map(backup => {
        const value = backup.data();
        return db.collection(String(value.collection)).doc(String(value.documentId));
      });
      const currentDocuments = refs.length ? await db.getAll(...refs) : [];
      const batch = db.batch();
      currentDocuments.forEach((current, index) => {
        const backup = dependencyChunk[index].data();
        const currentData = current.data() || {};
        if (!current.exists || currentData.clientMergeManifestId !== manifestId) {
          skippedDependencies += 1;
          return;
        }
        const touchedFields = Array.isArray(backup.touchedFields)
          ? backup.touchedFields.map(String)
          : ['clientId', 'clientMergeManifestId', 'clientIdentityMigratedAt'];
        const previousValues = backup.previousValues && typeof backup.previousValues === 'object'
          ? backup.previousValues as Record<string, unknown>
          : { clientId: backup.previousClientId };
        batch.update(current.ref, restoreFieldPatch(previousValues, touchedFields) as any);
        restoredDependencies += 1;
      });
      await batch.commit();
    }

    let restoredHierarchyRecords = 0;
    let removedHierarchyRecords = 0;
    let skippedHierarchyRecords = 0;
    for (const hierarchyChunk of chunks(hierarchyBackups.docs, 400)) {
      const refs = hierarchyChunk.map(backup => {
        const value = backup.data();
        return db.collection(String(value.collection)).doc(String(value.documentId));
      });
      const currentDocuments = refs.length ? await db.getAll(...refs) : [];
      const batch = db.batch();
      currentDocuments.forEach((current, index) => {
        const backup = hierarchyChunk[index].data();
        const currentData = current.data() || {};
        if (!current.exists || currentData.lastClientMergeManifestId !== manifestId) {
          skippedHierarchyRecords += 1;
          return;
        }
        if (backup.existed !== true) {
          batch.delete(current.ref);
          removedHierarchyRecords += 1;
          return;
        }
        batch.update(current.ref, restoreFieldPatch(
          (backup.data || {}) as Record<string, unknown>,
          Array.isArray(backup.touchedFields) ? backup.touchedFields.map(String) : [],
        ) as any);
        restoredHierarchyRecords += 1;
      });
      await batch.commit();
    }

    const clientBatch = db.batch();
    let restoredClients = 0;
    let skippedClients = 0;
    for (const backup of clientBackups.docs) {
      const value = backup.data();
      const clientId = String(value.clientId || backup.id);
      const clientRef = db.collection('clients').doc(clientId);
      const current = await clientRef.get();
      const currentData = current.data() || {};
      const isCanonical = clientId === String(manifestData.canonicalClientId || '');
      const belongsToManifest = isCanonical
        ? currentData.lastClientMergeManifestId === manifestId
        : currentData.mergeManifestId === manifestId;
      if (!current.exists || !belongsToManifest) {
        skippedClients += 1;
        continue;
      }
      clientBatch.update(clientRef, restoreFieldPatch(
        (value.data || {}) as Record<string, unknown>,
        Array.isArray(value.touchedFields) ? value.touchedFields.map(String) : [],
      ) as any);
      restoredClients += 1;
    }
    const rolledBackAt = nowIso();
    clientBatch.set(manifestRef, {
      status: 'ROLLED_BACK',
      rolledBackAt,
      rolledBackBy: actor.uid,
      rollbackAvailable: false,
      rollbackResult: {
        restoredClients,
        skippedClients,
        restoredDependencies,
        skippedDependencies,
        restoredHierarchyRecords,
        removedHierarchyRecords,
        skippedHierarchyRecords,
      },
    }, { merge: true });
    const mergeFingerprint = text(manifestData.expectedFingerprint);
    if (mergeFingerprint) {
      clientBatch.set(db.collection('clientMergeExecutionLocks').doc(mergeFingerprint), {
        status: 'ROLLED_BACK',
        manifestId,
        rolledBackAt,
        rolledBackBy: actor.uid,
      }, { merge: true });
    }
    const approvalId = text(manifestData.approvalId);
    if (approvalId) {
      clientBatch.set(db.collection('clientMergeApprovals').doc(approvalId), {
        status: 'ROLLED_BACK',
        rolledBackManifestId: manifestId,
        rolledBackAt,
        rolledBackBy: actor.uid,
      }, { merge: true });
    }
    await clientBatch.commit();
    await persistAuditEvent({
      action: 'CLIENT_MERGE_ROLLED_BACK',
      manifestId,
      actorId: actor.uid,
      restoredClients,
      skippedClients,
      restoredDependencies,
      skippedDependencies,
      restoredHierarchyRecords,
      removedHierarchyRecords,
      skippedHierarchyRecords,
    });
    return {
      success: true,
      manifestId,
      restoredClients,
      skippedClients,
      restoredDependencies,
      skippedDependencies,
      restoredHierarchyRecords,
      removedHierarchyRecords,
      skippedHierarchyRecords,
    };
  });
