import { SourceSystem, SourceTrackingFields } from '../types';

export type SourceIdentityInput = {
  sourceSystem: SourceSystem;
  sourceBaseId?: string;
  sourceTable?: string;
  sourceView?: string;
  sourceRecordId?: string;
  legacyRef?: string;
  snapshot?: Record<string, unknown>;
  lastSyncRunId?: string;
  syncedAt?: string;
};

const AIRTABLE_DEFAULT_BASE_ID = 'appnglRJzSscwJJph';

const clean = (value?: string | null) => (value || '').trim();

const normalizeTable = (value?: string) => clean(value).replace(/\s+/g, ' ');

const normalizeRef = (value?: string) => clean(value).replace(/\s+/g, ' ');

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce((acc, key) => {
        const next = (value as Record<string, unknown>)[key];
        if (next !== undefined) acc[key] = stableValue(next);
        return acc;
      }, {} as Record<string, unknown>);
  }
  if (typeof value === 'string') return value.trim();
  return value;
};

const stableStringify = (value: unknown) => JSON.stringify(stableValue(value));

const hashString = (value: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export const SourceTracking = {
  airtableBaseId: AIRTABLE_DEFAULT_BASE_ID,

  normalizeTable,

  normalizeRef,

  buildSourceKey: (input: Pick<SourceIdentityInput, 'sourceSystem' | 'sourceBaseId' | 'sourceTable' | 'sourceRecordId'>) => {
    const system = clean(input.sourceSystem);
    const base = clean(input.sourceBaseId);
    const table = normalizeTable(input.sourceTable);
    const record = clean(input.sourceRecordId);
    return [system, base, table, record].filter(Boolean).join(':');
  },

  createSnapshotHash: (snapshot?: Record<string, unknown>) => {
    if (!snapshot) return undefined;
    return hashString(stableStringify(snapshot));
  },

  fromSource: (input: SourceIdentityInput): SourceTrackingFields => {
    const sourceSystem = input.sourceSystem;
    const sourceBaseId = sourceSystem === 'AIRTABLE'
      ? clean(input.sourceBaseId) || AIRTABLE_DEFAULT_BASE_ID
      : clean(input.sourceBaseId) || undefined;
    const sourceTable = normalizeTable(input.sourceTable) || undefined;
    const sourceView = normalizeTable(input.sourceView) || undefined;
    const sourceRecordId = clean(input.sourceRecordId) || undefined;
    const legacyRef = normalizeRef(input.legacyRef) || undefined;
    const isExternalSync = sourceSystem === 'AIRTABLE' || sourceSystem === 'SYSTEM_IMPORT' || sourceSystem === 'MANUAL_RECONCILIATION';
    const lastSyncedAt = input.syncedAt || (isExternalSync ? new Date().toISOString() : undefined);

    return {
      sourceSystem,
      sourceBaseId,
      sourceTable,
      sourceView,
      sourceRecordId,
      legacyRef,
      snapshotHash: SourceTracking.createSnapshotHash(input.snapshot),
      lastSyncedAt,
      lastSyncRunId: clean(input.lastSyncRunId) || undefined,
      syncStatus: isExternalSync ? 'SYNCED' : 'LOCAL_ONLY'
    };
  },

  merge: <T extends Record<string, unknown>>(entity: T, tracking: SourceTrackingFields): T & SourceTrackingFields => ({
    ...entity,
    ...tracking,
    legacyRef: tracking.legacyRef || (entity.legacyRef as string | undefined) || (entity.legacyAirtableRef as string | undefined),
    sourceRecordId: tracking.sourceRecordId || (entity.sourceRecordId as string | undefined),
    sourceTable: tracking.sourceTable || (entity.sourceTable as string | undefined),
    sourceBaseId: tracking.sourceBaseId || (entity.sourceBaseId as string | undefined),
    lastSyncedAt: tracking.lastSyncedAt || (entity.lastSyncedAt as string | undefined),
    syncStatus: tracking.syncStatus || (entity.syncStatus as SourceTrackingFields['syncStatus'] | undefined)
  })
};
