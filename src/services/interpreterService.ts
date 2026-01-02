
import { collection, doc, getDoc, getDocs, updateDoc, addDoc } from 'firebase/firestore';
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
        if(i) Object.assign(i, data);
        saveMockData();
    }
  },

  create: async (data: Omit<Interpreter, 'id'>): Promise<Interpreter> => {
    try {
      const ref = await addDoc(collection(db, 'interpreters'), { ...data, status: 'ONBOARDING' });
      return { id: ref.id, ...data, status: 'ONBOARDING' } as Interpreter;
    } catch {
      const newInt = { id: `mock-${Date.now()}`, ...data, status: 'ONBOARDING' } as Interpreter;
      MOCK_INTERPRETERS.push(newInt);
      saveMockData();
      return newInt;
    }
  }
};
