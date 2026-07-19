import { describe, expect, it } from 'vitest';
import {
  buildClientIdentityAudit,
  extractClientEmails,
  extractUkPostcode,
  normalizeClientPhone,
  normalizeClientAddress,
  normalizeOrganizationName,
} from './clientIdentityAuditCore';

describe('client identity audit', () => {
  it('normalises organisation names and UK postcodes deterministically', () => {
    expect(normalizeOrganizationName('  Hampshire & IOW NHS Trust ')).toBe('hampshire and iow nhs trust');
    expect(extractUkPostcode('Tremona Road, Southampton so16 6YD')).toBe('SO16 6YD');
    expect(extractClientEmails('Office <office@example.org>, admin@example.org; invalid value')).toEqual([
      'admin@example.org',
      'office@example.org',
    ]);
    expect(normalizeClientPhone('+44 (0) 23 8012 3456')).toBe('02380123456');
    expect(normalizeClientAddress('Address Pending Update')).toBe('');
  });

  it('never merges organisations by contact email alone', () => {
    const audit = buildClientIdentityAudit({
      generatedAt: '2026-07-18T10:00:00.000Z',
      clients: [
        { id: 'client-a', companyName: 'Hospital A', email: 'person@example.org' },
        { id: 'client-b', companyName: 'Council B', bookingEmail: 'person@example.org' },
      ],
    });

    expect(audit.organizationCandidates).toHaveLength(0);
    expect(audit.agentCandidates).toHaveLength(1);
    expect(audit.agentCandidates[0]).toMatchObject({
      kind: 'AGENT',
      confidence: 'HIGH',
      clientIds: ['client-a', 'client-b'],
    });
    expect(audit.agentCandidates[0].recommendation).toMatch(/Do not merge organisations|retain a separate membership/i);
  });

  it('finds the same organisation by name and postcode and recommends the record carrying history', () => {
    const audit = buildClientIdentityAudit({
      clients: [
        {
          id: 'older-complete',
          companyName: 'University Hospital Southampton',
          billingAddress: 'Tremona Road, Southampton, SO16 6YD',
          contactPerson: 'Booking Contact',
          email: 'booking@example.org',
          status: 'ACTIVE',
        },
        {
          id: 'newer-empty',
          companyName: 'University Hospital Southampton',
          billingAddress: 'SO16 6YD',
        },
      ],
      bookingCounts: { 'older-complete': 14, 'newer-empty': 1 },
      invoiceCounts: { 'older-complete': 3 },
      linkedUserCounts: { 'older-complete': 1 },
    });

    expect(audit.organizationCandidates).toHaveLength(1);
    expect(audit.organizationCandidates[0]).toMatchObject({
      confidence: 'HIGH',
      recommendedClientId: 'older-complete',
      totals: {
        records: 2,
        jobs: 15,
        invoices: 3,
        jobsToReassign: 1,
      },
    });
    expect(audit.organizationCandidates[0].evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'NAME_AND_POSTCODE', strength: 'STRONG' }),
    ]));
  });

  it('marks conflicting financial identities as high-risk manual review', () => {
    const audit = buildClientIdentityAudit({
      clients: [
        { id: 'client-a', companyName: 'Same Trust', sageAccountRef: 'SAGE-100' },
        { id: 'client-b', companyName: 'Same Trust', sageAccountRef: 'SAGE-200' },
      ],
    });

    expect(audit.organizationCandidates[0]).toMatchObject({
      confidence: 'REVIEW',
      mergeRisk: 'HIGH',
    });
    expect(audit.organizationCandidates[0].conflicts.join(' ')).toMatch(/Conflicting Sage/i);
  });

  it('uses a stable Sage reference as strong evidence even when source labels differ', () => {
    const audit = buildClientIdentityAudit({
      clients: [
        { id: 'client-a', companyName: 'HHFT Urology', sageAccountRef: 'HHFT01' },
        { id: 'client-b', companyName: 'Hampshire Hospitals Foundation Trust', sageAccountRef: 'HHFT01' },
      ],
    });

    expect(audit.organizationCandidates).toHaveLength(1);
    expect(audit.organizationCandidates[0].confidence).toBe('HIGH');
    expect(audit.organizationCandidates[0].evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'SAGE_ACCOUNT', value: 'HHFT01' }),
    ]));
  });

  it('flags shared mailboxes and generic organisation labels instead of inferring a person or company', () => {
    const audit = buildClientIdentityAudit({
      clients: [
        { id: 'client-a', companyName: 'Airtable Client', email: 'bookings@example.org' },
        { id: 'client-b', companyName: 'Client', bookingEmail: 'bookings@example.org' },
      ],
    });

    expect(audit.organizationCandidates).toHaveLength(0);
    expect(audit.summary.recordsWithoutOrganizationIdentity).toBe(2);
    expect(audit.agentCandidates[0]).toMatchObject({
      confidence: 'REVIEW',
      mergeRisk: 'HIGH',
    });
    expect(audit.agentCandidates[0].evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'SHARED_MAILBOX', strength: 'RISK' }),
    ]));
  });

  it('detects a repeated agent when a legacy field contains multiple addresses', () => {
    const audit = buildClientIdentityAudit({
      clients: [
        { id: 'client-a', companyName: 'Organisation A', email: 'person@example.org, office@example.org' },
        { id: 'client-b', companyName: 'Organisation B', bookingEmail: 'office@example.org' },
      ],
    });

    expect(audit.organizationCandidates).toHaveLength(0);
    expect(audit.agentCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        mergeRisk: 'HIGH',
        evidence: expect.arrayContaining([expect.objectContaining({ value: 'office@example.org' })]),
      }),
    ]));
  });

  it('returns stable candidate identifiers regardless of source order', () => {
    const clients = [
      { id: 'client-b', companyName: 'Same Organisation' },
      { id: 'client-a', companyName: 'Same Organisation' },
    ];
    const forward = buildClientIdentityAudit({ clients });
    const reversed = buildClientIdentityAudit({ clients: clients.slice().reverse() });

    expect(forward.organizationCandidates[0].id).toBe(reversed.organizationCandidates[0].id);
    expect(forward.organizationCandidates[0].clientIds).toEqual(['client-a', 'client-b']);
  });

  it('uses a similar name plus the same address and phone as corroborating evidence', () => {
    const audit = buildClientIdentityAudit({
      clients: [
        {
          id: 'client-a',
          companyName: 'Southampton University Hospital Trust',
          billingAddress: 'Tremona Road, Southampton SO16 6YD',
          phone: '023 8120 0000',
        },
        {
          id: 'client-b',
          companyName: 'Southampton University Hospitals Trust',
          billingAddress: 'Tremona Road, Southampton, SO16 6YD',
          bookingPhone: '+44 23 8120 0000',
        },
      ],
    });

    expect(audit.organizationCandidates).toHaveLength(1);
    expect(audit.organizationCandidates[0].evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'PHONE', strength: 'STRONG' }),
      expect.objectContaining({ type: 'ADDRESS', strength: 'STRONG' }),
      expect.objectContaining({ type: 'NAME_SIMILARITY' }),
    ]));
  });

  it('joins a named operating unit to its institution only with phone and specific-domain corroboration', () => {
    const audit = buildClientIdentityAudit({
      clients: [
        {
          id: 'priory',
          companyName: 'Priory Hospital Southampton',
          phone: '02380 840044',
          email: 'katy@priorygroup.com',
        },
        {
          id: 'sandpiper',
          companyName: 'Sandpiper Ward - Priory Hospital Southampton',
          phone: '02380840044',
          email: 'sandpipercrew@priorygroup.com',
        },
      ],
      bookingCounts: { priory: 2, sandpiper: 1 },
    });

    expect(audit.organizationCandidates).toHaveLength(1);
    expect(audit.organizationCandidates[0]).toMatchObject({
      recommendedClientId: 'priory',
      clientIds: ['priory', 'sandpiper'],
    });
    expect(audit.organizationCandidates[0].evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'PHONE', strength: 'STRONG' }),
      expect.objectContaining({ type: 'EMAIL_DOMAIN', value: 'priorygroup.com' }),
    ]));
  });

  it('does not join an operating-unit-like name when only its domain matches', () => {
    const audit = buildClientIdentityAudit({
      clients: [
        { id: 'root', companyName: 'Example Hospital', email: 'person@hospital.org' },
        { id: 'unit', companyName: 'Ward Alpha Example Hospital', email: 'ward@hospital.org' },
      ],
    });

    expect(audit.organizationCandidates).toHaveLength(0);
  });

  it('does not use broad or public email domains to join different organisations', () => {
    const audit = buildClientIdentityAudit({
      clients: [
        { id: 'client-a', companyName: 'Hospital Alpha', email: 'person@nhs.net' },
        { id: 'client-b', companyName: 'Council Beta', email: 'another@nhs.net' },
        { id: 'client-c', companyName: 'Business Gamma', email: 'person@gmail.com' },
      ],
    });

    expect(audit.organizationCandidates).toHaveLength(0);
  });

  it('blocks a merge when a non-canonical source carries a linked portal user', () => {
    const audit = buildClientIdentityAudit({
      clients: [
        { id: 'canonical', companyName: 'Example Council', sageAccountRef: 'EX-10' },
        { id: 'source', companyName: 'Example Council', sageAccountRef: 'EX-10' },
      ],
      bookingCounts: { canonical: 10 },
      linkedUserCounts: { canonical: 1, source: 1 },
    });

    expect(audit.organizationCandidates[0]).toMatchObject({
      executionEligibility: 'BLOCKED',
      totals: { usersToReassign: 1 },
    });
  });

  it('excludes previously merged records from future candidate detection', () => {
    const audit = buildClientIdentityAudit({
      clients: [
        { id: 'canonical', companyName: 'Example Council' },
        { id: 'source', companyName: 'Example Council', recordState: 'MERGED', mergedIntoClientId: 'canonical' },
      ],
    });

    expect(audit.organizationCandidates).toHaveLength(0);
    expect(audit.summary).toMatchObject({ clientRecords: 1, mergedRecordsExcluded: 1 });
  });
});
