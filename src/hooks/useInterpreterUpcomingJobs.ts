import { useState, useEffect } from 'react';
import { BookingService } from '../services/api';
import { Booking, BookingStatus } from '../types';

export const useInterpreterUpcomingJobs = (interpreterId: string | undefined) => {
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (interpreterId) {
      loadJobs();
    }
  }, [interpreterId]);

  const loadJobs = async () => {
    if (!interpreterId) return;
    setLoading(true);
    try {
      const data = await BookingService.getInterpreterSchedule(interpreterId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const confirmedStatuses = [BookingStatus.BOOKED, BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICED, BookingStatus.PAID];
      const upcoming = data
        .filter(job => confirmedStatuses.includes(job.status) && new Date(job.date) >= today)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setJobs(upcoming);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return { jobs, loading, refresh: loadJobs };
};
