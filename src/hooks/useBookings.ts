import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { Booking } from '../types';

export const useBookings = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'bookings'), orderBy('date', 'desc'));

    // Inscrição em tempo real
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Booking[];
      
      setBookings(data);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error("Erro no listener de bookings:", err);
      setError("Falha ao sincronizar dados com o servidor.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  /* Add refresh function to satisfy AdminBookings.tsx component needs */
  const refresh = useCallback(() => {
    setLoading(true);
    // Since onSnapshot is real-time, we just simulate a brief loading state
    setTimeout(() => setLoading(false), 500);
  }, []);

  return { bookings, loading, error, refresh };
};