
import { useState, useEffect } from 'react';
import { BookingService, BillingService } from '../../services/api';
import { Booking, Timesheet } from '../../types';

export const useInterpreterTimesheets = (interpreterId: string | undefined) => {
  const [pendingSubmission, setPendingSubmission] = useState<Booking[]>([]);
  const [submittedHistory, setSubmittedHistory] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (interpreterId) loadData();
  }, [interpreterId]);

  const loadData = async () => {
    if (!interpreterId) return;
    setLoading(true);
    try {
      const [schedule, timesheets] = await Promise.all([
        BookingService.getInterpreterSchedule(interpreterId),
        BillingService.getInterpreterTimesheets(interpreterId)
      ]);

      // Find completed jobs without timesheets
      // In real app: check if booking status is COMPLETED and no timesheet exists
      const pending = schedule.filter(b => {
        const hasTimesheet = timesheets.some(t => t.bookingId === b.id);
        // Simple logic: if date is in past and no timesheet
        const isPast = new Date(b.date) < new Date(); 
        return isPast && !hasTimesheet;
      });

      setPendingSubmission(pending);
      setSubmittedHistory(timesheets.sort((a,b) => (b.submittedAt ? new Date(b.submittedAt).getTime() : 0) - (a.submittedAt ? new Date(a.submittedAt).getTime() : 0)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const submitTimesheet = async (data: any) => {
    if (!interpreterId) return;
    await BillingService.submitTimesheet({ ...data, interpreterId });
    await loadData();
  };

  return { pendingSubmission, submittedHistory, loading, submitTimesheet, refresh: loadData };
};
