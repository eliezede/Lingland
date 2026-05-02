import { collection, doc, getDoc, getDocs, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Interpreter } from '../types';
import { MOCK_INTERPRETERS, saveMockData } from './mockData';
import { convertDoc, safeFetch } from './utils';

export const InterpreterService = {
  getAll: async (): Promise<Interpreter[]> => {
    return safeFetch(async () => {
      const snap = await getDocs(collection(db, 'interpreters'));
      return snap.docs.map(d => convertDoc<Interpreter>(d));
    }, MOCK_INTERPRETERS);
  },

  getById: async (id: string) => {
    try {
      const snap = await getDoc(doc(db, 'interpreters', id));
      return snap.exists() ? convertDoc<Interpreter>(snap) : MOCK_INTERPRETERS.find(i => i.id === id);
    } catch {
      return MOCK_INTERPRETERS.find(i => i.id === id);
    }
  },

  updateProfile: async (id: string, data: Partial<Interpreter>) => {
    try {
      await updateDoc(doc(db, 'interpreters', id), data);
    } catch (e) {
      const i = MOCK_INTERPRETERS.find(inter => inter.id === id);
      if (i) Object.assign(i, data);
      saveMockData();
    }
  },

  create: async (data: Omit<Interpreter, 'id'>): Promise<Interpreter> => {
    const status = (data as any).status || 'ONBOARDING';
    try {
      const ref = await addDoc(collection(db, 'interpreters'), { ...data, status });
      return { id: ref.id, ...data, status } as Interpreter;
    } catch {
      const newInt = { id: `mock-${Date.now()}`, ...data, status } as Interpreter;
      MOCK_INTERPRETERS.push(newInt);
      saveMockData();
      return newInt;
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'interpreters', id));
    } catch (e) {
      console.warn('Firebase interpreter deletion failed', e);
    }

    const idx = MOCK_INTERPRETERS.findIndex(i => i.id === id);
    if (idx >= 0) {
      MOCK_INTERPRETERS.splice(idx, 1);
      saveMockData();
    }
  },

  getPhotoMap: async (): Promise<Record<string, string>> => {
    try {
      const snap = await getDocs(collection(db, 'interpreters'));
      const map: Record<string, string> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.photoUrl) map[d.id] = data.photoUrl;
      });
      return Object.keys(map).length > 0 ? map : MOCK_INTERPRETERS.reduce((acc, i) => {
        if (i.photoUrl) acc[i.id] = i.photoUrl;
        return acc;
      }, {} as Record<string, string>);
    } catch {
      return MOCK_INTERPRETERS.reduce((acc, i) => {
        if (i.photoUrl) acc[i.id] = i.photoUrl;
        return acc;
      }, {} as Record<string, string>);
    }
  }
};
