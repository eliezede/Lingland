export type CommunicationMode = 'SUPPRESSED' | 'INTERNAL_ONLY' | 'SELECTIVE_LIVE' | 'LIVE';

const INTERNAL_RECIPIENTS = new Set(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'STAFF', 'COORDINATOR']);

export const normalizeCommunicationMode = (value: unknown): CommunicationMode => {
  const mode = String(value || '').toUpperCase();
  return ['SUPPRESSED', 'INTERNAL_ONLY', 'SELECTIVE_LIVE', 'LIVE'].includes(mode)
    ? mode as CommunicationMode
    : 'SUPPRESSED';
};

export const isInternalRecipientType = (recipientType: unknown) => (
  INTERNAL_RECIPIENTS.has(String(recipientType || '').toUpperCase())
);

export const canDeliverCommunication = (modeValue: unknown, recipientType: unknown) => {
  const mode = normalizeCommunicationMode(modeValue);
  if (mode === 'LIVE') return true;
  if (mode === 'SUPPRESSED') return false;
  return isInternalRecipientType(recipientType);
};
