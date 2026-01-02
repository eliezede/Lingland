import { useState, useEffect, useCallback } from 'react';
import { BookingService } from '../services/api';
import { Booking, BookingStatus } from '../types';

export const useBookings = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await BookingService.getAll();
      
      // Normalização defensiva dos dados
      const normalizedData = (data ?? []).map(b => ({
        ...b,
        clientName: b?.clientName ?? 'Unknown Client',
        status: b?.status ?? BookingStatus.REQUESTED,
        bookingRef: b?.bookingRef ?? '',
        languageTo: b?.languageTo ?? 'TBD'
      })) as Booking[];
      
      setBookings(normalizedData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (err) {
      console.error(err);
      setError("Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { bookings, loading, error, refresh: loadData };
};