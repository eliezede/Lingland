
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

export const convertDoc = <T>(doc: QueryDocumentSnapshot | DocumentData): T => {
  return { id: doc.id, ...doc.data() } as T;
};

export const safeFetch = async <T>(operation: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    void fallback;
    throw error;
  }
};
