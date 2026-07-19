import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseConfig';

export type ClientIdentityCandidateKind = 'ORGANIZATION' | 'AGENT';
export type ClientIdentityConfidence = 'HIGH' | 'MEDIUM' | 'REVIEW';
export type ClientIdentityRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type ClientMergeEligibility = 'READY' | 'REVIEW_REQUIRED' | 'BLOCKED';

export interface ClientIdentityEvidence {
  type: 'SAGE_ACCOUNT' | 'AIRTABLE_CLIENT_KEY' | 'NAME_AND_POSTCODE' | 'COMPANY_NAME' | 'ORGANIZATION_ALIAS' | 'PHONE' | 'ADDRESS' | 'EMAIL_DOMAIN' | 'NAME_SIMILARITY' | 'CONTACT_EMAIL' | 'SHARED_MAILBOX' | 'CONFLICT';
  label: string;
  value: string;
  strength: 'STRONG' | 'SUPPORTING' | 'RISK';
}

export interface ClientIdentityAuditRecord {
  id: string;
  companyName: string;
  normalizedCompanyName: string;
  aliases: string[];
  billingAddress: string;
  postcode: string;
  departmentName: string;
  locationName: string;
  contactPerson: string;
  contactEmails: string[];
  invoiceEmail: string;
  phoneNumbers: string[];
  organizationDomains: string[];
  sageAccountRef: string;
  airtableClientKey: string;
  sourceSystem: string;
  status: string;
  bookingCount: number;
  invoiceCount: number;
  linkedUserCount: number;
  completenessScore: number;
}

export interface ClientIdentityCandidate {
  id: string;
  fingerprint: string;
  kind: ClientIdentityCandidateKind;
  label: string;
  confidence: ClientIdentityConfidence;
  mergeRisk: ClientIdentityRisk;
  executionEligibility: ClientMergeEligibility;
  evidence: ClientIdentityEvidence[];
  conflicts: string[];
  blockers: string[];
  recommendedClientId: string;
  recommendation: string;
  clientIds: string[];
  departments: string[];
  records: ClientIdentityAuditRecord[];
  totals: {
    records: number;
    duplicateRecords: number;
    jobs: number;
    invoices: number;
    linkedUsers: number;
    jobsToReassign: number;
    invoicesToReassign: number;
    usersToReassign: number;
  };
}

export interface ClientIdentityAuditResult {
  generatedAt: string;
  readOnly: true;
  truncated: boolean;
  summary: {
    clientRecords: number;
    mergedRecordsExcluded: number;
    organizationCandidates: number;
    organizationRecordsInCandidates: number;
    duplicateOrganizationRecords: number;
    readyToMergeCandidates: number;
    reviewRequiredCandidates: number;
    blockedCandidates: number;
    agentCandidates: number;
    agentRecordsInCandidates: number;
    duplicateAgentRecords: number;
    highRiskCandidates: number;
    departmentsDetected: number;
    jobsAffected: number;
    invoicesAffected: number;
    linkedUsersAffected: number;
    recordsWithoutOrganizationIdentity: number;
  };
  organizationCandidates: ClientIdentityCandidate[];
  agentCandidates: ClientIdentityCandidate[];
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

export interface ClientHierarchySeedPreview {
  canonicalClientId: string;
  departments: Array<{
    id: string;
    clientId: string;
    name: string;
    normalizedName: string;
    confidence: 'EXPLICIT' | 'INFERRED';
    sourceClientIds: string[];
    evidence: string[];
  }>;
  agents: Array<{
    id: string;
    email: string;
    normalizedEmail: string;
    displayName: string;
    names: string[];
    phoneNumbers: string[];
    agentType: 'PERSON' | 'SHARED_MAILBOX';
    roles: Array<'REQUESTER' | 'FINANCE'>;
    sourceClientIds: string[];
  }>;
  memberships: Array<{
    id: string;
    clientId: string;
    agentId: string;
    accessLevel: 'AGENT' | 'CLIENT_FINANCE';
    roles: Array<'REQUESTER' | 'FINANCE'>;
    departmentIds: string[];
    sourceClientIds: string[];
  }>;
  departmentBySourceClientId: Record<string, string>;
  bookingAgentBySourceClientId: Record<string, string>;
  unresolvedContacts: Array<{
    sourceClientId: string;
    name: string;
    role: 'REQUESTER' | 'FINANCE';
    reason: string;
  }>;
  bookingAgentLinks: number;
  bookingDepartmentLinks: number;
  totals: {
    departments: number;
    agents: number;
    memberships: number;
    sharedMailboxes: number;
    sourceRecordsWithDepartment: number;
    sourceRecordsWithBookingAgent: number;
    unresolvedContacts: number;
  };
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
  confirmationPhrase: string;
  blockers: string[];
  warnings: string[];
  fields: ClientMergeFieldDecision[];
  fieldSelections: Record<string, string>;
  canonicalPatch: Record<string, unknown>;
  aliases: string[];
  hierarchy: ClientHierarchySeedPreview;
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

export interface ClientMergeResult {
  success: true;
  idempotent: boolean;
  manifestId: string;
  canonicalClientId: string;
  mergedClientIds: string[];
  migratedDependencies: number;
  linkedBookingAgents?: number;
  linkedBookingDepartments?: number;
  hierarchy?: ClientHierarchySeedPreview['totals'];
}

export interface ClientMergeRollbackResult {
  success: true;
  idempotent?: boolean;
  manifestId: string;
  restoredClients?: number;
  skippedClients?: number;
  restoredDependencies?: number;
  skippedDependencies?: number;
  restoredHierarchyRecords?: number;
  removedHierarchyRecords?: number;
  skippedHierarchyRecords?: number;
}

export interface ClientHierarchyIntegrityIssue {
  code: string;
  severity: 'CRITICAL' | 'WARNING';
  entityType: string;
  entityId: string;
  clientId?: string;
  message: string;
}

export interface ClientHierarchyIntegrityResult {
  generatedAt: string;
  readOnly: true;
  truncated: boolean;
  readyForMembershipCutover: boolean;
  readyForFinanceScope: boolean;
  summary: {
    clients: number;
    departments: number;
    agents: number;
    memberships: number;
    bookings: number;
    invoices: number;
    invoiceLines: number;
    bookingsWithoutDepartment: number;
    bookingsWithoutRequester: number;
    invoicesNeedingHierarchyBackfill: number;
    invoiceLinesNeedingHierarchyBackfill: number;
    invoicesWithoutJobLinks: number;
    blockedCrossClientInvoices: number;
    invoicesWithSuggestedClientRepair: number;
    criticalIssues: number;
    warningIssues: number;
  };
  issueCounts: Record<string, number>;
  issues: ClientHierarchyIntegrityIssue[];
  financeBackfill: {
    fingerprint: string;
    invoicesScanned: number;
    linesScanned: number;
    invoiceUpdates: number;
    lineUpdates: number;
    blockedInvoiceIds: string[];
    unlinkedInvoiceIds: string[];
    inferredClientAssignments: ClientInvoiceIdentityAssignment[];
    blockedInvoices: ClientInvoiceIdentityBlocker[];
  };
}

export interface ClientInvoiceIdentityAssignment {
  invoiceId: string;
  clientId: string;
  confidence: 'HIGH' | 'MEDIUM';
  method: 'LINKED_JOB' | 'ACCOUNT_KEY' | 'EXACT_NAME';
  evidence: string[];
}

export interface ClientInvoiceIdentityBlocker {
  invoiceId: string;
  reason: 'MULTIPLE_CLIENTS' | 'BOOKING_LINK_MISSING' | 'INVALID_BOOKING_SCOPE' | 'CLIENT_IDENTITY_UNRESOLVED';
  candidateClientIds: string[];
  evidence: string[];
  currentClientId: string;
  clientName: string;
  invoiceNumber: string;
  status: string;
}

export interface ClientFinanceHierarchyReconciliation {
  success: true;
  dryRun: boolean;
  applied: boolean;
  idempotent?: boolean;
  fingerprint: string;
  invoicesScanned: number;
  linesScanned: number;
  invoiceUpdates: number;
  lineUpdates: number;
  blockedInvoiceCount: number;
  unlinkedInvoiceCount: number;
  inferredClientAssignmentCount: number;
  blockedInvoiceIds: string[];
  unlinkedInvoiceIds: string[];
  inferredClientAssignments: ClientInvoiceIdentityAssignment[];
  blockedInvoices: ClientInvoiceIdentityBlocker[];
  invoicesWritten?: number;
  linesWritten?: number;
  manifestId?: string;
}

export interface ClientFinanceHierarchyRollback {
  success: true;
  idempotent?: boolean;
  manifestId: string;
  restored?: number;
  skipped?: number;
}

export interface ClientInvoiceIdentityResolutionResult {
  success: true;
  invoiceId: string;
  clientId: string;
  manifestId: string;
  invoicesWritten: number;
  linesWritten: number;
}

let pendingAudit: Promise<ClientIdentityAuditResult> | null = null;
let cachedAudit: { value: ClientIdentityAuditResult; expiresAt: number } | null = null;

const requestAudit = async () => {
  const callable = httpsCallable<Record<string, never>, ClientIdentityAuditResult>(
    functions,
    'getClientIdentityAudit',
    { timeout: 120000 },
  );
  const response = await callable({});
  cachedAudit = { value: response.data, expiresAt: Date.now() + 30_000 };
  return response.data;
};

export const ClientIdentityAuditService = {
  getAudit: async (forceRefresh = false): Promise<ClientIdentityAuditResult> => {
    if (!forceRefresh && cachedAudit && cachedAudit.expiresAt > Date.now()) return cachedAudit.value;
    if (pendingAudit) return pendingAudit;
    pendingAudit = requestAudit().finally(() => {
      pendingAudit = null;
    });
    return pendingAudit;
  },
  getMergePreview: async (candidateId: string, canonicalClientId: string, fieldSelections: Record<string, string> = {}): Promise<ClientMergePreview> => {
    const callable = httpsCallable<{ candidateId: string; canonicalClientId: string; fieldSelections: Record<string, string> }, ClientMergePreview>(
      functions,
      'getClientMergePreview',
      { timeout: 300000 },
    );
    return (await callable({ candidateId, canonicalClientId, fieldSelections })).data;
  },
  executeMerge: async (input: {
    candidateId: string;
    canonicalClientId: string;
    expectedFingerprint: string;
    confirmation: string;
    reviewAcknowledged: boolean;
    fieldSelections: Record<string, string>;
  }): Promise<ClientMergeResult> => {
    const callable = httpsCallable<typeof input, ClientMergeResult>(
      functions,
      'executeClientMerge',
      { timeout: 300000 },
    );
    const result = (await callable(input)).data;
    cachedAudit = null;
    return result;
  },
  rollbackMerge: async (manifestId: string, confirmation: string): Promise<ClientMergeRollbackResult> => {
    const callable = httpsCallable<{ manifestId: string; confirmation: string }, ClientMergeRollbackResult>(
      functions,
      'rollbackClientMerge',
      { timeout: 300000 },
    );
    const result = (await callable({ manifestId, confirmation })).data;
    cachedAudit = null;
    return result;
  },
  getHierarchyIntegrity: async (): Promise<ClientHierarchyIntegrityResult> => {
    const callable = httpsCallable<Record<string, never>, ClientHierarchyIntegrityResult>(
      functions,
      'getClientHierarchyIntegrityAudit',
      { timeout: 300000 },
    );
    return (await callable({})).data;
  },
  previewFinanceHierarchyReconciliation: async (): Promise<ClientFinanceHierarchyReconciliation> => {
    const callable = httpsCallable<{ dryRun: true }, ClientFinanceHierarchyReconciliation>(
      functions,
      'reconcileClientFinanceHierarchy',
      { timeout: 300000 },
    );
    return (await callable({ dryRun: true })).data;
  },
  applyFinanceHierarchyReconciliation: async (
    expectedFingerprint: string,
    confirmation: string,
  ): Promise<ClientFinanceHierarchyReconciliation> => {
    const callable = httpsCallable<{
      dryRun: false;
      expectedFingerprint: string;
      confirmation: string;
    }, ClientFinanceHierarchyReconciliation>(
      functions,
      'reconcileClientFinanceHierarchy',
      { timeout: 300000 },
    );
    return (await callable({ dryRun: false, expectedFingerprint, confirmation })).data;
  },
  resolveClientInvoiceIdentity: async (input: {
    invoiceId: string;
    clientId: string;
    expectedFingerprint: string;
    confirmation: string;
  }): Promise<ClientInvoiceIdentityResolutionResult> => {
    const callable = httpsCallable<typeof input, ClientInvoiceIdentityResolutionResult>(
      functions,
      'resolveClientInvoiceIdentity',
      { timeout: 300000 },
    );
    return (await callable(input)).data;
  },
  rollbackFinanceHierarchyReconciliation: async (
    manifestId: string,
    confirmation: string,
  ): Promise<ClientFinanceHierarchyRollback> => {
    const callable = httpsCallable<{ manifestId: string; confirmation: string }, ClientFinanceHierarchyRollback>(
      functions,
      'rollbackClientFinanceHierarchyReconciliation',
      { timeout: 300000 },
    );
    return (await callable({ manifestId, confirmation })).data;
  },
};
