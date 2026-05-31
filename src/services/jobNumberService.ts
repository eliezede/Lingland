import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Booking } from '../types';
import { MOCK_BOOKINGS, MOCK_SETTINGS, saveMockData } from './mockData';
import { SystemService } from './systemService';

const COUNTERS_COLLECTION = 'systemCounters';

const getCurrentYearSuffix = () => Number(new Date().getFullYear().toString().slice(-2));

const getNumberingSettings = async () => {
  const platformMode = await SystemService.getPlatformMode();
  const numbering = platformMode.jobNumbering || MOCK_SETTINGS.platformMode?.jobNumbering;
  return {
    prefix: numbering?.prefix || 'LING',
    year: numbering?.year || getCurrentYearSuffix(),
    nextSequence: numbering?.nextSequence || 17037,
    displayIncludesLanguage: numbering?.displayIncludesLanguage ?? true
  };
};

const extractSequence = (value?: string): number => {
  const match = value?.match(/LING\d{2}\.(\d+)/i);
  return match ? Number(match[1]) : 0;
};

const buildDisplayRef = (jobNumber: string, languageTo?: string, includeLanguage = true) => {
  return includeLanguage && languageTo ? `${jobNumber} ${languageTo}` : jobNumber;
};

export const JobNumberService = {
  buildDisplayRef,

  ensureBookingReference: async (bookingData: Partial<Booking>): Promise<Partial<Booking>> => {
    if (bookingData.jobNumber || bookingData.bookingRef) {
      const jobNumber = bookingData.jobNumber || bookingData.bookingRef;
      return {
        ...bookingData,
        jobNumber,
        bookingRef: bookingData.bookingRef || jobNumber,
        displayRef: bookingData.displayRef || buildDisplayRef(jobNumber || '', bookingData.languageTo)
      };
    }

    const numbering = await getNumberingSettings();
    const counterId = `${numbering.prefix}${numbering.year}`;

    try {
      const counterRef = doc(db, COUNTERS_COLLECTION, counterId);
      let seed = numbering.nextSequence - 1;
      const latest = await getDocs(query(collection(db, 'bookings'), orderBy('jobNumber', 'desc'), limit(1)));
      if (!latest.empty) {
        seed = Math.max(seed, extractSequence((latest.docs[0].data() as Booking).jobNumber));
      }

      const nextSequence = await runTransaction(db, async transaction => {
        const counterSnap = await transaction.get(counterRef);
        if (counterSnap.exists()) {
          const lastSequence = Number(counterSnap.data().lastSequence || numbering.nextSequence - 1);
          const next = lastSequence + 1;
          transaction.update(counterRef, { lastSequence: next, updatedAt: serverTimestamp() });
          return next;
        }

        const next = seed + 1;
        transaction.set(counterRef, {
          prefix: numbering.prefix,
          year: numbering.year,
          lastSequence: next,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return next;
      });

      const jobNumber = `${numbering.prefix}${numbering.year}.${nextSequence}`;
      await setDoc(doc(db, 'system', 'settings'), {
        platformMode: {
          jobNumbering: {
            nextSequence: nextSequence + 1
          }
        }
      }, { merge: true });

      return {
        ...bookingData,
        jobNumber,
        bookingRef: jobNumber,
        displayRef: buildDisplayRef(jobNumber, bookingData.languageTo, numbering.displayIncludesLanguage)
      };
    } catch (error) {
      const maxExisting = MOCK_BOOKINGS.reduce((max, booking) => Math.max(max, extractSequence(booking.jobNumber || booking.bookingRef)), 0);
      const nextSequence = Math.max(numbering.nextSequence, maxExisting + 1);
      const jobNumber = `${numbering.prefix}${numbering.year}.${nextSequence}`;
      if (MOCK_SETTINGS.platformMode?.jobNumbering) {
        MOCK_SETTINGS.platformMode.jobNumbering.nextSequence = nextSequence + 1;
        saveMockData();
      }
      return {
        ...bookingData,
        jobNumber,
        bookingRef: jobNumber,
        displayRef: buildDisplayRef(jobNumber, bookingData.languageTo, numbering.displayIncludesLanguage)
      };
    }
  }
};
