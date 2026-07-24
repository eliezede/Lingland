const normalizeFieldKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const normalizeLinkedValue = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

export const pickExactLinkedRecordIds = (
  fields: Record<string, unknown>,
  fieldNames: string[],
) => {
  const requestedFields = new Set(fieldNames.map(normalizeFieldKey));
  const values = Object.entries(fields).flatMap(([fieldName, value]) => {
    if (!requestedFields.has(normalizeFieldKey(fieldName))) return [];
    const rawValues = Array.isArray(value) ? value : [value];
    return rawValues.map(normalizeLinkedValue).filter(Boolean);
  });

  return Array.from(new Set(values));
};
