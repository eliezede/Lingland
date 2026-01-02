import { collection, addDoc, getDocs, doc, updateDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { InterpreterApplication, ApplicationStatus } from '../types';

const COLLECTION = 'applications';

export const ApplicationService = {
  submit: async (data: Omit<InterpreterApplication, 'id' | 'status' | 'submittedAt'>) => {
    const application = {
      ...data,
      status: ApplicationStatus.PENDING,
      submittedAt: new Date().toISOString()
    };
    try {
      const docRef = await addDoc(collection(db, COLLECTION), application);
      return { id: docRef.id, ...application };
    } catch (e) {
      // Mock Fallback
      console.warn("Application Service: Offline Mode");
      return { id: `app-${Date.now()}`, ...application };
    }
  },

  getAll: async (): Promise<InterpreterApplication[]> => {
    try {
      const q = query(collection(db, COLLECTION), orderBy('submittedAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as InterpreterApplication));
    } catch (e) {
      return [];
    }
  },

  updateStatus: async (id: string, status: ApplicationStatus) => {
    try {
      await updateDoc(doc(db, COLLECTION, id), { status });
    } catch (e) {
      console.error(e);
    }
  }
};