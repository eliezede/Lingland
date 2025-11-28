
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { SystemSettings } from '../types';
import { MOCK_CLIENTS, MOCK_INTERPRETERS, MOCK_BOOKINGS, MOCK_USERS, MOCK_SETTINGS, saveMockData } from './mockData';
import { safeFetch } from './utils';

export const SystemService = {
  checkConnection: async (): Promise<boolean> => {
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1500));
      const check = getDoc(doc(db, 'system', 'ping'));
      await Promise.race([check, timeout]);
      return true;
    } catch (error) {
      return false;
    }
  },

  seedDatabase: async () => {
    console.log("Starting Database Seed...");
    try {
      for (const client of MOCK_CLIENTS) await setDoc(doc(db, 'clients', client.id), client);
      for (const interpreter of MOCK_INTERPRETERS) await setDoc(doc(db, 'interpreters', interpreter.id), interpreter);
      for (const booking of MOCK_BOOKINGS) await setDoc(doc(db, 'bookings', booking.id), booking);
      for (const user of MOCK_USERS) await setDoc(doc(db, 'users', user.id), user);
      await setDoc(doc(db, 'system', 'settings'), MOCK_SETTINGS);
      return true;
    } catch (e) {
      console.error("Seeding failed:", e);
      throw e;
    }
  },

  getSettings: async (): Promise<SystemSettings> => {
    return safeFetch(async () => {
      const snap = await getDoc(doc(db, 'system', 'settings'));
      return snap.exists() ? snap.data() as SystemSettings : MOCK_SETTINGS;
    }, MOCK_SETTINGS);
  },

  updateSettings: async (settings: Partial<SystemSettings>) => {
    try {
      await setDoc(doc(db, 'system', 'settings'), settings, { merge: true });
      Object.assign(MOCK_SETTINGS, settings);
      saveMockData();
    } catch (e) {
      console.log("Update settings offline");
      Object.assign(MOCK_SETTINGS, settings);
      saveMockData();
    }
  }
};
