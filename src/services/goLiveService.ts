import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';

export type GoLiveChecklist = Record<string, boolean>;

export interface GoLiveControlRecord {
  checklist?: GoLiveChecklist;
  lastReadinessAudit?: Record<string, unknown>;
  lastRollbackAt?: string;
  lastRollbackBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

const controlRef = () => doc(db, 'goLiveControl', 'current');

export const GoLiveService = {
  get: async (): Promise<GoLiveControlRecord> => {
    const snapshot = await getDoc(controlRef());
    return snapshot.exists() ? snapshot.data() as GoLiveControlRecord : {};
  },

  save: async (data: GoLiveControlRecord) => {
    await setDoc(controlRef(), data, { merge: true });
  },
};
