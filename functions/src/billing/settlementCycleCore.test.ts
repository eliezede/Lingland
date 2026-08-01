import { describe, expect, it } from 'vitest';
import {
  canTransitionSettlementCycle,
  londonPeriodKey,
  normalizeSettlementService,
  settlementCycleId,
  settlementPeriodBounds,
  summarizeSettlementItems,
} from './settlementCycleCore';

describe('settlement cycle core', () => {
  it('builds deterministic service-specific cycle ids', () => {
    expect(settlementCycleId('2026-07', 'INTERPRETATION')).toBe('2026-07_interpretation');
    expect(settlementCycleId('2026-07', 'TRANSLATION')).toBe('2026-07_translation');
  });

  it('normalizes UI service labels', () => {
    expect(normalizeSettlementService('interpreting')).toBe('INTERPRETATION');
    expect(normalizeSettlementService('translations')).toBe('TRANSLATION');
  });

  it('uses the Europe/London service month at UTC boundaries', () => {
    expect(londonPeriodKey('2026-07-31T23:30:00.000Z')).toBe('2026-08');
  });

  it('creates inclusive calendar bounds and buffered query bounds', () => {
    expect(settlementPeriodBounds('2026-02').periodEnd).toBe('2026-02-28');
  });

  it('prevents skipping review before approval', () => {
    expect(canTransitionSettlementCycle('OPEN', 'APPROVED')).toBe(false);
    expect(canTransitionSettlementCycle('REVIEW', 'APPROVED')).toBe(true);
  });

  it('summarizes jobs, professionals and exceptions independently', () => {
    expect(summarizeSettlementItems([
      { bookingId: 'a', interpreterId: 'i1', interpreterName: 'One', amount: 10, status: 'READY' },
      { bookingId: 'b', interpreterId: 'i1', interpreterName: 'One', amount: 20, status: 'INVOICED' },
      { bookingId: 'c', interpreterId: '', interpreterName: '', amount: 0, status: 'EXCEPTION' },
    ])).toEqual({
      jobCount: 3,
      professionalCount: 1,
      readyCount: 1,
      invoicedCount: 1,
      paidCount: 0,
      exceptionCount: 1,
      totalAmount: 30,
      readyAmount: 10,
    });
  });
});
