import {
  Booking,
  BookingStatus,
  ClientInvoice,
  InvoiceStatus,
  PayableStatus,
  ReceivableStatus,
  ServiceCategory,
} from '../../types';

const RECEIVABLE_VALUES = new Set<ReceivableStatus>([
  'NOT_READY',
  'READY',
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'VOID',
  'ISSUE',
]);

const PAYABLE_VALUES = new Set<PayableStatus>([
  'NOT_ELIGIBLE',
  'ACCRUED',
  'IN_CYCLE',
  'STATEMENT_READY',
  'INVOICE_RECEIVED',
  'APPROVED',
  'SCHEDULED',
  'PAID',
  'DISPUTED',
  'VOID',
  'ISSUE',
]);

export const getLondonPeriodKey = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  return year && month ? `${year}-${month}` : '';
};

export const getBookingServicePeriod = (booking: Booking): string => (
  booking.servicePeriod
  || (booking.date && /^\d{4}-\d{2}/.test(booking.date) ? booking.date.slice(0, 7) : '')
  || getLondonPeriodKey(booking.date)
);

export const getReceivableStatus = (booking: Booking): ReceivableStatus => {
  const explicit = String(booking.clientBillingStatus || '').toUpperCase() as ReceivableStatus;
  if (RECEIVABLE_VALUES.has(explicit)) return explicit;
  const clientPayment = String(booking.clientPaymentStatus || booking.paymentStatus || '').toUpperCase();
  if (clientPayment === 'PAID' || clientPayment === 'RECONCILED' || booking.status === BookingStatus.PAID) return 'PAID';
  if (clientPayment === 'OVERDUE') return 'OVERDUE';
  if (clientPayment === 'INVOICED' || clientPayment === 'DUE' || booking.status === BookingStatus.INVOICED) return 'ISSUED';
  if (booking.clientInvoiceId) return 'DRAFT';
  if (clientPayment === 'READY_FOR_INVOICE' || [BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING].includes(booking.status)) return 'READY';
  if (clientPayment === 'ISSUE' || booking.billingIssueFlag) return 'ISSUE';
  return 'NOT_READY';
};

export const getPayableStatus = (booking: Booking): PayableStatus => {
  const explicit = String(booking.interpreterPayableStatus || '').toUpperCase() as PayableStatus;
  if (PAYABLE_VALUES.has(explicit)) return explicit;
  const payment = String(booking.interpreterPaymentStatus || '').toUpperCase();
  if (payment === 'PAID' || payment === 'RECONCILED') return 'PAID';
  if (payment === 'SCHEDULED') return 'SCHEDULED';
  if (booking.interpreterInvoiceId) return 'INVOICE_RECEIVED';
  if (booking.settlementCycleId) return 'IN_CYCLE';
  if ([BookingStatus.TIMESHEET_VERIFIED, BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICING].includes(booking.status)) return 'ACCRUED';
  return 'NOT_ELIGIBLE';
};

export const getInvoiceReceivableStatus = (invoice: ClientInvoice, now = new Date()): ReceivableStatus => {
  if (invoice.status === InvoiceStatus.PAID) return 'PAID';
  if (invoice.status === InvoiceStatus.CANCELLED) return 'VOID';
  if (invoice.status === InvoiceStatus.DRAFT) return 'DRAFT';
  const dueAt = new Date(invoice.dueDate || '').getTime();
  if (Number.isFinite(dueAt) && dueAt < now.getTime()) return 'OVERDUE';
  if ([InvoiceStatus.SENT, InvoiceStatus.APPROVED].includes(invoice.status)) return 'ISSUED';
  return 'ISSUE';
};

export const matchesServiceCategory = (
  value: { serviceCategory?: ServiceCategory; primaryServiceCategory?: ServiceCategory; serviceCategories?: ServiceCategory[] },
  category?: ServiceCategory,
): boolean => {
  if (!category) return true;
  if (value.serviceCategory === category || value.primaryServiceCategory === category) return true;
  return Array.isArray(value.serviceCategories) && value.serviceCategories.includes(category);
};

export const getServiceLabel = (category: ServiceCategory): string => (
  category === ServiceCategory.TRANSLATION ? 'Translations' : 'Interpreting'
);
