import { describe, expect, it } from 'vitest';
import { rankInterpreterCandidate } from './interpreterMatcher';

const booking = {
  date: '2026-07-30',
  startTime: '10:00',
  durationMinutes: 60,
  serviceCategory: 'INTERPRETATION',
  languageTo: 'Polish',
  locationType: 'ONSITE',
  postcode: 'SO16 6YD',
};

const interpreter = {
  name: 'Eligible professional',
  status: 'ACTIVE',
  languages: ['Polish'],
  isAvailable: true,
  acceptsDirectAssignment: true,
  dbsExpiry: '2027-01-01',
  hasCar: true,
  postcode: 'SO16 3AB',
};

describe('deterministic interpreter matcher', () => {
  it('ranks an active eligible professional without personal data in the result', () => {
    const result = rankInterpreterCandidate('professional-1', interpreter, booking, false);
    expect(result).toMatchObject({ id: 'professional-1', score: expect.any(Number) });
    expect(result?.score).toBeGreaterThanOrEqual(60);
    expect(JSON.stringify(result)).not.toMatch(/"postcode"|"email"|"phone"|"address"|SO16/i);
  });

  it('rejects schedule conflicts and expired DBS evidence', () => {
    expect(rankInterpreterCandidate('professional-1', interpreter, booking, true)).toBeNull();
    expect(rankInterpreterCandidate('professional-1', { ...interpreter, dbsExpiry: '2025-01-01' }, booking, false)).toBeNull();
  });

  it('keeps translation-only professionals out of interpreting jobs', () => {
    expect(rankInterpreterCandidate('professional-1', { ...interpreter, status: 'ONLY_TRANSL' }, booking, false)).toBeNull();
    expect(rankInterpreterCandidate('professional-1', { ...interpreter, status: 'ONLY_TRANSL' }, { ...booking, serviceCategory: 'TRANSLATION' }, false)).not.toBeNull();
  });

  it('rejects profiles without the requested language', () => {
    expect(rankInterpreterCandidate('professional-1', { ...interpreter, languages: ['Turkish'] }, booking, false)).toBeNull();
  });
});
