
import { useState, useEffect } from 'react';
import { BookingService, BillingService } from '../services/api';
import { Booking, BookingStatus, Timesheet } from '../types';

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
        const scheduledEnd = new Date(`${b.date}T${b.endTime || b.expectedEndTime || b.startTime || '23:59'}`);
        const isCompleted = scheduledEnd <= new Date();
        return b.status === BookingStatus.BOOKED && isCompleted && !hasTimesheet;
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
