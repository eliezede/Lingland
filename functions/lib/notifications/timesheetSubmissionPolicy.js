"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldCreateTimesheetSubmissionCommunications = exports.shouldAdvanceBookingForTimesheet = exports.isMirroredTimesheet = void 0;
const MIRROR_SOURCES = new Set(['AIRTABLE', 'AIRTABLE_MIRROR', 'SYSTEM_IMPORT']);
const TIMESHEET_ADVANCE_STATUSES = new Set(['BOOKED', 'SESSION_COMPLETED']);
const isMirroredTimesheet = (timesheet) => (timesheet.importedFromAirtable === true
    || MIRROR_SOURCES.has(String(timesheet.sourceSystem || '').toUpperCase())
    || MIRROR_SOURCES.has(String(timesheet.source || '').toUpperCase()));
exports.isMirroredTimesheet = isMirroredTimesheet;
const shouldAdvanceBookingForTimesheet = (timesheet, bookingStatus) => (!(0, exports.isMirroredTimesheet)(timesheet)
    && TIMESHEET_ADVANCE_STATUSES.has(String(bookingStatus || '').toUpperCase()));
exports.shouldAdvanceBookingForTimesheet = shouldAdvanceBookingForTimesheet;
const shouldCreateTimesheetSubmissionCommunications = (timesheet) => (!(0, exports.isMirroredTimesheet)(timesheet));
exports.shouldCreateTimesheetSubmissionCommunications = shouldCreateTimesheetSubmissionCommunications;
//# sourceMappingURL=timesheetSubmissionPolicy.js.map