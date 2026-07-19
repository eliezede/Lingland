export type ClientMergeApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'IN_PROGRESS'
  | 'CONSUMED'
  | 'EXPIRED'
  | 'ROLLED_BACK';

export interface ClientMergeApprovalRecord {
  status: string;
  candidateId: string;
  candidateFingerprint: string;
  expectedFingerprint: string;
  canonicalClientId: string;
  fieldSelections?: Record<string, unknown>;
  requestedBy: string;
  reviewedBy: string;
  expiresAt: string;
  consumedByManifestId?: string;
}

export interface ClientMergeApprovalExpectation {
  candidateId: string;
  candidateFingerprint: string;
  expectedFingerprint: string;
  canonicalClientId: string;
  fieldSelections: Record<string, string>;
  nowMs?: number;
}

export interface ClientMergeApprovalValidation {
  valid: boolean;
  reason: string;
}

const text = (value: unknown) => String(value ?? '').trim();

const normalizedSelections = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '[]';
  return JSON.stringify(Object.entries(value as Record<string, unknown>)
    .map(([field, clientId]) => [text(field), text(clientId)] as const)
    .filter(([field, clientId]) => Boolean(field && clientId))
    .sort(([left], [right]) => left.localeCompare(right)));
};

export const clientMergeApprovalStatus = (
  approval: Pick<ClientMergeApprovalRecord, 'status' | 'expiresAt'>,
  nowMs = Date.now(),
): ClientMergeApprovalStatus => {
  const rawStatus = text(approval.status).toUpperCase();
  const expiresAt = Date.parse(text(approval.expiresAt));
  if (['PENDING', 'APPROVED'].includes(rawStatus) && Number.isFinite(expiresAt) && expiresAt <= nowMs) {
    return 'EXPIRED';
  }
  if (['APPROVED', 'REJECTED', 'IN_PROGRESS', 'CONSUMED', 'ROLLED_BACK'].includes(rawStatus)) {
    return rawStatus as ClientMergeApprovalStatus;
  }
  return 'PENDING';
};

export const validateClientMergeApproval = (
  approval: ClientMergeApprovalRecord,
  expectation: ClientMergeApprovalExpectation,
): ClientMergeApprovalValidation => {
  const status = clientMergeApprovalStatus(approval, expectation.nowMs);
  if (status !== 'APPROVED') {
    return { valid: false, reason: status === 'EXPIRED' ? 'The second approval expired.' : `The second approval is ${status.toLowerCase()}.` };
  }
  if (!text(approval.requestedBy) || !text(approval.reviewedBy) || text(approval.requestedBy) === text(approval.reviewedBy)) {
    return { valid: false, reason: 'The request and approval must be completed by two different Super Admins.' };
  }
  if (text(approval.consumedByManifestId)) {
    return { valid: false, reason: 'This second approval has already been used.' };
  }
  if (
    text(approval.candidateId) !== expectation.candidateId
    || text(approval.candidateFingerprint) !== expectation.candidateFingerprint
    || text(approval.expectedFingerprint) !== expectation.expectedFingerprint
    || text(approval.canonicalClientId) !== expectation.canonicalClientId
    || normalizedSelections(approval.fieldSelections) !== normalizedSelections(expectation.fieldSelections)
  ) {
    return { valid: false, reason: 'The approved merge no longer matches the current preview.' };
  }
  return { valid: true, reason: '' };
};
