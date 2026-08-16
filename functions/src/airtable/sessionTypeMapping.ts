export type AirtableLocationType = 'ONSITE' | 'ONLINE';

export const AIRTABLE_SESSION_TYPE_MAPPING_VERSION = 'airtable-session-type-v1';

export type AirtableSessionTypeMapping = {
  serviceType: string;
  sessionMode: 'Face-to-Face' | 'Videocall' | 'Over the Phone';
};

export const mapAirtableSessionType = (
  sourceValue: string,
  locationType: AirtableLocationType
): AirtableSessionTypeMapping => {
  const raw = String(sourceValue || '').trim();
  const normalized = raw.toLowerCase();

  if (/telephone|\bphone\b|\bopi\b|audio/.test(normalized)) {
    return { serviceType: 'Telephone', sessionMode: 'Over the Phone' };
  }

  if (/video|videocall|\bvri\b|virtual|remote|online|zoom|teams/.test(normalized)) {
    return { serviceType: 'Video Call', sessionMode: 'Videocall' };
  }

  if (/face[\s-]*to[\s-]*face|\bf2f\b|on[\s-]*site|in[\s-]*person/.test(normalized)) {
    return { serviceType: 'Face-to-Face', sessionMode: 'Face-to-Face' };
  }

  if (raw) {
    return {
      serviceType: raw,
      sessionMode: locationType === 'ONLINE' ? 'Videocall' : 'Face-to-Face',
    };
  }

  return locationType === 'ONLINE'
    ? { serviceType: 'Video Call', sessionMode: 'Videocall' }
    : { serviceType: 'Face-to-Face', sessionMode: 'Face-to-Face' };
};
