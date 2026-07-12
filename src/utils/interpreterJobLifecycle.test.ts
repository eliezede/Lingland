import { describe, expect, it } from 'vitest';
import { BookingStatus, ServiceCategory } from '../types';
import {
  buildInterpreterHistory,
  getInterpreterBookingAmount,
  getInterpreterBookingEnd,
  isPendingInterpreterTimesheet,
  isUpcomingInterpreterBooking,
} from './interpreterJobLifecycle';

const booking = (overrides: Record<string, unknown> = {}) => ({
  id: 'job-1',
  date: '2026-07-12',
  startTime: '10:00',
  durationMinutes: 60,
  status: BookingStatus.BOOKED,
  serviceCategory: ServiceCategory.INTERPRETATION,
  ...overrides,
} as any);

describe('interpreter job lifecycle', () => {
  it('uses duration when an interpretation has no explicit end time', () => {
    expect(getInterpreterBookingEnd(booking())?.getHours()).toBe(11);
  });

  it('uses the end of the translation deadline day', () => {
    const end = getInterpreterBookingEnd(booking({
      serviceCategory: ServiceCategory.TRANSLATION,
      translationDeadline: '2026-07-15',
    }));
    expect(end?.getDate()).toBe(15);
    expect(end?.getHours()).toBe(23);
  });

  it('keeps future booked work upcoming and completed work out of that queue', () => {
    const now = new Date('2026-07-12T09:00:00');
    expect(isUpcomingInterpreterBooking(booking(), now)).toBe(true);
    expect(isUpcomingInterpreterBooking(booking({ status: BookingStatus.PAID }), now)).toBe(false);
  });

  it('allows BOOKED and SESSION_COMPLETED work into the missing-timesheet queue', () => {
    const now = new Date('2026-07-12T12:00:00');
    expect(isPendingInterpreterTimesheet(booking(), new Set(), now)).toBe(true);
    expect(isPendingInterpreterTimesheet(booking({ status: BookingStatus.SESSION_COMPLETED }), new Set(), now)).toBe(true);
    expect(isPendingInterpreterTimesheet(booking(), new Set(['job-1']), now)).toBe(false);
  });

  it('preserves imported terminal jobs in history even without a timesheet', () => {
    const records = buildInterpreterHistory([
      booking({ status: BookingStatus.PAID, sourceSystem: 'AIRTABLE' }),
    ], [], new Date('2026-07-20T12:00:00'));
    expect(records).toHaveLength(1);
    expect(records[0].booking?.id).toBe('job-1');
  });

  it('does not duplicate a booking that already has a mirrored timesheet', () => {
    const records = buildInterpreterHistory([
      booking({ status: BookingStatus.INVOICED }),
    ], [{
      id: 'ts-1',
      bookingId: 'job-1',
      actualStart: '2026-07-12T10:00:00',
    } as any], new Date('2026-07-20T12:00:00'));
    expect(records).toHaveLength(1);
    expect(records[0].timesheet?.id).toBe('ts-1');
  });

  it('never invents a professional payment amount', () => {
    expect(getInterpreterBookingAmount(booking())).toBe(0);
    expect(getInterpreterBookingAmount(booking({ professionalCost: 82.5 }))).toBe(82.5);
  });
});
