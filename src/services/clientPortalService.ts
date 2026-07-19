import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseConfig';
import type { Booking, ClientInvoice } from '../types';

const call = async <TRequest, TResponse>(name: string, data: TRequest): Promise<TResponse> => {
  const callable = httpsCallable<TRequest, TResponse>(functions, name);
  return (await callable(data)).data;
};

export const ClientPortalService = {
  getBookings: () => call<Record<string, never>, Booking[]>('getMyClientBookings', {}),

  getBooking: (bookingId: string) => (
    call<{ bookingId: string }, Booking>('getMyClientBooking', { bookingId })
  ),

  getInvoices: () => call<Record<string, never>, ClientInvoice[]>('getMyClientInvoices', {}),

  getInvoice: (invoiceId: string) => (
    call<{ invoiceId: string }, ClientInvoice>('getMyClientInvoice', { invoiceId })
  ),

  linkLegacyBookings: () => (
    call<Record<string, never>, { linked: number; skipped: boolean }>('linkMyLegacyBookings', {})
  ),
};
