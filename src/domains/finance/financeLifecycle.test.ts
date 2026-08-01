import { describe, expect, it } from 'vitest';
import { BookingStatus, InvoiceStatus, ServiceCategory } from '../../types';
import {
  getBookingServicePeriod,
  getInvoiceReceivableStatus,
  getPayableStatus,
  getReceivableStatus,
  matchesServiceCategory,
} from './financeLifecycle';

const booking = (overrides: Record<string, unknown> = {}) => ({
  id: 'job-1',
  date: '2026-07-12',
  status: BookingStatus.SESSION_COMPLETED,
  serviceCategory: ServiceCategory.INTERPRETATION,
  ...overrides,
} as any);

describe('finance lifecycle compatibility', () => {
  it('prefers independent receivable state over the legacy job status', () => {
    expect(getReceivableStatus(booking({ status: BookingStatus.PAID, clientBillingStatus: 'READY' }))).toBe('READY');
  });

  it('keeps interpreter payment independent from the client state', () => {
    expect(getPayableStatus(booking({ status: BookingStatus.PAID, interpreterPayableStatus: 'ACCRUED' }))).toBe('ACCRUED');
  });

  it('derives the service period from the scheduled service date', () => {
    expect(getBookingServicePeriod(booking({ date: '2026-08-01' }))).toBe('2026-08');
  });

  it('classifies an issued invoice as overdue using its due date', () => {
    expect(getInvoiceReceivableStatus({ status: InvoiceStatus.SENT, dueDate: '2026-07-01' } as any, new Date('2026-08-01'))).toBe('OVERDUE');
  });

  it('matches service scopes without duplicating a mixed supplier identity', () => {
    expect(matchesServiceCategory({ serviceCategories: [ServiceCategory.INTERPRETATION, ServiceCategory.TRANSLATION] }, ServiceCategory.TRANSLATION)).toBe(true);
  });
});
