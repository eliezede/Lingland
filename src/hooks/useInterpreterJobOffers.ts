import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { BookingService } from '../services/api';
import { BookingAssignment, AssignmentStatus } from '../types';

export const useInterpreterJobOffers = (interpreterId: string | undefined) => {
  const [offers, setOffers] = useState<BookingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!interpreterId) return;
    try {
      const data = await BookingService.getInterpreterOffers(interpreterId);
      setOffers(data);
    } catch (err) {
      console.error("Erro ao carregar ofertas via Service:", err);
    } finally {
      setLoading(false);
    }
  }, [interpreterId]);

  useEffect(() => {
    if (!interpreterId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Listener em tempo real para mudanças de status ou novas ofertas
    const q = query(
      collection(db, 'assignments'),
      where('interpreterId', '==', interpreterId),
      where('status', '==', AssignmentStatus.OFFERED)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Sempre que houver mudança no Firestore, recarregamos via Service 
      // para aproveitar a lógica de população de snapshots e fallbacks
      loadData();
    }, (err) => {
      console.warn("Firestore listener falhou, operando em modo offline/mock.");
      loadData();
    });

    return () => unsubscribe();
  }, [interpreterId, loadData]);

  const acceptOffer = async (assignmentId: string) => {
    try {
      await BookingService.acceptOffer(assignmentId);
      // Remove localmente para feedback instantâneo enquanto o listener não dispara
      setOffers(prev => prev.filter(o => o.id !== assignmentId));
      return true;
    } catch (e) {
      console.error("Erro ao aceitar oferta:", e);
      return false;
    }
  };

  const declineOffer = async (assignmentId: string) => {
    try {
      await BookingService.declineOffer(assignmentId);
      setOffers(prev => prev.filter(o => o.id !== assignmentId));
      return true;
    } catch (e) {
      console.error("Erro ao recusar oferta:", e);
      return false;
    }
  };

  return { offers, loading, error, acceptOffer, declineOffer, refresh: loadData };
};