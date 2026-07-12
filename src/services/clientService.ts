
import { collection, doc, getDoc, getDocs, updateDoc, addDoc, setDoc, query, where, limit, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseConfig';
import { Client, GuestContact } from '../types';
import { convertDoc } from './utils';
import { SourceTracking } from './sourceTracking';

export const ClientService = {
  getAll: async (): Promise<Client[]> => {
    const snap = await getDocs(collection(db, 'clients'));
    return snap.docs.map(d => convertDoc<Client>(d));
  },

  getById: async (id: string) => {
    const snap = await getDoc(doc(db, 'clients', id));
    return snap.exists() ? convertDoc<Client>(snap) : undefined;
  },

  getByEmail: async (email: string): Promise<Client | undefined> => {
    const q = query(collection(db, 'clients'), where('email', '==', email.trim().toLowerCase()), limit(1));
    const snap = await getDocs(q);
    return snap.empty ? undefined : convertDoc<Client>(snap.docs[0]);
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
  },

  createClientFromGuest: async (guest: GuestContact): Promise<Client> => {
    const cleanEmail = guest.email.trim().toLowerCase();
    const newClient: Client = {
      id: doc(collection(db, 'clients')).id,
      companyName: guest.organisation || guest.name,
      contactPerson: guest.name,
      email: cleanEmail,
      status: 'GUEST',
      billingAddress: 'Address Pending Update',
      paymentTermsDays: 30,
      defaultCostCodeType: 'PO',
      ...SourceTracking.fromSource({
        sourceSystem: 'CLIENT_PORTAL',
        legacyRef: guest.organisation || guest.name
      }),
      organizationId: 'lingland-main',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'clients', newClient.id), newClient);
    return newClient;
  },

  linkUserToClient: async (email: string, clientId: string): Promise<void> => {
    try {
      const q = query(collection(db, 'users'), where('email', '==', email), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, { profileId: clientId });
        console.log(`Linked user ${email} to client ${clientId}`);
      }
    } catch (e) {
      console.warn('Failed to link user to client', e);
      throw e;
    }
  },

  convertToMember: async (clientId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, 'clients', clientId), {
        status: 'ACTIVE',
        updatedAt: serverTimestamp()
      } as any);
      console.log(`Client ${clientId} converted to ACTIVE member.`);
    } catch (e) {
      console.error('Failed to convert client to member', e);
      throw e;
    }
  }
};
