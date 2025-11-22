
import { useState, useEffect } from 'react';
import { BookingService } from '../../services/api';
import { Booking } from '../../types';

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
      // Filter for future jobs or today
      const upcoming = data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setJobs(upcoming);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return { jobs, loading, refresh: loadJobs };
};
