
import { collection, doc, getDoc, getDocs, updateDoc, addDoc, setDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from './firebaseConfig';
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
      // Criamos o documento no Firestore com um ID gerado automaticamente
      const newDocRef = doc(collection(db, 'users'));
      await setDoc(newDocRef, data);
      return { id: newDocRef.id, ...data };
    } catch (e) { 
      console.error("Erro ao criar usuário no Firestore:", e);
      return { id: `mock-u-${Date.now()}`, ...data };
    }
  },

  /**
   * Envia um e-mail de redefinição de senha que serve como "Ativação de Conta"
   * para usuários que o Admin acabou de criar.
   */
  sendActivationEmail: async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return true;
    } catch (e) {
      console.error("Erro ao enviar e-mail de ativação:", e);
      // Se o usuário ainda não existe no Auth, o Firebase retornará erro.
      // Em produção, isso seria resolvido via Cloud Functions.
      throw e;
    }
  }
};
