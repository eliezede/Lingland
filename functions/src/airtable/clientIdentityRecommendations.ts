import {
  extractClientEmails,
  extractOrganizationDomains,
  extractUkPostcode,
  isGenericOrganizationName,
  normalizeClientAddress,
  normalizeClientPhone,
  normalizeOrganizationName,
  organizationNameSimilarity,
} from '../clients/clientIdentityAuditCore';

export type ClientIdentityRecommendationConfidence = 'HIGH' | 'MEDIUM';

export interface ClientIdentityRecommendationProfile {
  id: string;
  label: string;
  names: string[];
  accountKeys?: string[];
  emails?: string[];
  phones?: string[];
  addresses?: string[];
}

export interface ClientIdentityRecommendationEvidence {
  code:
    | 'ACCOUNT_KEY'
    | 'EXACT_NAME'
    | 'SIMILAR_NAME'
    | 'ADDRESS'
    | 'POSTCODE'
    | 'PHONE'
    | 'ORGANISATION_DOMAIN';
  label: string;
  value: string;
  strength: 'STRONG' | 'SUPPORTING';
}

export interface ClientIdentityRecommendation {
  canonicalClientId: string;
  canonicalCompanyName: string;
  confidence: ClientIdentityRecommendationConfidence;
  score: number;
  autoReviewEligible: boolean;
  evidence: ClientIdentityRecommendationEvidence[];
  alternatives: Array<{
    canonicalClientId: string;
    canonicalCompanyName: string;
    score: number;
  }>;
}

type PreparedProfile = {
  id: string;
  label: string;
  names: string[];
  accountKeys: string[];
  domains: string[];
  phones: string[];
  addresses: string[];
  postcodes: string[];
};

type RankedRecommendation = Omit<ClientIdentityRecommendation, 'autoReviewEligible' | 'alternatives'>;

const text = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))
  .sort((left, right) => left.localeCompare(right));
const intersects = (left: string[], right: string[]) => left.some(value => right.includes(value));
const shared = (left: string[], right: string[]) => left.find(value => right.includes(value)) || '';
const normalizeAccountKey = (value: unknown) => text(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

const prepareProfile = (profile: ClientIdentityRecommendationProfile): PreparedProfile => {
  const rawNames = unique([profile.label, ...(profile.names || [])]);
  const names = unique(rawNames
    .map(normalizeOrganizationName)
    .filter(value => value && !isGenericOrganizationName(value)));
  const emails = unique((profile.emails || []).flatMap(extractClientEmails));
  const addresses = unique((profile.addresses || []).map(normalizeClientAddress));
  return {
    id: profile.id,
    label: text(profile.label) || rawNames[0] || profile.id,
    names,
    accountKeys: unique((profile.accountKeys || []).map(normalizeAccountKey)),
    domains: extractOrganizationDomains(emails),
    phones: unique((profile.phones || []).map(normalizeClientPhone)),
    addresses,
    postcodes: unique((profile.addresses || []).map(extractUkPostcode)),
  };
};

const bestNameSimilarity = (left: PreparedProfile, right: PreparedProfile) => left.names.reduce(
  (best, leftName) => Math.max(
    best,
    ...right.names.map(rightName => organizationNameSimilarity(leftName, rightName)),
  ),
  0,
);

const rankTarget = (source: PreparedProfile, target: PreparedProfile): RankedRecommendation | null => {
  const sameAccountKey = intersects(source.accountKeys, target.accountKeys);
  const exactName = intersects(source.names, target.names);
  const sameAddress = intersects(source.addresses, target.addresses);
  const samePostcode = intersects(source.postcodes, target.postcodes);
  const samePhone = intersects(source.phones, target.phones);
  const sameDomain = intersects(source.domains, target.domains);
  const nameSimilarity = bestNameSimilarity(source, target);
  const supportingSignal = sameAddress || samePostcode || samePhone || sameDomain;

  const highConfidence = sameAccountKey
    || exactName
    || (nameSimilarity >= 0.82 && supportingSignal)
    || (nameSimilarity >= 0.70 && samePhone && sameDomain)
    || (nameSimilarity >= 0.68 && sameAddress && samePostcode);
  const mediumConfidence = highConfidence
    || (nameSimilarity >= 0.68 && supportingSignal)
    || (sameAddress && samePostcode)
    || (samePhone && sameDomain)
    || (sameDomain && samePostcode);
  if (!mediumConfidence) return null;

  const evidence: ClientIdentityRecommendationEvidence[] = [];
  if (sameAccountKey) evidence.push({
    code: 'ACCOUNT_KEY',
    label: 'Same stable account reference',
    value: shared(source.accountKeys, target.accountKeys),
    strength: 'STRONG',
  });
  if (exactName) evidence.push({
    code: 'EXACT_NAME',
    label: 'Same organisation name or alias',
    value: shared(source.names, target.names),
    strength: 'STRONG',
  });
  if (!exactName && nameSimilarity >= 0.68) evidence.push({
    code: 'SIMILAR_NAME',
    label: 'Similar organisation names',
    value: `${Math.round(nameSimilarity * 100)}%`,
    strength: 'SUPPORTING',
  });
  if (sameAddress) evidence.push({
    code: 'ADDRESS',
    label: 'Same billing or service address',
    value: shared(source.addresses, target.addresses),
    strength: 'STRONG',
  });
  if (samePostcode) evidence.push({
    code: 'POSTCODE',
    label: 'Same UK postcode',
    value: shared(source.postcodes, target.postcodes),
    strength: 'SUPPORTING',
  });
  if (samePhone) evidence.push({
    code: 'PHONE',
    label: 'Same organisation phone',
    value: shared(source.phones, target.phones),
    strength: 'STRONG',
  });
  if (sameDomain) evidence.push({
    code: 'ORGANISATION_DOMAIN',
    label: 'Same specific organisation email domain',
    value: shared(source.domains, target.domains),
    strength: 'SUPPORTING',
  });

  const score = Math.min(100, Math.round(
    (sameAccountKey ? 55 : 0)
    + (exactName ? 42 : nameSimilarity * 24)
    + (sameAddress ? 22 : 0)
    + (samePostcode ? 10 : 0)
    + (samePhone ? 18 : 0)
    + (sameDomain ? 14 : 0),
  ));

  return {
    canonicalClientId: target.id,
    canonicalCompanyName: target.label,
    confidence: highConfidence ? 'HIGH' : 'MEDIUM',
    score,
    evidence,
  };
};

export const recommendCanonicalClient = (
  sourceProfile: ClientIdentityRecommendationProfile,
  targetProfiles: ClientIdentityRecommendationProfile[],
): ClientIdentityRecommendation | null => {
  const source = prepareProfile(sourceProfile);
  if (!source.names.length && !source.accountKeys.length && !source.addresses.length && !source.phones.length && !source.domains.length) {
    return null;
  }

  const targetsById = new Map<string, ClientIdentityRecommendationProfile>();
  targetProfiles.forEach(target => {
    const current = targetsById.get(target.id);
    if (!current) {
      targetsById.set(target.id, target);
      return;
    }
    targetsById.set(target.id, {
      ...current,
      label: current.label || target.label,
      names: unique([...(current.names || []), ...(target.names || [])]),
      accountKeys: unique([...(current.accountKeys || []), ...(target.accountKeys || [])]),
      emails: unique([...(current.emails || []), ...(target.emails || [])]),
      phones: unique([...(current.phones || []), ...(target.phones || [])]),
      addresses: unique([...(current.addresses || []), ...(target.addresses || [])]),
    });
  });

  const ranked = Array.from(targetsById.values())
    .map(prepareProfile)
    .map(target => rankTarget(source, target))
    .filter((candidate): candidate is RankedRecommendation => Boolean(candidate))
    .sort((left, right) => right.score - left.score
      || (left.confidence === right.confidence ? 0 : left.confidence === 'HIGH' ? -1 : 1)
      || left.canonicalCompanyName.localeCompare(right.canonicalCompanyName));
  if (!ranked.length) return null;

  const winner = ranked[0];
  const runnerUp = ranked[1];
  const uniquelyStrong = winner.confidence === 'HIGH'
    && (!runnerUp || runnerUp.confidence !== 'HIGH' || winner.score - runnerUp.score >= 8);

  return {
    ...winner,
    confidence: uniquelyStrong ? 'HIGH' : 'MEDIUM',
    autoReviewEligible: uniquelyStrong,
    alternatives: ranked.slice(1, 4).map(candidate => ({
      canonicalClientId: candidate.canonicalClientId,
      canonicalCompanyName: candidate.canonicalCompanyName,
      score: candidate.score,
    })),
  };
};
