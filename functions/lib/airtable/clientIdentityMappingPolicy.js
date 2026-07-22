"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateClientIdentityRecommendationRun = exports.validateClientIdentityMappingBatch = exports.CLIENT_IDENTITY_RECOMMENDATION_TTL_MS = exports.MAX_CLIENT_IDENTITY_BATCH_MAPPINGS = void 0;
const ALLOWED_SOURCE_TABLES = new Set(['Clients', 'Clients Book', 'Departments']);
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
const validateClientIdentityRecommendationRun = (run, mappings, actorId, expectedMappingVersion, nowMs = Date.now()) => {
    if (!run)
        return { ok: false, reason: 'RECOMMENDATION_RUN_NOT_FOUND' };
    if (run.kind !== 'AIRTABLE_SYNC_CENTER' || run.dryRun !== true || run.success !== true) {
        return { ok: false, reason: 'RECOMMENDATION_RUN_INVALID' };
    }
    if (run.mappingVersion !== expectedMappingVersion)
        return { ok: false, reason: 'RECOMMENDATION_CONTRACT_CHANGED' };
    if (run.userId !== actorId)
        return { ok: false, reason: 'RECOMMENDATION_ACTOR_CHANGED' };
    const finishedAtMs = typeof run.finishedAt === 'string' ? Date.parse(run.finishedAt) : Number.NaN;
    if (!Number.isFinite(finishedAtMs) || finishedAtMs > nowMs + 60000) {
        return { ok: false, reason: 'RECOMMENDATION_RUN_TIME_INVALID' };
    }
    if (nowMs - finishedAtMs > exports.CLIENT_IDENTITY_RECOMMENDATION_TTL_MS) {
        return { ok: false, reason: 'RECOMMENDATION_RUN_EXPIRED' };
    }
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
//# sourceMappingURL=clientIdentityMappingPolicy.js.map