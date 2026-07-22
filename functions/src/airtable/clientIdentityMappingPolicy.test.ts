import { describe, expect, it } from 'vitest';
import {
  MAX_CLIENT_IDENTITY_BATCH_MAPPINGS,
  CLIENT_IDENTITY_RECOMMENDATION_TTL_MS,
  validateClientIdentityMappingBatch,
  validateClientIdentityManualMappingBatch,
  validateClientIdentityManualReviewRun,
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
    mappingVersion: 'airtable-sync-center-v8',
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
      'airtable-sync-center-v8',
      now,
    )).toEqual({ ok: true });
    expect(validateClientIdentityManualReviewRun(
      run,
      [{ ...mappings[0], groupKey: 'changed identity' }],
      'super-admin-1',
      'airtable-sync-center-v8',
      now,
    )).toEqual({ ok: false, reason: 'IDENTITY_NO_LONGER_UNRESOLVED' });
    expect(validateClientIdentityManualReviewRun(
      run,
      [{ ...mappings[0], sourceNames: ['Changed evidence'] }],
      'super-admin-1',
      'airtable-sync-center-v8',
      now,
    )).toEqual({ ok: false, reason: 'IDENTITY_SOURCE_EVIDENCE_CHANGED' });
    expect(validateClientIdentityManualReviewRun(
      run,
      mappings,
      'super-admin-2',
      'airtable-sync-center-v8',
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
      'airtable-sync-center-v8',
      now,
    )).toEqual({ ok: false, reason: 'REVIEW_RUN_EXPIRED' });
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
      mappingVersion: 'airtable-sync-center-v8',
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
      'airtable-sync-center-v8',
      now,
    )).toEqual({ ok: true });
    expect(validateClientIdentityRecommendationRun(
      run,
      [{ ...mappings[0], canonicalClientId: 'client-other' }],
      'admin-1',
      'airtable-sync-center-v8',
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
      mappingVersion: 'airtable-sync-center-v8',
      userId: 'admin-1',
      finishedAt: new Date(now - CLIENT_IDENTITY_RECOMMENDATION_TTL_MS - 1).toISOString(),
      moduleResults: [],
    };
    expect(validateClientIdentityRecommendationRun(
      run,
      mappings,
      'admin-1',
      'airtable-sync-center-v8',
      now,
    )).toEqual({ ok: false, reason: 'RECOMMENDATION_RUN_EXPIRED' });
    expect(validateClientIdentityRecommendationRun(
      { ...run, finishedAt: new Date(now - 60_000).toISOString() },
      mappings,
      'admin-2',
      'airtable-sync-center-v8',
      now,
    )).toEqual({ ok: false, reason: 'RECOMMENDATION_ACTOR_CHANGED' });
  });
});
