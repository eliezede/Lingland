
import { useState, useEffect } from 'react';
import { BookingService, BillingService } from '../services/api';
import { Booking, Timesheet } from '../types';
import {
  buildInterpreterHistory,
  InterpreterHistoryRecord,
  isPendingInterpreterTimesheet,
} from '../utils/interpreterJobLifecycle';

export const useInterpreterTimesheets = (interpreterId: string | undefined) => {
  const [pendingSubmission, setPendingSubmission] = useState<Booking[]>([]);
  const [submittedHistory, setSubmittedHistory] = useState<Timesheet[]>([]);
  const [jobHistory, setJobHistory] = useState<InterpreterHistoryRecord[]>([]);
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

      const timesheetBookingIds = new Set(timesheets.map(timesheet => timesheet.bookingId));
      const pending = schedule.filter(booking => (
        isPendingInterpreterTimesheet(booking, timesheetBookingIds)
      ));

      setPendingSubmission(pending);
      setSubmittedHistory(timesheets.sort((a,b) => (b.submittedAt ? new Date(b.submittedAt).getTime() : 0) - (a.submittedAt ? new Date(a.submittedAt).getTime() : 0)));
      setJobHistory(buildInterpreterHistory(schedule, timesheets));
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

  return { pendingSubmission, submittedHistory, jobHistory, loading, submitTimesheet, refresh: loadData };
};
