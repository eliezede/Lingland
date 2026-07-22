import { createHash } from 'crypto';
import {
  buildClientHierarchySeedPreview,
  ClientHierarchySeedPreview,
  ClientHierarchySourceDocument,
} from '../clients/clientHierarchyCore';
import { normalizeOrganizationName } from '../clients/clientIdentityAuditCore';

export const CLIENT_BOOK_PROJECTION_VERSION = 1;

export interface ClientBookSourceRecord {
  sourceRecordId: string;
  sourceTable?: string;
  companyName: string;
  stableKey: string;
  bookingAgent: string;
  bookingEmail: string;
  bookingPhone: string;
  invoiceEmail: string;
  invoiceContact?: string;
  departmentName?: string;
  locationName?: string;
  billingAddress?: string;
}

export interface ClientBookCanonicalResolution {
  sourceRecordId: string;
  canonicalClientId: string;
  canonicalCompanyName: string;
}

export interface ClientBookCanonicalProjection {
  canonicalClientId: string;
  canonicalCompanyName: string;
  aliases: string[];
  sourceRecordIds: string[];
  sourceRecords: Array<{ sourceTable: string; sourceRecordId: string }>;
  snapshotHash: string;
  hierarchy: ClientHierarchySeedPreview;
}

export interface ClientBookProjectionResult {
  projections: ClientBookCanonicalProjection[];
  unresolvedSourceRecordIds: string[];
}

const text = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))
  .sort((left, right) => left.localeCompare(right));
const stableSourceId = (sourceTable: string, sourceRecordId: string) => {
  const tableKey = normalizeOrganizationName(sourceTable).replace(/\s+/g, '_') || 'source';
  return `airtable_${tableKey}_${sourceRecordId}`;
};
const stableHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const sourceDocument = (source: ClientBookSourceRecord): ClientHierarchySourceDocument => ({
  id: stableSourceId(source.sourceTable || 'Clients Book', source.sourceRecordId),
  data: {
    companyName: text(source.companyName),
    normalizedCompanyName: normalizeOrganizationName(source.companyName),
    airtableClientKey: text(source.stableKey),
    sourceKey: text(source.stableKey),
    bookingContactName: text(source.bookingAgent),
    bookingEmail: text(source.bookingEmail),
    bookingPhone: text(source.bookingPhone),
    invoiceContact: text(source.invoiceContact),
    invoiceEmail: text(source.invoiceEmail),
    departmentName: text(source.departmentName),
    locationName: text(source.locationName),
    billingAddress: text(source.billingAddress),
    sourceSystem: 'AIRTABLE',
    sourceTable: source.sourceTable || 'Clients Book',
    sourceRecordId: source.sourceRecordId,
  },
});

export const buildClientBookProjection = (
  sources: ClientBookSourceRecord[],
  resolutions: ClientBookCanonicalResolution[],
): ClientBookProjectionResult => {
  const sourceById = new Map(sources.map(source => [source.sourceRecordId, source]));
  const resolutionBySourceId = new Map(
    resolutions
      .filter(resolution => sourceById.has(resolution.sourceRecordId))
      .map(resolution => [resolution.sourceRecordId, resolution]),
  );
  const unresolvedSourceRecordIds = sources
    .map(source => source.sourceRecordId)
    .filter(sourceRecordId => !resolutionBySourceId.has(sourceRecordId))
    .sort((left, right) => left.localeCompare(right));
  const sourcesByCanonicalClient = new Map<string, ClientBookSourceRecord[]>();
  const canonicalNames = new Map<string, string>();

  sources.forEach(source => {
    const resolution = resolutionBySourceId.get(source.sourceRecordId);
    if (!resolution?.canonicalClientId) return;
    sourcesByCanonicalClient.set(resolution.canonicalClientId, [
      ...(sourcesByCanonicalClient.get(resolution.canonicalClientId) || []),
      source,
    ]);
    if (!canonicalNames.has(resolution.canonicalClientId)) {
      canonicalNames.set(resolution.canonicalClientId, text(resolution.canonicalCompanyName) || text(source.companyName));
    }
  });

  const projections = Array.from(sourcesByCanonicalClient.entries()).map(([canonicalClientId, groupedSources]) => {
    const canonicalCompanyName = canonicalNames.get(canonicalClientId) || groupedSources[0]?.companyName || 'Client';
    const orderedSources = groupedSources.slice().sort((left, right) => left.sourceRecordId.localeCompare(right.sourceRecordId));
    const canonicalDocument: ClientHierarchySourceDocument = {
      id: canonicalClientId,
      data: {
        companyName: canonicalCompanyName,
        normalizedCompanyName: normalizeOrganizationName(canonicalCompanyName),
        sourceSystem: 'AIRTABLE',
      },
    };
    const documents = [canonicalDocument, ...orderedSources.map(sourceDocument)];
    const hierarchy = buildClientHierarchySeedPreview(documents, canonicalClientId);
    const aliases = unique(orderedSources.flatMap(source => [source.companyName, source.stableKey]));
    const sourceRecordIds = orderedSources.map(source => source.sourceRecordId);
    const sourceRecords = orderedSources.map(source => ({
      sourceTable: source.sourceTable || 'Clients Book',
      sourceRecordId: source.sourceRecordId,
    }));
    const snapshotHash = stableHash({
      version: CLIENT_BOOK_PROJECTION_VERSION,
      canonicalClientId,
      canonicalCompanyName,
      records: orderedSources.map(source => ({
        sourceRecordId: source.sourceRecordId,
        sourceTable: source.sourceTable || 'Clients Book',
        companyName: text(source.companyName),
        stableKey: text(source.stableKey),
        bookingAgent: text(source.bookingAgent),
        bookingEmail: text(source.bookingEmail).toLowerCase(),
        bookingPhone: text(source.bookingPhone),
        invoiceEmail: text(source.invoiceEmail).toLowerCase(),
        invoiceContact: text(source.invoiceContact),
        departmentName: text(source.departmentName),
        locationName: text(source.locationName),
        billingAddress: text(source.billingAddress),
      })),
    });

    return {
      canonicalClientId,
      canonicalCompanyName,
      aliases,
      sourceRecordIds,
      sourceRecords,
      snapshotHash,
      hierarchy,
    };
  }).sort((left, right) => left.canonicalClientId.localeCompare(right.canonicalClientId));

  return { projections, unresolvedSourceRecordIds };
};
