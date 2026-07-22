export type ClientIdentityMappingAdminRole = 'ADMIN' | 'SUPER_ADMIN';

export interface ClientIdentityBatchMappingRequest {
  sourceTable: string;
  groupKey: string;
  sourceNames?: string[];
  action: string;
  canonicalClientId: string;
  canonicalCompanyName?: string;
  reason?: string;
  recommendationConfidence?: string;
}

export interface ClientIdentityManualBatchMappingRequest {
  sourceTable: string;
  groupKey: string;
  sourceNames: string[];
  action: 'MAP_TO_CLIENT';
  canonicalClientId: string;
  canonicalCompanyName?: string;
  reason?: string;
}

const ALLOWED_SOURCE_TABLES = new Set(['Clients', 'Clients Book', 'Departments']);
const MANUAL_BATCH_SOURCE_TABLES = new Set(['Clients Book', 'Departments']);
export const MAX_CLIENT_IDENTITY_BATCH_MAPPINGS = 25;
export const CLIENT_IDENTITY_RECOMMENDATION_TTL_MS = 30 * 60 * 1000;

const text = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const validateClientIdentityMappingBatch = (
  input: unknown,
  actorRole: ClientIdentityMappingAdminRole,
  confirmed: boolean,
): ClientIdentityBatchMappingRequest[] => {
  if (!['ADMIN', 'SUPER_ADMIN'].includes(actorRole)) {
    throw new Error('Only an active admin can review client identity mappings.');
  }
  if (!confirmed) {
    throw new Error('Explicit batch confirmation is required.');
  }
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_CLIENT_IDENTITY_BATCH_MAPPINGS) {
    throw new Error(`Choose between 1 and ${MAX_CLIENT_IDENTITY_BATCH_MAPPINGS} identity recommendations.`);
  }

  const seen = new Set<string>();
  return input.map((raw, index) => {
    const item = (raw || {}) as Record<string, unknown>;
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
    if (seen.has(scope)) throw new Error(`The source identity in recommendation ${index + 1} is duplicated.`);
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

export const validateClientIdentityManualMappingBatch = (
  input: unknown,
  actorRole: ClientIdentityMappingAdminRole,
  confirmed: boolean,
): ClientIdentityManualBatchMappingRequest[] => {
  if (actorRole !== 'SUPER_ADMIN') {
    throw new Error('Only a Super Admin can save manual client identity batches.');
  }
  if (!confirmed) {
    throw new Error('Explicit batch confirmation is required.');
  }
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_CLIENT_IDENTITY_BATCH_MAPPINGS) {
    throw new Error(`Choose between 1 and ${MAX_CLIENT_IDENTITY_BATCH_MAPPINGS} client identities.`);
  }

  const seen = new Set<string>();
  let batchCanonicalClientId = '';
  return input.map((raw, index) => {
    const item = (raw || {}) as Record<string, unknown>;
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
    if (seen.has(scope)) throw new Error(`The source identity in item ${index + 1} is duplicated.`);
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

export type ClientIdentityRecommendationRunValidation =
  | { ok: true }
  | { ok: false; reason: string };

export const validateClientIdentityRecommendationRun = (
  run: Record<string, unknown> | null | undefined,
  mappings: ClientIdentityBatchMappingRequest[],
  actorId: string,
  expectedMappingVersion: string,
  nowMs = Date.now(),
): ClientIdentityRecommendationRunValidation => {
  if (!run) return { ok: false, reason: 'RECOMMENDATION_RUN_NOT_FOUND' };
  if (run.kind !== 'AIRTABLE_SYNC_CENTER' || run.dryRun !== true || run.success !== true) {
    return { ok: false, reason: 'RECOMMENDATION_RUN_INVALID' };
  }
  if (run.mappingVersion !== expectedMappingVersion) return { ok: false, reason: 'RECOMMENDATION_CONTRACT_CHANGED' };
  if (run.userId !== actorId) return { ok: false, reason: 'RECOMMENDATION_ACTOR_CHANGED' };

  const finishedAtMs = typeof run.finishedAt === 'string' ? Date.parse(run.finishedAt) : Number.NaN;
  if (!Number.isFinite(finishedAtMs) || finishedAtMs > nowMs + 60_000) {
    return { ok: false, reason: 'RECOMMENDATION_RUN_TIME_INVALID' };
  }
  if (nowMs - finishedAtMs > CLIENT_IDENTITY_RECOMMENDATION_TTL_MS) {
    return { ok: false, reason: 'RECOMMENDATION_RUN_EXPIRED' };
  }

  const moduleResults = Array.isArray(run.moduleResults) ? run.moduleResults : [];
  const clientModule = moduleResults.find(raw => (
    raw && typeof raw === 'object' && (raw as Record<string, unknown>).module === 'clients'
  )) as Record<string, unknown> | undefined;
  const diagnostics = clientModule?.diagnostics as Record<string, unknown> | undefined;
  const clientsBook = diagnostics?.clientsBook as Record<string, unknown> | undefined;
  const conflicts = Array.isArray(clientsBook?.conflictCandidates)
    ? clientsBook.conflictCandidates as Array<Record<string, unknown>>
    : [];

  const scope = (sourceTable: unknown, groupKey: unknown) => (
    `${text(sourceTable).toLowerCase()}|${text(groupKey).toLowerCase()}`
  );
  const conflictByScope = new Map(conflicts.map(conflict => [
    scope(conflict.sourceTable, conflict.groupKey),
    conflict,
  ]));

  for (const mapping of mappings) {
    const conflict = conflictByScope.get(scope(mapping.sourceTable, mapping.groupKey));
    const recommendation = conflict?.recommendation as Record<string, unknown> | undefined;
    if (
      !recommendation
      || recommendation.confidence !== 'HIGH'
      || recommendation.autoReviewEligible !== true
      || text(recommendation.canonicalClientId) !== mapping.canonicalClientId
    ) {
      return { ok: false, reason: 'RECOMMENDATION_NO_LONGER_MATCHES' };
    }
  }

  return { ok: true };
};

export const validateClientIdentityManualReviewRun = (
  run: Record<string, unknown> | null | undefined,
  mappings: ClientIdentityManualBatchMappingRequest[],
  actorId: string,
  expectedMappingVersion: string,
  nowMs = Date.now(),
): ClientIdentityRecommendationRunValidation => {
  if (!run) return { ok: false, reason: 'REVIEW_RUN_NOT_FOUND' };
  if (run.kind !== 'AIRTABLE_SYNC_CENTER' || run.dryRun !== true || run.success !== true) {
    return { ok: false, reason: 'REVIEW_RUN_INVALID' };
  }
  if (run.mappingVersion !== expectedMappingVersion) return { ok: false, reason: 'REVIEW_CONTRACT_CHANGED' };
  if (run.userId !== actorId) return { ok: false, reason: 'REVIEW_ACTOR_CHANGED' };

  const finishedAtMs = typeof run.finishedAt === 'string' ? Date.parse(run.finishedAt) : Number.NaN;
  if (!Number.isFinite(finishedAtMs) || finishedAtMs > nowMs + 60_000) {
    return { ok: false, reason: 'REVIEW_RUN_TIME_INVALID' };
  }
  if (nowMs - finishedAtMs > CLIENT_IDENTITY_RECOMMENDATION_TTL_MS) {
    return { ok: false, reason: 'REVIEW_RUN_EXPIRED' };
  }

  const moduleResults = Array.isArray(run.moduleResults) ? run.moduleResults : [];
  const clientModule = moduleResults.find(raw => (
    raw && typeof raw === 'object' && (raw as Record<string, unknown>).module === 'clients'
  )) as Record<string, unknown> | undefined;
  const diagnostics = clientModule?.diagnostics as Record<string, unknown> | undefined;
  const clientsBook = diagnostics?.clientsBook as Record<string, unknown> | undefined;
  const conflicts = Array.isArray(clientsBook?.conflictCandidates)
    ? clientsBook.conflictCandidates as Array<Record<string, unknown>>
    : [];

  const normalized = (value: unknown) => text(value).toLowerCase();
  const scope = (sourceTable: unknown, groupKey: unknown) => `${normalized(sourceTable)}|${normalized(groupKey)}`;
  const conflictByScope = new Map(conflicts.map(conflict => [
    scope(conflict.sourceTable, conflict.groupKey),
    conflict,
  ]));

  for (const mapping of mappings) {
    const conflict = conflictByScope.get(scope(mapping.sourceTable, mapping.groupKey));
    if (!conflict) return { ok: false, reason: 'IDENTITY_NO_LONGER_UNRESOLVED' };
    const conflictNames = Array.isArray(conflict.companyNames)
      ? new Set((conflict.companyNames as unknown[]).map(normalized).filter(Boolean))
      : new Set<string>();
    const mappingNames = new Set(mapping.sourceNames.map(normalized).filter(Boolean));
    if (
      conflictNames.size === 0
      || mappingNames.size !== conflictNames.size
      || Array.from(mappingNames).some(sourceName => !conflictNames.has(sourceName))
    ) {
      return { ok: false, reason: 'IDENTITY_SOURCE_EVIDENCE_CHANGED' };
    }
  }

  return { ok: true };
};
