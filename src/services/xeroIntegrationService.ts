import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseConfig';

export type XeroIntegrationState = 'NOT_CONNECTED' | 'TENANT_SELECTION_REQUIRED' | 'CONNECTED' | 'ERROR';

export interface XeroTenant {
  connectionId: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  createdDateUtc?: string;
  updatedDateUtc?: string;
}

export interface XeroOrganisation {
  name?: string;
  legalName?: string;
  countryCode?: string;
  baseCurrency?: string;
  organisationType?: string;
  registrationNumber?: string;
  shortCode?: string;
}

export interface XeroIntegrationStatus {
  provider: 'XERO';
  configured: boolean;
  status: XeroIntegrationState;
  mode: 'READ_ONLY';
  syncEnabled: false;
  liveWriteEnabled: false;
  aiDataUseEnabled: false;
  scopes: string[];
  redirectUri: string;
  tenant: XeroTenant | null;
  organisation: XeroOrganisation | null;
  connectionOptions: XeroTenant[];
  connectedAt: string | null;
  connectedBy: string | null;
  lastHealthCheckAt: string | null;
  lastHealthCheckStatus: 'CONNECTED' | 'ERROR' | 'NOT_TESTED';
  lastHealthCheckMessage: string | null;
  tokenExpiresAt: string | null;
  updatedAt: string | null;
  viewer: { role: 'ADMIN' | 'SUPER_ADMIN'; canManage: boolean };
}

export type XeroReconciliationMatchStatus = 'EXACT' | 'REVIEW' | 'CONFLICT' | 'MISSING';

export interface XeroReconciliationCounts {
  TOTAL: number;
  EXACT: number;
  REVIEW: number;
  CONFLICT: number;
  MISSING: number;
}

export interface XeroReconciliationIssue {
  entityType: 'CONTACT' | 'DOCUMENT';
  localCollection: 'accountingContacts' | 'accountingDocuments';
  localId: string;
  status: XeroReconciliationMatchStatus;
  strategy: string;
  reasons: string[];
  local: {
    reference: string;
    name: string;
    direction?: 'RECEIVABLE' | 'PAYABLE';
    date?: string;
    total?: number;
  };
  xero: null | {
    id: string;
    reference: string;
    name: string;
    status: string;
    date?: string;
    total?: number;
    amountPaid?: number;
    amountDue?: number;
  };
}

export interface XeroReconciliationRun {
  runId: string;
  status: 'RUNNING' | 'PREVIEW_READY' | 'FAILED' | 'APPLIED' | 'APPLIED_WITH_CONFLICTS';
  scope: { fromDate: string; toDate: string; importRunId: string };
  previewHash: string;
  summary: null | {
    contacts: XeroReconciliationCounts;
    documents: XeroReconciliationCounts;
    receivables: XeroReconciliationCounts;
    payables: XeroReconciliationCounts;
    xero: {
      contacts: number;
      invoices: number;
      payments: number;
      orphanInvoices: number;
      invoiceStatuses: Record<string, number>;
    };
    exactLinkCount: number;
    reviewCount: number;
  };
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  issueCount: number;
  issues: XeroReconciliationIssue[];
  issuesTruncated: boolean;
  applySummary: null | {
    exactMatches: number;
    applied: number;
    alreadyLinked: number;
    localLinkConflicts: number;
    localRecordsMissing: number;
  };
}

const callable = <Request, Response>(name: string) => httpsCallable<Request, Response>(functions, name, { timeout: 60000 });
const longCallable = <Request, Response>(name: string) => httpsCallable<Request, Response>(functions, name, { timeout: 540000 });

export const XeroIntegrationService = {
  getStatus: async () => {
    const response = await callable<Record<string, never>, XeroIntegrationStatus>('getXeroIntegrationStatus')({});
    return response.data;
  },

  startConnection: async (returnUrl: string) => {
    const response = await callable<{ returnUrl: string }, {
      authorizationUrl: string;
      expiresAt: string;
      redirectUri: string;
      scopes: string[];
    }>('startXeroConnection')({ returnUrl });
    return response.data;
  },

  selectOrganisation: async (connectionId: string) => {
    const response = await callable<{ connectionId: string }, XeroIntegrationStatus>('selectXeroOrganisation')({ connectionId });
    return response.data;
  },

  testConnection: async () => {
    const response = await callable<Record<string, never>, {
      connected: true;
      testedAt: string;
      tenant: XeroTenant;
      organisation: XeroOrganisation;
      mode: 'READ_ONLY';
      syncEnabled: false;
    }>('testXeroConnection')({});
    return response.data;
  },

  disconnect: async () => {
    const response = await callable<Record<string, never>, { success: true; disconnectedAt: string }>('disconnectXero')({});
    return response.data;
  },

  previewReconciliation: async (scope: { fromDate: string; toDate: string; importRunId?: string }) => {
    const response = await longCallable<typeof scope, XeroReconciliationRun>('previewXeroReconciliation')(scope);
    return response.data;
  },

  getReconciliationRun: async (runId?: string) => {
    const response = await callable<{ runId?: string }, XeroReconciliationRun | null>('getXeroReconciliationRun')({ runId });
    return response.data;
  },

  applyReconciliationLinks: async (runId: string, previewHash: string) => {
    const response = await longCallable<{ runId: string; previewHash: string }, XeroReconciliationRun>('applyXeroReconciliationLinks')({ runId, previewHash });
    return response.data;
  },
};
