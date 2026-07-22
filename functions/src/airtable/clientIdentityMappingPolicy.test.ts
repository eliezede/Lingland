import { describe, expect, it } from 'vitest';
import {
  MAX_CLIENT_IDENTITY_BATCH_MAPPINGS,
  CLIENT_IDENTITY_RECOMMENDATION_TTL_MS,
  validateClientIdentityMappingBatch,
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
