import { describe, expect, it } from 'vitest';
import {
  isMirroredTimesheet,
  shouldAdvanceBookingForTimesheet,
  shouldCreateTimesheetSubmissionCommunications,
} from './timesheetSubmissionPolicy';

describe('timesheet submission trigger policy', () => {
  it('recognises every supported mirror marker', () => {
    expect(isMirroredTimesheet({ sourceSystem: 'AIRTABLE' })).toBe(true);
    expect(isMirroredTimesheet({ source: 'AIRTABLE_MIRROR' })).toBe(true);
    expect(isMirroredTimesheet({ importedFromAirtable: true })).toBe(true);
  });

  it('never regresses an imported financial job', () => {
    const mirrored = { sourceSystem: 'AIRTABLE', importedFromAirtable: true };
    expect(shouldAdvanceBookingForTimesheet(mirrored, 'PAID')).toBe(false);
    expect(shouldAdvanceBookingForTimesheet(mirrored, 'INVOICED')).toBe(false);
    expect(shouldCreateTimesheetSubmissionCommunications(mirrored)).toBe(false);
  });

  it('only advances live confirmed or completed work', () => {
    const live = { source: 'INTERPRETER_APP' };
    expect(shouldAdvanceBookingForTimesheet(live, 'BOOKED')).toBe(true);
    expect(shouldAdvanceBookingForTimesheet(live, 'SESSION_COMPLETED')).toBe(true);
    expect(shouldAdvanceBookingForTimesheet(live, 'READY_FOR_INVOICE')).toBe(false);
  });
});
