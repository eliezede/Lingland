import { collection, addDoc, getDocs, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { InterpreterApplication, ApplicationStatus } from '../types';

const COLLECTION = 'applications';

// Cache local persistente em memória para a sessão atual em modo mock
let MOCK_APPLICATIONS_CACHE: InterpreterApplication[] = [];

export const ApplicationService = {
  submit: async (data: Omit<InterpreterApplication, 'id' | 'status' | 'submittedAt'>) => {
    const application = {
      ...data,
      status: ApplicationStatus.PENDING,
      submittedAt: new Date().toISOString()
    };
    try {
      const docRef = await addDoc(collection(db, COLLECTION), application);
      return { id: docRef.id, ...application } as InterpreterApplication;
    } catch (e) {
      console.warn("Application Service: Offline Mode / Mock Data Use");
      const mockApp = { id: `app-${Date.now()}`, ...application } as InterpreterApplication;
      MOCK_APPLICATIONS_CACHE.push(mockApp);
      return mockApp;
    }
  },

  getAll: async (): Promise<InterpreterApplication[]> => {
    try {
      const q = query(collection(db, COLLECTION), orderBy('submittedAt', 'desc'));
      const snap = await getDocs(q);
      const remoteApps = snap.docs.map(d => ({ id: d.id, ...d.data() } as InterpreterApplication));
      // Se houver dados remotos, eles ganham precedência, senão usa o cache local de testes
      return remoteApps.length > 0 ? remoteApps : MOCK_APPLICATIONS_CACHE;
    } catch (e) {
      return MOCK_APPLICATIONS_CACHE;
    }
  },

  updateStatus: async (id: string, status: ApplicationStatus) => {
    try {
      await updateDoc(doc(db, COLLECTION, id), { status });
    } catch (e) {
      console.error("Application Update Failed (Offline Mode):", e);
      // Atualiza o cache local para que a UI reflita a mudança imediatamente
      const app = MOCK_APPLICATIONS_CACHE.find(a => a.id === id);
      if (app) {
        app.status = status;
      }
    }
  }
};