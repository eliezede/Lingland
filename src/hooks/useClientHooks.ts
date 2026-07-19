
import { useState, useEffect, useCallback } from 'react';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { FirestoreClientService } from '../firebase/firestoreClient';
import { ClientPortalService } from '../services/clientPortalService';
import { InterpreterService } from '../services/interpreterService';
import { Booking, ClientInvoice, Client } from '../types';

export const useClientBookings = (clientId: string | undefined) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!clientId) {
      setBookings([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    Promise.all([
      ClientPortalService.getBookings(),
      InterpreterService.getPhotoMap(),
    ])
      .then(([data, photoMap]) => {
        if (!active) return;
        setBookings(data.map(booking => (
          booking.interpreterId && !booking.interpreterPhotoUrl
            ? { ...booking, interpreterPhotoUrl: photoMap[booking.interpreterId] }
            : booking
        )));
      })
      .catch(error => {
        if (!active) return;
        console.error('Error fetching scoped client bookings:', error);
        setBookings([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [clientId, revision]);

  return { bookings, loading, refresh };
};

export const useClientBookingById = (clientId: string | undefined, bookingId: string | undefined) => {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId || !bookingId) {
      setBooking(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    Promise.all([
      ClientPortalService.getBooking(bookingId),
      InterpreterService.getPhotoMap(),
    ])
      .then(([data, photoMap]) => {
        if (!active) return;
        setBooking(data.interpreterId && !data.interpreterPhotoUrl
          ? { ...data, interpreterPhotoUrl: photoMap[data.interpreterId] }
          : data);
      })
      .catch(error => {
        if (!active) return;
        console.error('Error fetching scoped client booking:', error);
        setBooking(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [clientId, bookingId]);

  return { booking, loading };
};

export const useCreateClientBooking = () => {
  const createBooking = async (bookingData: Partial<Booking>) => {
    // Use the Firestore write service
    return await FirestoreClientService.createBookingRequest(bookingData as any);
  };

  return { createBooking };
};

export const useClientInvoices = (clientId: string | undefined) => {
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    ClientPortalService.getInvoices()
      .then(data => {
        if (active) setInvoices(data);
      })
      .catch(error => {
        if (!active) return;
        console.error('Error fetching scoped client invoices:', error);
        setInvoices([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [clientId]);

  return { invoices, loading };
};

export const useClientInvoiceById = (clientId: string | undefined, invoiceId: string | undefined) => {
  const [invoice, setInvoice] = useState<ClientInvoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId || !invoiceId) {
      setInvoice(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    ClientPortalService.getInvoice(invoiceId)
      .then(data => {
        if (active) setInvoice(data);
      })
      .catch(error => {
        if (!active) return;
        console.error('Error fetching scoped client invoice:', error);
        setInvoice(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [clientId, invoiceId]);

  return { invoice, loading };
};

export const useClientProfile = (clientId: string | undefined) => {
  const [profile, setProfile] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const docRef = doc(db, "clients", clientId);
    getDoc(docRef).then(docSnap => {
      if (docSnap.exists()) {
        setProfile({ id: docSnap.id, ...docSnap.data() } as Client);
      } else {
        setProfile(null);
      }
    })
    .catch(err => console.error(err))
    .finally(() => setLoading(false));
  }, [clientId]);

  return { profile, loading };
};
