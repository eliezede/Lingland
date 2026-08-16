import { describe, expect, it } from 'vitest';
import {
  classifyAccountingJobLink,
  deriveFinancialYearWindow,
  deriveObservedSourceWindow,
  intersectCoverageWindows,
  intersectWithAccountingSnapshot,
  toIsoDay,
} from './sourceReconciliationCore';

describe('source reconciliation coverage', () => {
  it('derives a stable observed Airtable service window', () => {
    expect(deriveObservedSourceWindow([
      { bookedFor: '2026-07-03T09:30:00.000Z' },
      { bookedFor: '' },
      { bookedFor: '2025-09-09T07:30:00.000Z' },
      { bookedFor: '2027-01-19T13:30:00.000Z' },
    ], ['bookedFor'])).toEqual({
      start: '2025-09-09',
      end: '2027-01-19',
      validDateCount: 3,
      missingDateCount: 1,
    });
  });

  it('limits reconciliation to the overlap with the Sage snapshot', () => {
    expect(intersectWithAccountingSnapshot({
      start: '2025-09-09',
      end: '2027-01-19',
    }, '2026-08-07')).toEqual({
      start: '2025-09-09',
      end: '2026-08-07',
    });
  });

  it('derives the configured current financial year and prioritizes its overlap', () => {
    const financialYear = deriveFinancialYearWindow('2026-08-09', 4, 1);
    expect(financialYear).toEqual({
      start: '2026-04-01',
      end: '2027-03-31',
      label: '2026/27',
      startMonth: 4,
      startDay: 1,
    });
    expect(intersectCoverageWindows(
      { start: '2025-09-09', end: '2026-08-07' },
      financialYear,
    )).toEqual({ start: '2026-04-01', end: '2026-08-07' });
  });

  it('rolls the configured financial year back before its start date', () => {
    expect(deriveFinancialYearWindow('2026-03-31', 4, 1).label).toBe('2025/26');
  });

  it('requires an exact job reference inside the overlap and preserves older Sage history', () => {
    const airtableWindow = { start: '2025-09-09', end: '2027-01-19' };
    expect(classifyAccountingJobLink({
      accountingDate: '2024-05-01',
      hasExactJobReference: true,
      airtableWindow,
      sageSourceAsOf: '2026-08-07',
    })).toBe('OUTSIDE_AIRTABLE_COVERAGE');
    expect(classifyAccountingJobLink({
      accountingDate: '2026-06-01',
      hasExactJobReference: false,
      airtableWindow,
      sageSourceAsOf: '2026-08-07',
    })).toBe('IN_PERIOD_REFERENCE_REQUIRED');
    expect(classifyAccountingJobLink({
      accountingDate: '2026-06-01',
      hasExactJobReference: true,
      airtableWindow,
      sageSourceAsOf: '2026-08-07',
    })).toBe('ELIGIBLE_EXACT_REFERENCE');
    expect(classifyAccountingJobLink({
      accountingDate: '2026-09-01',
      hasExactJobReference: true,
      airtableWindow,
      sageSourceAsOf: '2026-08-07',
    })).toBe('AFTER_SAGE_SNAPSHOT');
  });

  it('normalizes valid dates without accepting impossible calendar days', () => {
    expect(toIsoDay('2026-08-07T16:39:52.000Z')).toBe('2026-08-07');
    expect(toIsoDay('06/07/2026 13:00')).toBe('2026-07-06');
    expect(toIsoDay('13/07/2026')).toBe('2026-07-13');
    expect(toIsoDay('2026-02-31')).toBeNull();
    expect(toIsoDay('31/02/2026')).toBeNull();
  });
});
