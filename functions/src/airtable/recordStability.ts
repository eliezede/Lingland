import { createHash } from 'crypto';

type AirtableLikeRecord = {
  id: string;
  fields: Record<string, unknown>;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const entry = (value as Record<string, unknown>)[key];
        if (entry !== undefined) result[key] = canonicalize(entry);
        return result;
      }, {});
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return value;
};

export const hashStableValue = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(canonicalize(value)))
  .digest('hex');

export const hashAirtableRecordFields = (fields: Record<string, unknown>): string => hashStableValue(fields);

export const fingerprintAirtableSnapshot = <T extends AirtableLikeRecord>(records: T[]): string => hashStableValue(
  records
    .map(record => ({ id: record.id, fieldsHash: hashAirtableRecordFields(record.fields) }))
    .sort((left, right) => left.id.localeCompare(right.id))
);

export const mergeAirtableSnapshots = <T extends AirtableLikeRecord>(...snapshots: T[][]): T[] => {
  const recordsById = new Map<string, T>();
  snapshots.forEach(records => records.forEach(record => recordsById.set(record.id, record)));
  return Array.from(recordsById.values()).sort((left, right) => left.id.localeCompare(right.id));
};
