export const AIRTABLE_SYNC_MAPPING_VERSION = 'airtable-sync-center-v9';
export const AIRTABLE_WRITE_APPROVAL_TTL_MS = 30 * 60 * 1000;

export type SyncWriteApprovalRun = {
  kind?: unknown;
  dryRun?: unknown;
  success?: unknown;
  mappingVersion?: unknown;
  syncStrategy?: unknown;
  limitRecords?: unknown;
  modules?: unknown;
  userId?: unknown;
  finishedAt?: unknown;
  stats?: unknown;
  writeApproval?: unknown;
  writeApprovalStatus?: unknown;
};

export type SyncWriteApprovalRequest = {
  userId: string;
  modules: string[];
  syncStrategy: string;
  limitRecords: number;
  mappingVersion?: string;
};

export type SyncWriteApprovalValidation =
  | { ok: true }
  | { ok: false; reason: string };

const normalizedModules = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())))).sort()
    : []
);

const sameModules = (left: unknown, right: string[]) => {
  const normalizedLeft = normalizedModules(left);
  const normalizedRight = normalizedModules(right);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((module, index) => module === normalizedRight[index]);
};

const errorCount = (stats: unknown) => {
  if (!stats || typeof stats !== 'object') return Number.NaN;
  return Number((stats as Record<string, unknown>).error);
};

const isWriteReady = (writeApproval: unknown) => (
  Boolean(writeApproval)
  && typeof writeApproval === 'object'
  && (writeApproval as Record<string, unknown>).ready === true
);

export const validateSyncWriteApproval = (
  run: SyncWriteApprovalRun | null | undefined,
  request: SyncWriteApprovalRequest,
  nowMs = Date.now(),
  ttlMs = AIRTABLE_WRITE_APPROVAL_TTL_MS,
): SyncWriteApprovalValidation => {
  if (!run) return { ok: false, reason: 'DRY_RUN_NOT_FOUND' };
  if (run.kind !== 'AIRTABLE_SYNC_CENTER') return { ok: false, reason: 'INVALID_RUN_KIND' };
  if (run.dryRun !== true) return { ok: false, reason: 'NOT_A_DRY_RUN' };
  if (run.success !== true || errorCount(run.stats) !== 0) return { ok: false, reason: 'DRY_RUN_NOT_CLEAN' };
  if (!isWriteReady(run.writeApproval)) return { ok: false, reason: 'DRY_RUN_HAS_WRITE_BLOCKERS' };

  const expectedMappingVersion = request.mappingVersion || AIRTABLE_SYNC_MAPPING_VERSION;
  if (run.mappingVersion !== expectedMappingVersion) return { ok: false, reason: 'MAPPING_VERSION_CHANGED' };
  if (run.userId !== request.userId) return { ok: false, reason: 'ACTOR_CHANGED' };
  if (run.syncStrategy !== request.syncStrategy) return { ok: false, reason: 'STRATEGY_CHANGED' };
  if (Number(run.limitRecords) !== request.limitRecords) return { ok: false, reason: 'LIMIT_CHANGED' };
  if (!sameModules(run.modules, request.modules)) return { ok: false, reason: 'MODULE_SCOPE_CHANGED' };
  if (typeof run.writeApprovalStatus === 'string' && run.writeApprovalStatus.trim()) {
    return { ok: false, reason: 'DRY_RUN_ALREADY_USED' };
  }

  const finishedAtMs = typeof run.finishedAt === 'string' ? Date.parse(run.finishedAt) : Number.NaN;
  if (!Number.isFinite(finishedAtMs)) return { ok: false, reason: 'INVALID_FINISHED_AT' };
  if (finishedAtMs > nowMs + 60_000) return { ok: false, reason: 'DRY_RUN_FROM_FUTURE' };
  if (nowMs - finishedAtMs > ttlMs) return { ok: false, reason: 'DRY_RUN_EXPIRED' };

  return { ok: true };
};
