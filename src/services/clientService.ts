
import { collection, doc, getDoc, getDocs, updateDoc, addDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Client, GuestContact } from '../types';
import { MOCK_CLIENTS, saveMockData } from './mockData';
import { convertDoc, safeFetch } from './utils';

export const ClientService = {
  getAll: async (): Promise<Client[]> => {
    return safeFetch(async () => {
      const snap = await getDocs(collection(db, 'clients'));
      return snap.docs.map(d => convertDoc<Client>(d));
    }, MOCK_CLIENTS);
  },
  
  getById: async (id: string) => {
    try {
      const snap = await getDoc(doc(db, 'clients', id));
      return snap.exists() ? convertDoc<Client>(snap) : MOCK_CLIENTS.find(c => c.id === id);
    } catch {
      return MOCK_CLIENTS.find(c => c.id === id);
    }
  },
  
  create: async (data: Omit<Client, 'id'>): Promise<Client> => {
    try {
      const ref = await addDoc(collection(db, 'clients'), data);
      return { id: ref.id, ...data } as Client;
    } catch {
      const newClient = { id: `c-${Date.now()}`, ...data } as Client;
      MOCK_CLIENTS.push(newClient);
      saveMockData();
      return newClient;
    }
  },

  update: async (id: string, data: Partial<Client>): Promise<Client | null> => {
    try {
      await updateDoc(doc(db, 'clients', id), data);
      return { id, ...data } as Client;
    } catch {
      const idx = MOCK_CLIENTS.findIndex(c => c.id === id);
      if(idx >= 0) {
          MOCK_CLIENTS[idx] = { ...MOCK_CLIENTS[idx], ...data };
          saveMockData();
      }
      return { id, ...data } as Client;
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'clients', id));
    } catch (e) {
      const idx = MOCK_CLIENTS.findIndex(c => c.id === id);
      if(idx >= 0) { MOCK_CLIENTS.splice(idx, 1); saveMockData(); }
    }
  },

  createClientFromGuest: async (guest: GuestContact): Promise<Client> => {
    const newClient: Client = {
      id: `c-${Date.now()}`,
      companyName: guest.organisation || guest.name,
      contactPerson: guest.name,
      email: guest.email,
      billingAddress: 'Address Pending Update',
      paymentTermsDays: 30,
      defaultCostCodeType: 'PO'
    };
    
    MOCK_CLIENTS.push(newClient);
    saveMockData();
    // Try to sync with Firestore
    try { await setDoc(doc(db, 'clients', newClient.id), newClient); } catch(e) {}
    
    return newClient;
  }
};
