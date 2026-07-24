import { collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebaseConfig';
import { RedbookSyncDetail, RedbookSyncStats } from './redbookSyncService';

const LONG_CALLABLE_OPTIONS = { timeout: 600_000 };

export type AirtableSyncModule =
  | 'clients'
  | 'redbook'
  | 'translations'
  | 'clientInvoices'
  | 'interpreterInvoices'
  | 'translationClientInvoices'
  | 'translatorInvoices';

export type AirtableSyncStrategy =
  | 'OPEN_WORKFLOW'
  | 'UPDATED_SINCE_LAST_SYNC'
  | 'RECENT_OPEN'
  | 'FULL_AUDIT'
  | 'CUSTOM_LIMIT';

export type AirtableModuleResult = {
  module: AirtableSyncModule;
  label: string;
  tableNames: string[];
  records: number;
  stats: RedbookSyncStats;
  details: RedbookSyncDetail[];
  financeStats?: {
    clientInvoices: RedbookSyncStats;
    interpreterInvoices: RedbookSyncStats;
  };
  financeRecords?: {
    clientInvoices: number;
    interpreterInvoices: number;
  };
  identityEvidence?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
  writeReadiness?: AirtableWriteReadiness;
};

export type AirtableWriteReadiness = {
  ready: boolean;
  blockerCount: number;
  blockers?: Array<{ reason: string; count: number }>;
};

export type AirtableSyncWriteApproval = {
  ready: boolean;
  blockerCount: number;
  blockedModules: Array<{
    module: AirtableSyncModule;
    label: string;
    blockerCount: number;
    blockers: Array<{ reason: string; count: number }>;
  }>;
};

export type AirtableSyncResult = {
  success: boolean;
  syncRunId?: string;
  mappingVersion?: string;
  syncStrategy?: AirtableSyncStrategy;
  limitRecords?: number;
  dryRun: boolean;
  importMode: string;
  triggeredBy?: string;
  userId?: string;
  approvedByDryRunId?: string;
  modules: AirtableSyncModule[];
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  stats: RedbookSyncStats;
  financePullThrough?: {
    workflowSourceRecordIds?: number;
    clientInvoicesDropped?: number;
    interpreterInvoicesDropped?: number;
    filterActive?: boolean;
  };
  writeApproval?: AirtableSyncWriteApproval;
  moduleResults: AirtableModuleResult[];
};

export type AirtableRedbookRepairResult = AirtableSyncResult & {
  missingRecords?: number;
  remainingMissingRecords?: number;
  hasMoreMissingRecords?: boolean;
  repairMode?: string;
  sourceRecordIds?: string[];
};

export type AirtableSyncCheckpoint = {
  lastRunId?: string;
  lastRunAt?: string;
  lastStats?: RedbookSyncStats;
  lastModules?: AirtableSyncModule[];
  lastSyncStrategy?: AirtableSyncStrategy;
  moduleCheckpoints?: Partial<Record<AirtableSyncModule, {
    lastRunId?: string;
    lastWriteAt?: string;
    recordsRead?: number;
    stats?: RedbookSyncStats;
    success?: boolean;
  }>>;
};

export type AirtableDependencyCounts = Partial<Record<AirtableSyncModule, number>>;

export type AirtableSyncRunSummary = {
  id: string;
  kind?: string;
  dryRun?: boolean;
  importMode?: string;
  syncStrategy?: AirtableSyncStrategy;
  modules?: AirtableSyncModule[];
  startedAt?: string;
  finishedAt?: string;
  success?: boolean;
  stats?: RedbookSyncStats;
};

export type AirtableSyncConflict = {
  id: string;
  runId?: string;
  entityType?: string;
  entityId?: string;
  sourceTable?: string;
  sourceRecordId?: string;
  legacyRef?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
  reason?: string;
  currentValue?: unknown;
  incomingValue?: unknown;
  recommendedAction?: string;
  resolutionStatus?: string;
  lastSeenAt?: string;
};

export type AirtableProfessionalIdentityLinkRequest = {
  professionalRecordId: string;
  interpreterId: string;
  sourceName: string;
  reason: string;
};

export type AirtableProfessionalIdentityLinkResult = {
  success: boolean;
  mappingId: string;
  professionalRecordId: string;
  interpreterId: string;
  requiresResync: boolean;
};

export type AirtableConflictSeverity = 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH';

export type AirtableClientIdentityMappingRequest = {
  sourceTable: 'Clients' | 'Clients Book' | 'Departments';
  groupKey: string;
  sourceNames: string[];
  action: 'MAP_TO_CLIENT' | 'APPROVE_NEW_CLIENT';
  canonicalClientId?: string;
  canonicalCompanyName?: string;
  sourceName?: string;
  reason?: string;
  syncRunId?: string;
};

export type AirtableClientIdentityDeferralCategory =
  | 'NOT_AN_ORGANISATION'
  | 'INSUFFICIENT_SOURCE_EVIDENCE'
  | 'SOURCE_DATA_REPAIR_REQUIRED'
  | 'OUT_OF_SCOPE_LEGACY_RECORD';

export type AirtableClientIdentityDeferralRequest = {
  sourceTable: 'Clients Book' | 'Departments';
  groupKey: string;
  sourceNames: string[];
  category: AirtableClientIdentityDeferralCategory;
  reason: string;
  syncRunId: string;
};

export type AirtableClientIdentityMappingResult = {
  success: boolean;
  mappingId: string;
  sourceTable: string;
  groupKey: string;
  action: 'MAP_TO_CLIENT' | 'APPROVE_NEW_CLIENT';
  canonicalClientId: string;
  canonicalCompanyName: string;
};

export type AirtableClientIdentityBatchMappingRequest = Omit<
  AirtableClientIdentityMappingRequest,
  'action' | 'canonicalClientId'
> & {
  action: 'MAP_TO_CLIENT';
  canonicalClientId: string;
  recommendationConfidence: 'HIGH';
};

export type AirtableClientIdentityBatchMappingResult = {
  success: boolean;
  saved: number;
  mappings: Array<{
    mappingId: string;
    sourceTable: 'Clients' | 'Clients Book' | 'Departments';
    groupKey: string;
    canonicalClientId: string;
    canonicalCompanyName: string;
  }>;
};

export type AirtableClientIdentityManualBatchMappingRequest = Omit<
  AirtableClientIdentityMappingRequest,
  'action' | 'canonicalClientId'
> & {
  sourceTable: 'Clients Book' | 'Departments';
  action: 'MAP_TO_CLIENT';
  canonicalClientId: string;
};

export type AirtableClientIdentityManualBatchMappingResult = AirtableClientIdentityBatchMappingResult & {
  reviewRunId: string;
  canonicalClientId: string;
  canonicalCompanyName: string;
};

export type AirtableClientIdentityMappingLedgerEntry = {
  mappingId: string;
  sourceTable: 'Clients' | 'Clients Book' | 'Departments';
  groupKey: string;
  sourceNames: string[];
  action: 'MAP_TO_CLIENT' | 'APPROVE_NEW_CLIENT' | 'DEFER_SOURCE';
  canonicalClientId: string;
  canonicalCompanyName: string;
  canonicalTargetState?: string;
  deferralCategory?: AirtableClientIdentityDeferralCategory;
  reviewMethod?: string;
  reason?: string;
  approvedAt?: string;
  approvedBy?: string;
};

export type AirtableClientIdentityMappingLedger = {
  success: boolean;
  mappings: AirtableClientIdentityMappingLedgerEntry[];
  total: number;
  limit: number;
};

export type AirtableSyncAuditTrail = {
  runs: AirtableSyncRunSummary[];
  conflicts: AirtableSyncConflict[];
};

export type AirtableMirrorAuditRow = {
  sourceRecordId?: string;
  bookingId?: string;
  jobNumber?: string;
  status?: string;
  bookedFor?: string;
  lastSyncedAt?: string;
};

export type AirtableMirrorStatusDivergence = {
  sourceRecordId: string;
  bookingId: string;
  jobNumber: string;
  airtableStatus: string;
  platformSourceStatus: string;
};

export type AirtableMirrorAudit = {
  success: boolean;
  syncStrategy: AirtableSyncStrategy;
  limitRecords: number;
  sourceTable: string;
  filterByFormula?: string;
  generatedAt: string;
  airtableRecords: number;
  platformRecords: number;
  matchedRecords: number;
  missingInPlatformCount: number;
  platformOnlyCount: number;
  statusDivergenceCount: number;
  nextOffset?: string;
  airtableStatusCounts: Record<string, number>;
  platformStatusCounts: Record<string, number>;
  missingInPlatform: AirtableMirrorAuditRow[];
  statusDivergences: AirtableMirrorStatusDivergence[];
  platformOnly: AirtableMirrorAuditRow[];
};

export type FinancialReconciliationIssue = {
  id: string;
  invoiceType: 'CLIENT' | 'INTERPRETER';
  invoiceId: string;
  reference: string;
  partyName: string;
  sourceTable: string;
  sourceRecordId: string;
  serviceCategory: string;
  reason: string;
  severity: 'MEDIUM' | 'HIGH';
  recommendedAction: string;
  totalAmount: number;
  lineTotal: number;
  lineCount: number;
  declaredLineCount?: number;
  platformStatus: string;
  expectedStatus?: string;
};

export type FinancialBookingLinkIssue = {
  id: string;
  bookingId: string;
  jobNumber: string;
  clientId: string;
  clientName: string;
  sourceSystem: string;
  sourceTable: string;
  sourceRecordId: string;
  sourceInvoiceReference: string;
  status: string;
  billingState: string;
  paymentStatus: string;
  invoiceIds: string[];
  reason: 'CLIENT_INVOICE_LINK_MISSING' | 'CLIENT_INVOICE_DOCUMENT_MISSING' | 'BOOKING_INVOICE_BACKLINK_MISSING';
  severity: 'MEDIUM' | 'HIGH';
  recommendedAction: string;
};

export type FinancialReconciliationAudit = {
  success: boolean;
  generatedAt: string;
  totalInvoices: number;
  clientInvoices: number;
  interpreterInvoices: number;
  healthyInvoices: number;
  affectedInvoices: number;
  affectedBookings: number;
  issueCount: number;
  byReason: Record<string, number>;
  bySeverity: Record<string, number>;
  issues: FinancialReconciliationIssue[];
  issuesTruncated: boolean;
  bookingIssues: FinancialBookingLinkIssue[];
  bookingIssuesTruncated: boolean;
};

export const AIRTABLE_SYNC_MODULES: Array<{
  id: AirtableSyncModule;
  label: string;
  description: string;
  tables: string[];
  dependency?: AirtableSyncModule;
}> = [
  {
    id: 'clients',
    label: 'Clients',
    description: 'Imports Clients and Clients Book before jobs are matched.',
    tables: ['Clients', 'Clients Book']
  },
  {
    id: 'redbook',
    label: 'Interpretation Jobs',
    description: 'Mirrors REDBOOK interpretation jobs before finance is matched.',
    tables: ['REDBOOK'],
    dependency: 'clients'
  },
  {
    id: 'translations',
    label: 'Translation Jobs',
    description: 'Imports Translations and Web translations as translation jobs.',
    tables: ['Translations', 'Web translations'],
    dependency: 'clients'
  },
  {
    id: 'clientInvoices',
    label: 'Client Invoices',
    description: 'Imports interpretation client invoices from Airtable.',
    tables: ['Invoices'],
    dependency: 'redbook'
  },
  {
    id: 'interpreterInvoices',
    label: 'Interpreter Invoices',
    description: 'Imports interpreter invoice records from Airtable.',
    tables: ['INV interp'],
    dependency: 'redbook'
  },
  {
    id: 'translationClientInvoices',
    label: 'Translation Client Invoices',
    description: 'Imports TR invoices into the unified client billing flow.',
    tables: ['TR invoices'],
    dependency: 'translations'
  },
  {
    id: 'translatorInvoices',
    label: 'Translator Invoices',
    description: 'Imports INV TR into the unified interpreter/translator payment flow.',
    tables: ['INV TR'],
    dependency: 'translations'
  }
];

export const AirtableSyncService = {
  run: async (
    dryRun: boolean,
    modules: AirtableSyncModule[] | 'full',
    limitRecords = 5000,
    syncStrategy: AirtableSyncStrategy = 'OPEN_WORKFLOW',
    expectedDryRunId?: string,
  ): Promise<AirtableSyncResult> => {
    const syncFn = httpsCallable(functions, 'syncAirtableData', LONG_CALLABLE_OPTIONS);
    const response = await syncFn({ dryRun, modules, limitRecords, syncStrategy, expectedDryRunId });
    return response.data as AirtableSyncResult;
  },

  linkProfessionalIdentity: async (
    request: AirtableProfessionalIdentityLinkRequest,
  ): Promise<AirtableProfessionalIdentityLinkResult> => {
    const linkFn = httpsCallable(
      functions,
      'linkAirtableProfessionalIdentity',
      LONG_CALLABLE_OPTIONS,
    );
    const response = await linkFn(request);
    return response.data as AirtableProfessionalIdentityLinkResult;
  },

  saveClientIdentityMapping: async (
    request: AirtableClientIdentityMappingRequest
  ): Promise<AirtableClientIdentityMappingResult> => {
    const saveFn = httpsCallable(functions, 'saveAirtableClientIdentityMapping', LONG_CALLABLE_OPTIONS);
    const response = await saveFn(request);
    return response.data as AirtableClientIdentityMappingResult;
  },

  saveClientIdentityMappingsBatch: async (
    mappings: AirtableClientIdentityBatchMappingRequest[],
    syncRunId: string,
  ): Promise<AirtableClientIdentityBatchMappingResult> => {
    const saveFn = httpsCallable(functions, 'saveAirtableClientIdentityMappingsBatch', LONG_CALLABLE_OPTIONS);
    const response = await saveFn({ mappings, syncRunId, confirmed: true });
    return response.data as AirtableClientIdentityBatchMappingResult;
  },

  saveClientIdentityMappingsManualBatch: async (
    mappings: AirtableClientIdentityManualBatchMappingRequest[],
    syncRunId: string,
  ): Promise<AirtableClientIdentityManualBatchMappingResult> => {
    const saveFn = httpsCallable(
      functions,
      'saveAirtableClientIdentityMappingsManualBatch',
      LONG_CALLABLE_OPTIONS,
    );
    const response = await saveFn({ mappings, syncRunId, confirmed: true });
    return response.data as AirtableClientIdentityManualBatchMappingResult;
  },

  deferClientIdentitySource: async (
    request: AirtableClientIdentityDeferralRequest,
  ): Promise<{
    success: boolean;
    mappingId: string;
    sourceTable: string;
    groupKey: string;
    action: 'DEFER_SOURCE';
    deferralCategory: AirtableClientIdentityDeferralCategory;
  }> => {
    const deferFn = httpsCallable(
      functions,
      'deferAirtableClientIdentitySource',
      LONG_CALLABLE_OPTIONS,
    );
    const response = await deferFn({ ...request, confirmed: true });
    return response.data as {
      success: boolean;
      mappingId: string;
      sourceTable: string;
      groupKey: string;
      action: 'DEFER_SOURCE';
      deferralCategory: AirtableClientIdentityDeferralCategory;
    };
  },

  revokeClientIdentityMapping: async (
    sourceTable: 'Clients' | 'Clients Book' | 'Departments',
    groupKey: string
  ): Promise<{ success: boolean; mappingId: string }> => {
    const revokeFn = httpsCallable(functions, 'revokeAirtableClientIdentityMapping', LONG_CALLABLE_OPTIONS);
    const response = await revokeFn({ sourceTable, groupKey });
    return response.data as { success: boolean; mappingId: string };
  },

  listClientIdentityMappings: async (
    resultLimit = 200
  ): Promise<AirtableClientIdentityMappingLedger> => {
    const listFn = httpsCallable(functions, 'listAirtableClientIdentityMappings', LONG_CALLABLE_OPTIONS);
    const response = await listFn({ limit: resultLimit });
    return response.data as AirtableClientIdentityMappingLedger;
  },

  getMirrorAudit: async (
    limitRecords = 5000,
    syncStrategy: AirtableSyncStrategy = 'OPEN_WORKFLOW'
  ): Promise<AirtableMirrorAudit> => {
    const auditFn = httpsCallable(functions, 'getAirtableMirrorAudit', LONG_CALLABLE_OPTIONS);
    const response = await auditFn({ limitRecords, syncStrategy });
    return response.data as AirtableMirrorAudit;
  },

  repairMissingRedbook: async (
    dryRun: boolean,
    limitRecords = 20,
    syncStrategy: AirtableSyncStrategy = 'OPEN_WORKFLOW'
  ): Promise<AirtableRedbookRepairResult> => {
    const repairFn = httpsCallable(functions, 'repairMissingRedbookRecords', LONG_CALLABLE_OPTIONS);
    const response = await repairFn({ dryRun, limitRecords, syncStrategy });
    return response.data as AirtableRedbookRepairResult;
  },

  getCheckpoint: async (): Promise<AirtableSyncCheckpoint | null> => {
    const snap = await getDoc(doc(db, 'system', 'airtableSyncCenter'));
    return snap.exists() ? snap.data() as AirtableSyncCheckpoint : null;
  },

  getAuditTrail: async (runLimit = 5, conflictLimit = 50): Promise<AirtableSyncAuditTrail> => {
    const auditFn = httpsCallable(functions, 'getAirtableSyncAuditTrail');
    const response = await auditFn({ runLimit, conflictLimit });
    return response.data as AirtableSyncAuditTrail;
  },

  getFinancialReconciliationAudit: async (): Promise<FinancialReconciliationAudit> => {
    const auditFn = httpsCallable(functions, 'getFinancialReconciliationAudit', LONG_CALLABLE_OPTIONS);
    const response = await auditFn();
    return response.data as FinancialReconciliationAudit;
  },

  getDependencyCounts: async (): Promise<AirtableDependencyCounts> => {
    const [clients, redbook, translations] = await Promise.all([
      getCountFromServer(query(
        collection(db, 'clients'),
        where('sourceSystem', '==', 'AIRTABLE')
      )),
      getCountFromServer(query(
        collection(db, 'bookings'),
        where('sourceTable', '==', 'REDBOOK')
      )),
      getCountFromServer(query(
        collection(db, 'bookings'),
        where('serviceCategory', '==', 'TRANSLATION')
      ))
    ]);

    return {
      clients: clients.data().count,
      redbook: redbook.data().count,
      translations: translations.data().count
    };
  },

  getRecentRuns: async (count = 5): Promise<AirtableSyncRunSummary[]> => {
    const snap = await getDocs(query(
      collection(db, 'syncRuns'),
      orderBy('finishedAt', 'desc'),
      limit(count)
    ));
    return snap.docs.map(docSnap => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<AirtableSyncRunSummary, 'id'>)
    }));
  },

  getOpenConflicts: async (count = 50): Promise<AirtableSyncConflict[]> => {
    const snap = await getDocs(query(
      collection(db, 'syncConflicts'),
      where('resolutionStatus', '==', 'OPEN'),
      limit(count)
    ));
    return snap.docs.map(docSnap => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<AirtableSyncConflict, 'id'>)
    }));
  },

  exportConflictsCsv: (conflicts: AirtableSyncConflict[]): string => {
    const headers = [
      'severity',
      'entityType',
      'sourceTable',
      'legacyRef',
      'sourceRecordId',
      'reason',
      'recommendedAction',
      'lastSeenAt',
      'runId'
    ];
    const escapeCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return [
      headers.join(','),
      ...conflicts.map(conflict => headers.map(header => escapeCell((conflict as any)[header])).join(','))
    ].join('\n');
  },

  exportFinancialAuditCsv: (
    issues: FinancialReconciliationIssue[],
    bookingIssues: FinancialBookingLinkIssue[] = [],
  ): string => {
    const headers = [
      'severity',
      'entityType',
      'reference',
      'partyName',
      'sourceTable',
      'sourceRecordId',
      'reason',
      'platformStatus',
      'expectedStatus',
      'totalAmount',
      'lineTotal',
      'lineCount',
      'recommendedAction',
    ];
    const escapeCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ...issues.map(issue => ({
        severity: issue.severity,
        entityType: issue.invoiceType === 'CLIENT' ? 'CLIENT_INVOICE' : 'INTERPRETER_INVOICE',
        reference: issue.reference,
        partyName: issue.partyName,
        sourceTable: issue.sourceTable,
        sourceRecordId: issue.sourceRecordId,
        reason: issue.reason,
        platformStatus: issue.platformStatus,
        expectedStatus: issue.expectedStatus,
        totalAmount: issue.totalAmount,
        lineTotal: issue.lineTotal,
        lineCount: issue.lineCount,
        recommendedAction: issue.recommendedAction,
      })),
      ...bookingIssues.map(issue => ({
        severity: issue.severity,
        entityType: 'JOB',
        reference: issue.jobNumber,
        partyName: issue.clientName,
        sourceTable: issue.sourceTable,
        sourceRecordId: issue.sourceRecordId,
        reason: issue.reason,
        platformStatus: issue.status,
        expectedStatus: issue.sourceInvoiceReference || issue.invoiceIds.join('; '),
        totalAmount: '',
        lineTotal: '',
        lineCount: '',
        recommendedAction: issue.recommendedAction,
      })),
    ];
    return [
      headers.join(','),
      ...rows.map(row => headers.map(header => escapeCell(row[header as keyof typeof row])).join(','))
    ].join('\n');
  }
};
