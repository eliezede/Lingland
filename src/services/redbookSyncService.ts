import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebaseConfig';
import type { AirtableSyncStrategy } from './airtableSyncService';

export type RedbookSyncStats = {
  created: number;
  updated: number;
  skipped: number;
  conflict: number;
  error: number;
};

export type RedbookSyncDetail = {
  action: 'created' | 'updated' | 'skipped' | 'conflict' | 'error';
  sourceRecordId: string;
  sourceBaseId?: string;
  sourceTable?: string;
  sourceView?: string;
  snapshotHash?: string;
  syncRunId?: string;
  jobNumber?: string;
  displayRef?: string;
  clientName?: string;
  clientId?: string;
  clientAction?: string;
  patientName?: string;
  interpreterName?: string;
  interpreterId?: string;
  interpreterResolved?: boolean;
  interpreterMatchMethod?: string;
  interpreterMatchConfidence?: number;
  ambiguousCandidates?: string[];
  conflictReasons?: string[];
  status?: string;
  message?: string;
};

export type RedbookSyncResult = {
  success: boolean;
  syncRunId?: string;
  mappingVersion?: string;
  dryRun: boolean;
  importMode: string;
  triggeredBy?: string;
  totalRecords?: number;
  financeRecords?: {
    clientInvoices: number;
    interpreterInvoices: number;
  };
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  stats: RedbookSyncStats;
  financeStats?: {
    clientInvoices: RedbookSyncStats;
    interpreterInvoices: RedbookSyncStats;
  };
  details: RedbookSyncDetail[];
};

export type RedbookSyncCheckpoint = {
  lastRunId?: string;
  lastRunAt?: string;
  lastTotalRecords?: number;
  lastStats?: RedbookSyncStats;
  scheduleEnabled?: boolean;
};

export const RedbookSyncService = {
  run: async (dryRun: boolean, limitRecords = 5000, syncStrategy: AirtableSyncStrategy = 'OPEN_WORKFLOW'): Promise<RedbookSyncResult> => {
    const syncFn = httpsCallable(functions, 'syncRedbookJobs');
    const response = await syncFn({ dryRun, limitRecords, syncStrategy });
    return response.data as RedbookSyncResult;
  },

  getCheckpoint: async (): Promise<RedbookSyncCheckpoint | null> => {
    const snap = await getDoc(doc(db, 'system', 'airtableRedbookSync'));
    return snap.exists() ? snap.data() as RedbookSyncCheckpoint : null;
  }
};
