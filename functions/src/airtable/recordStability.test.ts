import { describe, expect, it } from 'vitest';
import {
  fingerprintAirtableSnapshot,
  hashAirtableRecordFields,
  hashStableValue,
  mergeAirtableSnapshots,
  stabilizeAirtableAttachments,
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

  it('includes nested identity fields in generic sync snapshots', () => {
    const first = hashStableValue({ tableName: 'Clients', identity: { name: 'Alpha', sage: 'A001' } });
    const second = hashStableValue({ tableName: 'Clients', identity: { name: 'Beta', sage: 'B001' } });

    expect(first).not.toBe(second);
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

  it('removes expiring Airtable URLs from attachment fingerprints', () => {
    const first = stabilizeAirtableAttachments([{
      id: 'attStable',
      filename: 'source.pdf',
      type: 'application/pdf',
      size: 2048,
      url: 'https://v5.airtableusercontent.com/file/a?expires=100&signature=one',
    }]);
    const second = stabilizeAirtableAttachments([{
      id: 'attStable',
      filename: 'source.pdf',
      type: 'application/pdf',
      size: 2048,
      url: 'https://v5.airtableusercontent.com/file/b?expires=200&signature=two',
    }]);

    expect(first).toEqual(second);
    expect(hashStableValue(first)).toBe(hashStableValue(second));
  });

  it('detects a replaced Airtable attachment even when the filename is unchanged', () => {
    const first = stabilizeAirtableAttachments([{ id: 'attOne', filename: 'source.pdf', size: 2048 }]);
    const second = stabilizeAirtableAttachments([{ id: 'attTwo', filename: 'source.pdf', size: 2048 }]);

    expect(hashStableValue(first)).not.toBe(hashStableValue(second));
  });
});
