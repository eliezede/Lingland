export const normalizeIdentityName = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

export const normalizeIdentityPhone = (value: string): string => {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0044')) digits = digits.slice(4);
  else if (digits.startsWith('44')) digits = digits.slice(2);
  if (!digits.startsWith('0') && digits.length === 10) digits = `0${digits}`;
  return digits;
};

export const findUniquePhoneCandidate = <T extends { phone?: string; normalizedPhone?: string }>(items: T[], phone: string): T | null => {
  const normalized = normalizeIdentityPhone(phone);
  if (!normalized) return null;
  const matches = items.filter(item => (
    normalizeIdentityPhone(String(item.normalizedPhone || item.phone || '')) === normalized
  ));
  return matches.length === 1 ? matches[0] : null;
};
