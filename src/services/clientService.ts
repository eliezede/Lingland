
import { collection, doc, getDoc, getDocs, updateDoc, addDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseConfig';
import { Client } from '../types';
import { convertDoc } from './utils';
import { SourceTracking } from './sourceTracking';

export const ClientService = {
  getAll: async (): Promise<Client[]> => {
    const snap = await getDocs(collection(db, 'clients'));
    return snap.docs
      .map(d => convertDoc<Client>(d))
      .filter(client => client.recordState !== 'MERGED' && !client.mergedIntoClientId);
  },

  getById: async (id: string) => {
    const snap = await getDoc(doc(db, 'clients', id));
    if (!snap.exists()) return undefined;
    const client = convertDoc<Client>(snap);
    if (client.recordState === 'MERGED' && client.mergedIntoClientId && client.mergedIntoClientId !== id) {
      const canonical = await getDoc(doc(db, 'clients', client.mergedIntoClientId));
      return canonical.exists() ? convertDoc<Client>(canonical) : client;
    }
    return client;
  },

  create: async (data: Omit<Client, 'id'>): Promise<Client> => {
    const payload = SourceTracking.merge(data as any, SourceTracking.fromSource({
      sourceSystem: (data as any).sourceSystem || 'STAFF_MANUAL',
      sourceBaseId: (data as any).sourceBaseId,
      sourceTable: (data as any).sourceTable,
      sourceView: (data as any).sourceView,
      sourceRecordId: (data as any).sourceRecordId,
      legacyRef: (data as any).legacyRef || data.companyName,
      snapshot: (data as any).sourceSystem === 'AIRTABLE' ? data as any : undefined,
      lastSyncRunId: (data as any).lastSyncRunId,
      syncedAt: (data as any).lastSyncedAt
    })) as Omit<Client, 'id'>;
    const ref = await addDoc(collection(db, 'clients'), payload);
    return { id: ref.id, ...payload } as Client;
  },

  update: async (id: string, data: Partial<Client>): Promise<Client | null> => {
    await updateDoc(doc(db, 'clients', id), data);
    return { id, ...data } as Client;
  },

  delete: async (id: string): Promise<void> => {
    await httpsCallable(functions, 'deletePlatformEntity')({ entityType: 'CLIENT', id });
  }
};
