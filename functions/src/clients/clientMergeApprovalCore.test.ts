import { describe, expect, it } from 'vitest';
import {
  ClientMergeApprovalExpectation,
  ClientMergeApprovalRecord,
  clientMergeApprovalStatus,
  validateClientMergeApproval,
} from './clientMergeApprovalCore';

const expectation: ClientMergeApprovalExpectation = {
  candidateId: 'candidate-1',
  candidateFingerprint: 'candidate-fingerprint',
  expectedFingerprint: 'merge-fingerprint',
  canonicalClientId: 'client-a',
  fieldSelections: { companyName: 'client-a', invoiceEmail: 'client-b' },
  nowMs: Date.parse('2026-07-19T12:00:00.000Z'),
};

const approval: ClientMergeApprovalRecord = {
  status: 'APPROVED',
  candidateId: expectation.candidateId,
  candidateFingerprint: expectation.candidateFingerprint,
  expectedFingerprint: expectation.expectedFingerprint,
  canonicalClientId: expectation.canonicalClientId,
  fieldSelections: { invoiceEmail: 'client-b', companyName: 'client-a' },
  requestedBy: 'admin-a',
  reviewedBy: 'admin-b',
  expiresAt: '2026-07-20T12:00:00.000Z',
};

describe('client merge second approval', () => {
  it('accepts an exact approval from a different administrator', () => {
    expect(validateClientMergeApproval(approval, expectation)).toEqual({ valid: true, reason: '' });
  });

  it('expires pending and approved requests at the deadline', () => {
    expect(clientMergeApprovalStatus({ ...approval, expiresAt: '2026-07-19T11:59:59.000Z' }, expectation.nowMs)).toBe('EXPIRED');
  });

  it('rejects self-approval', () => {
    expect(validateClientMergeApproval({ ...approval, reviewedBy: 'admin-a' }, expectation)).toMatchObject({ valid: false });
  });

  it('rejects an approval when canonical field choices change', () => {
    expect(validateClientMergeApproval(approval, {
      ...expectation,
      fieldSelections: { companyName: 'client-b', invoiceEmail: 'client-b' },
    })).toEqual({ valid: false, reason: 'The approved merge no longer matches the current preview.' });
  });

  it('rejects approvals already reserved or consumed', () => {
    expect(validateClientMergeApproval({ ...approval, status: 'IN_PROGRESS' }, expectation).valid).toBe(false);
    expect(validateClientMergeApproval({ ...approval, consumedByManifestId: 'manifest-1' }, expectation).valid).toBe(false);
  });
});
