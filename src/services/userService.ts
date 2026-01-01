import { collection, doc, getDoc, getDocs, updateDoc, deleteDoc, setDoc, addDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from './firebaseConfig';
import { User } from '../types';
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
      console.log("Update user offline"); 
      const idx = MOCK_USERS.findIndex(u => u.id === id);
      if (idx !== -1) {
        MOCK_USERS[idx] = { ...MOCK_USERS[idx], ...data };
        saveMockData();
      }
    }
  },

  delete: async (id: string) => {
    try {
      await deleteDoc(doc(db, 'users', id));
    } catch (e) {
      const idx = MOCK_USERS.findIndex(u => u.id === id);
      if (idx !== -1) {
        MOCK_USERS.splice(idx, 1);
        saveMockData();
      }
    }
  },

  create: async (data: Omit<User, 'id'>) => {
    try {
      const newDocRef = doc(collection(db, 'users'));
      const userData = { ...data, status: data.status || 'ACTIVE' };
      await setDoc(newDocRef, userData);
      return { id: newDocRef.id, ...userData };
    } catch (e) { 
      const mockUser = { id: `mock-u-${Date.now()}`, ...data, status: data.status || 'ACTIVE' };
      MOCK_USERS.push(mockUser);
      saveMockData();
      return mockUser;
    }
  },

  /**
   * Envia um e-mail real utilizando o padrão de gatilho do Firestore.
   * Requer a extensão "Trigger Email" instalada no Firebase.
   */
  sendActivationEmail: async (email: string, displayName: string) => {
    try {
      // 1. Tenta o método nativo do Firebase Auth (funciona se o e-mail já estiver no Auth)
      await sendPasswordResetEmail(auth, email);
      
      // 2. Registra log de envio no Firestore para auditoria e gatilho de e-mail customizado
      await addDoc(collection(db, 'mail'), {
        to: email,
        message: {
          subject: 'Welcome to Lingland - Access your Account',
          html: `
            <h1>Hello, ${displayName}!</h1>
            <p>Your account on Lingland Platform has been provisioned by an administrator.</p>
            <p>To set your password and access the system, please use the link sent by Firebase Security or click the button below to reset your password.</p>
            <br>
            <p>If you have any questions, contact support@lingland.com</p>
          `,
        },
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (e) {
      console.error("Erro ao processar envio de e-mail:", e);
      throw e;
    }
  }
};