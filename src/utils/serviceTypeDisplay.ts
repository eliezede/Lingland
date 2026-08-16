import { ServiceCategory, ServiceType, SessionMode } from '../types';

type ServiceDisplayInput = {
  serviceCategory?: ServiceCategory | string;
  serviceType?: string;
  sessionMode?: SessionMode | string;
  sourceServiceType?: string;
  locationType?: 'ONSITE' | 'ONLINE' | string;
};
const normalize = (value?: string) => String(value || '').trim();

const canonicalServiceType = (value?: string): string | null => {
  const raw = normalize(value);
  const normalized = raw.toLowerCase();

  if (!normalized || normalized === 'interpreting' || normalized === 'interpretation') return null;
  if (normalized.includes('translation')) return ServiceType.TRANSLATION;
  if (normalized === 'bsl' || normalized.includes('british sign')) return ServiceType.BSL;
  if (/face[\s-]*to[\s-]*face|\bf2f\b|on[\s-]*site|in[\s-]*person/.test(normalized)) return ServiceType.FACE_TO_FACE;
  if (/telephone|\bphone\b|\bopi\b|audio/.test(normalized)) return ServiceType.TELEPHONE;
  if (/video|videocall|\bvri\b|virtual|remote|online|zoom|teams/.test(normalized)) return ServiceType.VIDEO;

  return raw;
};

export const getServiceCategoryLabel = (input: ServiceDisplayInput): string => {
  const values = [input.serviceCategory, input.serviceType].map(value => normalize(value).toLowerCase());
  return values.some(value => value.includes('translation')) ? 'Translation' : 'Interpreting';
};

export const getServiceTypeLabel = (input: ServiceDisplayInput): string => {
  if (getServiceCategoryLabel(input) === 'Translation') return ServiceType.TRANSLATION;

  const explicitType = [input.serviceType, input.sessionMode, input.sourceServiceType]
    .map(canonicalServiceType)
    .find(Boolean);

  if (explicitType) return explicitType;
  return input.locationType === 'ONLINE' ? 'Remote / online' : ServiceType.FACE_TO_FACE;
};
