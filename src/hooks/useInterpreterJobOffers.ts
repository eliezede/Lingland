
import { useState, useEffect } from 'react';
import { BookingService } from '../../services/api';
import { BookingAssignment } from '../../types';

export const useInterpreterJobOffers = (interpreterId: string | undefined) => {
  const [offers, setOffers] = useState<BookingAssignment[]>([]);
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
      const data = await BookingService.getInterpreterOffers(interpreterId);
      setOffers(data);
    } catch (err) {
      setError("Failed to load job offers");
    } finally {
      setLoading(false);
    }
  };

  const acceptOffer = async (assignmentId: string) => {
    try {
      await BookingService.acceptOffer(assignmentId);
      await loadOffers(); // Refresh list
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const declineOffer = async (assignmentId: string) => {
    try {
      await BookingService.declineOffer(assignmentId);
      // Optimistic update
      setOffers(prev => prev.filter(o => o.id !== assignmentId));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  return { offers, loading, error, acceptOffer, declineOffer, refresh: loadOffers };
};
