
import { useState, useEffect } from 'react';
import { BookingService } from '../services/bookingService';
import { Booking } from '../types';

export const useBookings = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await BookingService.getAll();
      // Sort by date desc
      setBookings(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (err) {
      console.error(err);
      setError("Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  };

  return { bookings, loading, error, refresh: loadData };
};
