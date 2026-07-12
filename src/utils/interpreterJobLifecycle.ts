import { Booking, BookingStatus, ServiceCategory, Timesheet } from '../types';

const OFFER_STATUSES = new Set<string>([
  BookingStatus.OPENED,
  BookingStatus.ASSIGNMENT_PENDING,
  'PENDING_ASSIGNMENT',
]);

const TIMESHEET_ELIGIBLE_STATUSES = new Set<string>([
  BookingStatus.BOOKED,
  BookingStatus.SESSION_COMPLETED,
]);

const HISTORY_STATUSES = new Set<string>([
  BookingStatus.CANCELLED,
  BookingStatus.TIMESHEET_SUBMITTED,
  BookingStatus.TIMESHEET_VERIFIED,
  BookingStatus.READY_FOR_INVOICE,
  BookingStatus.INVOICING,
  BookingStatus.INVOICED,
  BookingStatus.PAID,
]);

export interface InterpreterHistoryRecord {
  id: string;
  booking?: Booking;
  timesheet?: Timesheet;
  occurredAt: number;
}

export const isTranslationBooking = (booking: Partial<Booking>) => (
  booking.serviceCategory === ServiceCategory.TRANSLATION
  || String(booking.serviceType || '').toUpperCase() === ServiceCategory.TRANSLATION
);

const parseLocalDateTime = (date: string, time: string) => {
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
};

export const getInterpreterBookingEnd = (booking: Partial<Booking>): Date | null => {
  const date = String(
    isTranslationBooking(booking)
      ? booking.translationDeadline || booking.date || ''
      : booking.date || ''
  ).slice(0, 10);
  if (!date) return null;

  if (isTranslationBooking(booking)) {
    return parseLocalDateTime(date, '23:59:59');
  }

  const explicitEnd = String(booking.endTime || booking.expectedEndTime || '').trim();
  if (explicitEnd) return parseLocalDateTime(date, explicitEnd.length === 5 ? `${explicitEnd}:00` : explicitEnd);

  const start = parseLocalDateTime(date, `${booking.startTime || '23:59'}:00`);
  if (!start) return null;
  return new Date(start.getTime() + Math.max(Number(booking.durationMinutes || 0), 0) * 60000);
};

export const isInterpreterOfferBooking = (booking: Partial<Booking>) => (
  OFFER_STATUSES.has(String(booking.status || ''))
);

export const isInterpreterBookingElapsed = (booking: Partial<Booking>, now = new Date()) => {
  const end = getInterpreterBookingEnd(booking);
  return Boolean(end && end.getTime() <= now.getTime());
};

export const isUpcomingInterpreterBooking = (booking: Partial<Booking>, now = new Date()) => (
  booking.status === BookingStatus.BOOKED
  && !isInterpreterBookingElapsed(booking, now)
);

export const isPendingInterpreterTimesheet = (
  booking: Partial<Booking>,
  timesheetBookingIds: ReadonlySet<string>,
  now = new Date()
) => (
  Boolean(booking.id)
  && TIMESHEET_ELIGIBLE_STATUSES.has(String(booking.status || ''))
  && isInterpreterBookingElapsed(booking, now)
  && !timesheetBookingIds.has(String(booking.id))
);

export const isHistoricalInterpreterBooking = (
  booking: Partial<Booking>,
  timesheetBookingIds: ReadonlySet<string>,
  now = new Date()
) => {
  const status = String(booking.status || '');
  if (HISTORY_STATUSES.has(status)) return true;
  return Boolean(
    booking.id
    && timesheetBookingIds.has(String(booking.id))
    && isInterpreterBookingElapsed(booking, now)
  );
};

const timesheetOccurredAt = (timesheet: Partial<Timesheet>) => {
  const value = timesheet.actualStart || timesheet.submittedAt;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const buildInterpreterHistory = (
  bookings: Booking[],
  timesheets: Timesheet[],
  now = new Date()
): InterpreterHistoryRecord[] => {
  const bookingsById = new Map(bookings.map(booking => [booking.id, booking]));
  const timesheetsByBookingId = new Map(timesheets.map(timesheet => [timesheet.bookingId, timesheet]));
  const timesheetBookingIds = new Set(timesheetsByBookingId.keys());
  const records = new Map<string, InterpreterHistoryRecord>();

  timesheets.forEach(timesheet => {
    const booking = bookingsById.get(timesheet.bookingId);
    records.set(`timesheet:${timesheet.id}`, {
      id: `timesheet:${timesheet.id}`,
      booking,
      timesheet,
      occurredAt: timesheetOccurredAt(timesheet) || getInterpreterBookingEnd(booking || {})?.getTime() || 0,
    });
  });

  bookings
    .filter(booking => isHistoricalInterpreterBooking(booking, timesheetBookingIds, now))
    .filter(booking => !timesheetsByBookingId.has(booking.id))
    .forEach(booking => {
      records.set(`booking:${booking.id}`, {
        id: `booking:${booking.id}`,
        booking,
        occurredAt: getInterpreterBookingEnd(booking)?.getTime() || 0,
      });
    });

  return Array.from(records.values()).sort((a, b) => b.occurredAt - a.occurredAt);
};

export const getInterpreterBookingAmount = (booking: Partial<Booking> | null | undefined) => {
  if (!booking) return 0;
  return Number(
    booking.interpreterInvoiceTotal
    ?? booking.interpreterAmountCalculated
    ?? booking.professionalCost
    ?? 0
  );
};
