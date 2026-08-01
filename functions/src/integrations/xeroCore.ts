import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const XERO_REDIRECT_URI = 'https://us-central1-lingland-2e52f.cloudfunctions.net/xeroOAuthCallback';
export const XERO_AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';

export const XERO_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'accounting.invoices.read',
  'accounting.payments.read',
  'accounting.contacts.read',
  'accounting.settings.read',
] as const;

export interface XeroTokenBundle {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string;
  expiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface EncryptedXeroTokenBundle {
  algorithm: 'AES-256-GCM';
  keyVersion: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface XeroConnectionOption {
  connectionId: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  createdDateUtc: string;
  updatedDateUtc: string;
}

const TOKEN_AAD = Buffer.from('lingland:xero:oauth-token:v1', 'utf8');
const safeText = (value: unknown, max = 300) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const encryptionKey = (secret: string) => {
  const value = secret.trim();
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) {
    throw new Error('XERO_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  return decoded;
};

export const hashOAuthState = (state: string) => createHash('sha256').update(state).digest('hex');

export const createOAuthState = () => randomBytes(32).toString('base64url');

export const buildXeroAuthorizationUrl = (clientId: string, state: string) => {
  const url = new URL(XERO_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId.trim());
  url.searchParams.set('redirect_uri', XERO_REDIRECT_URI);
  url.searchParams.set('scope', XERO_SCOPES.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
};

export const sanitizeIntegrationReturnUrl = (input: unknown) => {
  const fallback = 'https://lingland-2e52f.web.app/#/admin/administration/integrations';
  const value = safeText(input, 1000);
  if (!value) return fallback;

  try {
    const url = new URL(value);
    const isLocal = url.protocol === 'http:'
      && url.hostname === 'localhost'
      && ['5173', '5174'].includes(url.port);
    const isFirebase = url.protocol === 'https:'
      && ['lingland-2e52f.web.app', 'lingland-2e52f.firebaseapp.com'].includes(url.hostname);
    const isLingland = url.protocol === 'https:'
      && (url.hostname === 'lingland.io' || url.hostname.endsWith('.lingland.io'));
    if (!isLocal && !isFirebase && !isLingland) return fallback;
    if (!url.hash.startsWith('#/admin/administration/integrations')) {
      url.hash = '#/admin/administration/integrations';
    }
    return url.toString();
  } catch {
    return fallback;
  }
};

export const appendXeroResultToReturnUrl = (
  returnUrl: string,
  status: 'connected' | 'select-organisation' | 'cancelled' | 'error',
  message = '',
) => {
  const url = new URL(sanitizeIntegrationReturnUrl(returnUrl));
  const rawHash = url.hash.replace(/^#/, '') || '/admin/administration/integrations';
  const [path, query = ''] = rawHash.split('?');
  const params = new URLSearchParams(query);
  params.set('xero', status);
  if (message) params.set('message', safeText(message, 180));
  else params.delete('message');
  url.hash = `${path}?${params.toString()}`;
  return url.toString();
};

export const encryptXeroTokenBundle = (
  bundle: XeroTokenBundle,
  secret: string,
): EncryptedXeroTokenBundle => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
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

export const decryptXeroTokenBundle = (
  encrypted: EncryptedXeroTokenBundle,
  secret: string,
): XeroTokenBundle => {
  if (encrypted.algorithm !== 'AES-256-GCM' || encrypted.keyVersion !== 1) {
    throw new Error('Unsupported Xero token encryption format.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(secret),
    Buffer.from(encrypted.iv, 'base64'),
  );
  decipher.setAAD(TOKEN_AAD);
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext) as XeroTokenBundle;
};

export const tokenResponseToBundle = (response: Record<string, unknown>, now = Date.now()): XeroTokenBundle => {
  const accessToken = safeText(response.access_token, 10000);
  const refreshToken = safeText(response.refresh_token, 10000);
  const expiresIn = Math.max(60, Math.min(3600, Number(response.expires_in) || 1800));
  if (!accessToken || !refreshToken) throw new Error('Xero did not return the required OAuth tokens.');
  return {
    accessToken,
    refreshToken,
    tokenType: safeText(response.token_type, 40) || 'Bearer',
    scope: safeText(response.scope, 2000),
    expiresAt: new Date(now + expiresIn * 1000).toISOString(),
    refreshTokenExpiresAt: new Date(now + 60 * 24 * 60 * 60 * 1000).toISOString(),
  };
};

export const normalizeXeroConnections = (value: unknown): XeroConnectionOption[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(item => {
    const data = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const connectionId = safeText(data.id || data.connectionId, 100);
    const tenantId = safeText(data.tenantId, 100);
    if (!connectionId || !tenantId || seen.has(connectionId)) return [];
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
