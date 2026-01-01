
import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  orderBy,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { Booking, Timesheet, BookingStatus } from '../types';

export const useInterpreterTimesheets = (interpreterId: string | undefined) => {
  const [pendingSubmission, setPendingSubmission] = useState<Booking[]>([]);
  const [submittedHistory, setSubmittedHistory] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!interpreterId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // 1. Monitorar Timesheets já enviados (Histórico)
    const qHistory = query(
      collection(db, 'timesheets'),
      where('interpreterId', '==', interpreterId),
      orderBy('submittedAt', 'desc')
    );

    const unsubHistory = onSnapshot(qHistory, (snapshot) => {
      const history = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Timesheet[];
      setSubmittedHistory(history);
    });

    // 2. Monitorar Bookings Passados sem Timesheet (Pendentes)
    // Simplified query to avoid requiring composite indexes
    const qAllMyBookings = query(
      collection(db, 'bookings'),
      where('interpreterId', '==', interpreterId)
    );

    const unsubPending = onSnapshot(qAllMyBookings, (snapshot) => {
      const allMyJobs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Booking[];

      const today = new Date().toISOString().split('T')[0];
      
      // Filter in-memory for past confirmed/completed jobs
      const pastJobs = allMyJobs.filter(job => 
        (job.status === BookingStatus.CONFIRMED || job.status === BookingStatus.COMPLETED) && 
        job.date < today
      );

      // Cruzar com o histórico para ver quais não têm timesheet ainda
      const pending = pastJobs.filter(job => 
        !submittedHistory.some(ts => ts.bookingId === job.id)
      );

      setPendingSubmission(pending);
      setLoading(false);
    }, (error) => {
      console.error("Error in pending timesheets listener:", error);
      setLoading(false);
    });

    return () => {
      unsubHistory();
      unsubPending();
    };
  }, [interpreterId, submittedHistory.length]);

  const submitTimesheet = async (data: Partial<Timesheet>) => {
    if (!interpreterId) return;
    
    try {
      const newTs = {
        ...data,
        interpreterId,
        status: 'SUBMITTED',
        adminApproved: false,
        submittedAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
        readyForClientInvoice: false,
        readyForInterpreterInvoice: false
      };

      await addDoc(collection(db, 'timesheets'), newTs);
      return true;
    } catch (error) {
      console.error("Erro ao enviar timesheet:", error);
      return false;
    }
  };

  return { pendingSubmission, submittedHistory, loading, submitTimesheet };
};
