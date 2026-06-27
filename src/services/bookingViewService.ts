import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { BookingView, BookingWorkspace } from '../types';
import { db } from './firebaseConfig';

const COLLECTION_NAME = 'bookingViewPreferences';

export interface BookingViewPreferenceDocument {
  userId: string;
  workspace: BookingWorkspace;
  organizationId: string;
  views: BookingView[];
  updatedAt?: any;
  createdAt?: any;
}

const preferenceId = (userId: string, workspace: BookingWorkspace) => `${userId}_${workspace}`;

export const BookingViewService = {
  getUserWorkspaceViews: async (userId: string, workspace: BookingWorkspace): Promise<BookingView[] | null> => {
    if (!userId) return null;

    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, preferenceId(userId, workspace)));
      if (!snap.exists()) return null;
      const data = snap.data() as BookingViewPreferenceDocument;
      return Array.isArray(data.views) ? data.views : null;
    } catch (error) {
      console.warn('[BookingViewService] Failed to load Firestore views', error);
      return null;
    }
  },

  saveUserWorkspaceViews: async (
    userId: string,
    workspace: BookingWorkspace,
    views: BookingView[],
    organizationId = 'lingland-main'
  ): Promise<void> => {
    if (!userId) return;

    try {
      await setDoc(doc(db, COLLECTION_NAME, preferenceId(userId, workspace)), {
        userId,
        workspace,
        organizationId,
        views,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.warn('[BookingViewService] Failed to persist Firestore views', error);
      throw error;
    }
  },
};
