import { describe, expect, it } from 'vitest';
import {
  buildExcludedOrganizationPairs,
  ClientIdentityDecisionRecord,
  normalizeDecisionPartitions,
} from './clientIdentityDecisionCore';

const decision = (overrides: Partial<ClientIdentityDecisionRecord>): ClientIdentityDecisionRecord => ({
  id: 'decision-1',
  candidateId: 'candidate-1',
  candidateFingerprint: 'fingerprint-1',
  kind: 'ORGANIZATION',
  decision: 'SPLIT',
  candidateLabel: 'Example Council',
  clientIds: ['a', 'b', 'c'],
  partitions: [['a', 'b'], ['c']],
  reason: 'Reviewed source records',
  notes: '',
  revisitAt: '',
  active: true,
  decidedBy: 'admin-1',
  decidedByName: 'Admin One',
  decidedAt: '2026-07-19T00:00:00.000Z',
  updatedBy: 'admin-1',
  updatedByName: 'Admin One',
  updatedAt: '2026-07-19T00:00:00.000Z',
  ...overrides,
});

describe('client identity decision policy', () => {
  it('normalizes a complete non-overlapping partition', () => {
    expect(normalizeDecisionPartitions(['c', 'a', 'b'], [['c'], ['b', 'a']]))
      .toEqual([['a', 'b'], ['c']]);
  });

  it('rejects incomplete or overlapping partitions', () => {
    expect(normalizeDecisionPartitions(['a', 'b', 'c'], [['a'], ['b']])).toEqual([]);
    expect(normalizeDecisionPartitions(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']])).toEqual([]);
  });

  it('excludes every cross-partition pair for a split decision', () => {
    expect(buildExcludedOrganizationPairs([decision({})])).toEqual(['a|c', 'b|c']);
  });

  it('excludes every pair for a rejected duplicate candidate', () => {
    expect(buildExcludedOrganizationPairs([decision({ decision: 'REJECTED', partitions: [] })]))
      .toEqual(['a|b', 'a|c', 'b|c']);
  });

  it('ignores deferred, inactive, and agent decisions', () => {
    expect(buildExcludedOrganizationPairs([
      decision({ decision: 'DEFERRED' }),
      decision({ active: false }),
      decision({ kind: 'AGENT' }),
    ])).toEqual([]);
  });
});
