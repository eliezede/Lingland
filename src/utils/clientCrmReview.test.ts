import { describe, expect, it } from 'vitest';
import { clientCrmReviewKey, deduplicateClientCrmReviewScopes } from './clientCrmReview';

describe('Client CRM review queue', () => {
  it('builds a stable key from the source table and normalized group', () => {
    expect(clientCrmReviewKey('Departments', 'rhch nick jonas ward')).toBe(
      'Departments|rhch nick jonas ward',
    );
  });

  it('keeps one review decision when multiple source records share a scope', () => {
    const candidates = [
      { sourceTable: 'Departments', groupKey: 'rhch nick jonas ward', sourceRecordId: 'one' },
      { sourceTable: 'Departments', groupKey: 'rhch nick jonas ward', sourceRecordId: 'two' },
      { sourceTable: 'Clients Book', groupKey: 'rhch nick jonas ward', sourceRecordId: 'three' },
    ];

    expect(deduplicateClientCrmReviewScopes(candidates)).toEqual([
      candidates[0],
      candidates[2],
    ]);
  });
});
