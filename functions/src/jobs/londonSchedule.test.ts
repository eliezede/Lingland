import { describe, expect, it } from 'vitest';
import { parseLondonSchedule } from './londonSchedule';

describe('London job schedule', () => {
  it('converts a summer session from BST to UTC', () => {
    expect(new Date(parseLondonSchedule('2026-07-12', '10:00')!).toISOString()).toBe('2026-07-12T09:00:00.000Z');
  });

  it('keeps a winter session in GMT', () => {
    expect(new Date(parseLondonSchedule('2026-01-12', '10:00')!).toISOString()).toBe('2026-01-12T10:00:00.000Z');
  });
});
