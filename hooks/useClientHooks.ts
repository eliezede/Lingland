
import { useState, useEffect } from 'react';
import { BookingService, BillingService, ClientService } from '../services/api';
import { Booking, ClientInvoice, Client } from '../types';

export const useClientBookings = (clientId: string | undefined) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    
    // Use Mock API
    BookingService.getByClientId(clientId)
      .then(data => {
        // Sort desc
        const sorted = data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setBookings(sorted);
      })
      .catch(err => console.error("Error loading client bookings", err))
      .finally(() => setLoading(false));

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
    
    BookingService.getById(bookingId)
      .then(data => {
        if (data && data.clientId === clientId) {
          setBooking(data);
        } else {
          setBooking(null);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [clientId, bookingId]);

  return { booking, loading };
};

export const useCreateClientBooking = () => {
  const createBooking = async (bookingData: Partial<Booking>) => {
    // Use Mock API
    return await BookingService.create(bookingData as any);
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
    BillingService.getClientInvoices()
      .then(data => {
        const clientInvoices = data.filter(inv => inv.clientId === clientId);
        setInvoices(clientInvoices);
      })
      .catch(err => console.error("Error fetching invoices:", err))
      .finally(() => setLoading(false));
  }, [clientId]);

  return { invoices, loading };
};

export const useClientInvoiceById = (invoiceId: string | undefined) => {
  const [invoice, setInvoice] = useState<ClientInvoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!invoiceId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    BillingService.getClientInvoiceById(invoiceId)
      .then(data => setInvoice(data))
      .catch(err => console.error("Error fetching invoice:", err))
      .finally(() => setLoading(false));
  }, [invoiceId]);

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
    ClientService.getById(clientId)
      .then(data => setProfile(data || null))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [clientId]);

  return { profile, loading };
};
