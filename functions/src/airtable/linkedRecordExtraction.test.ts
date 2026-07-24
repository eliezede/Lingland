import { describe, expect, it } from 'vitest';
import { pickExactLinkedRecordIds } from './linkedRecordExtraction';

describe('pickExactLinkedRecordIds', () => {
  it('does not treat lookup fields ending with a linked field name as record links', () => {
    const result = pickExactLinkedRecordIds({
      'Job Number from redbook': ['rec-job-a'],
      'Booking Agent (from Job Number from redbook)': ['Booking Agent'],
      'DATE TIME CALC (from Job Number from redbook)': ['2026-07-24T10:00:00.000Z'],
      'LANGUAGE (from feed from redbook)': ['Polish'],
    }, ['Job Number from redbook']);

    expect(result).toEqual(['rec-job-a']);
  });

  it('normalizes decorated field names and removes duplicate links', () => {
    const result = pickExactLinkedRecordIds({
      '🖥️ REDBOOK': ['rec-job-a', 'rec-job-a', 'rec-job-b'],
    }, ['REDBOOK']);

    expect(result).toEqual(['rec-job-a', 'rec-job-b']);
  });
});
