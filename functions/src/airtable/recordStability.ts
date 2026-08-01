import { createHash } from 'crypto';

type AirtableLikeRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type AirtableAttachmentLike = {
  id?: unknown;
  filename?: unknown;
  name?: unknown;
  type?: unknown;
  size?: unknown;
  url?: unknown;
};

const text = (value: unknown): string => String(value || '').trim();

const stableUrl = (value: unknown): string => {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw.split(/[?#]/)[0];
  }
};

export const stabilizeAirtableAttachments = (attachments: unknown[]): unknown[] => attachments
  .map(attachment => {
    if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
      const url = stableUrl(attachment);
      return url ? { url } : null;
    }

    const value = attachment as AirtableAttachmentLike;
    const id = text(value.id);
    const name = text(value.filename) || text(value.name);
    const type = text(value.type);
    const size = Number(value.size);
    const url = id || name ? '' : stableUrl(value.url);
    if (!id && !name && !url) return null;
    return {
      ...(id ? { id } : {}),
      ...(name ? { name } : {}),
      ...(type ? { type } : {}),
      ...(Number.isFinite(size) && size > 0 ? { size } : {}),
      ...(url ? { url } : {}),
    };
  })
  .filter(Boolean)
  .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

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
