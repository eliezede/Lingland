
import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  getDoc,
  doc,
  orderBy
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { Booking, Client } from '../types';

export const useClientBookings = (clientId: string | undefined) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    
    const q = query(
      collection(db, "bookings"), 
      where("clientId", "==", clientId),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setBookings(data);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao sincronizar bookings do cliente:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [clientId]);

  return { bookings, loading };
};

export const useClientBookingById = (clientId: string | undefined, bookingId: string | undefined) => {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId || !bookingId) {
      setLoading(false);
      return;
    }
    
    const docRef = doc(db, "bookings", bookingId);
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as Booking;
        // Garantia de segurança no front: o booking deve pertencer ao cliente
        if (data.clientId === clientId) {
          setBooking(data);
        } else {
          setBooking(null);
        }
      } else {
        setBooking(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Erro ao buscar detalhes do agendamento:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [clientId, bookingId]);

  return { booking, loading };
};

export const useClientProfile = (clientId: string | undefined) => {
  const [profile, setProfile] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }

    const docRef = doc(db, "clients", clientId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setProfile({ id: docSnap.id, ...docSnap.data() } as Client);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [clientId]);

  return { profile, loading };
};
