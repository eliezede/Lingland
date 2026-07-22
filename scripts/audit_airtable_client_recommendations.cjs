/**
 * Read-only audit for the Airtable Client CRM recommendation engine.
 *
 * Required environment:
 *   AIRTABLE_API_KEY or VITE_AIRTABLE_API_KEY
 */

const {
  recommendCanonicalClient,
} = require('../functions/lib/airtable/clientIdentityRecommendations.js');
const {
  isGenericOrganizationName,
  normalizeOrganizationName,
} = require('../functions/lib/clients/clientIdentityAuditCore.js');

const BASE_ID = 'appnglRJzSscwJJph';
const TABLES = {
  clients: 'Clients',
  clientsBook: 'Clients Book',
  departments: 'Departments',
};

const token = String(process.env.AIRTABLE_API_KEY || process.env.VITE_AIRTABLE_API_KEY || '').trim();
if (!token) throw new Error('AIRTABLE_API_KEY or VITE_AIRTABLE_API_KEY is required.');

const text = value => {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  return String(value ?? '').replace(/\s+/g, ' ').trim();
};
const unique = values => Array.from(new Set(values.map(text).filter(Boolean)));
const pick = (fields, names) => {
  for (const name of names) {
    const value = text(fields[name]);
    if (value) return value;
  }
  return '';
};
const pickLinks = (fields, names) => {
  for (const name of names) {
    if (Array.isArray(fields[name])) return fields[name].map(text).filter(Boolean);
  }
  return [];
};

const fetchTable = async tableName => {
  const records = [];
  let offset = '';
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableName)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`${tableName} read failed (${response.status}).`);
    const payload = await response.json();
    records.push(...(payload.records || []));
    offset = payload.offset || '';
  } while (offset);
  return records;
};

const clientProfile = record => {
  const fields = record.fields || {};
  const companyName = pick(fields, [
    'Name', 'TR Agency', 'Agency, institution or company', 'Agency, institution or company  ',
    'Web Client', 'Client', 'Organisation', 'Organization',
  ]) || 'Airtable Client';
  return {
    id: record.id,
    label: companyName,
    names: unique([
      companyName,
      pick(fields, ['Client trade', 'Client Category']),
    ]),
    accountKeys: unique([
      pick(fields, ['Unique Client Key', 'Sage Account Ref', 'Sage ref', 'Client Key']),
      pick(fields, ['Sage Account Ref', 'Sage ref', 'Sage Code', 'SAGE Account']),
    ]),
    emails: unique([
      pick(fields, ['BA email', 'Booking Email', 'Email']),
      pick(fields, ['invoice email', 'Invoicing email', 'Accounts email', 'Finance email']),
    ]),
    phones: unique([
      pick(fields, ['BA telephone', 'Booking phone contact number', 'Phone']),
      pick(fields, ['invoice phone', 'Invoicing phone', 'Accounts phone', 'Finance phone']),
    ]),
    addresses: unique([
      pick(fields, ['BA Address', 'Invoice address', 'Invoicing address', 'BA PCode', 'Address']),
    ]),
  };
};

const clientsBookSource = record => {
  const fields = record.fields || {};
  const companyName = pick(fields, [
    'Name', 'TR Agency', 'Agency, institution or company', 'Agency, institution or company  ',
    'Web Client', 'Client', 'Organisation', 'Organization',
  ]) || 'Airtable Client';
  return {
    id: record.id,
    label: companyName,
    names: unique([
      companyName,
      pick(fields, ['Department', 'Dept', 'Ward', 'Service', 'Client Department']),
      pick(fields, ['Location', 'Site', 'Hospital', 'Venue']),
    ]),
    accountKeys: unique([
      pick(fields, ['Unique Client Key']),
    ]),
    emails: unique([
      pick(fields, ['BA email', 'Booking Email', 'Email']),
      pick(fields, ['Invoicing address/email', 'invoice email', 'Invoicing email']),
    ]),
    phones: unique([
      pick(fields, ['BA telephone', 'Booking phone contact number', 'Phone']),
    ]),
    addresses: unique([
      pick(fields, ['BA Address', 'Invoice address', 'Invoicing address', 'BA PCode', 'Address']),
    ]),
    groupKey: normalizeOrganizationName(pick(fields, ['Unique Client Key']) || companyName),
  };
};

const departmentSource = record => {
  const fields = record.fields || {};
  const departmentName = pick(fields, ['Name']) || 'Airtable department';
  return {
    id: record.id,
    label: departmentName,
    names: [departmentName],
    emails: unique([pick(fields, ['email', 'Email'])]),
    phones: unique([pick(fields, ['Phone'])]),
    addresses: unique([pick(fields, ['Ward/dep Address', 'Ward/Dep PC'])]),
    groupKey: normalizeOrganizationName(departmentName),
    linkedClientIds: pickLinks(fields, ['Clients']),
  };
};

const recommendationCounts = recommendations => recommendations.reduce((counts, recommendation) => {
  if (!recommendation) counts.none += 1;
  else if (recommendation.autoReviewEligible) counts.high += 1;
  else counts.medium += 1;
  return counts;
}, { high: 0, medium: 0, none: 0 });

const main = async () => {
  const [clientRecords, clientsBookRecords, departmentRecords] = await Promise.all([
    fetchTable(TABLES.clients),
    fetchTable(TABLES.clientsBook),
    fetchTable(TABLES.departments),
  ]);
  const targets = clientRecords.map(clientProfile);
  const canonicalIndex = new Map();
  targets.forEach(target => unique([
    ...target.names.map(normalizeOrganizationName),
    ...target.accountKeys.map(normalizeOrganizationName),
  ]).forEach(key => {
    if (!key) return;
    canonicalIndex.set(key, unique([...(canonicalIndex.get(key) || []), target.id]));
  }));

  const groupedBookSources = new Map();
  clientsBookRecords.map(clientsBookSource).forEach(source => {
    groupedBookSources.set(source.groupKey, [...(groupedBookSources.get(source.groupKey) || []), source]);
  });
  let exactBookGroups = 0;
  const bookRecommendations = [];
  groupedBookSources.forEach(group => {
    const exactCandidates = new Set(unique(group.flatMap(source => [source.groupKey, ...source.names.map(normalizeOrganizationName)]))
      .flatMap(key => canonicalIndex.get(key) || []));
    if (exactCandidates.size === 1) {
      exactBookGroups += 1;
      return;
    }
    const representative = group[0];
    if (isGenericOrganizationName(representative.groupKey)) {
      bookRecommendations.push(null);
      return;
    }
    bookRecommendations.push(recommendCanonicalClient({
      id: representative.groupKey,
      label: representative.label,
      names: unique(group.flatMap(source => source.names)),
      accountKeys: unique(group.flatMap(source => source.accountKeys)),
      emails: unique(group.flatMap(source => source.emails)),
      phones: unique(group.flatMap(source => source.phones)),
      addresses: unique(group.flatMap(source => source.addresses)),
    }, targets));
  });

  const unresolvedDepartments = departmentRecords
    .map(departmentSource)
    .filter(source => source.linkedClientIds.length !== 1);
  const departmentRecommendations = unresolvedDepartments.map(source => recommendCanonicalClient(source, targets));

  console.log(JSON.stringify({
    readOnly: true,
    sourceRecords: {
      clients: clientRecords.length,
      clientsBook: clientsBookRecords.length,
      departments: departmentRecords.length,
    },
    clientsBookGroups: {
      total: groupedBookSources.size,
      exact: exactBookGroups,
      unresolved: bookRecommendations.length,
      recommendations: recommendationCounts(bookRecommendations),
    },
    departments: {
      explicitlyLinked: departmentRecords.length - unresolvedDepartments.length,
      unresolved: unresolvedDepartments.length,
      recommendations: recommendationCounts(departmentRecommendations),
    },
  }, null, 2));
};

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
