import { useState, useEffect } from 'react';
import { BookingService } from '../services/api';
import { Booking } from '../types';
import { isUpcomingInterpreterBooking } from '../utils/interpreterJobLifecycle';

export const useInterpreterUpcomingJobs = (interpreterId: string | undefined) => {
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (interpreterId) {
      void loadJobs();
    } else {
      setJobs([]);
      setLoading(false);
    }
  }, [interpreterId]);

  const loadJobs = async () => {
    if (!interpreterId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await BookingService.getInterpreterSchedule(interpreterId);
      const upcoming = data
        .filter(job => isUpcomingInterpreterBooking(job))
        .sort((a, b) => `${a.date}T${a.startTime || ''}`.localeCompare(`${b.date}T${b.startTime || ''}`));
      setJobs(upcoming);
    } catch (err) {
      console.error(err);
      setError('Confirmed jobs could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  return { jobs, loading, error, refresh: loadJobs };
};
