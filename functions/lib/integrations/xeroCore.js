"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeXeroConnections = exports.tokenResponseToBundle = exports.decryptXeroTokenBundle = exports.encryptXeroTokenBundle = exports.appendXeroResultToReturnUrl = exports.sanitizeIntegrationReturnUrl = exports.buildXeroAuthorizationUrl = exports.createOAuthState = exports.hashOAuthState = exports.XERO_SCOPES = exports.XERO_AUTHORIZE_URL = exports.XERO_REDIRECT_URI = void 0;
const node_crypto_1 = require("node:crypto");
exports.XERO_REDIRECT_URI = 'https://us-central1-lingland-2e52f.cloudfunctions.net/xeroOAuthCallback';
exports.XERO_AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
exports.XERO_SCOPES = [
    'openid',
    'profile',
    'email',
    'offline_access',
    'accounting.invoices.read',
    'accounting.payments.read',
    'accounting.contacts.read',
    'accounting.settings.read',
];
const TOKEN_AAD = Buffer.from('lingland:xero:oauth-token:v1', 'utf8');
const safeText = (value, max = 300) => String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const encryptionKey = (secret) => {
    const value = secret.trim();
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length !== 32 || decoded.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) {
        throw new Error('XERO_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
    }
    return decoded;
};
const hashOAuthState = (state) => (0, node_crypto_1.createHash)('sha256').update(state).digest('hex');
exports.hashOAuthState = hashOAuthState;
const createOAuthState = () => (0, node_crypto_1.randomBytes)(32).toString('base64url');
exports.createOAuthState = createOAuthState;
const buildXeroAuthorizationUrl = (clientId, state) => {
    const url = new URL(exports.XERO_AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId.trim());
    url.searchParams.set('redirect_uri', exports.XERO_REDIRECT_URI);
    url.searchParams.set('scope', exports.XERO_SCOPES.join(' '));
    url.searchParams.set('state', state);
    return url.toString();
};
exports.buildXeroAuthorizationUrl = buildXeroAuthorizationUrl;
const sanitizeIntegrationReturnUrl = (input) => {
    const fallback = 'https://lingland-2e52f.web.app/#/admin/administration/integrations';
    const value = safeText(input, 1000);
    if (!value)
        return fallback;
    try {
        const url = new URL(value);
        const isLocal = url.protocol === 'http:'
            && url.hostname === 'localhost'
            && ['5173', '5174'].includes(url.port);
        const isFirebase = url.protocol === 'https:'
            && ['lingland-2e52f.web.app', 'lingland-2e52f.firebaseapp.com'].includes(url.hostname);
        const isLingland = url.protocol === 'https:'
            && (url.hostname === 'lingland.io' || url.hostname.endsWith('.lingland.io'));
        if (!isLocal && !isFirebase && !isLingland)
            return fallback;
        if (!url.hash.startsWith('#/admin/administration/integrations')) {
            url.hash = '#/admin/administration/integrations';
        }
        return url.toString();
    }
    catch {
        return fallback;
    }
};
exports.sanitizeIntegrationReturnUrl = sanitizeIntegrationReturnUrl;
const appendXeroResultToReturnUrl = (returnUrl, status, message = '') => {
    const url = new URL((0, exports.sanitizeIntegrationReturnUrl)(returnUrl));
    const rawHash = url.hash.replace(/^#/, '') || '/admin/administration/integrations';
    const [path, query = ''] = rawHash.split('?');
    const params = new URLSearchParams(query);
    params.set('xero', status);
    if (message)
        params.set('message', safeText(message, 180));
    else
        params.delete('message');
    url.hash = `${path}?${params.toString()}`;
    return url.toString();
};
exports.appendXeroResultToReturnUrl = appendXeroResultToReturnUrl;
const encryptXeroTokenBundle = (bundle, secret) => {
    const iv = (0, node_crypto_1.randomBytes)(12);
    const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', encryptionKey(secret), iv);
    cipher.setAAD(TOKEN_AAD);
    const plaintext = Buffer.from(JSON.stringify(bundle), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
        algorithm: 'AES-256-GCM',
        keyVersion: 1,
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
    };
};
exports.encryptXeroTokenBundle = encryptXeroTokenBundle;
const decryptXeroTokenBundle = (encrypted, secret) => {
    if (encrypted.algorithm !== 'AES-256-GCM' || encrypted.keyVersion !== 1) {
        throw new Error('Unsupported Xero token encryption format.');
    }
    const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', encryptionKey(secret), Buffer.from(encrypted.iv, 'base64'));
    decipher.setAAD(TOKEN_AAD);
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
        decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext);
};
exports.decryptXeroTokenBundle = decryptXeroTokenBundle;
const tokenResponseToBundle = (response, now = Date.now()) => {
    const accessToken = safeText(response.access_token, 10000);
    const refreshToken = safeText(response.refresh_token, 10000);
    const expiresIn = Math.max(60, Math.min(3600, Number(response.expires_in) || 1800));
    if (!accessToken || !refreshToken)
        throw new Error('Xero did not return the required OAuth tokens.');
    return {
        accessToken,
        refreshToken,
        tokenType: safeText(response.token_type, 40) || 'Bearer',
        scope: safeText(response.scope, 2000),
        expiresAt: new Date(now + expiresIn * 1000).toISOString(),
        refreshTokenExpiresAt: new Date(now + 60 * 24 * 60 * 60 * 1000).toISOString(),
    };
};
exports.tokenResponseToBundle = tokenResponseToBundle;
const normalizeXeroConnections = (value) => {
    if (!Array.isArray(value))
        return [];
    const seen = new Set();
    return value.flatMap(item => {
        const data = item && typeof item === 'object' ? item : {};
        const connectionId = safeText(data.id || data.connectionId, 100);
        const tenantId = safeText(data.tenantId, 100);
        if (!connectionId || !tenantId || seen.has(connectionId))
            return [];
        seen.add(connectionId);
        return [{
                connectionId,
                tenantId,
                tenantName: safeText(data.tenantName || data.tenantDisplayName, 200) || 'Xero organisation',
                tenantType: safeText(data.tenantType, 80) || 'ORGANISATION',
                createdDateUtc: safeText(data.createdDateUtc, 80),
                updatedDateUtc: safeText(data.updatedDateUtc, 80),
            }];
    });
};
exports.normalizeXeroConnections = normalizeXeroConnections;
//# sourceMappingURL=xeroCore.js.map