
import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { Booking, BookingStatus } from '../types';

export const useInterpreterUpcomingJobs = (interpreterId: string | undefined) => {
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  // Added refresh key to allow manual re-triggering of the onSnapshot listener if required by the UI
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey(prev => prev + 1), []);

  useEffect(() => {
    if (!interpreterId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Simplified query: filter by interpreterId first
    const q = query(
      collection(db, 'bookings'),
      where('interpreterId', '==', interpreterId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allJobs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Booking[];
      
      // Filter for CONFIRMED status and future dates in-memory
      const today = new Date().toISOString().split('T')[0];
      const upcoming = allJobs
        .filter(j => j.status === BookingStatus.CONFIRMED && j.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));
      
      setJobs(upcoming);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao sincronizar agenda do intérprete:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [interpreterId, refreshKey]);

  // Fixed: Included refresh in the return object to satisfy component requirements
  return { jobs, loading, refresh };
};
