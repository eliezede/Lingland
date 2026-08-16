"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyXeroReconciliationLinks = exports.getXeroReconciliationRun = exports.previewXeroReconciliation = exports.disconnectXero = exports.testXeroConnection = exports.selectXeroOrganisation = exports.xeroOAuthCallback = exports.startXeroConnection = exports.getXeroIntegrationStatus = void 0;
const node_crypto_1 = require("node:crypto");
const axios_1 = __importDefault(require("axios"));
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const auditWriter_1 = require("../audit/auditWriter");
const xeroCore_1 = require("./xeroCore");
const xeroReconciliationCore_1 = require("./xeroReconciliationCore");
const db = admin.firestore();
const INTEGRATION_REF = db.collection('accountingIntegrations').doc('xero');
const OAUTH_STATE_COLLECTION = db.collection('xeroOAuthStates');
const XERO_SECRETS = ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET', 'XERO_TOKEN_ENCRYPTION_KEY'];
const XERO_RUNTIME = { timeoutSeconds: 60, memory: '256MB', secrets: XERO_SECRETS };
const XERO_RECONCILIATION_RUNTIME = { timeoutSeconds: 540, memory: '1GB', secrets: XERO_SECRETS };
const TOKEN_URL = 'https://identity.xero.com/connect/token';
const REVOCATION_URL = 'https://identity.xero.com/connect/revocation';
const CONNECTIONS_URL = 'https://api.xero.com/connections';
const ACCOUNTING_API_URL = 'https://api.xero.com/api.xro/2.0';
const RECONCILIATION_RUNS = db.collection('xeroReconciliationRuns');
const RECONCILIATION_PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;
const nowIso = () => new Date().toISOString();
const text = (value, max = 500) => String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const clean = (value) => JSON.parse(JSON.stringify(value));
const isConfiguredSecret = (name) => {
    const value = process.env[name]?.trim();
    return Boolean(value && value !== 'NOT_CONFIGURED');
};
const secret = (name) => {
    const value = process.env[name]?.trim();
    if (!value || value === 'NOT_CONFIGURED') {
        throw new functions.https.HttpsError('failed-precondition', `${name} is not configured in Firebase Secret Manager.`);
    }
    return value;
};
const assertActiveAdmin = async (uid, superAdminOnly = false) => {
    if (!uid)
        throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
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
        role: role,
        organizationId: text(data.organizationId, 160) || 'lingland-main',
    };
};
const writeXeroAudit = async (actor, action, changedFields, before, after) => {
    const [settings, eventRef] = await Promise.all([
        db.collection('system').doc('settings').get(),
        Promise.resolve(db.collection('auditEvents').doc()),
    ]);
    await (0, auditWriter_1.writeAuditEvent)(eventRef.id, {
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
const providerError = (error, fallback) => {
    if (!axios_1.default.isAxiosError(error))
        return fallback;
    const data = error.response?.data && typeof error.response.data === 'object'
        ? error.response.data
        : {};
    return text(data.error_description || data.Message || data.message || data.error, 240)
        || (error.response?.status ? `${fallback} (HTTP ${error.response.status})` : fallback);
};
const exchangeAuthorizationCode = async (code) => {
    const response = await axios_1.default.post(TOKEN_URL, new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: xeroCore_1.XERO_REDIRECT_URI,
    }).toString(), {
        headers: {
            Authorization: `Basic ${basicAuth()}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        timeout: 15000,
    });
    return (0, xeroCore_1.tokenResponseToBundle)(response.data);
};
const refreshOAuthToken = async (refreshToken) => {
    const response = await axios_1.default.post(TOKEN_URL, new URLSearchParams({
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
    return (0, xeroCore_1.tokenResponseToBundle)(response.data);
};
const fetchConnections = async (accessToken) => {
    const response = await axios_1.default.get(CONNECTIONS_URL, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        timeout: 15000,
    });
    return (0, xeroCore_1.normalizeXeroConnections)(response.data);
};
const fetchOrganisation = async (accessToken, tenantId) => {
    const response = await axios_1.default.get('https://api.xero.com/api.xro/2.0/Organisation', {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'xero-tenant-id': tenantId,
            Accept: 'application/json',
        },
        timeout: 15000,
    });
    const payload = response.data && typeof response.data === 'object'
        ? response.data
        : {};
    const organisations = Array.isArray(payload.Organisations) ? payload.Organisations : [];
    const organisation = organisations[0] && typeof organisations[0] === 'object'
        ? organisations[0]
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
const assertCommunicationsSuppressed = async () => {
    const settings = await db.collection('system').doc('settings').get();
    const mode = text(settings.data()?.platformMode?.communicationMode || 'SUPPRESSED', 40).toUpperCase();
    if (mode !== 'SUPPRESSED') {
        throw new functions.https.HttpsError('failed-precondition', 'Xero reconciliation links require Communication Mode SUPPRESSED.');
    }
};
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const validateReconciliationScope = (input) => {
    const source = input && typeof input === 'object' ? input : {};
    const fromDate = text(source.fromDate, 10);
    const toDate = text(source.toDate, 10);
    const importRunId = text(source.importRunId, 80);
    if (!ISO_DATE_PATTERN.test(fromDate) || !ISO_DATE_PATTERN.test(toDate)) {
        throw new functions.https.HttpsError('invalid-argument', 'A valid reconciliation date range is required.');
    }
    const fromTime = Date.parse(`${fromDate}T00:00:00.000Z`);
    const toTime = Date.parse(`${toDate}T23:59:59.999Z`);
    if (fromTime > toTime)
        throw new functions.https.HttpsError('invalid-argument', 'The reconciliation start date must be before the end date.');
    if (toTime - fromTime > 550 * 24 * 60 * 60 * 1000) {
        throw new functions.https.HttpsError('invalid-argument', 'Reconciliation previews are limited to 18 months.');
    }
    return { fromDate, toDate, importRunId };
};
const resolveFinanceImportRun = async (actor, requestedRunId) => {
    const candidates = requestedRunId
        ? [await db.collection('accountingImportRuns').doc(requestedRunId).get()]
        : (await db.collection('accountingImportRuns').orderBy('createdAt', 'desc').limit(30).get()).docs;
    const match = candidates.find(snapshot => {
        const data = snapshot.data() || {};
        const counts = data.manifest?.expectedModuleCounts || {};
        return snapshot.exists
            && text(data.organizationId, 160) === actor.organizationId
            && text(data.status, 40) === 'COMMITTED'
            && (Number(counts.salesDocuments) > 0 || Number(counts.purchaseDocuments) > 0);
    });
    if (!match) {
        throw new functions.https.HttpsError('failed-precondition', requestedRunId
            ? 'The selected canonical finance import is not committed or does not belong to this organisation.'
            : 'Commit a canonical Sage finance import before reconciling with Xero.');
    }
    return match.id;
};
const xeroDateFilter = (fromDate, toDate) => {
    const from = fromDate.split('-').map(Number);
    const to = toDate.split('-').map(Number);
    return `Date>=DateTime(${from[0]},${from[1]},${from[2]})&&Date<=DateTime(${to[0]},${to[1]},${to[2]})`;
};
const fetchPagedXeroResource = async (resource, responseKey, accessToken, tenantId, extraParams = {}) => {
    const records = [];
    const pageSize = 500;
    for (let page = 1; page <= 200; page += 1) {
        const response = await axios_1.default.get(`${ACCOUNTING_API_URL}/${resource}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'xero-tenant-id': tenantId,
                Accept: 'application/json',
            },
            params: {
                page,
                pageSize,
                ...(resource === 'Contacts' || resource === 'Invoices' ? { summaryOnly: 'true' } : {}),
                ...extraParams,
            },
            timeout: 30000,
        });
        const payload = response.data && typeof response.data === 'object'
            ? response.data
            : {};
        const pageRecords = Array.isArray(payload[responseKey])
            ? payload[responseKey].filter((record) => Boolean(record && typeof record === 'object' && !Array.isArray(record)))
            : [];
        records.push(...pageRecords);
        if (pageRecords.length < pageSize)
            return records;
    }
    throw new functions.https.HttpsError('resource-exhausted', `Xero ${resource} exceeded the guarded pagination limit.`);
};
const loadLocalReconciliationData = async (actor, fromDate, toDate, importRunId) => {
    const documentSnapshot = await db.collection('accountingDocuments')
        .where('issueDate', '>=', fromDate)
        .where('issueDate', '<=', toDate)
        .get();
    const documents = documentSnapshot.docs
        .map(document => ({ id: document.id, ...document.data() }))
        .filter(document => text(document.organizationId, 160) === actor.organizationId)
        .filter(document => text(document.lastImportRunId, 80) === importRunId)
        .filter(document => ['SALES_INVOICE', 'PURCHASE_BILL'].includes(text(document.documentType, 40).toUpperCase()));
    const contactIds = Array.from(new Set(documents.map(document => text(document.accountingContactId, 180)).filter(Boolean)));
    const contacts = [];
    for (let offset = 0; offset < contactIds.length; offset += 100) {
        const refs = contactIds.slice(offset, offset + 100).map(id => db.collection('accountingContacts').doc(id));
        if (!refs.length)
            continue;
        const snapshots = await db.getAll(...refs);
        contacts.push(...snapshots.filter(snapshot => snapshot.exists).map(snapshot => ({ id: snapshot.id, ...snapshot.data() })));
    }
    return { documents, contacts };
};
const matchDocumentId = (item) => `${item.entityType.toLowerCase()}_${item.localId}`.slice(0, 1500);
const publicReconciliationRun = async (snapshot) => {
    if (!snapshot.exists)
        return null;
    const matches = await snapshot.ref.collection('matches').get();
    const issues = matches.docs
        .map(document => document.data())
        .filter(item => item.status !== 'EXACT')
        .slice(0, 100);
    const data = snapshot.data() || {};
    return {
        runId: snapshot.id,
        status: text(data.status, 60),
        scope: data.scope || null,
        previewHash: text(data.previewHash, 64),
        summary: data.summary || null,
        createdAt: text(data.createdAt, 80),
        completedAt: text(data.completedAt, 80) || null,
        expiresAt: text(data.expiresAt, 80) || null,
        issueCount: Number(data.issueCount) || issues.length,
        issues,
        issuesTruncated: Number(data.issueCount) > issues.length,
        applySummary: data.applySummary || null,
    };
};
const publicStatus = (data, actor) => ({
    provider: 'XERO',
    configured: XERO_SECRETS.every(isConfiguredSecret),
    status: text(data.status, 60).toUpperCase() || 'NOT_CONNECTED',
    mode: 'READ_ONLY',
    syncEnabled: false,
    liveWriteEnabled: false,
    aiDataUseEnabled: false,
    scopes: xeroCore_1.XERO_SCOPES,
    redirectUri: xeroCore_1.XERO_REDIRECT_URI,
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
const escapeHtml = (value) => value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] || character));
const callbackFailurePage = (message) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Xero connection</title></head><body style="font-family:system-ui;padding:40px;color:#0f172a"><h1>Xero connection could not be completed</h1><p>${escapeHtml(text(message, 240))}</p><p>Return to Lingland Administration and start the connection again.</p></body></html>`;
const markOAuthStateConsumed = async (stateHash) => db.runTransaction(async (transaction) => {
    const ref = OAUTH_STATE_COLLECTION.doc(stateHash);
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};
    if (!snapshot.exists || data.consumedAt)
        throw new Error('This Xero connection request is invalid or has already been used.');
    if (Date.parse(text(data.expiresAt, 80)) <= Date.now())
        throw new Error('This Xero connection request has expired.');
    transaction.update(ref, { consumedAt: nowIso() });
    return data;
});
const ensureFreshToken = async (forceRefresh = false) => {
    const initial = await INTEGRATION_REF.get();
    const initialData = initial.data() || {};
    if (!initial.exists || !initialData.encryptedTokens) {
        throw new functions.https.HttpsError('failed-precondition', 'Xero is not connected.');
    }
    let bundle = (0, xeroCore_1.decryptXeroTokenBundle)(initialData.encryptedTokens, secret('XERO_TOKEN_ENCRYPTION_KEY'));
    if (!forceRefresh && Date.parse(bundle.expiresAt) > Date.now() + 2 * 60 * 1000) {
        return { bundle, data: initialData };
    }
    const lockId = (0, node_crypto_1.randomBytes)(16).toString('hex');
    const acquired = await db.runTransaction(async (transaction) => {
        const current = await transaction.get(INTEGRATION_REF);
        const data = current.data() || {};
        if (!current.exists || !data.encryptedTokens)
            throw new Error('Xero is not connected.');
        const currentBundle = (0, xeroCore_1.decryptXeroTokenBundle)(data.encryptedTokens, secret('XERO_TOKEN_ENCRYPTION_KEY'));
        if (!forceRefresh && Date.parse(currentBundle.expiresAt) > Date.now() + 2 * 60 * 1000) {
            return { refresh: false, bundle: currentBundle, data };
        }
        const lock = data.refreshLock && typeof data.refreshLock === 'object'
            ? data.refreshLock
            : {};
        if (Date.parse(text(lock.expiresAt, 80)) > Date.now()) {
            throw new functions.https.HttpsError('unavailable', 'The Xero token is already being refreshed. Try again in a moment.');
        }
        transaction.update(INTEGRATION_REF, {
            refreshLock: { id: lockId, expiresAt: new Date(Date.now() + 60000).toISOString() },
            updatedAt: nowIso(),
        });
        return { refresh: true, bundle: currentBundle, data };
    });
    if (!acquired.refresh)
        return { bundle: acquired.bundle, data: acquired.data };
    bundle = acquired.bundle;
    try {
        const refreshed = await refreshOAuthToken(bundle.refreshToken);
        const encryptedTokens = (0, xeroCore_1.encryptXeroTokenBundle)(refreshed, secret('XERO_TOKEN_ENCRYPTION_KEY'));
        await db.runTransaction(async (transaction) => {
            const current = await transaction.get(INTEGRATION_REF);
            const lock = current.data()?.refreshLock || {};
            if (lock.id !== lockId)
                throw new Error('The Xero refresh lock changed before tokens were saved.');
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
    }
    catch (error) {
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
exports.getXeroIntegrationStatus = functions.runWith(XERO_RUNTIME).https.onCall(async (_data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid);
    const snapshot = await INTEGRATION_REF.get();
    return publicStatus(snapshot.data() || {}, actor);
});
exports.startXeroConnection = functions.runWith(XERO_RUNTIME).https.onCall(async (data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid, true);
    const clientId = secret('XERO_CLIENT_ID');
    const state = (0, xeroCore_1.createOAuthState)();
    const stateHash = (0, xeroCore_1.hashOAuthState)(state);
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const returnUrl = (0, xeroCore_1.sanitizeIntegrationReturnUrl)(data?.returnUrl);
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
        scopes: xeroCore_1.XERO_SCOPES,
        connectionStartedAt: createdAt,
        connectionStartedBy: actor.uid,
        updatedAt: createdAt,
    }, { merge: true });
    await writeXeroAudit(actor, 'XERO_CONNECTION_STARTED', ['connectionStartedAt'], before, {
        status: beforeSnapshot.data()?.status || 'NOT_CONNECTED',
        mode: 'READ_ONLY',
        scopes: xeroCore_1.XERO_SCOPES,
    });
    return {
        authorizationUrl: (0, xeroCore_1.buildXeroAuthorizationUrl)(clientId, state),
        expiresAt,
        redirectUri: xeroCore_1.XERO_REDIRECT_URI,
        scopes: xeroCore_1.XERO_SCOPES,
    };
});
exports.xeroOAuthCallback = functions.runWith(XERO_RUNTIME).https.onRequest(async (request, response) => {
    if (request.method !== 'GET') {
        response.status(405).send('Method not allowed');
        return;
    }
    const state = text(request.query.state, 500);
    if (!state) {
        response.status(400).send(callbackFailurePage('Missing OAuth state.'));
        return;
    }
    let stateData;
    try {
        stateData = await markOAuthStateConsumed((0, xeroCore_1.hashOAuthState)(state));
    }
    catch (error) {
        response.status(400).send(callbackFailurePage(error instanceof Error ? error.message : 'Invalid OAuth state.'));
        return;
    }
    const actor = {
        uid: text(stateData.actorId, 160),
        role: text(stateData.actorRole, 40) === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN',
        organizationId: text(stateData.organizationId, 160) || 'lingland-main',
    };
    const stateRef = OAUTH_STATE_COLLECTION.doc((0, xeroCore_1.hashOAuthState)(state));
    const returnUrl = (0, xeroCore_1.sanitizeIntegrationReturnUrl)(stateData.returnUrl);
    const oauthError = text(request.query.error_description || request.query.error, 240);
    if (oauthError) {
        await writeXeroAudit(actor, 'XERO_CONNECTION_CANCELLED', [], null, { reason: oauthError });
        await stateRef.delete();
        response.redirect(302, (0, xeroCore_1.appendXeroResultToReturnUrl)(returnUrl, 'cancelled', oauthError));
        return;
    }
    const code = text(request.query.code, 2000);
    if (!code) {
        await stateRef.delete();
        response.redirect(302, (0, xeroCore_1.appendXeroResultToReturnUrl)(returnUrl, 'error', 'Xero did not return an authorization code.'));
        return;
    }
    try {
        const bundle = await exchangeAuthorizationCode(code);
        const connections = await fetchConnections(bundle.accessToken);
        if (connections.length === 0)
            throw new Error('No Xero organisation was authorized.');
        const encryptedTokens = (0, xeroCore_1.encryptXeroTokenBundle)(bundle, secret('XERO_TOKEN_ENCRYPTION_KEY'));
        const connectedAt = nowIso();
        const shared = {
            provider: 'XERO',
            mode: 'READ_ONLY',
            syncEnabled: false,
            liveWriteEnabled: false,
            aiDataUseEnabled: false,
            scopes: xeroCore_1.XERO_SCOPES,
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
            response.redirect(302, (0, xeroCore_1.appendXeroResultToReturnUrl)(returnUrl, 'connected'));
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
        response.redirect(302, (0, xeroCore_1.appendXeroResultToReturnUrl)(returnUrl, 'select-organisation'));
    }
    catch (error) {
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
        response.redirect(302, (0, xeroCore_1.appendXeroResultToReturnUrl)(returnUrl, 'error', message));
    }
});
exports.selectXeroOrganisation = functions.runWith(XERO_RUNTIME).https.onCall(async (data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid, true);
    const connectionId = text(data?.connectionId, 100);
    const snapshot = await INTEGRATION_REF.get();
    const current = snapshot.data() || {};
    if (current.status !== 'TENANT_SELECTION_REQUIRED' || !current.encryptedTokens) {
        throw new functions.https.HttpsError('failed-precondition', 'There is no pending Xero organisation selection.');
    }
    const options = (0, xeroCore_1.normalizeXeroConnections)(current.connectionOptions);
    const tenant = options.find(option => option.connectionId === connectionId);
    if (!tenant)
        throw new functions.https.HttpsError('invalid-argument', 'Choose an authorised Xero organisation.');
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
exports.testXeroConnection = functions.runWith(XERO_RUNTIME).https.onCall(async (_data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid);
    try {
        const { bundle, data } = await ensureFreshToken();
        const tenant = data.tenant && typeof data.tenant === 'object'
            ? data.tenant
            : null;
        if (!tenant?.tenantId)
            throw new Error('No Xero organisation has been selected.');
        const connections = await fetchConnections(bundle.accessToken);
        const liveConnection = connections.find(option => option.connectionId === tenant.connectionId || option.tenantId === tenant.tenantId);
        if (!liveConnection)
            throw new Error('The selected Xero organisation is no longer connected.');
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
    }
    catch (error) {
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
exports.disconnectXero = functions.runWith(XERO_RUNTIME).https.onCall(async (_data, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid, true);
    const snapshot = await INTEGRATION_REF.get();
    const before = snapshot.data() || {};
    if (!snapshot.exists || !before.encryptedTokens) {
        throw new functions.https.HttpsError('failed-precondition', 'Xero is not connected.');
    }
    const { bundle, data } = await ensureFreshToken();
    const tenant = data.tenant && typeof data.tenant === 'object'
        ? data.tenant
        : null;
    try {
        if (tenant?.connectionId) {
            await axios_1.default.delete(`${CONNECTIONS_URL}/${encodeURIComponent(tenant.connectionId)}`, {
                headers: { Authorization: `Bearer ${bundle.accessToken}` },
                timeout: 15000,
            });
        }
        await axios_1.default.post(REVOCATION_URL, new URLSearchParams({ token: bundle.refreshToken }).toString(), {
            headers: {
                Authorization: `Basic ${basicAuth()}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 15000,
        });
    }
    catch (error) {
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
exports.previewXeroReconciliation = functions.runWith(XERO_RECONCILIATION_RUNTIME).https.onCall(async (input, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid);
    const requestedScope = validateReconciliationScope(input);
    const importRunId = await resolveFinanceImportRun(actor, requestedScope.importRunId);
    const scope = { fromDate: requestedScope.fromDate, toDate: requestedScope.toDate, importRunId };
    const runRef = RECONCILIATION_RUNS.doc();
    const createdAt = nowIso();
    await runRef.create({
        provider: 'XERO',
        mode: 'READ_ONLY',
        status: 'RUNNING',
        scope,
        organizationId: actor.organizationId,
        createdAt,
        createdBy: actor.uid,
        updatedAt: createdAt,
    });
    try {
        const { bundle, data } = await ensureFreshToken();
        const tenant = data.tenant && typeof data.tenant === 'object'
            ? data.tenant
            : null;
        if (!tenant?.tenantId || text(data.status, 60).toUpperCase() !== 'CONNECTED') {
            throw new functions.https.HttpsError('failed-precondition', 'Connect and verify the Xero organisation before reconciliation.');
        }
        const filter = xeroDateFilter(scope.fromDate, scope.toDate);
        const [local, xeroContacts, xeroInvoices, xeroPayments] = await Promise.all([
            loadLocalReconciliationData(actor, scope.fromDate, scope.toDate, scope.importRunId),
            fetchPagedXeroResource('Contacts', 'Contacts', bundle.accessToken, tenant.tenantId),
            fetchPagedXeroResource('Invoices', 'Invoices', bundle.accessToken, tenant.tenantId, { where: filter }),
            fetchPagedXeroResource('Payments', 'Payments', bundle.accessToken, tenant.tenantId, { where: filter }),
        ]);
        const preview = (0, xeroReconciliationCore_1.reconcileXeroAccounting)({
            localContacts: local.contacts,
            localDocuments: local.documents,
            xeroContacts,
            xeroInvoices,
            xeroPayments,
            generatedAt: nowIso(),
        });
        const writer = db.bulkWriter();
        preview.items.forEach(item => {
            writer.set(runRef.collection('matches').doc(matchDocumentId(item)), clean({
                ...item,
                runId: runRef.id,
                scope,
                createdAt: preview.generatedAt,
                applyStatus: 'NOT_APPLIED',
            }));
        });
        await writer.close();
        const completedAt = nowIso();
        const expiresAt = new Date(Date.now() + RECONCILIATION_PREVIEW_TTL_MS).toISOString();
        await runRef.set(clean({
            status: 'PREVIEW_READY',
            tenantId: tenant.tenantId,
            tenantName: tenant.tenantName,
            previewHash: preview.previewHash,
            summary: preview.summary,
            issueCount: preview.summary.reviewCount,
            sourceCounts: {
                localContacts: local.contacts.length,
                localDocuments: local.documents.length,
                xeroContacts: xeroContacts.length,
                xeroInvoices: xeroInvoices.length,
                xeroPayments: xeroPayments.length,
            },
            completedAt,
            expiresAt,
            updatedAt: completedAt,
            updatedBy: actor.uid,
        }), { merge: true });
        await INTEGRATION_REF.set({
            lastReconciliationRunId: runRef.id,
            lastReconciliationPreviewAt: completedAt,
            lastReconciliationStatus: 'PREVIEW_READY',
            updatedAt: completedAt,
        }, { merge: true });
        await writeXeroAudit(actor, 'XERO_RECONCILIATION_PREVIEWED', ['lastReconciliationRunId'], null, {
            runId: runRef.id,
            scope,
            previewHash: preview.previewHash,
            summary: preview.summary,
        });
        return publicReconciliationRun(await runRef.get());
    }
    catch (error) {
        const message = error instanceof functions.https.HttpsError
            ? error.message
            : providerError(error, error instanceof Error ? error.message : 'Xero reconciliation preview failed.');
        await runRef.set({
            status: 'FAILED',
            errorMessage: text(message, 300),
            failedAt: nowIso(),
            updatedAt: nowIso(),
            updatedBy: actor.uid,
        }, { merge: true });
        if (error instanceof functions.https.HttpsError)
            throw error;
        throw new functions.https.HttpsError('unavailable', message);
    }
});
exports.getXeroReconciliationRun = functions.runWith(XERO_RUNTIME).https.onCall(async (input, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid);
    const requestedRunId = text(input?.runId, 180);
    let snapshot = null;
    if (requestedRunId) {
        const requested = await RECONCILIATION_RUNS.doc(requestedRunId).get();
        if (requested.exists && text(requested.data()?.organizationId, 160) === actor.organizationId)
            snapshot = requested;
    }
    else {
        const latest = await RECONCILIATION_RUNS
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();
        snapshot = latest.docs.find((doc) => text(doc.data().organizationId, 160) === actor.organizationId) || null;
    }
    if (!snapshot)
        return null;
    return publicReconciliationRun(snapshot);
});
exports.applyXeroReconciliationLinks = functions.runWith(XERO_RECONCILIATION_RUNTIME).https.onCall(async (input, context) => {
    const actor = await assertActiveAdmin(context.auth?.uid, true);
    await assertCommunicationsSuppressed();
    const runId = text(input?.runId, 180);
    const previewHash = text(input?.previewHash, 64).toLowerCase();
    if (!runId || !previewHash) {
        throw new functions.https.HttpsError('invalid-argument', 'Run id and preview hash are required.');
    }
    const runRef = RECONCILIATION_RUNS.doc(runId);
    const runSnapshot = await runRef.get();
    if (!runSnapshot.exists || text(runSnapshot.data()?.organizationId, 160) !== actor.organizationId) {
        throw new functions.https.HttpsError('not-found', 'Xero reconciliation preview not found.');
    }
    const run = runSnapshot.data() || {};
    if (['APPLIED', 'APPLIED_WITH_CONFLICTS'].includes(text(run.status, 60))) {
        return publicReconciliationRun(runSnapshot);
    }
    if (text(run.status, 60) !== 'PREVIEW_READY' || text(run.previewHash, 64).toLowerCase() !== previewHash) {
        throw new functions.https.HttpsError('failed-precondition', 'A matching completed Xero preview is required.');
    }
    const appliedScope = run.scope && typeof run.scope === 'object'
        ? run.scope
        : {};
    if (!text(appliedScope.importRunId, 80)) {
        throw new functions.https.HttpsError('failed-precondition', 'Run a fresh preview scoped to a committed canonical finance import.');
    }
    if (Date.parse(text(run.expiresAt, 80)) <= Date.now()) {
        throw new functions.https.HttpsError('failed-precondition', 'This Xero preview expired. Run a fresh preview before linking records.');
    }
    const matchSnapshots = await runRef.collection('matches').get();
    const exactMatches = matchSnapshots.docs
        .map(document => ({ ref: document.ref, item: document.data() }))
        .filter(entry => entry.item.status === 'EXACT' && entry.item.xero?.id);
    const localSnapshots = new Map();
    for (let offset = 0; offset < exactMatches.length; offset += 100) {
        const entries = exactMatches.slice(offset, offset + 100);
        const snapshots = await db.getAll(...entries.map(entry => db.collection(entry.item.localCollection).doc(entry.item.localId)));
        snapshots.forEach(snapshot => localSnapshots.set(`${snapshot.ref.parent.id}:${snapshot.id}`, snapshot));
    }
    const applySummary = {
        exactMatches: exactMatches.length,
        applied: 0,
        alreadyLinked: 0,
        localLinkConflicts: 0,
        localRecordsMissing: 0,
    };
    const appliedAt = nowIso();
    const writer = db.bulkWriter();
    exactMatches.forEach(({ ref: matchRef, item }) => {
        const localSnapshot = localSnapshots.get(`${item.localCollection}:${item.localId}`);
        if (!localSnapshot?.exists || !item.xero) {
            applySummary.localRecordsMissing += 1;
            writer.set(matchRef, { applyStatus: 'LOCAL_RECORD_MISSING', appliedAt, appliedBy: actor.uid }, { merge: true });
            return;
        }
        const current = localSnapshot.data() || {};
        const idField = item.entityType === 'CONTACT' ? 'xeroContactId' : 'xeroDocumentId';
        const existingXeroId = text(current[idField], 180);
        if (existingXeroId && existingXeroId !== item.xero.id) {
            applySummary.localLinkConflicts += 1;
            writer.set(matchRef, {
                applyStatus: 'LOCAL_LINK_CONFLICT',
                existingXeroId,
                appliedAt,
                appliedBy: actor.uid,
            }, { merge: true });
            return;
        }
        const evidence = {
            runId,
            previewHash,
            strategy: item.strategy,
            reasons: item.reasons,
            scope: run.scope || null,
            reconciledAt: appliedAt,
            reconciledBy: actor.uid,
        };
        const shared = {
            xeroSyncStatus: 'RECONCILED',
            xeroReconciliationRunId: runId,
            xeroReconciledAt: appliedAt,
            xeroReconciliationEvidence: evidence,
            updatedAt: appliedAt,
            updatedBy: actor.uid,
        };
        const payload = item.entityType === 'CONTACT'
            ? {
                ...shared,
                xeroContactId: item.xero.id,
                xeroAccountNumber: item.xero.reference,
                xeroContactStatus: item.xero.status,
                xeroUpdatedDateUtc: item.xero.updatedDateUtc || '',
            }
            : {
                ...shared,
                xeroDocumentId: item.xero.id,
                xeroInvoiceNumber: item.xero.reference,
                xeroStatus: item.xero.status,
                xeroTotal: item.xero.total || 0,
                xeroAmountPaid: item.xero.amountPaid || 0,
                xeroAmountDue: item.xero.amountDue || 0,
                xeroPaymentIds: item.xero.paymentIds || [],
                xeroPaymentTotal: item.xero.paymentTotal || 0,
                xeroUpdatedDateUtc: item.xero.updatedDateUtc || '',
            };
        writer.set(localSnapshot.ref, clean(payload), { merge: true });
        writer.set(matchRef, { applyStatus: existingXeroId ? 'ALREADY_LINKED' : 'APPLIED', appliedAt, appliedBy: actor.uid }, { merge: true });
        if (existingXeroId)
            applySummary.alreadyLinked += 1;
        else
            applySummary.applied += 1;
    });
    await writer.close();
    const status = applySummary.localLinkConflicts || applySummary.localRecordsMissing
        ? 'APPLIED_WITH_CONFLICTS'
        : 'APPLIED';
    await runRef.set({
        status,
        applySummary,
        appliedAt,
        appliedBy: actor.uid,
        updatedAt: appliedAt,
        updatedBy: actor.uid,
    }, { merge: true });
    await INTEGRATION_REF.set({
        lastReconciliationRunId: runId,
        lastReconciliationAppliedAt: appliedAt,
        lastReconciliationStatus: status,
        updatedAt: appliedAt,
    }, { merge: true });
    await writeXeroAudit(actor, 'XERO_RECONCILIATION_LINKS_APPLIED', ['lastReconciliationRunId'], null, {
        runId,
        status,
        scope: run.scope || null,
        applySummary,
    });
    return publicReconciliationRun(await runRef.get());
});
//# sourceMappingURL=xeroFunctions.js.map