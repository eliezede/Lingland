
import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getDoc,
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { BookingAssignment, AssignmentStatus, BookingStatus } from '../types';

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
          
          // Se não houver snapshot do booking no documento, buscamos o booking real
          // para garantir que os dados de exibição (data, hora, local) estejam atualizados
          if (!assignment.bookingSnapshot || !assignment.bookingSnapshot.date) {
            const bookingDoc = await getDoc(doc(db, 'bookings', assignment.bookingId));
            if (bookingDoc.exists()) {
              assignment.bookingSnapshot = bookingDoc.data();
            }
          }
          return assignment;
        }));

        // Ordenar por data do agendamento (mais próximos primeiro)
        offersData.sort((a, b) => {
          const dateA = a.bookingSnapshot?.date || '';
          const dateB = b.bookingSnapshot?.date || '';
          return dateA.localeCompare(dateB);
        });

        setOffers(offersData);
        setLoading(false);
      } catch (err) {
        console.error("Erro ao processar ofertas:", err);
        setError("Falha ao carregar ofertas.");
        setLoading(false);
      }
    }, (err) => {
      console.error("Erro no listener de ofertas:", err);
      setError("Conexão perdida com o servidor de ofertas.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [interpreterId]);

  const acceptOffer = async (assignmentId: string) => {
    try {
      const assignmentRef = doc(db, 'assignments', assignmentId);
      const assignmentSnap = await getDoc(assignmentRef);
      
      if (!assignmentSnap.exists()) throw new Error("Oferta não encontrada.");
      const assignmentData = assignmentSnap.data() as BookingAssignment;

      // 1. Atualiza o Assignment para ACCEPTED
      await updateDoc(assignmentRef, {
        status: AssignmentStatus.ACCEPTED,
        respondedAt: new Date().toISOString()
      });

      // 2. Atualiza o Booking para CONFIRMED e vincula o Intérprete
      const bookingRef = doc(db, 'bookings', assignmentData.bookingId);
      await updateDoc(bookingRef, {
        status: BookingStatus.CONFIRMED,
        interpreterId: assignmentData.interpreterId,
        updatedAt: serverTimestamp()
      });

      return true;
    } catch (e) {
      console.error("Erro ao aceitar oferta:", e);
      return false;
    }
  };

  const declineOffer = async (assignmentId: string) => {
    try {
      const assignmentRef = doc(db, 'assignments', assignmentId);
      await updateDoc(assignmentRef, {
        status: AssignmentStatus.DECLINED,
        respondedAt: new Date().toISOString()
      });
      return true;
    } catch (e) {
      console.error("Erro ao recusar oferta:", e);
      return false;
    }
  };

  return { offers, loading, error, acceptOffer, declineOffer };
};
