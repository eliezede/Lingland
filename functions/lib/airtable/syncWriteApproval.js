"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSyncWriteApproval = exports.AIRTABLE_WRITE_APPROVAL_TTL_MS = exports.AIRTABLE_SYNC_MAPPING_VERSION = void 0;
exports.AIRTABLE_SYNC_MAPPING_VERSION = 'airtable-sync-center-v10';
exports.AIRTABLE_WRITE_APPROVAL_TTL_MS = 30 * 60 * 1000;
const normalizedModules = (value) => (Array.isArray(value)
    ? Array.from(new Set(value.filter((item) => typeof item === 'string' && Boolean(item.trim())))).sort()
    : []);
const sameModules = (left, right) => {
    const normalizedLeft = normalizedModules(left);
    const normalizedRight = normalizedModules(right);
    return normalizedLeft.length === normalizedRight.length
        && normalizedLeft.every((module, index) => module === normalizedRight[index]);
};
const errorCount = (stats) => {
    if (!stats || typeof stats !== 'object')
        return Number.NaN;
    return Number(stats.error);
};
const isWriteReady = (writeApproval) => (Boolean(writeApproval)
    && typeof writeApproval === 'object'
    && writeApproval.ready === true);
const validateSyncWriteApproval = (run, request, nowMs = Date.now(), ttlMs = exports.AIRTABLE_WRITE_APPROVAL_TTL_MS) => {
    if (!run)
        return { ok: false, reason: 'DRY_RUN_NOT_FOUND' };
    if (run.kind !== 'AIRTABLE_SYNC_CENTER')
        return { ok: false, reason: 'INVALID_RUN_KIND' };
    if (run.dryRun !== true)
        return { ok: false, reason: 'NOT_A_DRY_RUN' };
    if (run.success !== true || errorCount(run.stats) !== 0)
        return { ok: false, reason: 'DRY_RUN_NOT_CLEAN' };
    if (!isWriteReady(run.writeApproval))
        return { ok: false, reason: 'DRY_RUN_HAS_WRITE_BLOCKERS' };
    const expectedMappingVersion = request.mappingVersion || exports.AIRTABLE_SYNC_MAPPING_VERSION;
    if (run.mappingVersion !== expectedMappingVersion)
        return { ok: false, reason: 'MAPPING_VERSION_CHANGED' };
    if (run.userId !== request.userId)
        return { ok: false, reason: 'ACTOR_CHANGED' };
    if (run.syncStrategy !== request.syncStrategy)
        return { ok: false, reason: 'STRATEGY_CHANGED' };
    if (Number(run.limitRecords) !== request.limitRecords)
        return { ok: false, reason: 'LIMIT_CHANGED' };
    if (!sameModules(run.modules, request.modules))
        return { ok: false, reason: 'MODULE_SCOPE_CHANGED' };
    if (typeof run.writeApprovalStatus === 'string' && run.writeApprovalStatus.trim()) {
        return { ok: false, reason: 'DRY_RUN_ALREADY_USED' };
    }
    const finishedAtMs = typeof run.finishedAt === 'string' ? Date.parse(run.finishedAt) : Number.NaN;
    if (!Number.isFinite(finishedAtMs))
        return { ok: false, reason: 'INVALID_FINISHED_AT' };
    if (finishedAtMs > nowMs + 60000)
        return { ok: false, reason: 'DRY_RUN_FROM_FUTURE' };
    if (nowMs - finishedAtMs > ttlMs)
        return { ok: false, reason: 'DRY_RUN_EXPIRED' };
    return { ok: true };
};
exports.validateSyncWriteApproval = validateSyncWriteApproval;
//# sourceMappingURL=syncWriteApproval.js.map