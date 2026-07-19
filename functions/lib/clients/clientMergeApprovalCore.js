"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateClientMergeApproval = exports.clientMergeApprovalStatus = void 0;
const text = (value) => String(value ?? '').trim();
const normalizedSelections = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return '[]';
    return JSON.stringify(Object.entries(value)
        .map(([field, clientId]) => [text(field), text(clientId)])
        .filter(([field, clientId]) => Boolean(field && clientId))
        .sort(([left], [right]) => left.localeCompare(right)));
};
const clientMergeApprovalStatus = (approval, nowMs = Date.now()) => {
    const rawStatus = text(approval.status).toUpperCase();
    const expiresAt = Date.parse(text(approval.expiresAt));
    if (['PENDING', 'APPROVED'].includes(rawStatus) && Number.isFinite(expiresAt) && expiresAt <= nowMs) {
        return 'EXPIRED';
    }
    if (['APPROVED', 'REJECTED', 'IN_PROGRESS', 'CONSUMED', 'ROLLED_BACK'].includes(rawStatus)) {
        return rawStatus;
    }
    return 'PENDING';
};
exports.clientMergeApprovalStatus = clientMergeApprovalStatus;
const validateClientMergeApproval = (approval, expectation) => {
    const status = (0, exports.clientMergeApprovalStatus)(approval, expectation.nowMs);
    if (status !== 'APPROVED') {
        return { valid: false, reason: status === 'EXPIRED' ? 'The second approval expired.' : `The second approval is ${status.toLowerCase()}.` };
    }
    if (!text(approval.requestedBy) || !text(approval.reviewedBy) || text(approval.requestedBy) === text(approval.reviewedBy)) {
        return { valid: false, reason: 'The request and approval must be completed by two different Super Admins.' };
    }
    if (text(approval.consumedByManifestId)) {
        return { valid: false, reason: 'This second approval has already been used.' };
    }
    if (text(approval.candidateId) !== expectation.candidateId
        || text(approval.candidateFingerprint) !== expectation.candidateFingerprint
        || text(approval.expectedFingerprint) !== expectation.expectedFingerprint
        || text(approval.canonicalClientId) !== expectation.canonicalClientId
        || normalizedSelections(approval.fieldSelections) !== normalizedSelections(expectation.fieldSelections)) {
        return { valid: false, reason: 'The approved merge no longer matches the current preview.' };
    }
    return { valid: true, reason: '' };
};
exports.validateClientMergeApproval = validateClientMergeApproval;
//# sourceMappingURL=clientMergeApprovalCore.js.map