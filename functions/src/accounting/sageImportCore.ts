import { createHash } from 'node:crypto';

export const SAGE_IMPORT_SCHEMA = 'lingland.sage-xero.v1';

export const SAGE_IMPORT_MODULES = [
  'contacts',
  'accounts',
  'bankAccounts',
  'salesDocuments',
  'purchaseDocuments',
  'customerPayments',
  'supplierPayments',
  'bankJournalEntries',
  'sourceArtifacts',
] as const;

export type SageImportModule = typeof SAGE_IMPORT_MODULES[number];

export interface SageImportManifest {
  schemaVersion: string;
  datasetId: string;
  manifestHash: string;
  generatedAt: string;
  sourceAsOf: string;
  scope?: {
    kind: string;
    fromDate: string;
    toDate: string;
  };
  expectedModuleCounts: Partial<Record<SageImportModule, number>>;
  sourceTotals?: Record<string, number>;
  validationSummary?: {
    passed: boolean;
    checkCount: number;
    failedCheckCount: number;
  };
}

export interface NormalizedSageRecord {
  id: string;
  sourceSystem: 'SAGE';
  sourceDatasetId: string;
  sourceRecordId: string;
  sourceRecordHash: string;
  sourceTable: string;
  [key: string]: unknown;
}

const MODULE_SET = new Set<string>(SAGE_IMPORT_MODULES);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/;

export const text = (value: unknown, max = 500): string => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

export const normalizedName = (value: unknown): string => text(value, 200)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

export const stableSageId = (prefix: string, value: unknown): string => (
  `${prefix}_${createHash('sha256').update(text(value, 2000)).digest('hex').slice(0, 24)}`
);

const finite = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 1000000) / 1000000 : fallback;
};

const optionalDate = (value: unknown): string | null => {
  const clean = text(value, 40);
  return clean && DATE_PATTERN.test(clean) ? clean : null;
};

const strings = (value: unknown, maxItems = 20): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => text(item, 500)).filter(Boolean))).slice(0, maxItems);
};

const cleanObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const normalizeSource = (record: Record<string, unknown>, datasetId: string) => {
  const id = text(record.id, 160);
  const sourceRecordId = text(record.sourceRecordId || record.recordUuid || id, 200);
  const sourceRecordHash = text(record.sourceRecordHash || record.recordSha256, 64).toLowerCase();
  const sourceTable = text(record.sourceTable, 120);
  if (!ID_PATTERN.test(id)) throw new Error('Every Sage record requires a stable, safe id.');
  if (!sourceRecordId) throw new Error(`Sage record ${id} has no source record id.`);
  if (!HASH_PATTERN.test(sourceRecordHash)) throw new Error(`Sage record ${id} has an invalid SHA-256 hash.`);
  if (!sourceTable) throw new Error(`Sage record ${id} has no source table.`);
  return {
    id,
    sourceSystem: 'SAGE' as const,
    sourceDatasetId: datasetId,
    sourceRecordId,
    sourceRecordHash,
    sourceTable,
  };
};

const normalizeContact = (record: Record<string, unknown>, datasetId: string): NormalizedSageRecord => {
  const source = normalizeSource(record, datasetId);
  const contactType = text(record.contactType, 20).toUpperCase();
  const sageAccountRef = text(record.sageAccountRef, 80).toUpperCase();
  const name = text(record.name, 200);
  if (!['CUSTOMER', 'SUPPLIER'].includes(contactType) || !sageAccountRef || !name) {
    throw new Error(`Sage contact ${source.id} is missing type, account reference or name.`);
  }
  return {
    ...source,
    contactType,
    sageAccountRef,
    xeroAccountNumber: text(record.xeroAccountNumber || sageAccountRef, 80).toUpperCase(),
    name,
    normalizedName: normalizedName(record.normalizedName || name),
    identityStatus: text(record.identityStatus || 'SOURCE_PROVIDED', 40).toUpperCase(),
    identityReviewReason: text(record.identityReviewReason, 120).toUpperCase(),
    contactName: text(record.contactName, 160),
    emails: strings(record.emails, 12).map(email => email.toLowerCase()),
    phones: strings(record.phones, 8),
    addressLines: strings(record.addressLines, 8),
    postcode: text(record.postcode, 24).toUpperCase(),
    paymentTermsDays: Math.max(0, Math.min(365, Math.trunc(finite(record.paymentTermsDays, 30)))),
    defaultAccountCode: text(record.defaultAccountCode, 20),
    currency: text(record.currency || 'GBP', 8).toUpperCase(),
    platformLinkStatus: 'UNRESOLVED',
    xeroContactId: null,
    xeroSyncStatus: 'NOT_SYNCED',
  };
};

const normalizeLine = (value: unknown, index: number) => {
  const line = cleanObject(value);
  const quantity = finite(line.quantity, 1);
  const unitAmount = finite(line.unitAmount);
  const netAmount = finite(line.netAmount, quantity * unitAmount);
  const taxAmount = finite(line.taxAmount);
  return {
    id: text(line.id, 160) || `line_${index + 1}`,
    sequence: Math.max(1, Math.trunc(finite(line.sequence, index + 1))),
    itemCode: text(line.itemCode, 80),
    description: text(line.description, 1000),
    quantity,
    unitAmount,
    netAmount,
    taxAmount,
    grossAmount: finite(line.grossAmount, netAmount + taxAmount),
    accountCode: text(line.accountCode, 20),
    taxRate: finite(line.taxRate),
    xeroTaxType: text(line.xeroTaxType, 80),
    serviceCategory: text(line.serviceCategory, 40).toUpperCase() || 'OTHER',
    lineStatus: text(line.lineStatus, 40).toUpperCase() || 'INCLUDED',
    includedInTotals: line.includedInTotals !== false,
  };
};

const normalizeDocument = (
  record: Record<string, unknown>,
  datasetId: string,
  direction: 'RECEIVABLE' | 'PAYABLE',
): NormalizedSageRecord => {
  const source = normalizeSource(record, datasetId);
  const documentType = text(record.documentType, 40).toUpperCase();
  const documentNumber = text(record.documentNumber, 120);
  const sageAccountRef = text(record.sageAccountRef, 80).toUpperCase();
  if (!documentType || !documentNumber || !sageAccountRef) {
    throw new Error(`Accounting document ${source.id} is missing type, number or account reference.`);
  }
  const netAmount = finite(record.netAmount);
  const taxAmount = finite(record.taxAmount);
  const grossAmount = finite(record.grossAmount, netAmount + taxAmount);
  const amountPaid = finite(record.amountPaid);
  const outstandingAmount = finite(record.outstandingAmount, grossAmount - amountPaid);
  return {
    ...source,
    direction,
    documentType,
    documentNumber,
    externalAccountingNumber: text(
      record.externalAccountingNumber
        || (direction === 'RECEIVABLE' ? documentNumber : ''),
      140,
    ),
    sourceAuditNumber: text(record.sourceAuditNumber || record.sageAuditNumber, 80),
    sageAccountRef,
    sourceSageAccountRef: text(record.sourceSageAccountRef || sageAccountRef, 80).toUpperCase(),
    accountingContactId: text(record.accountingContactId, 160),
    contactName: text(record.contactName, 200),
    reference: text(record.reference, 240),
    description: text(record.description, 1000),
    issueDate: optionalDate(record.issueDate),
    dueDate: optionalDate(record.dueDate),
    currency: text(record.currency || 'GBP', 8).toUpperCase(),
    netAmount,
    taxAmount,
    grossAmount,
    amountPaid,
    outstandingAmount,
    settlementStatus: text(record.settlementStatus, 40).toUpperCase() || 'UNKNOWN',
    accountingStatus: text(record.accountingStatus, 40).toUpperCase() || 'HISTORICAL',
    migrationDisposition: text(record.migrationDisposition, 60).toUpperCase() || 'HISTORICAL_ARCHIVE',
    xeroSyncStatus: text(record.xeroSyncStatus, 40).toUpperCase() || 'NOT_SYNCED',
    xeroDocumentId: null,
    bookingReferences: strings(record.bookingReferences, 30),
    language: text(record.language, 100),
    preparedBy: text(record.preparedBy, 120),
    lines: Array.isArray(record.lines) ? record.lines.slice(0, 250).map(normalizeLine) : [],
  };
};

const normalizePayment = (
  record: Record<string, unknown>,
  datasetId: string,
  direction: 'INBOUND' | 'OUTBOUND',
): NormalizedSageRecord => {
  const source = normalizeSource(record, datasetId);
  const sageAccountRef = text(record.sageAccountRef, 80).toUpperCase();
  const amount = finite(record.amount);
  if (!sageAccountRef) throw new Error(`Accounting payment ${source.id} has no account reference.`);
  return {
    ...source,
    direction,
    paymentType: text(record.paymentType, 40).toUpperCase() || (direction === 'INBOUND' ? 'RECEIPT' : 'PAYMENT'),
    sageAccountRef,
    sourceSageAccountRef: text(record.sourceSageAccountRef || sageAccountRef, 80).toUpperCase(),
    accountingContactId: text(record.accountingContactId, 160),
    reference: text(record.reference, 240),
    details: text(record.details, 1000),
    transactionDate: optionalDate(record.transactionDate),
    postingDate: optionalDate(record.postingDate),
    amount,
    allocatedAmount: finite(record.allocatedAmount),
    outstandingAmount: finite(record.outstandingAmount),
    currency: text(record.currency || 'GBP', 8).toUpperCase(),
    nominalOrBankCode: text(record.nominalOrBankCode, 40),
    settlementStatus: text(record.settlementStatus, 40).toUpperCase() || 'UNKNOWN',
    xeroSyncStatus: 'NOT_SYNCED',
    xeroPaymentId: null,
  };
};

export const normalizeSageImportRecord = (
  module: SageImportModule,
  value: unknown,
  datasetId: string,
): NormalizedSageRecord => {
  const record = cleanObject(value);
  if (module === 'contacts') return normalizeContact(record, datasetId);
  if (module === 'salesDocuments') return normalizeDocument(record, datasetId, 'RECEIVABLE');
  if (module === 'purchaseDocuments') return normalizeDocument(record, datasetId, 'PAYABLE');
  if (module === 'customerPayments') return normalizePayment(record, datasetId, 'INBOUND');
  if (module === 'supplierPayments') return normalizePayment(record, datasetId, 'OUTBOUND');

  const source = normalizeSource(record, datasetId);
  if (module === 'accounts') {
    const code = text(record.code, 20);
    const name = text(record.name, 200);
    if (!code || !name) throw new Error(`Nominal account ${source.id} is missing code or name.`);
    return {
      ...source,
      code,
      name,
      accountType: text(record.accountType, 40) || 'UNMAPPED',
      mappingStatus: text(record.mappingStatus || 'UNMAPPED', 40).toUpperCase(),
      mappingReviewReason: text(record.mappingReviewReason, 120).toUpperCase(),
      xeroAccountId: null,
      xeroSyncStatus: 'NOT_SYNCED',
    };
  }
  if (module === 'bankAccounts') {
    return {
      ...source,
      nominalCode: text(record.nominalCode, 20),
      name: text(record.name, 200),
      accountNumberMasked: text(record.accountNumberMasked, 20),
      sortCodeMasked: text(record.sortCodeMasked, 20),
      xeroBankAccountId: null,
      xeroSyncStatus: 'NOT_SYNCED',
    };
  }
  if (module === 'bankJournalEntries') {
    return {
      ...source,
      entryType: text(record.entryType, 40).toUpperCase(),
      accountRef: text(record.accountRef, 80).toUpperCase(),
      nominalOrBankCode: text(record.nominalOrBankCode, 40),
      reference: text(record.reference, 240),
      details: text(record.details, 1000),
      transactionDate: optionalDate(record.transactionDate),
      postingDate: optionalDate(record.postingDate),
      netAmount: finite(record.netAmount),
      taxAmount: finite(record.taxAmount),
      grossAmount: finite(record.grossAmount),
      xeroSyncStatus: 'NOT_SYNCED',
    };
  }
  return {
    ...source,
    fileName: text(record.fileName, 260),
    sizeBytes: Math.max(0, Math.trunc(finite(record.sizeBytes))),
    sha256: text(record.sha256, 64).toLowerCase(),
    recordCount: Math.max(0, Math.trunc(finite(record.recordCount))),
    storageStatus: text(record.storageStatus, 40) || 'LOCAL_VALIDATED_SOURCE',
  };
};

export const validateSageImportManifest = (value: unknown): SageImportManifest => {
  const manifest = cleanObject(value);
  const schemaVersion = text(manifest.schemaVersion, 80);
  const datasetId = text(manifest.datasetId, 120);
  const manifestHash = text(manifest.manifestHash, 64).toLowerCase();
  const generatedAt = text(manifest.generatedAt, 60);
  const sourceAsOf = text(manifest.sourceAsOf, 40);
  if (schemaVersion !== SAGE_IMPORT_SCHEMA) throw new Error(`Unsupported Sage import schema: ${schemaVersion || 'missing'}.`);
  if (!ID_PATTERN.test(datasetId)) throw new Error('The Sage dataset id is invalid.');
  if (!HASH_PATTERN.test(manifestHash)) throw new Error('The Sage manifest hash is invalid.');
  const rawCounts = cleanObject(manifest.expectedModuleCounts);
  const expectedModuleCounts: Partial<Record<SageImportModule, number>> = {};
  for (const [key, rawCount] of Object.entries(rawCounts)) {
    if (!MODULE_SET.has(key)) throw new Error(`Unsupported Sage import module: ${key}.`);
    expectedModuleCounts[key as SageImportModule] = Math.max(0, Math.trunc(finite(rawCount)));
  }
  if (!Object.keys(expectedModuleCounts).length) throw new Error('The Sage import manifest has no modules.');
  const validation = cleanObject(manifest.validationSummary);
  const rawScope = cleanObject(manifest.scope);
  const scope = rawScope.kind || rawScope.fromDate || rawScope.toDate
    ? {
      kind: text(rawScope.kind, 80),
      fromDate: text(rawScope.fromDate, 10),
      toDate: text(rawScope.toDate, 10),
    }
    : undefined;
  return {
    schemaVersion,
    datasetId,
    manifestHash,
    generatedAt,
    sourceAsOf,
    scope,
    expectedModuleCounts,
    sourceTotals: Object.fromEntries(Object.entries(cleanObject(manifest.sourceTotals)).map(([key, amount]) => [text(key, 80), finite(amount)])),
    validationSummary: {
      passed: validation.passed === true,
      checkCount: Math.max(0, Math.trunc(finite(validation.checkCount))),
      failedCheckCount: Math.max(0, Math.trunc(finite(validation.failedCheckCount))),
    },
  };
};

export const isSageImportModule = (value: unknown): value is SageImportModule => MODULE_SET.has(text(value, 80));

export const hashSageBatch = (records: NormalizedSageRecord[]): string => createHash('sha256')
  .update(JSON.stringify(records))
  .digest('hex');
