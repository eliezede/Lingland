import { describe, expect, it } from 'vitest';
import {
  ClientIdentityAuditResult,
  ClientFinanceHierarchyReconciliation,
  ClientMergePreview,
  normalizeAuditResult,
  normalizeFinanceReconciliation,
  normalizeMergePreview,
} from './clientIdentityAuditService';

describe('client identity audit service compatibility', () => {
  it('normalizes an audit response created before review decisions existed', () => {
    const legacy = {
      generatedAt: '2026-07-19T12:00:00.000Z',
      readOnly: true,
      truncated: false,
      summary: {},
      organizationCandidates: [],
      agentCandidates: [],
    } as unknown as ClientIdentityAuditResult;

    expect(normalizeAuditResult(legacy)).toMatchObject({
      decisions: [],
      decisionSummary: { deferred: 0, rejected: 0, split: 0, stale: 0 },
    });
  });

  it('fails closed when a merge preview predates the second-approval policy', () => {
    const legacy = {
      candidateId: 'candidate-1',
      expectedFingerprint: 'fingerprint-1',
    } as unknown as ClientMergePreview;

    const normalized = normalizeMergePreview(legacy);
    expect(normalized.requiresSecondApproval).toBe(true);
    expect(normalized.approval).toBeNull();
    expect(normalized.secondApprovalReasons[0]).toContain('not available');
  });

  it('preserves an explicit no-approval decision from the current backend', () => {
    const current = {
      requiresSecondApproval: false,
      secondApprovalReasons: [],
      approval: null,
    } as unknown as ClientMergePreview;

    expect(normalizeMergePreview(current)).toMatchObject({
      requiresSecondApproval: false,
      secondApprovalReasons: [],
      approval: null,
    });
  });

  it('normalizes finance blockers created before job-level repair details existed', () => {
    const legacy = {
      blockedInvoiceIds: ['invoice-1'],
      unlinkedInvoiceIds: [],
      inferredClientAssignments: [],
      blockedInvoices: [{
        invoiceId: 'invoice-1',
        reason: 'INVALID_BOOKING_SCOPE',
        candidateClientIds: undefined,
        evidence: undefined,
      }],
    } as unknown as ClientFinanceHierarchyReconciliation;

    const normalized = normalizeFinanceReconciliation(legacy);
    expect(normalized.blockedInvoices[0]).toMatchObject({
      bookingIds: [],
      missingBookingIds: [],
      bookings: [],
      candidateClientIds: [],
      evidence: [],
    });
    expect(normalized.blockerReasonCounts).toEqual({
      MULTIPLE_CLIENTS: 0,
      BOOKING_LINK_MISSING: 0,
      INVALID_BOOKING_SCOPE: 0,
      CLIENT_IDENTITY_UNRESOLVED: 0,
    });
  });
});
