import { collection, doc, getDoc, getDocs, updateDoc, addDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseConfig';
import { Interpreter } from '../types';
import { convertDoc } from './utils';
import { ensureInterpreterOnboarding } from '../utils/interpreterFlow';

const normalizeInterpreter = (interpreter: Interpreter): Interpreter => ({
  ...interpreter,
  onboarding: ensureInterpreterOnboarding(interpreter),
  languages: interpreter.languages || interpreter.languageProficiencies?.map(p => p.language).filter(Boolean) || [],
  regions: interpreter.regions || [interpreter.address?.postcode].filter(Boolean) as string[],
});

export const InterpreterService = {
  getAll: async (): Promise<Interpreter[]> => {
    const snap = await getDocs(collection(db, 'interpreters'));
    const data = snap.docs.map(d => convertDoc<Interpreter>(d));
    return data.map(normalizeInterpreter);
  },

  getById: async (id: string) => {
    const snap = await getDoc(doc(db, 'interpreters', id));
    const interpreter = snap.exists() ? convertDoc<Interpreter>(snap) : undefined;
    return interpreter ? normalizeInterpreter(interpreter) : undefined;
  },

  updateProfile: async (id: string, data: Partial<Interpreter>) => {
    const payload = data.onboarding ? { ...data, onboarding: ensureInterpreterOnboarding(data) } : data;
    await updateDoc(doc(db, 'interpreters', id), payload);
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
    const ref = await addDoc(collection(db, 'interpreters'), payload);
    return { id: ref.id, ...payload } as Interpreter;
  },

  delete: async (id: string): Promise<void> => {
    await httpsCallable(functions, 'deletePlatformEntity')({ entityType: 'INTERPRETER', id });
  },

  getPhotoMap: async (): Promise<Record<string, string>> => {
    try {
      const snap = await getDocs(collection(db, 'interpreters'));
      const map: Record<string, string> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.photoUrl) map[d.id] = data.photoUrl;
      });
      return map;
    } catch (error) {
      console.error('Failed to load interpreter photos', error);
      throw error;
    }
  }
};
