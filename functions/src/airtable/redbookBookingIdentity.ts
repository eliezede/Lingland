export type ExistingBookingIdentity = {
  sourceRecordId?: unknown;
  legacyAirtableRef?: unknown;
};

const identityValue = (value: unknown): string => String(value || '').trim().toLowerCase();

export const canReuseLegacyBookingIdentity = (
  existing: ExistingBookingIdentity,
  incomingLegacyRef: string,
): boolean => {
  if (identityValue(existing.sourceRecordId)) return false;

  const existingLegacyRef = identityValue(existing.legacyAirtableRef);
  const incomingRef = identityValue(incomingLegacyRef);
  return !incomingRef || !existingLegacyRef || existingLegacyRef === incomingRef;
};
