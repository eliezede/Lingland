import { describe, expect, it } from 'vitest';
import {
  deriveActorId,
  deriveAuditAction,
  deriveAuditSource,
  deriveSyncRunId,
} from './auditPolicy';

describe('audit policy', () => {
  it('records semantic booking and assignment transitions', () => {
    expect(deriveAuditAction('bookings', { status: 'OPENED' }, { status: 'BOOKED' })).toBe('STATUS_CHANGED');
    expect(deriveAuditAction('assignments', { status: 'OFFERED' }, { status: 'ACCEPTED' })).toBe('ASSIGNMENT_ACCEPTED');
  });

  it('records financial settlement semantics', () => {
    expect(deriveAuditAction('clientInvoices', { status: 'SENT' }, { status: 'PAID' })).toBe('CLIENT_PAYMENT_RECEIVED');
    expect(deriveAuditAction('interpreterInvoices', { status: 'APPROVED' }, { status: 'PAID' })).toBe('INTERPRETER_PAYMENT_SENT');
  });

  it('records communication suppression and sync conflict resolution', () => {
    expect(deriveAuditAction('emailAudit', undefined, { status: 'SUPPRESSED' })).toBe('EMAIL_SUPPRESSED');
    expect(deriveAuditAction('syncConflicts', { resolutionStatus: 'OPEN' }, { resolutionStatus: 'RESOLVED' })).toBe('SYNC_CONFLICT_RESOLVED');
  });

  it('preserves source, actor and sync lineage', () => {
    const after = { sourceSystem: 'AIRTABLE', metadata: { syncRunId: 'run-42' }, actorUserId: 'user-7' };
    expect(deriveAuditSource(undefined, after)).toBe('AIRTABLE');
    expect(deriveSyncRunId(undefined, after)).toBe('run-42');
    expect(deriveActorId('jobEvents', undefined, after)).toBe('user-7');
  });
});
