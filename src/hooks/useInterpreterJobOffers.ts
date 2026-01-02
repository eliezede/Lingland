import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getDoc
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { BookingService } from '../services/api';
import { BookingAssignment, AssignmentStatus } from '../types';

export const useInterpreterJobOffers = (interpreterId: string | undefined) => {
  const [offers, setOffers] = useState<BookingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!interpreterId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Busca assignments com status OFFERED para este intérprete
    const q = query(
      collection(db, 'assignments'),
      where('interpreterId', '==', interpreterId),
      where('status', '==', AssignmentStatus.OFFERED)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const offersData = await Promise.all(snapshot.docs.map(async (d) => {
          const assignment = { id: d.id, ...d.data() } as BookingAssignment;
          
          // CRITICAL FIX: Use BookingService instead of raw getDoc to support mock data fallback
          if (!assignment.bookingSnapshot || !assignment.bookingSnapshot.date) {
            const booking = await BookingService.getById(assignment.bookingId);
            if (booking) {
              assignment.bookingSnapshot = booking;
            }
          }
          return assignment;
        }));

        // Filtrar apenas ofertas que conseguiram carregar o snapshot mínimo para exibição
        const validOffers = offersData.filter(o => o.bookingSnapshot && o.bookingSnapshot.date);

        // Ordenar por data do agendamento (mais próximos primeiro)
        validOffers.sort((a, b) => {
          const dateA = a.bookingSnapshot?.date || '';
          const dateB = b.bookingSnapshot?.date || '';
          return dateA.localeCompare(dateB);
        });

        setOffers(validOffers);
        setLoading(false);
      } catch (err) {
        console.error("Erro ao processar ofertas:", err);
        setError("Falha ao carregar ofertas.");
        setLoading(false);
      }
    }, (err) => {
      console.error("Erro no listener de ofertas:", err);
      // Se falhar a conexão com Firestore, tentamos carregar do service (que tem mocks)
      BookingService.getInterpreterOffers(interpreterId).then(mockOffers => {
        setOffers(mockOffers);
        setLoading(false);
      });
    });

    return () => unsubscribe();
  }, [interpreterId]);

  const acceptOffer = async (assignmentId: string) => {
    try {
      await BookingService.acceptOffer(assignmentId);
      return true;
    } catch (e) {
      console.error("Erro ao aceitar oferta:", e);
      return false;
    }
  };

  const declineOffer = async (assignmentId: string) => {
    try {
      await BookingService.declineOffer(assignmentId);
      return true;
    } catch (e) {
      console.error("Erro ao recusar oferta:", e);
      return false;
    }
  };

  return { offers, loading, error, acceptOffer, declineOffer };
};