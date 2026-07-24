import { describe, expect, it } from 'vitest';
import {
  MAX_CLIENT_IDENTITY_BATCH_MAPPINGS,
  CLIENT_IDENTITY_RECOMMENDATION_TTL_MS,
  validateClientIdentityDeferralRequest,
  validateClientIdentityDeferralReviewRun,
  validateClientIdentityMappingBatch,
  validateClientIdentityManualMappingBatch,
  validateClientIdentityManualReviewRun,
  validateClientIdentityPendingCanonicalApproval,
  validateClientIdentityPendingCanonicalTarget,
  validateClientIdentityRecommendationRun,
} from './clientIdentityMappingPolicy';

const recommendation = (overrides: Record<string, unknown> = {}) => ({
  sourceTable: 'Clients Book',
  groupKey: 'example trust',
  sourceNames: ['Example Trust'],
  action: 'MAP_TO_CLIENT',
  canonicalClientId: 'client-example',
  canonicalCompanyName: 'Example Trust',
  recommendationConfidence: 'HIGH',
  ...overrides,
});

describe('approved pending canonical target policy', () => {
  const now = Date.parse('2026-07-22T12:00:00.000Z');
  const run = {
    kind: 'AIRTABLE_SYNC_CENTER',
    dryRun: true,
    success: true,
    mappingVersion: 'airtable-sync-center-v9',
    userId: 'super-admin-1',
    finishedAt: new Date(now - 60_000).toISOString(),
    moduleResults: [{
      module: 'clients',
      diagnostics: {
        canonicalAccounts: {
          approvedPendingCanonicalAccounts: [{
            sourceTable: 'Clients',
            sourceRecordId: 'rec-official-1',
            groupKey: 'hsi002',
            clientId: 'airtable_client_hsi002',
            companyName: 'NHS Hampshire and Isle of Wight Integrated Care Board',
            sageAccountRef: 'HSI002',
          }],
        },
      },
    }],
  };

  it('accepts only the exact pending account approved in the same fresh client review', () => {
    expect(validateClientIdentityPendingCanonicalTarget(
      run,
      'airtable_client_hsi002',
      'super-admin-1',
      'airtable-sync-center-v9',
      now,
    )).toEqual({
      ok: true,
      target: expect.objectContaining({
        sourceTable: 'Clients',
        sourceRecordId: 'rec-official-1',
        groupKey: 'hsi002',
        clientId: 'airtable_client_hsi002',
        sageAccountRef: 'HSI002',
      }),
    });
    expect(validateClientIdentityPendingCanonicalTarget(
      run,
      'airtable_client_arbitrary',
      'super-admin-1',
      'airtable-sync-center-v9',
      now,
    )).toEqual({ ok: false, reason: 'PENDING_CANONICAL_TARGET_NOT_APPROVED_IN_RUN' });
  });

  it('rejects cross-admin, stale and malformed pending target evidence', () => {
    expect(validateClientIdentityPendingCanonicalTarget(
      run,
      'airtable_client_hsi002',
      'other-admin',
      'airtable-sync-center-v9',
      now,
    )).toEqual({ ok: false, reason: 'REVIEW_ACTOR_CHANGED' });
    expect(validateClientIdentityPendingCanonicalTarget(
      { ...run, finishedAt: new Date(now - CLIENT_IDENTITY_RECOMMENDATION_TTL_MS - 1).toISOString() },
      'airtable_client_hsi002',
      'super-admin-1',
      'airtable-sync-center-v9',
      now,
    )).toEqual({ ok: false, reason: 'REVIEW_RUN_EXPIRED' });
    const malformedRun = {
      ...run,
      moduleResults: [{
        module: 'clients',
        diagnostics: {
          canonicalAccounts: {
            approvedPendingCanonicalAccounts: [{
              sourceTable: 'Clients',
              groupKey: 'hsi002',
              clientId: 'airtable_client_hsi002',
              companyName: 'NHS Hampshire and Isle of Wight Integrated Care Board',
            }],
          },
        },
      }],
    };
    expect(validateClientIdentityPendingCanonicalTarget(
      malformedRun,
      'airtable_client_hsi002',
      'super-admin-1',
      'airtable-sync-center-v9',
      now,
    )).toEqual({ ok: false, reason: 'PENDING_CANONICAL_TARGET_EVIDENCE_INVALID' });
  });

  it('rejects a revoked or changed official approval before an alias can use it', () => {
    const target = {
      sourceTable: 'Clients' as const,
      sourceRecordId: 'rec-official-1',
      groupKey: 'hsi002',
      clientId: 'airtable_client_hsi002',
      companyName: 'NHS Hampshire and Isle of Wight Integrated Care Board',
      sageAccountRef: 'HSI002',
    };
    const approval = {
      status: 'ACTIVE',
      action: 'APPROVE_NEW_CLIENT',
      sourceTable: 'Clients',
      groupKey: 'hsi002',
      canonicalClientId: 'airtable_client_hsi002',
    };
    expect(validateClientIdentityPendingCanonicalApproval(target, approval)).toEqual({ ok: true });
    expect(validateClientIdentityPendingCanonicalApproval(
      target,
      { ...approval, status: 'REVOKED' },
    )).toEqual({ ok: false, reason: 'PENDING_CANONICAL_APPROVAL_NOT_ACTIVE' });
    expect(validateClientIdentityPendingCanonicalApproval(
      target,
      { ...approval, canonicalClientId: 'airtable_client_other' },
    )).toEqual({ ok: false, reason: 'PENDING_CANONICAL_APPROVAL_EVIDENCE_CHANGED' });
  });
});

describe('manual client identity batch mapping policy', () => {
  const manualMapping = (overrides: Record<string, unknown> = {}) => ({
    sourceTable: 'Clients Book',
    groupKey: 'example trust department',
    sourceNames: ['Example Trust Department'],
    action: 'MAP_TO_CLIENT',
    canonicalClientId: 'client-example',
    canonicalCompanyName: 'Example Trust',
    ...overrides,
  });

  const reviewRun = (finishedAt: string) => ({
    kind: 'AIRTABLE_SYNC_CENTER',
    dryRun: true,
    success: true,
    mappingVersion: 'airtable-sync-center-v9',
    userId: 'super-admin-1',
    finishedAt,
    moduleResults: [{
      module: 'clients',
      diagnostics: {
        clientsBook: {
          conflictCandidates: [{
            sourceTable: 'Clients Book',
            groupKey: 'example trust department',
            companyNames: ['Example Trust Department'],
            reason: 'NEW_CANONICAL_ORGANISATION_REVIEW_REQUIRED',
          }],
        },
      },
    }],
  });

  it('requires a Super Admin, confirmation and one shared canonical target', () => {
    expect(() => validateClientIdentityManualMappingBatch([manualMapping()], 'ADMIN', true))
      .toThrow(/Super Admin/i);
    expect(() => validateClientIdentityManualMappingBatch([manualMapping()], 'SUPER_ADMIN', false))
      .toThrow(/confirmation/i);
    expect(() => validateClientIdentityManualMappingBatch([
      manualMapping(),
      manualMapping({ groupKey: 'other department', sourceNames: ['Other Department'], canonicalClientId: 'client-other' }),
    ], 'SUPER_ADMIN', true)).toThrow(/same canonical client/i);
  });

  it('rejects unsupported actions, duplicate scopes and missing source evidence', () => {
    expect(() => validateClientIdentityManualMappingBatch([
      manualMapping({ action: 'APPROVE_NEW_CLIENT' }),
    ], 'SUPER_ADMIN', true)).toThrow(/existing client/i);
    expect(() => validateClientIdentityManualMappingBatch([
      manualMapping(),
      manualMapping(),
    ], 'SUPER_ADMIN', true)).toThrow(/duplicated/i);
    expect(() => validateClientIdentityManualMappingBatch([
      manualMapping({ sourceNames: [] }),
    ], 'SUPER_ADMIN', true)).toThrow(/source evidence/i);
  });

  it('binds every selected identity to the same recent Clients dry run and actor', () => {
    const now = Date.parse('2026-07-22T12:00:00.000Z');
    const mappings = validateClientIdentityManualMappingBatch([manualMapping()], 'SUPER_ADMIN', true);
    const run = reviewRun(new Date(now - 60_000).toISOString());

    expect(validateClientIdentityManualReviewRun(
      run,
      mappings,
      'super-admin-1',
      'airtable-sync-center-v9',
      now,
    )).toEqual({ ok: true });
    expect(validateClientIdentityManualReviewRun(
      run,
      [{ ...mappings[0], groupKey: 'changed identity' }],
      'super-admin-1',
      'airtable-sync-center-v9',
      now,
    )).toEqual({ ok: false, reason: 'IDENTITY_NO_LONGER_UNRESOLVED' });
    expect(validateClientIdentityManualReviewRun(
      run,
      [{ ...mappings[0], sourceNames: ['Changed evidence'] }],
      'super-admin-1',
      'airtable-sync-center-v9',
      now,
    )).toEqual({ ok: false, reason: 'IDENTITY_SOURCE_EVIDENCE_CHANGED' });
    expect(validateClientIdentityManualReviewRun(
      run,
      mappings,
      'super-admin-2',
      'airtable-sync-center-v9',
      now,
    )).toEqual({ ok: false, reason: 'REVIEW_ACTOR_CHANGED' });
  });

  it('rejects expired manual review runs', () => {
    const now = Date.parse('2026-07-22T12:00:00.000Z');
    const mappings = validateClientIdentityManualMappingBatch([manualMapping()], 'SUPER_ADMIN', true);
    expect(validateClientIdentityManualReviewRun(
      reviewRun(new Date(now - CLIENT_IDENTITY_RECOMMENDATION_TTL_MS - 1).toISOString()),
      mappings,
      'super-admin-1',
      'airtable-sync-center-v9',
      now,
    )).toEqual({ ok: false, reason: 'REVIEW_RUN_EXPIRED' });
  });
});

describe('client identity source deferral policy', () => {
  const now = Date.parse('2026-07-24T12:00:00.000Z');
  const request = {
    sourceTable: 'Departments',
    groupKey: 'unknown legacy unit',
    sourceNames: ['Unknown Legacy Unit'],
    category: 'INSUFFICIENT_SOURCE_EVIDENCE',
    reason: 'The Airtable row has no parent, contact, domain, address or linked workflow evidence.',
  };
  const run = {
    kind: 'AIRTABLE_SYNC_CENTER',
    dryRun: true,
    success: true,
    mappingVersion: 'airtable-sync-center-v10',
    userId: 'super-admin-1',
    finishedAt: new Date(now - 60_000).toISOString(),
    moduleResults: [{
      module: 'clients',
      diagnostics: {
        clientsBook: {
          conflictCandidates: [{
            sourceTable: 'Departments',
            groupKey: 'unknown legacy unit',
            companyNames: ['Unknown Legacy Unit'],
            reason: 'DEPARTMENT_CLIENT_NOT_RESOLVED',
          }],
        },
      },
    }],
  };

  it('requires Super Admin, an allowed category and a material reason', () => {
    expect(() => validateClientIdentityDeferralRequest(request, 'ADMIN', true))
      .toThrow(/Super Admin/i);
    expect(() => validateClientIdentityDeferralRequest(request, 'SUPER_ADMIN', false))
      .toThrow(/confirmation/i);
    expect(() => validateClientIdentityDeferralRequest(
      { ...request, category: 'UNKNOWN' },
      'SUPER_ADMIN',
      true,
    )).toThrow(/category/i);
    expect(() => validateClientIdentityDeferralRequest(
      { ...request, reason: 'No evidence' },
      'SUPER_ADMIN',
      true,
    )).toThrow(/at least 20/i);
  });

  it('binds a deferral to the exact unresolved source evidence in a fresh dry run', () => {
    const validated = validateClientIdentityDeferralRequest(request, 'SUPER_ADMIN', true);
    expect(validateClientIdentityDeferralReviewRun(
      run,
      validated,
      'super-admin-1',
      'airtable-sync-center-v10',
      now,
    )).toEqual({ ok: true });
    expect(validateClientIdentityDeferralReviewRun(
      run,
      { ...validated, sourceNames: ['Changed Unit'] },
      'super-admin-1',
      'airtable-sync-center-v10',
      now,
    )).toEqual({ ok: false, reason: 'IDENTITY_SOURCE_EVIDENCE_CHANGED' });
    expect(validateClientIdentityDeferralReviewRun(
      run,
      { ...validated, groupKey: 'different unit' },
      'super-admin-1',
      'airtable-sync-center-v10',
      now,
    )).toEqual({ ok: false, reason: 'IDENTITY_NO_LONGER_UNRESOLVED' });
  });
});

describe('client identity batch mapping policy', () => {
  it('allows an explicitly confirmed high-confidence mapping for active admin roles', () => {
    expect(validateClientIdentityMappingBatch([recommendation()], 'ADMIN', true)).toEqual([
      expect.objectContaining({ action: 'MAP_TO_CLIENT', canonicalClientId: 'client-example' }),
    ]);
  });

  it('requires explicit confirmation', () => {
    expect(() => validateClientIdentityMappingBatch([recommendation()], 'SUPER_ADMIN', false))
      .toThrow(/confirmation/i);
  });

  it('rejects creation and medium-confidence suggestions from batch review', () => {
    expect(() => validateClientIdentityMappingBatch([
      recommendation({ action: 'APPROVE_NEW_CLIENT' }),
    ], 'SUPER_ADMIN', true)).toThrow(/existing clients/i);
    expect(() => validateClientIdentityMappingBatch([
      recommendation({ recommendationConfidence: 'MEDIUM' }),
    ], 'SUPER_ADMIN', true)).toThrow(/high-confidence/i);
  });

  it('rejects duplicate scopes and oversized batches', () => {
    expect(() => validateClientIdentityMappingBatch([
      recommendation(),
      recommendation({ canonicalClientId: 'client-other' }),
    ], 'ADMIN', true)).toThrow(/duplicated/i);
    expect(() => validateClientIdentityMappingBatch(
      Array.from({ length: MAX_CLIENT_IDENTITY_BATCH_MAPPINGS + 1 }, (_, index) => recommendation({ groupKey: `client ${index}` })),
      'ADMIN',
      true,
    )).toThrow(/between 1 and/i);
  });

  it('binds batch review to the same recent dry run, actor and recommendation target', () => {
    const now = Date.parse('2026-07-22T12:00:00.000Z');
    const run = {
      kind: 'AIRTABLE_SYNC_CENTER',
      dryRun: true,
      success: true,
      mappingVersion: 'airtable-sync-center-v9',
      userId: 'admin-1',
      finishedAt: new Date(now - 60_000).toISOString(),
      moduleResults: [{
        module: 'clients',
        diagnostics: {
          clientsBook: {
            conflictCandidates: [{
              sourceTable: 'Clients Book',
              groupKey: 'example trust',
              recommendation: {
                canonicalClientId: 'client-example',
                confidence: 'HIGH',
                autoReviewEligible: true,
              },
            }],
          },
        },
      }],
    };
    const mappings = validateClientIdentityMappingBatch([recommendation()], 'ADMIN', true);

    expect(validateClientIdentityRecommendationRun(
      run,
      mappings,
      'admin-1',
      'airtable-sync-center-v9',
      now,
    )).toEqual({ ok: true });
    expect(validateClientIdentityRecommendationRun(
      run,
      [{ ...mappings[0], canonicalClientId: 'client-other' }],
      'admin-1',
      'airtable-sync-center-v9',
      now,
    )).toEqual({ ok: false, reason: 'RECOMMENDATION_NO_LONGER_MATCHES' });
  });

  it('rejects stale or cross-admin recommendation runs', () => {
    const now = Date.parse('2026-07-22T12:00:00.000Z');
    const mappings = validateClientIdentityMappingBatch([recommendation()], 'ADMIN', true);
    const run = {
      kind: 'AIRTABLE_SYNC_CENTER',
      dryRun: true,
      success: true,
      mappingVersion: 'airtable-sync-center-v9',
      userId: 'admin-1',
      finishedAt: new Date(now - CLIENT_IDENTITY_RECOMMENDATION_TTL_MS - 1).toISOString(),
      moduleResults: [],
    };
    expect(validateClientIdentityRecommendationRun(
      run,
      mappings,
      'admin-1',
      'airtable-sync-center-v9',
      now,
    )).toEqual({ ok: false, reason: 'RECOMMENDATION_RUN_EXPIRED' });
    expect(validateClientIdentityRecommendationRun(
      { ...run, finishedAt: new Date(now - 60_000).toISOString() },
      mappings,
      'admin-2',
      'airtable-sync-center-v9',
      now,
    )).toEqual({ ok: false, reason: 'RECOMMENDATION_ACTOR_CHANGED' });
  });
});
