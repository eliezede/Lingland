import { describe, expect, it } from 'vitest';
import { scopeAirtableRecordsToFinancialYear } from './financialYearScope';

describe('Airtable current financial-year scope', () => {
  it('keeps current-year interpreting jobs and holds older rows for review', () => {
    const selection = scopeAirtableRecordsToFinancialYear([
      { id: 'current', fields: { 'Booking Date & Time': '2026-07-06T13:00:00.000Z' } },
      { id: 'older', fields: { 'Booking Date & Time': '2026-03-31T13:00:00.000Z' } },
      { id: 'future', fields: { 'Booking Date & Time': '2027-04-01T13:00:00.000Z' } },
      { id: 'undated', fields: {} },
    ], 'REDBOOK', '2026-08-09');

    expect(selection.records.map(record => record.id)).toEqual(['current']);
    expect(selection.excludedRecords).toBe(3);
    expect(selection.undatedRecords).toBe(1);
    expect(selection.window.label).toBe('2026/27');
  });

  it('uses UK dates and the invoice issue date for finance rows', () => {
    const selection = scopeAirtableRecordsToFinancialYear([
      { id: 'invoice', fields: { 'Invoice Date': '06/07/2026' } },
      { id: 'historical', fields: { 'Issue Date': '18/03/2026' } },
    ], 'Invoices', '2026-08-09');

    expect(selection.records.map(record => record.id)).toEqual(['invoice']);
  });

  it('does not date-filter client hierarchy source tables', () => {
    const records = [{ id: 'client', fields: {} }];
    const selection = scopeAirtableRecordsToFinancialYear(records, 'Clients', '2026-08-09');
    expect(selection.scopeApplied).toBe(false);
    expect(selection.records).toEqual(records);
  });
});
