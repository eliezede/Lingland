
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

export const convertDoc = <T>(doc: QueryDocumentSnapshot | DocumentData): T => {
  return { id: doc.id, ...doc.data() } as T;
};

export const safeFetch = async <T>(operation: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    if (error?.message && error.message.includes('offline')) {
      console.log("App is offline, using mock data fallback.");
    } else {
      console.warn("Firestore operation failed, using fallback data:", error);
    }
    return fallback;
  }
};
