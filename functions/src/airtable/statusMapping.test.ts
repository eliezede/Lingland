import { describe, expect, it } from 'vitest';
import {
  allocateInvoiceLineAmount,
  mapExplicitRedbookStatus,
  mapExplicitTranslationStatus,
  mapClientInvoiceStatusToBookingStatus,
  mapClientInvoiceStatusToPaymentStatus,
  mapClientInvoiceStatusValue,
  mapInterpreterInvoiceStatusValue,
  preserveStatusIfLocalAhead,
} from './statusMapping';

describe('Airtable workflow status mapping', () => {
  it('maps REDBOOK labels to the platform lifecycle', () => {
    expect(mapExplicitRedbookStatus('Incoming')).toBe('INCOMING');
    expect(mapExplicitRedbookStatus('Opened')).toBe('OPENED');
    expect(mapExplicitRedbookStatus('Booked')).toBe('BOOKED');
    expect(mapExplicitRedbookStatus('Invoicing')).toBe('INVOICING');
    expect(mapExplicitRedbookStatus('Invoiced and completed')).toBe('INVOICED');
    expect(mapExplicitRedbookStatus('Paid')).toBe('PAID');
  });

  it('maps translation completion into finance readiness', () => {
    expect(mapExplicitTranslationStatus('Completed')).toBe('READY_FOR_INVOICE');
    expect(mapExplicitTranslationStatus('Verified')).toBe('READY_FOR_INVOICE');
  });

  it('lets Airtable win in mirror mode and protects later local states otherwise', () => {
    expect(preserveStatusIfLocalAhead('PAID', 'OPENED', 'AIRTABLE')).toBe('OPENED');
    expect(preserveStatusIfLocalAhead('INVOICED', 'BOOKED', 'PLATFORM')).toBe('INVOICED');
    expect(preserveStatusIfLocalAhead('BOOKED', 'CANCELLED', 'PLATFORM')).toBe('CANCELLED');
  });

  it('never treats unpaid invoice labels as paid', () => {
    expect(mapClientInvoiceStatusValue('Unpaid')).toBe('SENT');
    expect(mapClientInvoiceStatusValue('Awaiting payment')).toBe('SENT');
    expect(mapClientInvoiceStatusValue('Invoicing')).toBe('SENT');
    expect(mapClientInvoiceStatusValue('Paid')).toBe('PAID');
    expect(mapClientInvoiceStatusValue('Payment received')).toBe('PAID');
    expect(mapInterpreterInvoiceStatusValue('Unpaid')).toBe('SUBMITTED');
    expect(mapInterpreterInvoiceStatusValue('Paid')).toBe('PAID');
  });

  it('projects invoice lifecycle into job billing state without treating drafts as sent', () => {
    expect(mapClientInvoiceStatusToBookingStatus('DRAFT')).toBe('INVOICING');
    expect(mapClientInvoiceStatusToBookingStatus('SENT')).toBe('INVOICED');
    expect(mapClientInvoiceStatusToBookingStatus('PAID')).toBe('PAID');
    expect(mapClientInvoiceStatusToBookingStatus('CANCELLED')).toBe('READY_FOR_INVOICE');

    expect(mapClientInvoiceStatusToPaymentStatus('DRAFT')).toBe('READY_FOR_INVOICE');
    expect(mapClientInvoiceStatusToPaymentStatus('SENT')).toBe('INVOICED');
    expect(mapClientInvoiceStatusToPaymentStatus('PAID')).toBe('PAID');
    expect(mapClientInvoiceStatusToPaymentStatus('CANCELLED')).toBe('ISSUE');
  });

  it('allocates invoice pennies without changing the invoice total', () => {
    const lines = [0, 1, 2].map(index => allocateInvoiceLineAmount(100, index, 3));
    expect(lines).toEqual([33.33, 33.33, 33.34]);
    expect(lines.reduce((sum, value) => sum + value, 0)).toBe(100);
  });
});
