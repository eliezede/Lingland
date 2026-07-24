import { describe, expect, it } from 'vitest';
import {
  auditBookingInvoiceLinks,
  getExpectedFinancialInvoiceStatus,
} from './financialLinkIntegrity';

const booking = (data: Record<string, unknown> = {}) => ({
  id: 'booking-a',
  data: {
    jobNumber: 'LING26.16512 Arabic',
    clientId: 'client-a',
    clientName: 'Client A',
    sourceSystem: 'AIRTABLE',
    sourceTable: 'REDBOOK',
    sourceRecordId: 'rec-job-a',
    status: 'INVOICED',
    ...data,
  },
});

describe('auditBookingInvoiceLinks', () => {
  it('detects a financially progressed job without an invoice relationship', () => {
    const issues = auditBookingInvoiceLinks({
      bookings: [booking({
        airtableStatusSignals: { invoiceNumber: 'HIC0001.7480', hasClientInvoice: true },
      })],
      clientInvoices: [],
      clientInvoiceLines: [],
    });

    expect(issues).toEqual([
      expect.objectContaining({
        bookingId: 'booking-a',
        sourceInvoiceReference: 'HIC0001.7480',
        reason: 'CLIENT_INVOICE_LINK_MISSING',
        severity: 'HIGH',
      }),
    ]);
  });

  it('accepts a booking linked to an existing invoice and line', () => {
    const issues = auditBookingInvoiceLinks({
      bookings: [booking({ clientInvoiceId: 'invoice-a' })],
      clientInvoices: [{ id: 'invoice-a', data: {} }],
      clientInvoiceLines: [{
        id: 'line-a',
        data: { bookingId: 'booking-a', invoiceId: 'invoice-a' },
      }],
    });

    expect(issues).toEqual([]);
  });

  it('detects a direct link to a missing invoice document', () => {
    const issues = auditBookingInvoiceLinks({
      bookings: [booking({ clientInvoiceId: 'invoice-missing' })],
      clientInvoices: [],
      clientInvoiceLines: [],
    });

    expect(issues[0]).toMatchObject({
      invoiceIds: ['invoice-missing'],
      reason: 'CLIENT_INVOICE_DOCUMENT_MISSING',
      severity: 'HIGH',
    });
  });

  it('detects a missing booking backlink when a verified line exists', () => {
    const issues = auditBookingInvoiceLinks({
      bookings: [booking()],
      clientInvoices: [{ id: 'invoice-a', data: {} }],
      clientInvoiceLines: [{
        id: 'line-a',
        data: { bookingId: 'booking-a', clientInvoiceId: 'invoice-a' },
      }],
    });

    expect(issues[0]).toMatchObject({
      invoiceIds: ['invoice-a'],
      reason: 'BOOKING_INVOICE_BACKLINK_MISSING',
      severity: 'MEDIUM',
    });
  });

  it('ignores jobs that have not reached billing', () => {
    const issues = auditBookingInvoiceLinks({
      bookings: [booking({
        status: 'BOOKED',
        billingState: 'NOT_READY',
        paymentStatus: '',
      })],
      clientInvoices: [],
      clientInvoiceLines: [],
    });

    expect(issues).toEqual([]);
  });
});

describe('getExpectedFinancialInvoiceStatus', () => {
  it('uses explicit Airtable payment evidence for a client invoice', () => {
    expect(getExpectedFinancialInvoiceStatus('CLIENT', {
      airtableStatus: 'Invoiced to client',
      airtablePaid: true,
    })).toBe('PAID');
  });

  it('uses a persisted paid date for an interpreter invoice', () => {
    expect(getExpectedFinancialInvoiceStatus('INTERPRETER', {
      airtableStatus: 'Approved',
      paidAt: '2026-07-24T10:00:00.000Z',
    })).toBe('PAID');
  });

  it('keeps an unpaid invoiced client invoice in sent state', () => {
    expect(getExpectedFinancialInvoiceStatus('CLIENT', {
      airtableStatus: 'Invoiced to client',
    })).toBe('SENT');
  });
});
