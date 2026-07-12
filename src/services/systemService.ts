
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { ServiceType, SystemSettings } from '../types';

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

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  general: {
    companyName: 'Lingland',
    supportEmail: '',
    businessAddress: '',
    websiteUrl: 'https://lingland.co.uk',
    portalUrl: typeof window !== 'undefined' ? window.location.origin : 'https://lingland.co.uk',
  },
  finance: {
    currency: 'GBP',
    vatRate: 0.20,
    vatNumber: '',
    invoicePrefix: 'INV-',
    nextInvoiceNumber: 1,
    paymentTermsDays: 30,
    invoiceFooterText: '',
  },
  operations: {
    minBookingDurationMinutes: 60,
    cancellationWindowHours: 24,
    timeIncrementMinutes: 15,
    defaultOnlinePlatformUrl: '',
  },
  masterData: {
    activeServiceTypes: [ServiceType.FACE_TO_FACE, ServiceType.VIDEO, ServiceType.TELEPHONE, ServiceType.TRANSLATION, ServiceType.BSL],
    priorityLanguages: [],
  },
  platformMode: DEFAULT_PLATFORM_MODE,
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

  getSettings: async (): Promise<SystemSettings> => {
    const snap = await getDoc(doc(db, 'system', 'settings'));
    return withSettingsDefaults(snap.exists() ? snap.data() as SystemSettings : DEFAULT_SYSTEM_SETTINGS);
  },

  getPlatformMode: async () => {
    const settings = await SystemService.getSettings();
    return settings.platformMode || DEFAULT_PLATFORM_MODE;
  },

  updateSettings: async (settings: Partial<SystemSettings>) => {
    await setDoc(doc(db, 'system', 'settings'), settings, { merge: true });
  }
};
