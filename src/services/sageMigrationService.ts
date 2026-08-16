import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseConfig';

export type SageImportModule =
  | 'contacts'
  | 'accounts'
  | 'bankAccounts'
  | 'salesDocuments'
  | 'purchaseDocuments'
  | 'customerPayments'
  | 'supplierPayments'
  | 'bankJournalEntries'
  | 'sourceArtifacts';

export interface SageImportManifest {
  schemaVersion: string;
  datasetId: string;
  manifestHash: string;
  generatedAt: string;
  sourceAsOf: string;
  scope?: { kind: string; fromDate: string; toDate: string };
  expectedModuleCounts: Partial<Record<SageImportModule, number>>;
  sourceTotals?: Record<string, number>;
  validationSummary?: { passed: boolean; checkCount: number; failedCheckCount: number };
}

export interface SagePlatformImportPackage extends SageImportManifest {
  manifest: SageImportManifest;
  modules: Record<SageImportModule, Array<Record<string, unknown>>>;
}

export interface SageImportPreview {
  ready: boolean;
  batchCount: number;
  recordCount: number;
  moduleCounts: Partial<Record<SageImportModule, number>>;
  previewHash: string;
  completedAt: string;
}

export interface SageImportRunResponse {
  runId: string;
  status: 'STAGING' | 'PREVIEW_READY' | 'COMMITTING' | 'COMMITTED' | 'FAILED';
  resumed?: boolean;
  idempotent?: boolean;
  preview?: SageImportPreview | null;
  summary?: SageImportPreview;
}

const LONG_CALL_OPTIONS = { timeout: 540_000 };

export const SageMigrationService = {
  createRun: async (manifest: SageImportManifest): Promise<SageImportRunResponse> => {
    const callable = httpsCallable(functions, 'createSageImportRun', LONG_CALL_OPTIONS);
    const result = await callable({ manifest });
    return result.data as SageImportRunResponse;
  },
  stageBatch: async (request: {
    runId: string;
    module: SageImportModule;
    batchIndex: number;
    batchCount: number;
    records: Array<Record<string, unknown>>;
  }) => {
    const callable = httpsCallable(functions, 'stageSageImportBatch', LONG_CALL_OPTIONS);
    const result = await callable(request);
    return result.data as { recordCount: number; batchHash: string; idempotent: boolean };
  },
  finalizePreview: async (runId: string): Promise<SageImportRunResponse> => {
    const callable = httpsCallable(functions, 'finalizeSageImportPreview', LONG_CALL_OPTIONS);
    const result = await callable({ runId });
    return result.data as SageImportRunResponse;
  },
  commitBatch: async (request: { runId: string; module: SageImportModule; batchIndex: number }) => {
    const callable = httpsCallable(functions, 'commitSageImportBatch', LONG_CALL_OPTIONS);
    const result = await callable(request);
    return result.data as { recordCount: number; idempotent: boolean; linkSummary?: Record<string, number> };
  },
  finalizeCommit: async (runId: string): Promise<SageImportRunResponse> => {
    const callable = httpsCallable(functions, 'finalizeSageImportCommit', LONG_CALL_OPTIONS);
    const result = await callable({ runId });
    return result.data as SageImportRunResponse;
  },
};
