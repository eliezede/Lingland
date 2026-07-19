import { describe, expect, it } from 'vitest';
import { resolveClientIdentity } from './clientIdentityResolution';

const clients = [
  {
    id: 'client-hampshire',
    data: {
      companyName: 'Hampshire Hospitals NHS Foundation Trust',
      sageAccountRef: 'HAM013',
      invoiceEmail: 'accounts@hhft.nhs.uk',
      recordState: 'ACTIVE',
    },
  },
  {
    id: 'client-priory',
    data: {
      companyName: 'Priory Hospital Southampton',
      airtableClientKey: 'PRIORYHO',
      recordState: 'ACTIVE',
    },
  },
];

describe('client identity resolution', () => {
  it('resolves a stale Airtable client ID through an exact account key', () => {
    const result = resolveClientIdentity({
      id: 'invoice-a',
      data: { clientId: 'airtable_client_ham013', clientName: 'Airtable Client' },
    }, clients);
    expect(result).toMatchObject({
      status: 'RESOLVED',
      clientId: 'client-hampshire',
      confidence: 'HIGH',
      method: 'ACCOUNT_KEY',
    });
  });

  it('resolves a unique exact client name when stronger identifiers are absent', () => {
    const result = resolveClientIdentity({
      id: 'invoice-a',
      data: { clientName: 'Priory Hospital Southampton' },
    }, clients);
    expect(result).toMatchObject({
      status: 'RESOLVED',
      clientId: 'client-priory',
      confidence: 'MEDIUM',
      method: 'EXACT_NAME',
    });
  });

  it('uses a unique account code embedded in the invoice reference', () => {
    const result = resolveClientIdentity({
      id: 'airtable_client_invoice_prioryho-7622',
      data: { clientId: 'airtable_client_missing', invoiceNumber: 'PRIORYHO-7622' },
    }, clients);
    expect(result).toMatchObject({
      status: 'RESOLVED',
      clientId: 'client-priory',
      confidence: 'HIGH',
      method: 'ACCOUNT_KEY',
    });
  });

  it('does not use placeholder client names', () => {
    const result = resolveClientIdentity({
      id: 'invoice-a',
      data: { clientName: 'Airtable Client' },
    }, clients);
    expect(result.status).toBe('UNMATCHED');
  });

  it('does not resolve an organisation from a contact or invoice email alone', () => {
    const result = resolveClientIdentity({
      id: 'invoice-email-only',
      data: { invoiceEmail: 'accounts@hhft.nhs.uk' },
    }, clients);
    expect(result.status).toBe('UNMATCHED');
    expect(result.candidateClientIds).toEqual([]);
  });

  it('does not accept an existing generic placeholder as a resolved client', () => {
    const result = resolveClientIdentity({
      id: 'invoice-a',
      data: { clientId: 'airtable_client_airtable-client' },
    }, [...clients, { id: 'airtable_client_airtable-client', data: { companyName: 'Airtable Client' } }]);
    expect(result.status).toBe('UNMATCHED');
  });

  it('keeps exact-name collisions ambiguous', () => {
    const result = resolveClientIdentity({
      id: 'invoice-a',
      data: { clientName: 'Priory Hospital Southampton' },
    }, [...clients, { id: 'client-priory-2', data: { companyName: 'Priory Hospital Southampton' } }]);
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.candidateClientIds).toEqual(['client-priory', 'client-priory-2']);
  });

  it('follows merged client aliases', () => {
    const result = resolveClientIdentity({
      id: 'invoice-a',
      data: { clientId: 'client-old' },
    }, [...clients, { id: 'client-old', data: { recordState: 'MERGED', mergedIntoClientId: 'client-hampshire' } }]);
    expect(result).toMatchObject({ status: 'RESOLVED', clientId: 'client-hampshire' });
  });
});
