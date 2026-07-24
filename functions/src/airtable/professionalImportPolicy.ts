import { normalizeIdentityName, normalizeIdentityPhone } from './identityMatching';

export type AirtableProfessionalRecord = {
  id: string;
  fields: Record<string, unknown>;
};

export type ProfessionalSourceStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'ON_LEAVE'
  | 'UNRELIABLE'
  | 'ONLY_TRANSL'
  | 'APPLICANT'
  | 'UNSPECIFIED';

export type ProfessionalProfileStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'ON_LEAVE'
  | 'UNRELIABLE'
  | 'ONLY_TRANSL'
  | 'APPLICANT'
  | 'IMPORTED';

export type ProfessionalImport = {
  name: string;
  email: string;
  phone: string;
  languages: string[];
  languageProficiencies: Array<{ language: string; l1: number; translateOrder: string }>;
  address: { street: string; town: string; county: string; postcode: string; country: string };
  qualifications: string[];
  regions: string[];
  sourceRecordId: string;
  airtableRecordIds: string[];
  sourceSnapshot: Record<string, unknown>;
  sourceStatus: ProfessionalSourceStatus;
  sourceStatuses: ProfessionalSourceStatus[];
  profileStatus: ProfessionalProfileStatus;
  portalEligible: boolean;
  translationOnly: boolean;
};

const text = (value: unknown): string => {
  if (Array.isArray(value)) return text(value[0]);
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const candidate = value as { name?: unknown };
    return candidate.name === undefined ? '' : text(candidate.name);
  }
  return String(value).trim();
};

const cleanEmail = (value: unknown): string => text(value).toLowerCase();

export const normalizeProfessionalSourceStatus = (value: unknown): ProfessionalSourceStatus => {
  const normalized = text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (normalized === 'active') return 'ACTIVE';
  if (normalized === 'inactive') return 'INACTIVE';
  if (normalized === 'on leave') return 'ON_LEAVE';
  if (normalized === 'unreliable') return 'UNRELIABLE';
  if (normalized === 'only transl' || normalized === 'only translation' || normalized === 'translation only') {
    return 'ONLY_TRANSL';
  }
  if (normalized === 'applicant') return 'APPLICANT';
  return 'UNSPECIFIED';
};

const STATUS_PRIORITY: Record<ProfessionalSourceStatus, number> = {
  ACTIVE: 7,
  ONLY_TRANSL: 6,
  APPLICANT: 5,
  ON_LEAVE: 4,
  INACTIVE: 3,
  UNRELIABLE: 2,
  UNSPECIFIED: 1,
};

export const selectProfessionalSourceStatus = (
  statuses: ProfessionalSourceStatus[],
): ProfessionalSourceStatus => (
  [...statuses].sort((left, right) => STATUS_PRIORITY[right] - STATUS_PRIORITY[left])[0] || 'UNSPECIFIED'
);

export const professionalProfileStatus = (
  sourceStatus: ProfessionalSourceStatus,
): ProfessionalProfileStatus => {
  if (sourceStatus === 'UNSPECIFIED') return 'IMPORTED';
  return sourceStatus;
};

export const isProfessionalPortalEligible = (sourceStatus: ProfessionalSourceStatus): boolean => (
  sourceStatus === 'ACTIVE' || sourceStatus === 'ONLY_TRANSL'
);

const identityKeys = (record: AirtableProfessionalRecord): string[] => {
  const fields = record.fields || {};
  const name = normalizeIdentityName(text(fields['NAME MASTER']));
  const email = cleanEmail(fields.EMAIL);
  const phone = normalizeIdentityPhone(text(fields.PHONE));
  const keys = [
    email && phone ? `email-phone:${email}|${phone}` : '',
    email && name ? `email-name:${email}|${name}` : '',
    phone && name ? `phone-name:${phone}|${name}` : '',
    !email && !phone && name ? `name-only:${name}` : '',
  ].filter(Boolean);
  return keys.length ? keys : [`source:${record.id}`];
};

type MutableProfessionalImport = ProfessionalImport & { identityKeys: Set<string> };

const createImport = (
  record: AirtableProfessionalRecord,
  sourceStatus: ProfessionalSourceStatus,
): MutableProfessionalImport => {
  const fields = record.fields || {};
  const name = text(fields['NAME MASTER']);
  const email = cleanEmail(fields.EMAIL);
  const phone = text(fields.PHONE);
  const language = text(fields.LANGUAGE);
  const town = text(fields.TOWN);
  const translateOrder = text(fields['Translate Order']) || 'no';
  return {
    name,
    email,
    phone,
    languages: language ? [language] : [],
    languageProficiencies: language ? [{
      language,
      l1: Number.parseInt(text(fields.L1), 10) || 18,
      translateOrder,
    }] : [],
    address: {
      street: text(fields.STREET),
      town,
      county: text(fields.COUNTY),
      postcode: text(fields.POSTCODE),
      country: text(fields.Country) || 'UK',
    },
    qualifications: text(fields.QUALIFICATIONS) ? [text(fields.QUALIFICATIONS)] : [],
    regions: town ? [town] : [],
    sourceRecordId: record.id,
    airtableRecordIds: [record.id],
    sourceSnapshot: fields,
    sourceStatus,
    sourceStatuses: [sourceStatus],
    profileStatus: professionalProfileStatus(sourceStatus),
    portalEligible: isProfessionalPortalEligible(sourceStatus),
    translationOnly: sourceStatus === 'ONLY_TRANSL',
    identityKeys: new Set(identityKeys(record)),
  };
};

const mergeRecord = (
  target: MutableProfessionalImport,
  record: AirtableProfessionalRecord,
  sourceStatus: ProfessionalSourceStatus,
) => {
  const fields = record.fields || {};
  const language = text(fields.LANGUAGE);
  const normalizedLanguage = language.toLowerCase();
  if (language && !target.languages.some(item => item.toLowerCase() === normalizedLanguage)) {
    target.languages.push(language);
    target.languageProficiencies.push({
      language,
      l1: Number.parseInt(text(fields.L1), 10) || 18,
      translateOrder: text(fields['Translate Order']) || 'no',
    });
  }

  target.airtableRecordIds = Array.from(new Set([...target.airtableRecordIds, record.id])).sort();
  target.sourceStatuses = Array.from(new Set([...target.sourceStatuses, sourceStatus]));
  target.sourceStatus = selectProfessionalSourceStatus(target.sourceStatuses);
  target.profileStatus = professionalProfileStatus(target.sourceStatus);
  target.portalEligible = isProfessionalPortalEligible(target.sourceStatus);
  target.translationOnly = target.sourceStatus === 'ONLY_TRANSL';
  identityKeys(record).forEach(key => target.identityKeys.add(key));

  if (!target.email) target.email = cleanEmail(fields.EMAIL);
  if (!target.phone) target.phone = text(fields.PHONE);
  if (!target.address.street) target.address.street = text(fields.STREET);
  if (!target.address.town) target.address.town = text(fields.TOWN);
  if (!target.address.county) target.address.county = text(fields.COUNTY);
  if (!target.address.postcode) target.address.postcode = text(fields.POSTCODE);
  if (!target.address.country) target.address.country = text(fields.Country) || 'UK';
  if (!target.regions.length && target.address.town) target.regions = [target.address.town];
};

export const mergeProfessionalRows = (
  records: AirtableProfessionalRecord[],
): { imports: ProfessionalImport[]; ambiguousSourceRecordIds: string[] } => {
  const groups: MutableProfessionalImport[] = [];
  const keyToGroup = new Map<string, number>();
  const ambiguousSourceRecordIds: string[] = [];

  for (const record of records) {
    const fields = record.fields || {};
    const name = text(fields['NAME MASTER']);
    if (!name) continue;

    const keys = identityKeys(record);
    const candidateGroups = Array.from(new Set(
      keys.map(key => keyToGroup.get(key)).filter((value): value is number => value !== undefined),
    ));
    if (candidateGroups.length > 1) {
      ambiguousSourceRecordIds.push(record.id);
    }

    const groupIndex = candidateGroups.length === 1 ? candidateGroups[0] : groups.length;
    const sourceStatus = normalizeProfessionalSourceStatus(fields['active!']);
    if (groupIndex === groups.length) groups.push(createImport(record, sourceStatus));
    else mergeRecord(groups[groupIndex], record, sourceStatus);

    keys.forEach(key => {
      if (!keyToGroup.has(key)) keyToGroup.set(key, groupIndex);
    });
  }

  return {
    imports: groups.map(({ identityKeys: _identityKeys, ...item }) => item),
    ambiguousSourceRecordIds,
  };
};

export const resolveImportedProfessionalStatus = (
  incomingStatus: ProfessionalProfileStatus,
  existingStatus: string,
): ProfessionalProfileStatus | 'ONBOARDING' | 'SUSPENDED' | 'BLOCKED' => {
  const normalizedExisting = String(existingStatus || '').trim().toUpperCase();
  if (['BLOCKED', 'SUSPENDED', 'ONBOARDING'].includes(normalizedExisting)) {
    return normalizedExisting as 'BLOCKED' | 'SUSPENDED' | 'ONBOARDING';
  }
  return incomingStatus;
};

export const resolveImportedProfessionalAccountStatus = (
  accountEligible: boolean,
  existingStatus: string,
): 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'IMPORTED' => {
  if (!accountEligible) return 'SUSPENDED';
  const normalizedExisting = String(existingStatus || '').trim().toUpperCase();
  if (['ACTIVE', 'PENDING', 'SUSPENDED', 'IMPORTED'].includes(normalizedExisting)) {
    return normalizedExisting as 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'IMPORTED';
  }
  return 'IMPORTED';
};
