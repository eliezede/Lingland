import { doc, getDoc } from 'firebase/firestore';
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
    description: 'Mirrors REDBOOK jobs and their interpretation finance links.',
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
  }
};
