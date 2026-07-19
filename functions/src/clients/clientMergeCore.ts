import { createHash } from 'node:crypto';
import { ClientIdentityCandidate, ClientMergeEligibility } from './clientIdentityAuditCore';
import { buildClientHierarchySeedPreview, ClientHierarchySeedPreview } from './clientHierarchyCore';

export interface ClientMergeSourceDocument {
  id: string;
  data: Record<string, unknown>;
  version: string;
}

export interface ClientMergeDependencyRecord {
  collection: string;
  id: string;
  clientId: string;
  version: string;
}

export interface ClientMergeHierarchyDocument {
  collection: 'clientDepartments' | 'clientAgents' | 'clientMemberships';
  id: string;
  version: string;
}

export interface ClientMergeFieldDecision {
  field: string;
  label: string;
  selectedValue: unknown;
  sourceClientId: string;
  alternatives: Array<{ clientId: string; value: unknown }>;
  conflict: boolean;
  fillsCanonicalGap: boolean;
  overridesCanonical: boolean;
}

export interface ClientMergePreview {
  candidateId: string;
  candidateFingerprint: string;
  expectedFingerprint: string;
  canonicalClientId: string;
  sourceClientIds: string[];
  eligibility: ClientMergeEligibility;
  canExecute: boolean;
  requiresReviewAcknowledgement: boolean;
  requiresSecondApproval: boolean;
  secondApprovalReasons: string[];
  confirmationPhrase: string;
  blockers: string[];
  warnings: string[];
  fields: ClientMergeFieldDecision[];
  fieldSelections: Record<string, string>;
  canonicalPatch: Record<string, unknown>;
  aliases: string[];
  hierarchy: ClientHierarchySeedPreview & { bookingAgentLinks: number; bookingDepartmentLinks: number };
  dependencies: Array<{ collection: string; records: number }>;
  totals: {
    clientRecords: number;
    dependencyRecords: number;
    jobs: number;
    clientInvoices: number;
    timesheets: number;
    interpreterInvoiceLines: number;
    linkedUsers: number;
  };
}

const MERGE_FIELDS = [
  ['companyName', 'Organisation name'],
  ['billingAddress', 'Billing address'],
  ['phone', 'Main phone'],
  ['paymentTermsDays', 'Payment terms'],
  ['defaultCostCodeType', 'Default cost code'],
  ['sageAccountRef', 'Sage account'],
  ['invoiceContact', 'Invoice contact'],
  ['invoiceEmail', 'Invoice email'],
  ['invoicePhone', 'Invoice phone'],
  ['photoUrl', 'Organisation image'],
  ['status', 'Client status'],
] as const;

const text = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const isPresent = (value: unknown) => value !== undefined && value !== null && text(value) !== '';
const comparable = (value: unknown) => typeof value === 'string' ? text(value).toLowerCase() : JSON.stringify(value);
const uniqueStrings = (values: unknown[]) => Array.from(new Set(values.flatMap(value => (
  Array.isArray(value) ? value : [value]
)).map(text).filter(Boolean))).sort((left, right) => left.localeCompare(right));

const stableHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const stableSourceDocuments = (documents: ClientMergeSourceDocument[]) => documents
  .slice()
  .sort((left, right) => left.id.localeCompare(right.id))
  .map(document => ({ id: document.id, version: document.version }));

const stableDependencies = (dependencies: ClientMergeDependencyRecord[]) => dependencies
  .slice()
  .sort((left, right) => left.collection.localeCompare(right.collection) || left.id.localeCompare(right.id))
  .map(dependency => ({
    collection: dependency.collection,
    id: dependency.id,
    clientId: dependency.clientId,
    version: dependency.version,
  }));

export const buildClientMergeFingerprint = (
  candidate: ClientIdentityCandidate,
  canonicalClientId: string,
  documents: ClientMergeSourceDocument[],
  dependencies: ClientMergeDependencyRecord[],
  hierarchyDocuments: ClientMergeHierarchyDocument[] = [],
  fieldSelections: Record<string, string> = {},
) => stableHash({
  candidateId: candidate.id,
  candidateFingerprint: candidate.fingerprint,
  canonicalClientId,
  documents: stableSourceDocuments(documents),
  dependencies: stableDependencies(dependencies),
  hierarchyDocuments: hierarchyDocuments.slice().sort((left, right) => (
    left.collection.localeCompare(right.collection) || left.id.localeCompare(right.id)
  )),
  fieldSelections: Object.fromEntries(Object.entries(fieldSelections).sort(([left], [right]) => left.localeCompare(right))),
});

const dependencySummary = (dependencies: ClientMergeDependencyRecord[]) => {
  const counts = new Map<string, number>();
  dependencies.forEach(dependency => counts.set(dependency.collection, (counts.get(dependency.collection) || 0) + 1));
  return Array.from(counts.entries())
    .map(([collection, records]) => ({ collection, records }))
    .sort((left, right) => left.collection.localeCompare(right.collection));
};

export const buildClientMergePreview = (
  candidate: ClientIdentityCandidate,
  canonicalClientId: string,
  documents: ClientMergeSourceDocument[],
  dependencies: ClientMergeDependencyRecord[],
  hierarchyDocuments: ClientMergeHierarchyDocument[] = [],
  requestedFieldSelections: Record<string, string> = {},
): ClientMergePreview => {
  if (candidate.kind !== 'ORGANIZATION') throw new Error('Only organisation candidates can be merged.');
  if (!candidate.clientIds.includes(canonicalClientId)) throw new Error('The canonical client must belong to the candidate.');
  const documentsById = new Map(documents.map(document => [document.id, document]));
  const canonical = documentsById.get(canonicalClientId);
  if (!canonical) throw new Error('The canonical client record was not found.');
  const sourceClientIds = candidate.clientIds.filter(id => id !== canonicalClientId).sort();
  const rankedIds = candidate.records
    .slice()
    .sort((left, right) => right.completenessScore - left.completenessScore || left.id.localeCompare(right.id))
    .map(record => record.id);
  const canonicalPatch: Record<string, unknown> = {};
  const fieldSelections: Record<string, string> = {};
  const fields: ClientMergeFieldDecision[] = MERGE_FIELDS.map(([field, label]) => {
    const values = candidate.clientIds
      .map(clientId => ({ clientId, value: documentsById.get(clientId)?.data[field] }))
      .filter(item => isPresent(item.value));
    const canonicalValue = canonical.data[field];
    const requestedClientId = requestedFieldSelections[field];
    const requestedWinner = requestedClientId ? values.find(item => item.clientId === requestedClientId) : undefined;
    const selectsEmptyCanonical = requestedClientId === canonicalClientId && values.length === 0;
    if (requestedClientId && !requestedWinner && !selectsEmptyCanonical) {
      throw new Error(`The selected ${label.toLowerCase()} value is no longer available.`);
    }
    const winner = requestedWinner || (isPresent(canonicalValue)
      ? { clientId: canonicalClientId, value: canonicalValue }
      : rankedIds.map(id => values.find(item => item.clientId === id)).find(Boolean)
        || values[0]
        || { clientId: canonicalClientId, value: canonicalValue });
    fieldSelections[field] = winner.clientId;
    const alternatives = values.filter(item => item.clientId !== winner.clientId || comparable(item.value) !== comparable(winner.value));
    const distinctValues = new Set(values.map(item => comparable(item.value)));
    const fillsCanonicalGap = !isPresent(canonicalValue) && isPresent(winner.value);
    const overridesCanonical = isPresent(canonicalValue)
      && winner.clientId !== canonicalClientId
      && comparable(winner.value) !== comparable(canonicalValue);
    if (fillsCanonicalGap || overridesCanonical) canonicalPatch[field] = winner.value;
    return {
      field,
      label,
      selectedValue: winner.value,
      sourceClientId: winner.clientId,
      alternatives,
      conflict: distinctValues.size > 1,
      fillsCanonicalGap,
      overridesCanonical,
    };
  });
  const aliases = uniqueStrings(candidate.clientIds.flatMap(clientId => {
    const data = documentsById.get(clientId)?.data || {};
    return [data.companyName, data.legalName, data.tradeName, data.clientTrade, data.accountAliases];
  })).filter(alias => comparable(alias) !== comparable(canonical.data.companyName));
  const existingMergedIds = uniqueStrings([canonical.data.mergedClientIds]);
  canonicalPatch.accountAliases = aliases;
  canonicalPatch.mergedClientIds = uniqueStrings([...existingMergedIds, ...sourceClientIds]);
  canonicalPatch.recordState = 'ACTIVE';

  const hierarchySeed = buildClientHierarchySeedPreview(documents, canonicalClientId);
  const bookingAgentLinks = dependencies.filter(dependency => (
    dependency.collection === 'bookings'
    && Boolean(hierarchySeed.bookingAgentBySourceClientId[dependency.clientId])
  )).length;
  const bookingDepartmentLinks = dependencies.filter(dependency => (
    dependency.collection === 'bookings'
    && Boolean(hierarchySeed.departmentBySourceClientId[dependency.clientId])
  )).length;

  const summary = dependencySummary(dependencies);
  const dependencyCount = (collection: string) => summary.find(item => item.collection === collection)?.records || 0;
  const hierarchyRequiresReview = hierarchySeed.totals.sharedMailboxes > 0 || hierarchySeed.totals.unresolvedContacts > 0;
  const effectiveEligibility: ClientMergeEligibility = candidate.executionEligibility === 'READY' && hierarchyRequiresReview
    ? 'REVIEW_REQUIRED'
    : candidate.executionEligibility;
  const warnings = Array.from(new Set([
    ...candidate.conflicts.filter(conflict => !candidate.blockers.includes(conflict)),
    fields.some(field => field.conflict) ? 'Some canonical fields have different non-empty values. Review every selected field winner.' : '',
    hierarchySeed.totals.sharedMailboxes > 0 ? 'Functional shared mailboxes will be preserved but not assigned to historical jobs automatically.' : '',
    hierarchySeed.totals.unresolvedContacts > 0 ? 'Contacts without a deterministic email remain in source snapshots and require manual classification.' : '',
    dependencyCount('clientInvoices') > 0 ? 'Financial records will keep their historical display snapshots; only the client relationship is reassigned.' : '',
  ].filter(Boolean)));
  const secondApprovalReasons = [
    candidate.mergeRisk === 'HIGH' ? 'The identity candidate is classified as high risk.' : '',
    dependencies.length >= 100 ? `${dependencies.length} dependent records are in scope.` : '',
    dependencyCount('clientInvoices') >= 10 ? `${dependencyCount('clientInvoices')} client invoices are in scope.` : '',
  ].filter(Boolean);

  return {
    candidateId: candidate.id,
    candidateFingerprint: candidate.fingerprint,
    expectedFingerprint: buildClientMergeFingerprint(candidate, canonicalClientId, documents, dependencies, hierarchyDocuments, fieldSelections),
    canonicalClientId,
    sourceClientIds,
    eligibility: effectiveEligibility,
    canExecute: candidate.executionEligibility !== 'BLOCKED',
    requiresReviewAcknowledgement: effectiveEligibility === 'REVIEW_REQUIRED',
    requiresSecondApproval: secondApprovalReasons.length > 0,
    secondApprovalReasons,
    confirmationPhrase: 'MERGE CLIENTS',
    blockers: candidate.blockers,
    warnings,
    fields,
    fieldSelections,
    canonicalPatch,
    aliases,
    hierarchy: { ...hierarchySeed, bookingAgentLinks, bookingDepartmentLinks },
    dependencies: summary,
    totals: {
      clientRecords: candidate.clientIds.length,
      dependencyRecords: dependencies.length,
      jobs: dependencyCount('bookings'),
      clientInvoices: dependencyCount('clientInvoices'),
      timesheets: dependencyCount('timesheets'),
      interpreterInvoiceLines: dependencyCount('interpreterInvoiceLines'),
      linkedUsers: candidate.totals.linkedUsers,
    },
  };
};
