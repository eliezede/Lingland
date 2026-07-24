import { describe, expect, it } from 'vitest';
import { aggregateClientInvoiceRows } from './clientInvoiceAggregation';

type Booking = { id: string };

describe('aggregateClientInvoiceRows', () => {
  it('combines Airtable invoice rows that share an invoice number', () => {
    const groups = aggregateClientInvoiceRows<Booking>([
      {
        sourceRecordId: 'rec-a',
        invoiceNumber: 'HAM007.Sept.25',
        hasInvoiceReference: true,
        linkedSourceIds: ['job-a'],
        bookings: [{ id: 'booking-a' }],
        grossAmount: 362.88,
        subtotalAmount: 302.4,
        status: 'PAID',
      },
      {
        sourceRecordId: 'rec-b',
        invoiceNumber: 'HAM007.Sept.25',
        hasInvoiceReference: true,
        linkedSourceIds: ['job-b'],
        bookings: [{ id: 'booking-b' }],
        grossAmount: 99,
        subtotalAmount: 82.5,
        status: 'PAID',
      },
    ], booking => booking.id);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      invoiceNumber: 'HAM007.Sept.25',
      sourceRecordIds: ['rec-a', 'rec-b'],
      linkedSourceIds: ['job-a', 'job-b'],
      grossAmount: 461.88,
      subtotalAmount: 384.9,
      status: 'PAID',
      statusMismatch: false,
    });
    expect(groups[0].lines).toEqual([
      expect.objectContaining({ key: 'booking-a', grossAmount: 362.88 }),
      expect.objectContaining({ key: 'booking-b', grossAmount: 99 }),
    ]);
  });

  it('merges repeated source rows for the same booking without losing value', () => {
    const groups = aggregateClientInvoiceRows<Booking>([
      {
        sourceRecordId: 'rec-a',
        invoiceNumber: 'INV-1',
        hasInvoiceReference: true,
        linkedSourceIds: ['job-a'],
        bookings: [{ id: 'booking-a' }],
        grossAmount: 60,
        subtotalAmount: 50,
        status: 'SENT',
      },
      {
        sourceRecordId: 'rec-b',
        invoiceNumber: 'INV-1',
        hasInvoiceReference: true,
        linkedSourceIds: ['job-a'],
        bookings: [{ id: 'booking-a' }],
        grossAmount: 12,
        subtotalAmount: 10,
        status: 'PAID',
      },
    ], booking => booking.id);

    expect(groups[0].lines).toEqual([
      expect.objectContaining({
        key: 'booking-a',
        sourceRecordIds: ['rec-a', 'rec-b'],
        grossAmount: 72,
        subtotalAmount: 60,
      }),
    ]);
    expect(groups[0]).toMatchObject({
      status: 'SENT',
      sourceStatuses: ['SENT', 'PAID'],
      statusMismatch: true,
    });
  });

  it('keeps missing-reference records separate', () => {
    const groups = aggregateClientInvoiceRows<Booking>([
      {
        sourceRecordId: 'rec-a',
        invoiceNumber: 'AIRTABLE-INV-rec-a',
        hasInvoiceReference: false,
        linkedSourceIds: [],
        bookings: [],
        grossAmount: 0,
        subtotalAmount: 0,
        status: 'DRAFT',
      },
      {
        sourceRecordId: 'rec-b',
        invoiceNumber: 'AIRTABLE-INV-rec-b',
        hasInvoiceReference: false,
        linkedSourceIds: [],
        bookings: [],
        grossAmount: 0,
        subtotalAmount: 0,
        status: 'DRAFT',
      },
    ], booking => booking.id);

    expect(groups).toHaveLength(2);
    expect(groups.map(group => group.sourceRecordIds)).toEqual([['rec-a'], ['rec-b']]);
  });
});
