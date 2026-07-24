"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateClientIdentityPendingCanonicalTarget = exports.validateClientIdentityManualReviewRun = exports.validateClientIdentityRecommendationRun = exports.validateClientIdentityPendingCanonicalApproval = exports.validateClientIdentityManualMappingBatch = exports.validateClientIdentityMappingBatch = exports.CLIENT_IDENTITY_RECOMMENDATION_TTL_MS = exports.MAX_CLIENT_IDENTITY_BATCH_MAPPINGS = void 0;
const ALLOWED_SOURCE_TABLES = new Set(['Clients', 'Clients Book', 'Departments']);
const MANUAL_BATCH_SOURCE_TABLES = new Set(['Clients Book', 'Departments']);
exports.MAX_CLIENT_IDENTITY_BATCH_MAPPINGS = 25;
exports.CLIENT_IDENTITY_RECOMMENDATION_TTL_MS = 30 * 60 * 1000;
const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const validateClientIdentityMappingBatch = (input, actorRole, confirmed) => {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(actorRole)) {
        throw new Error('Only an active admin can review client identity mappings.');
    }
    if (!confirmed) {
        throw new Error('Explicit batch confirmation is required.');
    }
    if (!Array.isArray(input) || input.length < 1 || input.length > exports.MAX_CLIENT_IDENTITY_BATCH_MAPPINGS) {
        throw new Error(`Choose between 1 and ${exports.MAX_CLIENT_IDENTITY_BATCH_MAPPINGS} identity recommendations.`);
    }
    const seen = new Set();
    return input.map((raw, index) => {
        const item = (raw || {});
        const sourceTable = text(item.sourceTable);
        const groupKey = text(item.groupKey);
        const action = text(item.action).toUpperCase();
        const canonicalClientId = text(item.canonicalClientId);
        const recommendationConfidence = text(item.recommendationConfidence).toUpperCase();
        if (!ALLOWED_SOURCE_TABLES.has(sourceTable)) {
            throw new Error(`Recommendation ${index + 1} has an unsupported source table.`);
        }
        if (!groupKey || !canonicalClientId) {
            throw new Error(`Recommendation ${index + 1} is missing its source identity or canonical client.`);
        }
        if (action !== 'MAP_TO_CLIENT') {
            throw new Error('Batch review can only map identities to existing clients. New organisations require individual approval.');
        }
        if (recommendationConfidence !== 'HIGH') {
            throw new Error('Only high-confidence recommendations can be included in batch review.');
        }
        const scope = `${sourceTable.toLowerCase()}|${groupKey.toLowerCase()}`;
        if (seen.has(scope))
            throw new Error(`The source identity in recommendation ${index + 1} is duplicated.`);
        seen.add(scope);
        return {
            sourceTable,
            groupKey,
            sourceNames: Array.isArray(item.sourceNames) ? item.sourceNames.map(text).filter(Boolean) : [],
            action,
            canonicalClientId,
            canonicalCompanyName: text(item.canonicalCompanyName),
            reason: text(item.reason),
            recommendationConfidence,
        };
    });
};
exports.validateClientIdentityMappingBatch = validateClientIdentityMappingBatch;
const validateClientIdentityManualMappingBatch = (input, actorRole, confirmed) => {
    if (actorRole !== 'SUPER_ADMIN') {
        throw new Error('Only a Super Admin can save manual client identity batches.');
    }
    if (!confirmed) {
        throw new Error('Explicit batch confirmation is required.');
    }
    if (!Array.isArray(input) || input.length < 1 || input.length > exports.MAX_CLIENT_IDENTITY_BATCH_MAPPINGS) {
        throw new Error(`Choose between 1 and ${exports.MAX_CLIENT_IDENTITY_BATCH_MAPPINGS} client identities.`);
    }
    const seen = new Set();
    let batchCanonicalClientId = '';
    return input.map((raw, index) => {
        const item = (raw || {});
        const sourceTable = text(item.sourceTable);
        const groupKey = text(item.groupKey);
        const action = text(item.action).toUpperCase();
        const canonicalClientId = text(item.canonicalClientId);
        const sourceNames = Array.isArray(item.sourceNames) ? item.sourceNames.map(text).filter(Boolean) : [];
        if (!MANUAL_BATCH_SOURCE_TABLES.has(sourceTable)) {
            throw new Error(`Identity ${index + 1} has an unsupported source table.`);
        }
        if (!groupKey || !canonicalClientId || sourceNames.length === 0) {
            throw new Error(`Identity ${index + 1} is missing its source evidence or canonical client.`);
        }
        if (action !== 'MAP_TO_CLIENT') {
            throw new Error('Manual batch review can only map identities to an existing client.');
        }
        if (batchCanonicalClientId && batchCanonicalClientId !== canonicalClientId) {
            throw new Error('Every identity in a manual batch must map to the same canonical client.');
        }
        batchCanonicalClientId = canonicalClientId;
        const scope = `${sourceTable.toLowerCase()}|${groupKey.toLowerCase()}`;
        if (seen.has(scope))
            throw new Error(`The source identity in item ${index + 1} is duplicated.`);
        seen.add(scope);
        return {
            sourceTable,
            groupKey,
            sourceNames,
            action: 'MAP_TO_CLIENT',
            canonicalClientId,
            canonicalCompanyName: text(item.canonicalCompanyName),
            reason: text(item.reason),
        };
    });
};
exports.validateClientIdentityManualMappingBatch = validateClientIdentityManualMappingBatch;
const validateClientIdentityPendingCanonicalApproval = (target, approval) => {
    if (!approval)
        return { ok: false, reason: 'PENDING_CANONICAL_APPROVAL_NOT_FOUND' };
    if (text(approval.status).toUpperCase() !== 'ACTIVE') {
        return { ok: false, reason: 'PENDING_CANONICAL_APPROVAL_NOT_ACTIVE' };
    }
    if (text(approval.action).toUpperCase() !== 'APPROVE_NEW_CLIENT') {
        return { ok: false, reason: 'PENDING_CANONICAL_APPROVAL_ACTION_CHANGED' };
    }
    if (text(approval.canonicalClientId) !== target.clientId
        || text(approval.sourceTable) !== target.sourceTable
        || text(approval.groupKey).toLowerCase() !== target.groupKey.toLowerCase()) {
        return { ok: false, reason: 'PENDING_CANONICAL_APPROVAL_EVIDENCE_CHANGED' };
    }
    return { ok: true };
};
exports.validateClientIdentityPendingCanonicalApproval = validateClientIdentityPendingCanonicalApproval;
const validateReviewRunEnvelope = (run, actorId, expectedMappingVersion, nowMs, reasonPrefix) => {
    if (!run)
        return { ok: false, reason: `${reasonPrefix}_RUN_NOT_FOUND` };
    if (run.kind !== 'AIRTABLE_SYNC_CENTER' || run.dryRun !== true || run.success !== true) {
        return { ok: false, reason: `${reasonPrefix}_RUN_INVALID` };
    }
    if (run.mappingVersion !== expectedMappingVersion) {
        return { ok: false, reason: `${reasonPrefix}_CONTRACT_CHANGED` };
    }
    if (run.userId !== actorId)
        return { ok: false, reason: `${reasonPrefix}_ACTOR_CHANGED` };
    const finishedAtMs = typeof run.finishedAt === 'string' ? Date.parse(run.finishedAt) : Number.NaN;
    if (!Number.isFinite(finishedAtMs) || finishedAtMs > nowMs + 60000) {
        return { ok: false, reason: `${reasonPrefix}_RUN_TIME_INVALID` };
    }
    if (nowMs - finishedAtMs > exports.CLIENT_IDENTITY_RECOMMENDATION_TTL_MS) {
        return { ok: false, reason: `${reasonPrefix}_RUN_EXPIRED` };
    }
    return { ok: true };
};
const validateClientIdentityRecommendationRun = (run, mappings, actorId, expectedMappingVersion, nowMs = Date.now()) => {
    const envelope = validateReviewRunEnvelope(run, actorId, expectedMappingVersion, nowMs, 'RECOMMENDATION');
    if (!envelope.ok)
        return envelope;
    const moduleResults = Array.isArray(run.moduleResults) ? run.moduleResults : [];
    const clientModule = moduleResults.find(raw => (raw && typeof raw === 'object' && raw.module === 'clients'));
    const diagnostics = clientModule?.diagnostics;
    const clientsBook = diagnostics?.clientsBook;
    const conflicts = Array.isArray(clientsBook?.conflictCandidates)
        ? clientsBook.conflictCandidates
        : [];
    const scope = (sourceTable, groupKey) => (`${text(sourceTable).toLowerCase()}|${text(groupKey).toLowerCase()}`);
    const conflictByScope = new Map(conflicts.map(conflict => [
        scope(conflict.sourceTable, conflict.groupKey),
        conflict,
    ]));
    for (const mapping of mappings) {
        const conflict = conflictByScope.get(scope(mapping.sourceTable, mapping.groupKey));
        const recommendation = conflict?.recommendation;
        if (!recommendation
            || recommendation.confidence !== 'HIGH'
            || recommendation.autoReviewEligible !== true
            || text(recommendation.canonicalClientId) !== mapping.canonicalClientId) {
            return { ok: false, reason: 'RECOMMENDATION_NO_LONGER_MATCHES' };
        }
    }
    return { ok: true };
};
exports.validateClientIdentityRecommendationRun = validateClientIdentityRecommendationRun;
const validateClientIdentityManualReviewRun = (run, mappings, actorId, expectedMappingVersion, nowMs = Date.now()) => {
    const envelope = validateReviewRunEnvelope(run, actorId, expectedMappingVersion, nowMs, 'REVIEW');
    if (!envelope.ok)
        return envelope;
    const moduleResults = Array.isArray(run.moduleResults) ? run.moduleResults : [];
    const clientModule = moduleResults.find(raw => (raw && typeof raw === 'object' && raw.module === 'clients'));
    const diagnostics = clientModule?.diagnostics;
    const clientsBook = diagnostics?.clientsBook;
    const conflicts = Array.isArray(clientsBook?.conflictCandidates)
        ? clientsBook.conflictCandidates
        : [];
    const normalized = (value) => text(value).toLowerCase();
    const scope = (sourceTable, groupKey) => `${normalized(sourceTable)}|${normalized(groupKey)}`;
    const conflictByScope = new Map(conflicts.map(conflict => [
        scope(conflict.sourceTable, conflict.groupKey),
        conflict,
    ]));
    for (const mapping of mappings) {
        const conflict = conflictByScope.get(scope(mapping.sourceTable, mapping.groupKey));
        if (!conflict)
            return { ok: false, reason: 'IDENTITY_NO_LONGER_UNRESOLVED' };
        const conflictNames = Array.isArray(conflict.companyNames)
            ? new Set(conflict.companyNames.map(normalized).filter(Boolean))
            : new Set();
        const mappingNames = new Set(mapping.sourceNames.map(normalized).filter(Boolean));
        if (conflictNames.size === 0
            || mappingNames.size !== conflictNames.size
            || Array.from(mappingNames).some(sourceName => !conflictNames.has(sourceName))) {
            return { ok: false, reason: 'IDENTITY_SOURCE_EVIDENCE_CHANGED' };
        }
    }
    return { ok: true };
};
exports.validateClientIdentityManualReviewRun = validateClientIdentityManualReviewRun;
const validateClientIdentityPendingCanonicalTarget = (run, canonicalClientId, actorId, expectedMappingVersion, nowMs = Date.now()) => {
    const envelope = validateReviewRunEnvelope(run, actorId, expectedMappingVersion, nowMs, 'REVIEW');
    if (!envelope.ok)
        return envelope;
    const moduleResults = Array.isArray(run.moduleResults) ? run.moduleResults : [];
    const clientModule = moduleResults.find(raw => (raw && typeof raw === 'object' && raw.module === 'clients'));
    const diagnostics = clientModule?.diagnostics;
    const canonicalAccounts = diagnostics?.canonicalAccounts;
    const pendingTargets = Array.isArray(canonicalAccounts?.approvedPendingCanonicalAccounts)
        ? canonicalAccounts.approvedPendingCanonicalAccounts
        : [];
    const requestedId = text(canonicalClientId);
    const rawTarget = pendingTargets.find(candidate => text(candidate.clientId) === requestedId);
    if (!rawTarget)
        return { ok: false, reason: 'PENDING_CANONICAL_TARGET_NOT_APPROVED_IN_RUN' };
    const sourceTable = text(rawTarget.sourceTable);
    const sourceRecordId = text(rawTarget.sourceRecordId);
    const groupKey = text(rawTarget.groupKey);
    const clientId = text(rawTarget.clientId);
    const companyName = text(rawTarget.companyName);
    if (sourceTable !== 'Clients'
        || !sourceRecordId
        || !groupKey
        || !clientId
        || !companyName) {
        return { ok: false, reason: 'PENDING_CANONICAL_TARGET_EVIDENCE_INVALID' };
    }
    return {
        ok: true,
        target: {
            sourceTable: 'Clients',
            sourceRecordId,
            groupKey,
            clientId,
            companyName,
            sageAccountRef: text(rawTarget.sageAccountRef) || undefined,
        },
    };
};
exports.validateClientIdentityPendingCanonicalTarget = validateClientIdentityPendingCanonicalTarget;
//# sourceMappingURL=clientIdentityMappingPolicy.js.map