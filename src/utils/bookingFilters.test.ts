import { describe, expect, it } from 'vitest';
import { Booking, BookingStatus, BookingView, ServiceCategory } from '../types';
import { filterBookings } from './bookingFilters';

const makeBooking = (overrides: Partial<Booking>): Booking => ({
  id: 'job-1',
  clientId: 'client-1',
  clientName: 'Client',
  requestedByUserId: 'admin-1',
  organizationId: 'lingland-main',
  serviceCategory: ServiceCategory.INTERPRETATION,
  serviceType: 'ONSITE',
  languageFrom: 'English',
  languageTo: 'Polish',
  date: '2026-07-12',
  startTime: '09:00',
  durationMinutes: 60,
  locationType: 'ONSITE',
  status: BookingStatus.READY_FOR_INVOICE,
  costCode: 'PO-100',
  totalAmount: 120,
  clientInvoiceReference: 'INV-100',
  ...overrides,
});

const exceptionView: BookingView = {
  id: 'finance-exceptions',
  name: 'Finance Exceptions',
  workspace: 'finance',
  filters: {
    statuses: [BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICED],
  },
  filterRules: [
    { id: 'finance-exception', field: 'financeException', operator: 'is', value: true },
  ],
  sortBy: 'dateAsc',
};

describe('finance exception booking views', () => {
  it('keeps complete billing records out of the exception queue', () => {
    expect(filterBookings([makeBooking({})], exceptionView)).toHaveLength(0);
  });

  it('surfaces missing purchase orders and client charges', () => {
    const missingPurchaseOrder = makeBooking({ id: 'missing-po', costCode: '' });
    const missingCharge = makeBooking({ id: 'missing-charge', totalAmount: 0 });

    expect(filterBookings([missingPurchaseOrder, missingCharge], exceptionView).map(job => job.id))
      .toEqual(['missing-po', 'missing-charge']);
  });

  it('surfaces issued invoices without an external reference', () => {
    const missingReference = makeBooking({
      id: 'missing-reference',
      status: BookingStatus.INVOICED,
      clientInvoiceId: 'invoice-internal-id',
      clientInvoiceReference: '',
      clientInvoiceNumber: '',
    });

    expect(filterBookings([missingReference], exceptionView)).toHaveLength(1);
  });

  it('surfaces payables without a verified professional cost', () => {
    const missingPayable = makeBooking({
      id: 'missing-payable',
      interpreterInvoiceId: 'payable-internal-id',
      interpreterInvoiceReference: 'INT-100',
      interpreterInvoiceTotal: 0,
      interpreterAmountCalculated: 0,
      professionalCost: 0,
    });

    expect(filterBookings([missingPayable], exceptionView)).toHaveLength(1);
  });
});
