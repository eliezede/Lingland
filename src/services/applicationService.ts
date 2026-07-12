import { collection, getDocs, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebaseConfig';
import { InterpreterApplication, ApplicationStatus } from '../types';
import { PublicSessionService } from './publicSessionService';

const COLLECTION = 'applications';

export const ApplicationService = {
  submit: async (data: Omit<InterpreterApplication, 'id' | 'status' | 'submittedAt'>) => {
    await PublicSessionService.ensure();
    const submit = httpsCallable(functions, 'submitPublicInterpreterApplication');
    const response = await submit(data);
    const result = response.data as { success: boolean; applicationId: string; submittedAt: string };
    if (!result.success || !result.applicationId) throw new Error('Application submission was not persisted.');
    return {
      ...data,
      id: result.applicationId,
      status: ApplicationStatus.PENDING,
      submittedAt: result.submittedAt
    } as InterpreterApplication;
  },

  getAll: async (): Promise<InterpreterApplication[]> => {
    const q = query(collection(db, COLLECTION), orderBy('submittedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as InterpreterApplication));
  },

  updateStatus: async (id: string, status: ApplicationStatus) => {
    await updateDoc(doc(db, COLLECTION, id), { status, updatedAt: new Date().toISOString() });
  }
};
