import { describe, expect, it } from 'vitest';
import { addDaysToDateKey, formatLondonDate, getLondonDateKey, parseLondonDateTime } from './londonDateTime';

describe('London date and time parsing', () => {
  it('uses BST during the summer', () => {
    expect(parseLondonDateTime('2026-07-12', '10:00')?.toISOString()).toBe('2026-07-12T09:00:00.000Z');
  });

  it('uses GMT during the winter', () => {
    expect(parseLondonDateTime('2026-01-12', '10:00')?.toISOString()).toBe('2026-01-12T10:00:00.000Z');
  });

  it('rejects incomplete schedule values', () => {
    expect(parseLondonDateTime('', '10:00')).toBeNull();
  });

  it('uses the London calendar date near midnight during BST', () => {
    expect(getLondonDateKey(new Date('2026-08-23T23:30:00.000Z'))).toBe('2026-08-24');
  });

  it('formats date-only values without changing their calendar day', () => {
    expect(formatLondonDate('2026-08-24', { day: '2-digit', month: 'short' })).toBe('24 Aug');
  });

  it('moves date keys without depending on the device timezone', () => {
    expect(addDaysToDateKey('2026-10-31', 1)).toBe('2026-11-01');
  });
});
