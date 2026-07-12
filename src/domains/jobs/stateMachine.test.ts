import { describe, expect, it } from 'vitest';
import { canTransition } from './stateMachine';

describe('job state machine', () => {
  it('keeps assignment acceptance and operational completion explicit', () => {
    expect(canTransition('ASSIGNMENT_PENDING', 'BOOKED')).toBe(true);
    expect(canTransition('BOOKED', 'SESSION_COMPLETED')).toBe(true);
    expect(canTransition('SESSION_COMPLETED', 'TIMESHEET_SUBMITTED')).toBe(true);
  });

  it('blocks skipping timesheet and invoice stages', () => {
    expect(canTransition('BOOKED', 'READY_FOR_INVOICE')).toBe(false);
    expect(canTransition('SESSION_COMPLETED', 'INVOICED')).toBe(false);
    expect(canTransition('READY_FOR_INVOICE', 'PAID')).toBe(false);
  });

  it('does not reopen terminal jobs through ordinary transitions', () => {
    expect(canTransition('PAID', 'INCOMING')).toBe(false);
    expect(canTransition('CANCELLED', 'BOOKED')).toBe(false);
  });
});
