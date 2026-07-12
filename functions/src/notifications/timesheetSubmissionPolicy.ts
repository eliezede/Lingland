const MIRROR_SOURCES = new Set(['AIRTABLE', 'AIRTABLE_MIRROR', 'SYSTEM_IMPORT']);
const TIMESHEET_ADVANCE_STATUSES = new Set(['BOOKED', 'SESSION_COMPLETED']);

export const isMirroredTimesheet = (timesheet: Record<string, unknown>) => (
  timesheet.importedFromAirtable === true
  || MIRROR_SOURCES.has(String(timesheet.sourceSystem || '').toUpperCase())
  || MIRROR_SOURCES.has(String(timesheet.source || '').toUpperCase())
);

export const shouldAdvanceBookingForTimesheet = (
  timesheet: Record<string, unknown>,
  bookingStatus: unknown
) => (
  !isMirroredTimesheet(timesheet)
  && TIMESHEET_ADVANCE_STATUSES.has(String(bookingStatus || '').toUpperCase())
);

export const shouldCreateTimesheetSubmissionCommunications = (timesheet: Record<string, unknown>) => (
  !isMirroredTimesheet(timesheet)
);
