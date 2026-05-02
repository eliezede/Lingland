import { collection, doc, getDoc, getDocs, updateDoc, deleteDoc, setDoc, addDoc } from 'firebase/firestore';
import { db, auth } from './firebaseConfig';
import { User, Interpreter, StaffProfile, Client } from '../types';
import { StorageService } from './storageService';
import { MOCK_USERS, saveMockData } from './mockData';
import { convertDoc, safeFetch } from './utils';

export const UserService = {
  getUserById: async (id: string): Promise<User | undefined> => {
    try {
      const docRef = doc(db, 'users', id);
      const snap = await getDoc(docRef);
      return snap.exists() ? convertDoc<User>(snap) : MOCK_USERS.find(u => u.id === id);
    } catch (e) {
      return MOCK_USERS.find(u => u.id === id);
    }
  },

  getAll: async (): Promise<User[]> => {
    return safeFetch(async () => {
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs.map(d => convertDoc<User>(d));
    }, MOCK_USERS);
  },

  update: async (id: string, data: Partial<User>) => {
    try {
      await updateDoc(doc(db, 'users', id), data);
    } catch (e) { 
      const idx = MOCK_USERS.findIndex(u => u.id === id);
      if (idx !== -1) {
        MOCK_USERS[idx] = { ...MOCK_USERS[idx], ...data } as User;
        saveMockData();
      }
    }
  },

  delete: async (id: string) => {
    // 1. Sync Mock Data first to ensure consistent state
    const idx = MOCK_USERS.findIndex(u => u.id === id);
    if (idx !== -1) {
      MOCK_USERS.splice(idx, 1);
      saveMockData();
    }

    try {
      await deleteDoc(doc(db, 'users', id));
    } catch (e) {
      console.warn('Firebase user deletion failed', e);
    }
  },

  rigorousDelete: async (user: User) => {
    // Determine and cleanup associated profile based on role
    try {
      if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
        const { StaffService } = await import('./staffService');
        await StaffService.deleteProfileByUserId(user.id);
      } else if (user.role === 'INTERPRETER') {
        const { InterpreterService } = await import('./interpreterService');
        if (user.profileId) await InterpreterService.delete(user.profileId);
      } else if (user.role === 'CLIENT') {
        const { ClientService } = await import('./clientService');
        if (user.profileId) await ClientService.delete(user.profileId);
      }
    } catch (e) {
      console.warn('Error during rigorous profile cleanup:', e);
    }

    // Finally delete the main user record
    await UserService.delete(user.id);
  },

  create: async (data: Omit<User, 'id'>) => {
    try {
      const newDocRef = doc(collection(db, 'users'));
      const userData = { ...data, status: data.status || 'ACTIVE' };
      await setDoc(newDocRef, userData);
      return { id: newDocRef.id, ...userData };
    } catch (e) { 
      const mockUser = { id: `mock-u-${Date.now()}`, ...data, status: data.status || 'ACTIVE' } as User;
      MOCK_USERS.push(mockUser);
      saveMockData();
      return mockUser;
    }
  },

  sendActivationInvite: async (email: string, displayName: string) => {
    const activationLink = `${window.location.origin}/#/activate?email=${encodeURIComponent(email)}`;
    
    // Queue email via 'mail' collection (Firebase Extension)
    await addDoc(collection(db, 'mail'), {
      to: [email],
      template: {
        name: 'ACCOUNT_ACTIVATION',
        data: {
          interpreterName: displayName,
          activationLink: activationLink
        }
      },
      createdAt: new Date().toISOString()
    });
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