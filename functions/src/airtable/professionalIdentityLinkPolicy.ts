export type ProfessionalIdentityLinkRequest = {
  professionalRecordId: string;
  interpreterId: string;
  sourceName: string;
  reason: string;
};

const text = (value: unknown): string => String(value || '').trim();

export const validateProfessionalIdentityLinkRequest = (
  input: unknown,
  actorRole: string,
): ProfessionalIdentityLinkRequest => {
  if (actorRole !== 'SUPER_ADMIN') {
    throw new Error('Only a Super Admin can confirm professional identity mappings.');
  }

  const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const professionalRecordId = text(value.professionalRecordId);
  const interpreterId = text(value.interpreterId);
  const sourceName = text(value.sourceName);
  const reason = text(value.reason);

  if (!/^rec[a-zA-Z0-9]{14}$/.test(professionalRecordId)) {
    throw new Error('A valid Airtable professional record ID is required.');
  }
  if (!interpreterId || interpreterId.length > 160 || interpreterId.includes('/')) {
    throw new Error('Choose one valid interpreter profile.');
  }
  if (reason.length < 8 || reason.length > 500) {
    throw new Error('Record a short reason between 8 and 500 characters.');
  }

  return {
    professionalRecordId,
    interpreterId,
    sourceName: sourceName.slice(0, 200),
    reason,
  };
};
