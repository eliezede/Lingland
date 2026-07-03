import { collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebaseConfig';
import { RedbookSyncDetail, RedbookSyncStats } from './redbookSyncService';

export type AirtableSyncModule =
  | 'clients'
  | 'redbook'
  | 'translations'
  | 'clientInvoices'
  | 'interpreterInvoices'
  | 'translationClientInvoices'
  | 'translatorInvoices';

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
};

export type AirtableSyncResult = {
  success: boolean;
  syncRunId?: string;
  mappingVersion?: string;
  dryRun: boolean;
  importMode: string;
  triggeredBy?: string;
  userId?: string;
  modules: AirtableSyncModule[];
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  stats: RedbookSyncStats;
  moduleResults: AirtableModuleResult[];
};

export type AirtableSyncCheckpoint = {
  lastRunId?: string;
  lastRunAt?: string;
  lastStats?: RedbookSyncStats;
  lastModules?: AirtableSyncModule[];
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

export type AirtableConflictSeverity = 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH';

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
    limitRecords = 500
  ): Promise<AirtableSyncResult> => {
    const syncFn = httpsCallable(functions, 'syncAirtableData');
    const response = await syncFn({ dryRun, modules, limitRecords });
    return response.data as AirtableSyncResult;
  },

  getCheckpoint: async (): Promise<AirtableSyncCheckpoint | null> => {
    const snap = await getDoc(doc(db, 'system', 'airtableSyncCenter'));
    return snap.exists() ? snap.data() as AirtableSyncCheckpoint : null;
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
  }
};
