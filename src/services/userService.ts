import { collection, doc, getDoc, getDocs, updateDoc, addDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { User } from '../types';
import { MOCK_USERS } from './mockData';
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
    } catch (e) { console.log("Update user offline"); }
  },

  create: async (data: Omit<User, 'id'>) => {
    try {
      const ref = await addDoc(collection(db, 'users'), data);
      return { id: ref.id, ...data };
    } catch (e) { 
      return { id: `mock-u-${Date.now()}`, ...data };
    }
  }
};
