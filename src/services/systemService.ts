
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { SystemSettings } from '../types';
import { MOCK_CLIENTS, MOCK_INTERPRETERS, MOCK_BOOKINGS, MOCK_USERS, MOCK_SETTINGS, saveMockData } from './mockData';
import { safeFetch } from './utils';

const DEFAULT_PLATFORM_MODE: NonNullable<SystemSettings['platformMode']> = {
  operatingMode: 'AIRTABLE_MIRROR',
  communicationMode: 'SUPPRESSED',
  sourceOfTruth: 'AIRTABLE',
  airtableImportMode: 'ON',
  hybridOperationsEnabled: true,
  jobNumbering: {
    prefix: 'LING',
    year: 26,
    nextSequence: 17037,
    displayIncludesLanguage: true
  }
};

const withSettingsDefaults = (settings: SystemSettings): SystemSettings => ({
  ...settings,
  platformMode: {
    ...DEFAULT_PLATFORM_MODE,
    ...(settings.platformMode || {}),
    jobNumbering: {
      ...DEFAULT_PLATFORM_MODE.jobNumbering,
      ...(settings.platformMode?.jobNumbering || {})
    }
  }
});

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
      return withSettingsDefaults(snap.exists() ? snap.data() as SystemSettings : MOCK_SETTINGS);
    }, withSettingsDefaults(MOCK_SETTINGS));
  },

  getPlatformMode: async () => {
    const settings = await SystemService.getSettings();
    return settings.platformMode || DEFAULT_PLATFORM_MODE;
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
