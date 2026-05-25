
import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  getDoc,
  doc
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { FirestoreClientService } from '../firebase/firestoreClient';
import { BillingService } from '../services/billingService';
import { ClientService } from '../services/clientService';
import { BookingService } from '../services/bookingService';
import { InterpreterService } from '../services/interpreterService';
import { Booking, ClientInvoice, Client, InvoiceStatus } from '../types';

export const useClientBookings = (clientId: string | undefined) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    
    // Real-time listener for bookings
    const q = query(
      collection(db, "bookings"), 
      where("clientId", "==", clientId)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const photoMap = await InterpreterService.getPhotoMap();
      const data = snapshot.docs.map(doc => {
        const booking = { id: doc.id, ...doc.data() } as Booking;
        if (booking.interpreterId && !booking.interpreterPhotoUrl) {
          booking.interpreterPhotoUrl = photoMap[booking.interpreterId];
        }
        return booking;
      });
      // Sort in memory to avoid index requirements during dev
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setBookings(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching client bookings:", error);
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
    
    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as Booking;
        // Security check: ensure booking belongs to client
        if (data.clientId === clientId) {
          if (data.interpreterId && !data.interpreterPhotoUrl) {
            const photoMap = await InterpreterService.getPhotoMap();
            data.interpreterPhotoUrl = photoMap[data.interpreterId];
          }
          setBooking(data);
        } else {
          setBooking(null);
        }
      } else {
        setBooking(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching booking:", error);
      setLoading(false);
    });

    return () => unsubscribe();
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
      setLoading(false);
      return;
    }
    
    setLoading(true);
    BillingService.getClientInvoices(clientId)
      .then(data => {
        const visibleStatuses = [InvoiceStatus.SENT, InvoiceStatus.APPROVED, InvoiceStatus.PAID];
        const clientInvoices = data.filter(inv => inv.clientId === clientId && visibleStatuses.includes(inv.status));
        setInvoices(clientInvoices);
      })
      .catch(err => console.error("Error fetching invoices:", err))
      .finally(() => setLoading(false));
  }, [clientId]);

  return { invoices, loading };
};

export const useClientInvoiceById = (clientId: string | undefined, invoiceId: string | undefined) => {
  const [invoice, setInvoice] = useState<ClientInvoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId || !invoiceId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    BillingService.getClientInvoiceById(invoiceId)
      .then(data => {
        const visibleStatuses = [InvoiceStatus.SENT, InvoiceStatus.APPROVED, InvoiceStatus.PAID];
        setInvoice(data?.clientId === clientId && visibleStatuses.includes(data.status) ? data : null);
      })
      .catch(err => console.error("Error fetching invoice:", err))
      .finally(() => setLoading(false));
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
