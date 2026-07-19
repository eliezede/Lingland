import { createHash } from 'node:crypto';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import { writeAuditEvent } from '../audit/auditWriter';
import { normalizeOrganizationName } from './clientIdentityAuditCore';

const db = admin.firestore();
const RUNTIME = { timeoutSeconds: 60, memory: '256MB' as const };
const AGENT_TYPES = new Set(['PERSON', 'SHARED_MAILBOX']);
const ACCESS_LEVELS = new Set(['AGENT', 'DEPARTMENT_MANAGER', 'CLIENT_FINANCE', 'CLIENT_MASTER']);
const AGENT_ROLES = new Set(['REQUESTER', 'FINANCE']);

const text = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
const stableId = (prefix: string, value: string) => `${prefix}_${createHash('sha1').update(value).digest('hex').slice(0, 20)}`;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ActiveAdmin {
  uid: string;
  role: 'ADMIN' | 'SUPER_ADMIN';
  organizationId: string;
}

const assertActiveAdmin = async (uid?: string): Promise<ActiveAdmin> => {
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
  const user = await db.collection('users').doc(uid).get();
  const data = user.data() || {};
  const role = text(data.role).toUpperCase();
  if (!user.exists || data.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only active administrators can manage client hierarchy.');
  }
  return {
    uid,
    role: role as ActiveAdmin['role'],
    organizationId: text(data.organizationId) || 'lingland-main',
  };
};

const assertCanonicalClient = async (clientId: string) => {
  const client = await db.collection('clients').doc(clientId).get();
  const data = client.data() || {};
  if (!client.exists) throw new functions.https.HttpsError('not-found', 'Client record not found.');
  if (text(data.recordState).toUpperCase() === 'MERGED' || text(data.mergedIntoClientId)) {
    throw new functions.https.HttpsError('failed-precondition', 'Open the canonical client before managing its hierarchy.');
  }
  return client;
};

const writeHierarchyAudit = async (
  actor: ActiveAdmin,
  entityType: string,
  entityId: string,
  action: string,
  changedFields: string[],
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
) => {
  const [settings, eventRef] = await Promise.all([
    db.collection('system').doc('settings').get(),
    Promise.resolve(db.collection('auditEvents').doc()),
  ]);
  await writeAuditEvent(eventRef.id, {
    entityType,
    entityId,
    action,
    actorId: actor.uid,
    actorRole: actor.role,
    source: 'ADMIN_CLIENT_CRM',
    communicationMode: text(settings.data()?.platformMode?.communicationMode || 'SUPPRESSED').toUpperCase(),
    syncRunId: '',
    changedFields,
    before,
    after,
    organizationId: actor.organizationId,
    bookingId: '',
    createdAt: new Date().toISOString(),
  });
};

export const saveClientDepartment = functions.runWith(RUNTIME).https.onCall(async (data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid);
  const clientId = text(data?.clientId);
  const requestedId = text(data?.departmentId);
  const name = text(data?.name);
  const normalizedName = normalizeOrganizationName(name);
  const locationName = text(data?.locationName);
  const billingAddress = text(data?.billingAddress);
  const status = text(data?.status || 'ACTIVE').toUpperCase();

  if (!clientId || name.length < 2 || name.length > 120 || !normalizedName) {
    throw new functions.https.HttpsError('invalid-argument', 'Client and a valid department name are required.');
  }
  if (!['ACTIVE', 'ARCHIVED'].includes(status)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid department status.');
  }
  await assertCanonicalClient(clientId);

  const existingDepartments = await db.collection('clientDepartments').where('clientId', '==', clientId).get();
  const duplicate = existingDepartments.docs.find(document => (
    document.id !== requestedId
    && text(document.data().normalizedName) === normalizedName
    && text(document.data().status || 'ACTIVE').toUpperCase() !== 'ARCHIVED'
  ));
  if (duplicate) throw new functions.https.HttpsError('already-exists', 'An active department with this name already exists.');

  const departmentId = requestedId || stableId('client_department', `${clientId}|${normalizedName}`);
  const ref = db.collection('clientDepartments').doc(departmentId);
  const existing = await ref.get();
  if (existing.exists && text(existing.data()?.clientId) !== clientId) {
    throw new functions.https.HttpsError('permission-denied', 'This department belongs to another client.');
  }

  const createdAt = new Date().toISOString();
  const patch = {
    clientId,
    name,
    normalizedName,
    locationName,
    billingAddress,
    status,
    organizationId: actor.organizationId,
    sourceSystem: text(existing.data()?.sourceSystem) || 'STAFF_MANUAL',
    syncStatus: text(existing.data()?.syncStatus) || 'LOCAL_ONLY',
    updatedAt: createdAt,
    updatedBy: actor.uid,
    ...(!existing.exists ? { createdAt, createdBy: actor.uid } : {}),
  };
  await ref.set(patch, { merge: true });
  await writeHierarchyAudit(
    actor,
    'clientDepartment',
    departmentId,
    existing.exists ? 'CLIENT_DEPARTMENT_UPDATED' : 'CLIENT_DEPARTMENT_CREATED',
    Object.keys(patch),
    existing.exists ? existing.data() || null : null,
    patch,
  );
  return { id: departmentId, ...patch };
});

export const saveClientAgentMembership = functions.runWith(RUNTIME).https.onCall(async (data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid);
  const clientId = text(data?.clientId);
  const requestedAgentId = text(data?.agentId);
  const displayName = text(data?.displayName);
  const normalizedEmail = text(data?.email).toLowerCase();
  const agentType = text(data?.agentType || 'PERSON').toUpperCase();
  const accessLevel = text(data?.accessLevel || 'AGENT').toUpperCase();
  const roles = unique((Array.isArray(data?.roles) ? data.roles : []).map((role: unknown) => text(role).toUpperCase()))
    .filter(role => AGENT_ROLES.has(role));
  const departmentIds = unique((Array.isArray(data?.departmentIds) ? data.departmentIds : []).map(text));

  if (!clientId || displayName.length < 2 || displayName.length > 120 || !emailPattern.test(normalizedEmail)) {
    throw new functions.https.HttpsError('invalid-argument', 'Client, display name and a valid email are required.');
  }
  if (!AGENT_TYPES.has(agentType) || !ACCESS_LEVELS.has(accessLevel) || roles.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Choose a valid identity type, role and access level.');
  }
  await assertCanonicalClient(clientId);

  const departmentDocuments = await Promise.all(departmentIds.map(departmentId => (
    db.collection('clientDepartments').doc(departmentId).get()
  )));
  if (departmentDocuments.some(document => !document.exists || text(document.data()?.clientId) !== clientId)) {
    throw new functions.https.HttpsError('invalid-argument', 'Every selected department must belong to this client.');
  }

  const emailMatches = await db.collection('clientAgents').where('normalizedEmail', '==', normalizedEmail).limit(2).get();
  if (emailMatches.size > 1) {
    throw new functions.https.HttpsError('failed-precondition', 'Multiple agent identities already use this email. Resolve them in Identity Audit first.');
  }
  const matchedAgent = emailMatches.docs[0];
  if (requestedAgentId && matchedAgent && matchedAgent.id !== requestedAgentId) {
    throw new functions.https.HttpsError('already-exists', 'This email already belongs to another agent identity.');
  }

  const agentId = requestedAgentId || matchedAgent?.id || stableId('client_agent', normalizedEmail);
  const agentRef = db.collection('clientAgents').doc(agentId);
  const agentDocument = requestedAgentId ? await agentRef.get() : matchedAgent || await agentRef.get();
  const agentBefore = agentDocument.exists ? agentDocument.data() || {} : null;
  const previousEmail = text(agentBefore?.normalizedEmail);
  if (requestedAgentId && previousEmail && previousEmail !== normalizedEmail && matchedAgent) {
    throw new functions.https.HttpsError('already-exists', 'The new email already belongs to another agent identity.');
  }

  const membershipId = stableId('client_membership', `${clientId}|${agentId}`);
  const membershipRef = db.collection('clientMemberships').doc(membershipId);
  const membershipDocument = await membershipRef.get();
  const membershipBefore = membershipDocument.exists ? membershipDocument.data() || {} : null;
  const linkedUserId = text(agentBefore?.userId || membershipBefore?.userId);
  if (linkedUserId && previousEmail && previousEmail !== normalizedEmail) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'This agent email is linked to a portal account. Update the account identity before changing it here.',
    );
  }
  const createdAt = new Date().toISOString();
  const agentPatch = {
    displayName,
    names: unique([...(Array.isArray(agentBefore?.names) ? agentBefore.names.map(text) : []), displayName]),
    email: normalizedEmail,
    normalizedEmail,
    agentType,
    roles: unique([...(Array.isArray(agentBefore?.roles) ? agentBefore.roles.map(text) : []), ...roles]),
    status: 'ACTIVE',
    organizationId: actor.organizationId,
    sourceSystem: text(agentBefore?.sourceSystem) || 'STAFF_MANUAL',
    syncStatus: text(agentBefore?.syncStatus) || 'LOCAL_ONLY',
    updatedAt: createdAt,
    updatedBy: actor.uid,
    ...(!agentDocument.exists ? { createdAt, createdBy: actor.uid } : {}),
  };
  const membershipPatch = {
    clientId,
    agentId,
    departmentIds,
    accessLevel,
    roles,
    status: 'ACTIVE',
    organizationId: actor.organizationId,
    sourceSystem: text(membershipBefore?.sourceSystem) || 'STAFF_MANUAL',
    syncStatus: text(membershipBefore?.syncStatus) || 'LOCAL_ONLY',
    updatedAt: createdAt,
    updatedBy: actor.uid,
    ...(!membershipDocument.exists ? { createdAt, createdBy: actor.uid } : {}),
  };

  const batch = db.batch();
  batch.set(agentRef, agentPatch, { merge: true });
  batch.set(membershipRef, membershipPatch, { merge: true });
  await batch.commit();
  await writeHierarchyAudit(
    actor,
    'clientMembership',
    membershipId,
    membershipDocument.exists ? 'CLIENT_MEMBERSHIP_UPDATED' : 'CLIENT_MEMBERSHIP_CREATED',
    unique([...Object.keys(agentPatch), ...Object.keys(membershipPatch)]),
    membershipBefore,
    { agent: agentPatch, membership: membershipPatch },
  );

  return {
    agent: { id: agentId, ...agentPatch },
    membership: { id: membershipId, ...membershipPatch },
  };
});

export const prepareClientAgentAccount = functions.runWith(RUNTIME).https.onCall(async (data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid);
  const clientId = text(data?.clientId);
  const agentId = text(data?.agentId);
  if (!clientId || !agentId) {
    throw new functions.https.HttpsError('invalid-argument', 'Client and agent are required.');
  }
  await assertCanonicalClient(clientId);

  const agentRef = db.collection('clientAgents').doc(agentId);
  const membershipId = stableId('client_membership', `${clientId}|${agentId}`);
  const membershipRef = db.collection('clientMemberships').doc(membershipId);
  const [agent, membership] = await Promise.all([agentRef.get(), membershipRef.get()]);
  const agentData = agent.data() || {};
  const membershipData = membership.data() || {};
  const normalizedEmail = text(agentData.normalizedEmail || agentData.email).toLowerCase();

  if (!agent.exists || !membership.exists || text(membershipData.clientId) !== clientId) {
    throw new functions.https.HttpsError('failed-precondition', 'Save this agent membership before preparing portal access.');
  }
  if (text(agentData.agentType).toUpperCase() !== 'PERSON') {
    throw new functions.https.HttpsError('failed-precondition', 'Shared mailboxes cannot receive portal accounts.');
  }
  if (!emailPattern.test(normalizedEmail)) {
    throw new functions.https.HttpsError('failed-precondition', 'This agent needs a valid email before portal access can be prepared.');
  }

  const userMatches = await db.collection('users').where('email', '==', normalizedEmail).limit(2).get();
  if (userMatches.size > 1) {
    throw new functions.https.HttpsError('failed-precondition', 'Multiple user accounts use this email. Resolve them before linking access.');
  }
  const existingUser = userMatches.docs[0] || null;
  const existingUserData = existingUser?.data() || {};
  const existingRole = text(existingUserData.role).toUpperCase();
  if (existingUser && existingRole && existingRole !== 'CLIENT') {
    throw new functions.https.HttpsError('failed-precondition', 'This email already belongs to a non-client platform account.');
  }
  const existingProfileId = text(existingUserData.clientId || existingUserData.profileId);
  if (existingProfileId && existingProfileId !== clientId) {
    const existingProfile = await db.collection('clients').doc(existingProfileId).get();
    if (text(existingProfile.data()?.mergedIntoClientId) !== clientId) {
      throw new functions.https.HttpsError('failed-precondition', 'This user account belongs to another canonical client.');
    }
  }

  const now = new Date().toISOString();
  const userId = existingUser?.id || stableId('client_user', normalizedEmail);
  const userRef = db.collection('users').doc(userId);
  const userPatch = {
    id: userId,
    email: normalizedEmail,
    displayName: text(agentData.displayName) || normalizedEmail.split('@')[0],
    role: 'CLIENT',
    status: text(existingUserData.status) || 'IMPORTED',
    profileId: clientId,
    clientId,
    clientAgentId: agentId,
    clientMembershipId: membershipId,
    accountSource: text(existingUserData.accountSource) || 'ADMIN_CLIENT_CRM',
    updatedAt: now,
    updatedBy: actor.uid,
    ...(!existingUser ? { createdAt: now, createdBy: actor.uid } : {}),
  };

  const batch = db.batch();
  batch.set(userRef, userPatch, { merge: true });
  batch.set(agentRef, { userId, updatedAt: now, updatedBy: actor.uid }, { merge: true });
  batch.set(membershipRef, { userId, updatedAt: now, updatedBy: actor.uid }, { merge: true });
  await batch.commit();
  await writeHierarchyAudit(
    actor,
    'clientMembership',
    membershipId,
    existingUser ? 'CLIENT_AGENT_ACCOUNT_LINKED' : 'CLIENT_AGENT_ACCOUNT_PREPARED',
    ['userId', 'clientId', 'clientAgentId', 'clientMembershipId', 'profileId', 'status'],
    existingUser ? existingUserData : null,
    userPatch,
  );

  return {
    user: userPatch,
    agentId,
    membershipId,
    activationRequired: userPatch.status !== 'ACTIVE',
    communicationSent: false,
  };
});
