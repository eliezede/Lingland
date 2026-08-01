import { randomBytes } from 'node:crypto';
import axios from 'axios';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import { writeAuditEvent } from '../audit/auditWriter';
import {
  appendXeroResultToReturnUrl,
  buildXeroAuthorizationUrl,
  createOAuthState,
  decryptXeroTokenBundle,
  encryptXeroTokenBundle,
  EncryptedXeroTokenBundle,
  hashOAuthState,
  normalizeXeroConnections,
  sanitizeIntegrationReturnUrl,
  tokenResponseToBundle,
  XERO_REDIRECT_URI,
  XERO_SCOPES,
  XeroConnectionOption,
  XeroTokenBundle,
} from './xeroCore';

const db = admin.firestore();
const INTEGRATION_REF = db.collection('accountingIntegrations').doc('xero');
const OAUTH_STATE_COLLECTION = db.collection('xeroOAuthStates');
const XERO_SECRETS = ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET', 'XERO_TOKEN_ENCRYPTION_KEY'];
const XERO_RUNTIME = { timeoutSeconds: 60, memory: '256MB' as const, secrets: XERO_SECRETS };
const TOKEN_URL = 'https://identity.xero.com/connect/token';
const REVOCATION_URL = 'https://identity.xero.com/connect/revocation';
const CONNECTIONS_URL = 'https://api.xero.com/connections';

interface ActiveAdmin {
  uid: string;
  role: 'ADMIN' | 'SUPER_ADMIN';
  organizationId: string;
}

const nowIso = () => new Date().toISOString();
const text = (value: unknown, max = 500) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isConfiguredSecret = (name: string) => {
  const value = process.env[name]?.trim();
  return Boolean(value && value !== 'NOT_CONFIGURED');
};

const secret = (name: 'XERO_CLIENT_ID' | 'XERO_CLIENT_SECRET' | 'XERO_TOKEN_ENCRYPTION_KEY') => {
  const value = process.env[name]?.trim();
  if (!value || value === 'NOT_CONFIGURED') {
    throw new functions.https.HttpsError('failed-precondition', `${name} is not configured in Firebase Secret Manager.`);
  }
  return value;
};

const assertActiveAdmin = async (uid?: string, superAdminOnly = false): Promise<ActiveAdmin> => {
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
  const user = await db.collection('users').doc(uid).get();
  const data = user.data() || {};
  const role = text(data.role, 40).toUpperCase();
  if (!user.exists || data.status !== 'ACTIVE' || !['ADMIN', 'SUPER_ADMIN'].includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only active administrators can view accounting integrations.');
  }
  if (superAdminOnly && role !== 'SUPER_ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Only a super administrator can change the Xero connection.');
  }
  return {
    uid,
    role: role as ActiveAdmin['role'],
    organizationId: text(data.organizationId, 160) || 'lingland-main',
  };
};

const writeXeroAudit = async (
  actor: ActiveAdmin,
  action: string,
  changedFields: string[],
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) => {
  const [settings, eventRef] = await Promise.all([
    db.collection('system').doc('settings').get(),
    Promise.resolve(db.collection('auditEvents').doc()),
  ]);
  await writeAuditEvent(eventRef.id, {
    entityType: 'accountingIntegration',
    entityId: 'xero',
    action,
    actorId: actor.uid,
    actorRole: actor.role,
    source: 'ADMIN_INTEGRATIONS',
    communicationMode: text(settings.data()?.platformMode?.communicationMode || 'SUPPRESSED', 40).toUpperCase(),
    syncRunId: '',
    changedFields,
    before,
    after,
    organizationId: actor.organizationId,
    bookingId: '',
    createdAt: nowIso(),
  });
};

const basicAuth = () => Buffer.from(`${secret('XERO_CLIENT_ID')}:${secret('XERO_CLIENT_SECRET')}`).toString('base64');

const providerError = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) return fallback;
  const data = error.response?.data && typeof error.response.data === 'object'
    ? error.response.data as Record<string, unknown>
    : {};
  return text(data.error_description || data.Message || data.message || data.error, 240)
    || (error.response?.status ? `${fallback} (HTTP ${error.response.status})` : fallback);
};

const exchangeAuthorizationCode = async (code: string) => {
  const response = await axios.post(TOKEN_URL, new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: XERO_REDIRECT_URI,
  }).toString(), {
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    timeout: 15000,
  });
  return tokenResponseToBundle(response.data as Record<string, unknown>);
};

const refreshOAuthToken = async (refreshToken: string) => {
  const response = await axios.post(TOKEN_URL, new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }).toString(), {
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    timeout: 15000,
  });
  return tokenResponseToBundle(response.data as Record<string, unknown>);
};

const fetchConnections = async (accessToken: string) => {
  const response = await axios.get(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    timeout: 15000,
  });
  return normalizeXeroConnections(response.data);
};

const fetchOrganisation = async (accessToken: string, tenantId: string) => {
  const response = await axios.get('https://api.xero.com/api.xro/2.0/Organisation', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
    timeout: 15000,
  });
  const payload = response.data && typeof response.data === 'object'
    ? response.data as Record<string, unknown>
    : {};
  const organisations = Array.isArray(payload.Organisations) ? payload.Organisations : [];
  const organisation = organisations[0] && typeof organisations[0] === 'object'
    ? organisations[0] as Record<string, unknown>
    : {};
  return {
    name: text(organisation.Name, 200),
    legalName: text(organisation.LegalName, 200),
    countryCode: text(organisation.CountryCode, 20),
    baseCurrency: text(organisation.BaseCurrency, 20),
    organisationType: text(organisation.OrganisationType, 80),
    registrationNumber: text(organisation.RegistrationNumber, 100),
    shortCode: text(organisation.ShortCode, 80),
  };
};

const publicStatus = (data: Record<string, unknown>, actor: ActiveAdmin) => ({
  provider: 'XERO' as const,
  configured: XERO_SECRETS.every(isConfiguredSecret),
  status: text(data.status, 60).toUpperCase() || 'NOT_CONNECTED',
  mode: 'READ_ONLY' as const,
  syncEnabled: false,
  liveWriteEnabled: false,
  aiDataUseEnabled: false,
  scopes: XERO_SCOPES,
  redirectUri: XERO_REDIRECT_URI,
  tenant: data.tenant && typeof data.tenant === 'object' ? data.tenant : null,
  organisation: data.organisation && typeof data.organisation === 'object' ? data.organisation : null,
  connectionOptions: Array.isArray(data.connectionOptions) ? data.connectionOptions : [],
  connectedAt: text(data.connectedAt, 80) || null,
  connectedBy: text(data.connectedBy, 160) || null,
  lastHealthCheckAt: text(data.lastHealthCheckAt, 80) || null,
  lastHealthCheckStatus: text(data.lastHealthCheckStatus, 40) || 'NOT_TESTED',
  lastHealthCheckMessage: text(data.lastHealthCheckMessage, 240) || null,
  tokenExpiresAt: text(data.tokenExpiresAt, 80) || null,
  updatedAt: text(data.updatedAt, 80) || null,
  viewer: { role: actor.role, canManage: actor.role === 'SUPER_ADMIN' },
});

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] || character));
const callbackFailurePage = (message: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Xero connection</title></head><body style="font-family:system-ui;padding:40px;color:#0f172a"><h1>Xero connection could not be completed</h1><p>${escapeHtml(text(message, 240))}</p><p>Return to Lingland Administration and start the connection again.</p></body></html>`;

const markOAuthStateConsumed = async (stateHash: string) => db.runTransaction(async transaction => {
  const ref = OAUTH_STATE_COLLECTION.doc(stateHash);
  const snapshot = await transaction.get(ref);
  const data = snapshot.data() || {};
  if (!snapshot.exists || data.consumedAt) throw new Error('This Xero connection request is invalid or has already been used.');
  if (Date.parse(text(data.expiresAt, 80)) <= Date.now()) throw new Error('This Xero connection request has expired.');
  transaction.update(ref, { consumedAt: nowIso() });
  return data;
});

const ensureFreshToken = async (forceRefresh = false): Promise<{ bundle: XeroTokenBundle; data: Record<string, unknown> }> => {
  const initial = await INTEGRATION_REF.get();
  const initialData = initial.data() || {};
  if (!initial.exists || !initialData.encryptedTokens) {
    throw new functions.https.HttpsError('failed-precondition', 'Xero is not connected.');
  }
  let bundle = decryptXeroTokenBundle(
    initialData.encryptedTokens as EncryptedXeroTokenBundle,
    secret('XERO_TOKEN_ENCRYPTION_KEY'),
  );
  if (!forceRefresh && Date.parse(bundle.expiresAt) > Date.now() + 2 * 60 * 1000) {
    return { bundle, data: initialData };
  }

  const lockId = randomBytes(16).toString('hex');
  const acquired = await db.runTransaction(async transaction => {
    const current = await transaction.get(INTEGRATION_REF);
    const data = current.data() || {};
    if (!current.exists || !data.encryptedTokens) throw new Error('Xero is not connected.');
    const currentBundle = decryptXeroTokenBundle(
      data.encryptedTokens as EncryptedXeroTokenBundle,
      secret('XERO_TOKEN_ENCRYPTION_KEY'),
    );
    if (!forceRefresh && Date.parse(currentBundle.expiresAt) > Date.now() + 2 * 60 * 1000) {
      return { refresh: false, bundle: currentBundle, data };
    }
    const lock = data.refreshLock && typeof data.refreshLock === 'object'
      ? data.refreshLock as Record<string, unknown>
      : {};
    if (Date.parse(text(lock.expiresAt, 80)) > Date.now()) {
      throw new functions.https.HttpsError('unavailable', 'The Xero token is already being refreshed. Try again in a moment.');
    }
    transaction.update(INTEGRATION_REF, {
      refreshLock: { id: lockId, expiresAt: new Date(Date.now() + 60_000).toISOString() },
      updatedAt: nowIso(),
    });
    return { refresh: true, bundle: currentBundle, data };
  });

  if (!acquired.refresh) return { bundle: acquired.bundle, data: acquired.data };
  bundle = acquired.bundle;
  try {
    const refreshed = await refreshOAuthToken(bundle.refreshToken);
    const encryptedTokens = encryptXeroTokenBundle(refreshed, secret('XERO_TOKEN_ENCRYPTION_KEY'));
    await db.runTransaction(async transaction => {
      const current = await transaction.get(INTEGRATION_REF);
      const lock = current.data()?.refreshLock || {};
      if (lock.id !== lockId) throw new Error('The Xero refresh lock changed before tokens were saved.');
      transaction.update(INTEGRATION_REF, {
        encryptedTokens,
        tokenExpiresAt: refreshed.expiresAt,
        refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
        tokenRotatedAt: nowIso(),
        refreshLock: admin.firestore.FieldValue.delete(),
        updatedAt: nowIso(),
      });
    });
    return { bundle: refreshed, data: acquired.data };
  } catch (error) {
    await INTEGRATION_REF.set({
      refreshLock: admin.firestore.FieldValue.delete(),
      lastHealthCheckAt: nowIso(),
      lastHealthCheckStatus: 'ERROR',
      lastHealthCheckMessage: providerError(error, 'Xero token refresh failed.'),
      updatedAt: nowIso(),
    }, { merge: true });
    throw error;
  }
};

export const getXeroIntegrationStatus = functions.runWith(XERO_RUNTIME).https.onCall(async (_data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid);
  const snapshot = await INTEGRATION_REF.get();
  return publicStatus(snapshot.data() || {}, actor);
});

export const startXeroConnection = functions.runWith(XERO_RUNTIME).https.onCall(async (data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid, true);
  const clientId = secret('XERO_CLIENT_ID');
  const state = createOAuthState();
  const stateHash = hashOAuthState(state);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const returnUrl = sanitizeIntegrationReturnUrl(data?.returnUrl);
  const beforeSnapshot = await INTEGRATION_REF.get();
  const before = beforeSnapshot.exists
    ? { status: beforeSnapshot.data()?.status, tenant: beforeSnapshot.data()?.tenant || null }
    : null;

  await OAUTH_STATE_COLLECTION.doc(stateHash).set(clean({
    actorId: actor.uid,
    actorRole: actor.role,
    organizationId: actor.organizationId,
    returnUrl,
    createdAt,
    expiresAt,
    consumedAt: null,
  }));
  await INTEGRATION_REF.set({
    provider: 'XERO',
    mode: 'READ_ONLY',
    syncEnabled: false,
    liveWriteEnabled: false,
    aiDataUseEnabled: false,
    scopes: XERO_SCOPES,
    connectionStartedAt: createdAt,
    connectionStartedBy: actor.uid,
    updatedAt: createdAt,
  }, { merge: true });
  await writeXeroAudit(actor, 'XERO_CONNECTION_STARTED', ['connectionStartedAt'], before, {
    status: beforeSnapshot.data()?.status || 'NOT_CONNECTED',
    mode: 'READ_ONLY',
    scopes: XERO_SCOPES,
  });

  return {
    authorizationUrl: buildXeroAuthorizationUrl(clientId, state),
    expiresAt,
    redirectUri: XERO_REDIRECT_URI,
    scopes: XERO_SCOPES,
  };
});

export const xeroOAuthCallback = functions.runWith(XERO_RUNTIME).https.onRequest(async (request, response) => {
  if (request.method !== 'GET') {
    response.status(405).send('Method not allowed');
    return;
  }

  const state = text(request.query.state, 500);
  if (!state) {
    response.status(400).send(callbackFailurePage('Missing OAuth state.'));
    return;
  }

  let stateData: Record<string, unknown>;
  try {
    stateData = await markOAuthStateConsumed(hashOAuthState(state));
  } catch (error) {
    response.status(400).send(callbackFailurePage(error instanceof Error ? error.message : 'Invalid OAuth state.'));
    return;
  }

  const actor: ActiveAdmin = {
    uid: text(stateData.actorId, 160),
    role: text(stateData.actorRole, 40) === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN',
    organizationId: text(stateData.organizationId, 160) || 'lingland-main',
  };
  const stateRef = OAUTH_STATE_COLLECTION.doc(hashOAuthState(state));
  const returnUrl = sanitizeIntegrationReturnUrl(stateData.returnUrl);
  const oauthError = text(request.query.error_description || request.query.error, 240);
  if (oauthError) {
    await writeXeroAudit(actor, 'XERO_CONNECTION_CANCELLED', [], null, { reason: oauthError });
    await stateRef.delete();
    response.redirect(302, appendXeroResultToReturnUrl(returnUrl, 'cancelled', oauthError));
    return;
  }

  const code = text(request.query.code, 2000);
  if (!code) {
    await stateRef.delete();
    response.redirect(302, appendXeroResultToReturnUrl(returnUrl, 'error', 'Xero did not return an authorization code.'));
    return;
  }

  try {
    const bundle = await exchangeAuthorizationCode(code);
    const connections = await fetchConnections(bundle.accessToken);
    if (connections.length === 0) throw new Error('No Xero organisation was authorized.');
    const encryptedTokens = encryptXeroTokenBundle(bundle, secret('XERO_TOKEN_ENCRYPTION_KEY'));
    const connectedAt = nowIso();
    const shared = {
      provider: 'XERO',
      mode: 'READ_ONLY',
      syncEnabled: false,
      liveWriteEnabled: false,
      aiDataUseEnabled: false,
      scopes: XERO_SCOPES,
      encryptedTokens,
      tokenExpiresAt: bundle.expiresAt,
      refreshTokenExpiresAt: bundle.refreshTokenExpiresAt,
      connectedBy: actor.uid,
      updatedAt: connectedAt,
      lastHealthCheckStatus: 'NOT_TESTED',
      lastHealthCheckMessage: '',
    };

    if (connections.length === 1) {
      const tenant = connections[0];
      await INTEGRATION_REF.set(clean({
        ...shared,
        status: 'CONNECTED',
        tenant,
        connectionOptions: [],
        connectedAt,
      }), { merge: true });
      await writeXeroAudit(actor, 'XERO_CONNECTED', ['status', 'tenant', 'connectedAt'], null, {
        status: 'CONNECTED',
        tenant,
        mode: 'READ_ONLY',
      });
      await stateRef.delete();
      response.redirect(302, appendXeroResultToReturnUrl(returnUrl, 'connected'));
      return;
    }

    await INTEGRATION_REF.set(clean({
      ...shared,
      status: 'TENANT_SELECTION_REQUIRED',
      tenant: null,
      connectionOptions: connections,
      pendingSelectionAt: connectedAt,
    }), { merge: true });
    await writeXeroAudit(actor, 'XERO_TENANT_SELECTION_REQUIRED', ['status', 'connectionOptions'], null, {
      status: 'TENANT_SELECTION_REQUIRED',
      organisationCount: connections.length,
    });
    await stateRef.delete();
    response.redirect(302, appendXeroResultToReturnUrl(returnUrl, 'select-organisation'));
  } catch (error) {
    const message = providerError(error, error instanceof Error ? error.message : 'Xero authorization failed.');
    await INTEGRATION_REF.set({
      status: 'ERROR',
      lastHealthCheckAt: nowIso(),
      lastHealthCheckStatus: 'ERROR',
      lastHealthCheckMessage: message,
      updatedAt: nowIso(),
    }, { merge: true });
    await writeXeroAudit(actor, 'XERO_CONNECTION_FAILED', ['status'], null, { status: 'ERROR', message });
    await stateRef.delete();
    response.redirect(302, appendXeroResultToReturnUrl(returnUrl, 'error', message));
  }
});

export const selectXeroOrganisation = functions.runWith(XERO_RUNTIME).https.onCall(async (data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid, true);
  const connectionId = text(data?.connectionId, 100);
  const snapshot = await INTEGRATION_REF.get();
  const current = snapshot.data() || {};
  if (current.status !== 'TENANT_SELECTION_REQUIRED' || !current.encryptedTokens) {
    throw new functions.https.HttpsError('failed-precondition', 'There is no pending Xero organisation selection.');
  }
  const options = normalizeXeroConnections(current.connectionOptions);
  const tenant = options.find(option => option.connectionId === connectionId);
  if (!tenant) throw new functions.https.HttpsError('invalid-argument', 'Choose an authorised Xero organisation.');
  const connectedAt = nowIso();
  await INTEGRATION_REF.update({
    status: 'CONNECTED',
    tenant,
    connectionOptions: [],
    connectedAt,
    connectedBy: actor.uid,
    updatedAt: connectedAt,
  });
  await writeXeroAudit(actor, 'XERO_ORGANISATION_SELECTED', ['status', 'tenant'], {
    status: current.status,
  }, { status: 'CONNECTED', tenant });
  return publicStatus({ ...current, status: 'CONNECTED', tenant, connectionOptions: [], connectedAt }, actor);
});

export const testXeroConnection = functions.runWith(XERO_RUNTIME).https.onCall(async (_data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid);
  try {
    const { bundle, data } = await ensureFreshToken();
    const tenant = data.tenant && typeof data.tenant === 'object'
      ? data.tenant as XeroConnectionOption
      : null;
    if (!tenant?.tenantId) throw new Error('No Xero organisation has been selected.');
    const connections = await fetchConnections(bundle.accessToken);
    const liveConnection = connections.find(option => option.connectionId === tenant.connectionId || option.tenantId === tenant.tenantId);
    if (!liveConnection) throw new Error('The selected Xero organisation is no longer connected.');
    const organisation = await fetchOrganisation(bundle.accessToken, liveConnection.tenantId);
    const testedAt = nowIso();
    await INTEGRATION_REF.set({
      status: 'CONNECTED',
      tenant: liveConnection,
      organisation,
      lastHealthCheckAt: testedAt,
      lastHealthCheckStatus: 'CONNECTED',
      lastHealthCheckMessage: 'Read-only organisation access verified.',
      updatedAt: testedAt,
    }, { merge: true });
    await writeXeroAudit(actor, 'XERO_CONNECTION_TESTED', ['lastHealthCheckStatus', 'organisation'], null, {
      status: 'CONNECTED',
      tenant: liveConnection,
      organisation,
    });
    return {
      connected: true,
      testedAt,
      tenant: liveConnection,
      organisation,
      mode: 'READ_ONLY',
      syncEnabled: false,
    };
  } catch (error) {
    const message = providerError(error, error instanceof Error ? error.message : 'Xero connection test failed.');
    await INTEGRATION_REF.set({
      lastHealthCheckAt: nowIso(),
      lastHealthCheckStatus: 'ERROR',
      lastHealthCheckMessage: message,
      updatedAt: nowIso(),
    }, { merge: true });
    throw new functions.https.HttpsError('failed-precondition', message);
  }
});

export const disconnectXero = functions.runWith(XERO_RUNTIME).https.onCall(async (_data, context) => {
  const actor = await assertActiveAdmin(context.auth?.uid, true);
  const snapshot = await INTEGRATION_REF.get();
  const before = snapshot.data() || {};
  if (!snapshot.exists || !before.encryptedTokens) {
    throw new functions.https.HttpsError('failed-precondition', 'Xero is not connected.');
  }
  const { bundle, data } = await ensureFreshToken();
  const tenant = data.tenant && typeof data.tenant === 'object'
    ? data.tenant as XeroConnectionOption
    : null;

  try {
    if (tenant?.connectionId) {
      await axios.delete(`${CONNECTIONS_URL}/${encodeURIComponent(tenant.connectionId)}`, {
        headers: { Authorization: `Bearer ${bundle.accessToken}` },
        timeout: 15000,
      });
    }
    await axios.post(REVOCATION_URL, new URLSearchParams({ token: bundle.refreshToken }).toString(), {
      headers: {
        Authorization: `Basic ${basicAuth()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    });
  } catch (error) {
    throw new functions.https.HttpsError('unavailable', providerError(error, 'Xero could not be disconnected.'));
  }

  const disconnectedAt = nowIso();
  await INTEGRATION_REF.set({
    provider: 'XERO',
    status: 'NOT_CONNECTED',
    mode: 'READ_ONLY',
    syncEnabled: false,
    liveWriteEnabled: false,
    aiDataUseEnabled: false,
    tenant: admin.firestore.FieldValue.delete(),
    organisation: admin.firestore.FieldValue.delete(),
    connectionOptions: [],
    encryptedTokens: admin.firestore.FieldValue.delete(),
    tokenExpiresAt: admin.firestore.FieldValue.delete(),
    refreshTokenExpiresAt: admin.firestore.FieldValue.delete(),
    refreshLock: admin.firestore.FieldValue.delete(),
    disconnectedAt,
    disconnectedBy: actor.uid,
    lastHealthCheckAt: disconnectedAt,
    lastHealthCheckStatus: 'NOT_TESTED',
    lastHealthCheckMessage: '',
    updatedAt: disconnectedAt,
  }, { merge: true });
  await writeXeroAudit(actor, 'XERO_DISCONNECTED', ['status', 'tenant', 'encryptedTokens'], {
    status: before.status,
    tenant: before.tenant || null,
  }, { status: 'NOT_CONNECTED' });
  return { success: true, disconnectedAt };
});
