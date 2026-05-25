import { collection, doc, getDoc, getDocs, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Interpreter } from '../types';
import { MOCK_INTERPRETERS, saveMockData } from './mockData';
import { convertDoc, safeFetch } from './utils';
import { ensureInterpreterOnboarding } from '../utils/interpreterFlow';

const normalizeInterpreter = (interpreter: Interpreter): Interpreter => ({
  ...interpreter,
  onboarding: ensureInterpreterOnboarding(interpreter),
  languages: interpreter.languages || interpreter.languageProficiencies?.map(p => p.language).filter(Boolean) || [],
  regions: interpreter.regions || [interpreter.address?.postcode].filter(Boolean) as string[],
});

export const InterpreterService = {
  getAll: async (): Promise<Interpreter[]> => {
    const data = await safeFetch(async () => {
      const snap = await getDocs(collection(db, 'interpreters'));
      return snap.docs.map(d => convertDoc<Interpreter>(d));
    }, MOCK_INTERPRETERS);
    return data.map(normalizeInterpreter);
  },

  getById: async (id: string) => {
    try {
      const snap = await getDoc(doc(db, 'interpreters', id));
      const interpreter = snap.exists() ? convertDoc<Interpreter>(snap) : MOCK_INTERPRETERS.find(i => i.id === id);
      return interpreter ? normalizeInterpreter(interpreter) : interpreter;
    } catch {
      const interpreter = MOCK_INTERPRETERS.find(i => i.id === id);
      return interpreter ? normalizeInterpreter(interpreter) : interpreter;
    }
  },

  updateProfile: async (id: string, data: Partial<Interpreter>) => {
    const payload = data.onboarding ? { ...data, onboarding: ensureInterpreterOnboarding(data) } : data;
    try {
      await updateDoc(doc(db, 'interpreters', id), payload);
    } catch (e) {
      const i = MOCK_INTERPRETERS.find(inter => inter.id === id);
      if (i) Object.assign(i, payload);
      saveMockData();
    }
  },

  create: async (data: Omit<Interpreter, 'id'>): Promise<Interpreter> => {
    const status = (data as any).status || 'ONBOARDING';
    const payload = {
      ...data,
      status,
      onboarding: ensureInterpreterOnboarding(data),
      languages: data.languages || data.languageProficiencies?.map(p => p.language).filter(Boolean) || [],
      regions: data.regions || [data.address?.postcode].filter(Boolean),
    };
    try {
      const ref = await addDoc(collection(db, 'interpreters'), payload);
      return { id: ref.id, ...payload } as Interpreter;
    } catch {
      const newInt = { id: `mock-${Date.now()}`, ...payload } as Interpreter;
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
