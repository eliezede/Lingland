import { useState, useEffect } from 'react';
import { BookingService } from '../services/api';
import { Booking } from '../types';
import { isUpcomingInterpreterBooking } from '../utils/interpreterJobLifecycle';

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
      const upcoming = data
        .filter(job => isUpcomingInterpreterBooking(job))
        .sort((a, b) => `${a.date}T${a.startTime || ''}`.localeCompare(`${b.date}T${b.startTime || ''}`));
      setJobs(upcoming);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return { jobs, loading, refresh: loadJobs };
};
