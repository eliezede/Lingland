import { describe, expect, it } from 'vitest';
import {
  fingerprintAirtableSnapshot,
  hashAirtableRecordFields,
  mergeAirtableSnapshots,
} from './recordStability';

describe('Airtable record stability', () => {
  it('hashes equivalent nested fields independently of object key order', () => {
    const first = {
      Status: 'Booked',
      Interpreter: [{ id: 'rec1', name: 'Test Person' }],
      Meta: { rate: 25, currency: 'GBP' },
    };
    const second = {
      Meta: { currency: 'GBP', rate: 25 },
      Interpreter: [{ name: 'Test Person', id: 'rec1' }],
      Status: 'Booked',
    };

    expect(hashAirtableRecordFields(first)).toBe(hashAirtableRecordFields(second));
  });

  it('detects non-status source changes', () => {
    const before = hashAirtableRecordFields({ Status: 'Booked', 'Booking Date': '2026-07-15' });
    const after = hashAirtableRecordFields({ Status: 'Booked', 'Booking Date': '2026-07-16' });

    expect(after).not.toBe(before);
  });

  it('uses the newest pass while retaining records omitted by a moving page boundary', () => {
    const firstPass = [
      { id: 'recA', fields: { Status: 'Opened' } },
      { id: 'recB', fields: { Status: 'Booked' } },
    ];
    const secondPass = [
      { id: 'recB', fields: { Status: 'Invoiced' } },
      { id: 'recC', fields: { Status: 'Opened' } },
    ];

    expect(mergeAirtableSnapshots(firstPass, secondPass)).toEqual([
      { id: 'recA', fields: { Status: 'Opened' } },
      { id: 'recB', fields: { Status: 'Invoiced' } },
      { id: 'recC', fields: { Status: 'Opened' } },
    ]);
  });

  it('fingerprints the same snapshot independently of record order', () => {
    const records = [
      { id: 'recA', fields: { Status: 'Opened' } },
      { id: 'recB', fields: { Status: 'Booked' } },
    ];

    expect(fingerprintAirtableSnapshot(records)).toBe(fingerprintAirtableSnapshot([...records].reverse()));
  });
});
