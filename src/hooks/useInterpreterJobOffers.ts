import { useState, useEffect } from 'react';
import { BookingService } from '../services/api';
import { AssignmentStatus, BookingAssignment } from '../types';

export const useInterpreterJobOffers = (interpreterId: string | undefined) => {
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (interpreterId) {
      loadOffers();
    }
  }, [interpreterId]);

  const loadOffers = async () => {
    if (!interpreterId) return;
    setLoading(true);
    try {
      const [offerList, schedule] = await Promise.all([
        BookingService.getInterpreterOffers(interpreterId),
        BookingService.getInterpreterSchedule(interpreterId)
      ]);

      const isPending = (s: string) => s === 'OPENED' || s === 'PENDING_ASSIGNMENT' || s === 'ASSIGNMENT_PENDING';
      const assignmentByBooking = new Map(offerList.map((assignment: BookingAssignment) => [assignment.bookingId, assignment]));
      const directPending = schedule
        .filter((b: any) => isPending(b.status as string))
        .map(b => ({ ...b, _isDirect: true, _assignmentId: assignmentByBooking.get(b.id)?.id }));

      // Enrol broadcast offers (fetching full booking details if missing)
      const enrichedOffers: any[] = await Promise.all(
        offerList.map(async (assignment: any) => {
          const bookingId = assignment.bookingId;
          const offerBase = { _isBroadcast: true, _assignmentId: assignment.id };

          if (!bookingId) {
            return { ...(assignment.bookingSnapshot || assignment), id: assignment.id, ...offerBase };
          }
          try {
            const booking = await BookingService.getById(bookingId);
            if (booking) {
              return { ...booking, ...offerBase };
            }
          } catch {/* ignore */ }
          return { ...(assignment.bookingSnapshot || assignment), id: assignment.id, ...offerBase };
        })
      );

      const directIds = new Set(directPending.map((b: any) => b.id));
      setOffers([...directPending, ...enrichedOffers.filter(offer => !directIds.has(offer.id))]);
    } catch (err) {
      setError("Failed to load job offers");
    } finally {
      setLoading(false);
    }
  };

  const acceptOffer = async (id: string, isDirect?: boolean, assignmentId?: string) => {
    try {
      if (isDirect) {
        const assignments = await BookingService.getAssignmentsByBookingId(id);
        const directAssignment = assignments.find((assignment: BookingAssignment) => assignment.interpreterId === interpreterId && assignment.status === AssignmentStatus.OFFERED);
        if (directAssignment?.id) {
          await BookingService.acceptOffer(directAssignment.id);
        } else {
          const recoveredAssignment = await BookingService.ensureInterpreterAssignment(id, interpreterId!);
          await BookingService.acceptOffer(recoveredAssignment.id);
        }
      } else {
        await BookingService.acceptOffer(assignmentId || id);
      }
      await loadOffers(); // Refresh list
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const declineOffer = async (id: string, isDirect?: boolean, assignmentId?: string) => {
    try {
      if (isDirect) {
        const assignments = await BookingService.getAssignmentsByBookingId(id);
        const directAssignment = assignments.find((assignment: BookingAssignment) => assignment.interpreterId === interpreterId && assignment.status === AssignmentStatus.OFFERED);
        const targetAssignment = directAssignment || await BookingService.ensureInterpreterAssignment(id, interpreterId!);
        await BookingService.declineOffer(targetAssignment.id);
      } else {
        await BookingService.declineOffer(assignmentId || id);
      }
      // Optimistic update
      setOffers(prev => prev.filter(o => o.id !== id && o._assignmentId !== (assignmentId || id)));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  return { offers, loading, error, acceptOffer, declineOffer, refresh: loadOffers };
};
