import { describe, expect, it } from 'vitest';
import {
  appendXeroResultToReturnUrl,
  buildXeroAuthorizationUrl,
  decryptXeroTokenBundle,
  encryptXeroTokenBundle,
  normalizeXeroConnections,
  sanitizeIntegrationReturnUrl,
  XERO_REDIRECT_URI,
  XERO_SCOPES,
  XeroTokenBundle,
} from './xeroCore';

const key = Buffer.alloc(32, 7).toString('base64');
const bundle: XeroTokenBundle = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  tokenType: 'Bearer',
  scope: XERO_SCOPES.join(' '),
  expiresAt: '2026-08-01T12:00:00.000Z',
  refreshTokenExpiresAt: '2026-09-30T12:00:00.000Z',
};

describe('Xero OAuth core', () => {
  it('builds the authorization URL with granular read-only scopes', () => {
    const url = new URL(buildXeroAuthorizationUrl('client-id', 'state-value'));
    expect(url.searchParams.get('redirect_uri')).toBe(XERO_REDIRECT_URI);
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(XERO_SCOPES);
    expect(url.searchParams.get('scope')?.split(' ')).not.toContain('accounting.invoices');
  });

  it('accepts only known platform return URLs', () => {
    expect(sanitizeIntegrationReturnUrl('http://localhost:5173/#/admin/administration/integrations'))
      .toBe('http://localhost:5173/#/admin/administration/integrations');
    expect(sanitizeIntegrationReturnUrl('https://portal.lingland.io/#/admin/administration/integrations'))
      .toBe('https://portal.lingland.io/#/admin/administration/integrations');
    expect(sanitizeIntegrationReturnUrl('https://malicious.example/callback'))
      .toBe('https://lingland-2e52f.web.app/#/admin/administration/integrations');
  });

  it('places callback results inside the hash router query', () => {
    expect(appendXeroResultToReturnUrl(
      'http://localhost:5173/#/admin/administration/integrations',
      'connected',
    )).toBe('http://localhost:5173/#/admin/administration/integrations?xero=connected');
  });

  it('encrypts tokens with authenticated encryption', () => {
    const encrypted = encryptXeroTokenBundle(bundle, key);
    expect(encrypted.ciphertext).not.toContain('access-token');
    expect(decryptXeroTokenBundle(encrypted, key)).toEqual(bundle);
    expect(() => decryptXeroTokenBundle({ ...encrypted, authTag: Buffer.alloc(16).toString('base64') }, key)).toThrow();
  });

  it('normalizes and deduplicates tenant connections', () => {
    expect(normalizeXeroConnections([
      { id: 'connection-1', tenantId: 'tenant-1', tenantName: 'Lingland Ltd', tenantType: 'ORGANISATION' },
      { id: 'connection-1', tenantId: 'tenant-1', tenantName: 'Duplicate' },
      { id: '', tenantId: 'tenant-2' },
    ])).toEqual([expect.objectContaining({
      connectionId: 'connection-1',
      tenantId: 'tenant-1',
      tenantName: 'Lingland Ltd',
    })]);
    expect(normalizeXeroConnections([{
      connectionId: 'normalized-connection',
      tenantId: 'normalized-tenant',
      tenantName: 'Already normalized',
    }])).toEqual([expect.objectContaining({ connectionId: 'normalized-connection' })]);
  });
});
