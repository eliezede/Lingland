import { collection, doc, getDoc, getDocs, updateDoc, setDoc, addDoc, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { User, Interpreter, StaffProfile, Client } from '../types';
import { StorageService } from './storageService';
import { convertDoc } from './utils';
import { SystemService } from './systemService';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseConfig';

export const UserService = {
  getUserById: async (id: string): Promise<User | undefined> => {
    const docRef = doc(db, 'users', id);
    const snap = await getDoc(docRef);
    return snap.exists() ? convertDoc<User>(snap) : undefined;
  },

  getAll: async (): Promise<User[]> => {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map(d => convertDoc<User>(d));
  },

  getByEmail: async (email: string): Promise<User | undefined> => {
    const cleanEmail = email.trim().toLowerCase();
    const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
    const snap = await getDocs(q);
    return snap.empty ? undefined : convertDoc<User>(snap.docs[0]);
  },

  update: async (id: string, data: Partial<User>) => {
    await updateDoc(doc(db, 'users', id), data);
  },

  delete: async (id: string) => {
    await httpsCallable(functions, 'deletePlatformEntity')({ entityType: 'USER', id });
  },

  rigorousDelete: async (user: User) => {
    await httpsCallable(functions, 'deletePlatformEntity')({ entityType: 'USER', id: user.id });
  },

  create: async (data: Omit<User, 'id'>) => {
    const newDocRef = doc(collection(db, 'users'));
    const userData = { ...data, status: data.status || 'ACTIVE' };
    await setDoc(newDocRef, userData);
    return { id: newDocRef.id, ...userData };
  },

  sendActivationInvite: async (email: string, displayName: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const communicationMode = (await SystemService.getPlatformMode()).communicationMode;
    if (communicationMode !== 'LIVE') {
      await addDoc(collection(db, 'emailAudit'), {
        to: [cleanEmail],
        recipientType: 'INTERPRETER',
        statusTrigger: 'ACCOUNT_ACTIVATION',
        status: 'SUPPRESSED',
        communicationMode,
        suppressedReason: `Communication mode ${communicationMode} suppressed account activation invite`,
        message: {
          subject: `Account activation invite for ${displayName}`,
          html: ''
        },
        createdAt: new Date().toISOString()
      });
      return { success: false, suppressed: true, communicationMode };
    }

    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const functions = getFunctions();
    const sendInvite = httpsCallable(functions, 'sendAccountActivationInvite');
    const result = await sendInvite({ email: cleanEmail, displayName });
    return result.data as { success: boolean; userId?: string; suppressed?: boolean; communicationMode?: string };
  },

  uploadProfilePhoto: async (userId: string, file: File | string, role: string): Promise<string> => {
    const path = `profiles/${role.toLowerCase()}/${userId}/${Date.now()}_profile.jpg`;
    const photoUrl = await StorageService.uploadFile(file, path);
    
    // Update main user record
    await UserService.update(userId, { photoUrl });

    // Update specific profile based on role
    try {
      if (role === 'INTERPRETER') {
        const { InterpreterService } = await import('./interpreterService');
        const user = await UserService.getUserById(userId);
        if (user?.profileId) {
          await InterpreterService.updateProfile(user.profileId, { photoUrl });
        }
      } else if (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'COORDINATOR' || role === 'STAFF') {
        const { StaffService } = await import('./staffService');
        const user = await UserService.getUserById(userId);
        if (user?.staffProfileId) {
          await StaffService.updateProfile(user.staffProfileId, { photoUrl });
        }
      } else if (role === 'CLIENT') {
        const { ClientService } = await import('./clientService');
        const user = await UserService.getUserById(userId);
        if (user?.profileId) {
          await ClientService.update(user.profileId, { photoUrl });
        }
      }
    } catch (profileError) {
      console.error("Error updating sub-profile photo:", profileError);
    }

    return photoUrl;
  }
};
