
import {
  collection, getDocs, getDoc, doc, updateDoc,
  query, where, orderBy, serverTimestamp, writeBatch, limit
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Booking, BookingStatus, BookingAssignment, AssignmentStatus, Interpreter } from '../types';
import { ClientService } from './clientService';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseConfig';
import { PublicSessionService } from './publicSessionService';

const COLLECTION_NAME = 'bookings';
const ASSIGNMENTS_COLLECTION = 'assignments';

export const BookingService = {
  getAll: async (): Promise<Booking[]> => {
    try {
      const q = query(collection(db, COLLECTION_NAME), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
    } catch (error) {
      console.error('Failed to get all bookings', error);
      throw error;
    }
  },

  getById: async (id: string): Promise<Booking | undefined> => {
    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, id));
      if (snap.exists()) return { id: snap.id, ...snap.data() } as Booking;
      return undefined;
    } catch (error) {
      console.error('Failed to get booking by id', error);
      throw error;
    }
  },

  getByInterpreterId: async (interpreterId: string): Promise<Booking[]> => {
    try {
      const q = query(collection(db, COLLECTION_NAME), where('interpreterId', '==', interpreterId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
    } catch (e) {
      console.error('Failed to get bookings by interpreter', e);
      throw e;
    }
  },

  getJobEvents: async (jobId: string): Promise<any[]> => {
    try {
      const q = query(collection(db, 'jobEvents'), where('jobId', '==', jobId), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    } catch (error) {
      console.error('Failed to get job events', error);
      throw error;
    }
  },

  getByClientId: async (clientId: string): Promise<Booking[]> => {
    try {
      const q = query(collection(db, COLLECTION_NAME), where('clientId', '==', clientId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
    } catch (e) {
      console.error('Failed to get bookings by client', e);
      throw e;
    }
  },

  create: async (bookingData: any): Promise<Booking> => {
    const response = await httpsCallable(functions, 'createAdminBooking')(bookingData);
    const result = response.data as { success: boolean; booking: Booking };
    if (!result?.success || !result.booking?.id) throw new Error('Booking was not persisted.');
    return result.booking;
  },

  createGuestBooking: async (input: any): Promise<Booking> => {
    await PublicSessionService.ensure();
    const submit = httpsCallable(functions, 'submitPublicBookingRequest');
    const response = await submit(input);
    const result = response.data as { success: boolean; booking: Booking };
    if (!result.success || !result.booking?.id) throw new Error('Booking request was not persisted.');
    return result.booking;
  },

  updateStatus: async (id: string, status: BookingStatus): Promise<void> => {
    if (status === BookingStatus.BOOKED) {
      await BookingService.recordInterpreterResponseByStaff(id, true);
      return;
    }
    if (status === BookingStatus.SESSION_COMPLETED) {
      await BookingService.recordSessionCompletedByStaff(id);
      return;
    }
    await httpsCallable(functions, 'adminUpdateBookingStatus')({ bookingId: id, status });
  },

  update: async (id: string, data: Partial<Booking>): Promise<void> => {
    try {
      await updateDoc(doc(db, COLLECTION_NAME, id), { ...data, updatedAt: serverTimestamp() });
    } catch (error) {
      console.warn('Firebase update failed', error);
      throw error;
    }
  },

  assignInterpreterToBooking: async (bookingId: string, interpreterId: string): Promise<void> => {
    await httpsCallable(functions, 'adminAssignmentAction')({ action: 'ASSIGN', bookingId, interpreterId });
  },

  unassignInterpreterFromBooking: async (bookingId: string, reason?: string): Promise<void> => {
    await httpsCallable(functions, 'adminAssignmentAction')({ action: 'UNASSIGN', bookingId, reason });
  },

  findInterpretersByLanguage: async (language: string): Promise<Interpreter[]> => {
    try {
      const snap = await getDocs(query(collection(db, 'interpreters'), where('status', '==', 'ACTIVE')));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Interpreter));
      return all.filter(i => i.languages.some(l => l.toLowerCase().includes(language.toLowerCase())));
    } catch (error) {
      console.error('Failed to load interpreters by language', error);
      throw error;
    }
  },

  getAssignmentsByBookingId: async (bookingId: string, interpreterId?: string): Promise<BookingAssignment[]> => {
    try {
      const q = interpreterId
        ? query(
          collection(db, ASSIGNMENTS_COLLECTION),
          where('bookingId', '==', bookingId),
          where('interpreterId', '==', interpreterId)
        )
        : query(collection(db, ASSIGNMENTS_COLLECTION), where('bookingId', '==', bookingId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as BookingAssignment));
    } catch (error) {
      console.error('Failed to load booking assignments', error);
      throw error;
    }
  },

  ensureInterpreterAssignment: async (bookingId: string, interpreterId: string): Promise<BookingAssignment> => {
    const existing = await BookingService.getAssignmentsByBookingId(bookingId, interpreterId);
    const match = existing.find(a => a.interpreterId === interpreterId && [AssignmentStatus.OFFERED, AssignmentStatus.ACCEPTED].includes(a.status));
    if (match) return match;

    const ensureAssignment = httpsCallable(functions, 'ensureOwnAssignment');
    const response = await ensureAssignment({ bookingId });
    const assignment = response.data as BookingAssignment;
    if (!assignment?.id || assignment.interpreterId !== interpreterId) {
      throw new Error('The assignment could not be recovered for this interpreter.');
    }
    return assignment;
  },

  createAssignment: async (bookingId: string, interpreterId: string): Promise<BookingAssignment> => {
    await BookingService.assignInterpreterToBooking(bookingId, interpreterId);
    const assignments = await BookingService.getAssignmentsByBookingId(bookingId);
    const created = assignments.find(assignment => assignment.interpreterId === interpreterId && assignment.status === AssignmentStatus.OFFERED);
    if (!created) throw new Error('Assignment was not persisted.');
    return created;
  },

  getRecentBookings: async (limitCount: number = 5): Promise<Booking[]> => {
    try {
      const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'), limit(limitCount));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
    } catch (error) {
      console.error('Failed to get recent bookings', error);
      throw error;
    }
  },

  checkScheduleConflict: async (interpreterId: string, date: string, startTime: string, durationMinutes: number, excludeBookingId?: string): Promise<Booking | null> => {
    try {
      const q = query(collection(db, COLLECTION_NAME), where('interpreterId', '==', interpreterId), where('date', '==', date));
      const snap = await getDocs(q);
      const nonConflictStatuses = new Set<string>([BookingStatus.CANCELLED]);
      const bookings = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Booking))
        .filter(b => !nonConflictStatuses.has(String(b.status)));

      const targetStart = new Date(`${date}T${startTime}`);
      const targetEnd = new Date(targetStart.getTime() + durationMinutes * 60000);

      for (const existing of bookings) {
        if (existing.id === excludeBookingId) continue;
        const existingStart = new Date(`${existing.date}T${existing.startTime}`);
        const existingEnd = new Date(existingStart.getTime() + existing.durationMinutes * 60000);
        if (targetStart < existingEnd && targetEnd > existingStart) return existing;
      }
      return null;
    } catch (error) {
      console.error('Failed to check interpreter schedule conflicts', error);
      throw error;
    }
  },

  getInterpreterOffers: async (interpreterId: string): Promise<BookingAssignment[]> => {
    try {
      const q = query(collection(db, ASSIGNMENTS_COLLECTION), where('interpreterId', '==', interpreterId), where('status', '==', AssignmentStatus.OFFERED));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as BookingAssignment));
    } catch (error) {
      console.error('Failed to get interpreter offers', error);
      throw error;
    }
  },

  getInterpreterSchedule: async (interpreterId: string): Promise<Booking[]> => {
    try {
      const q = query(collection(db, COLLECTION_NAME), where('interpreterId', '==', interpreterId));
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
      return all.filter(b => [
        BookingStatus.OPENED,
        BookingStatus.ASSIGNMENT_PENDING,
        'PENDING_ASSIGNMENT' as any,
        BookingStatus.BOOKED,
        BookingStatus.SESSION_COMPLETED,
        BookingStatus.TIMESHEET_SUBMITTED,
        BookingStatus.TIMESHEET_VERIFIED,
        BookingStatus.READY_FOR_INVOICE,
        BookingStatus.INVOICING,
        BookingStatus.INVOICED,
        BookingStatus.PAID,
        BookingStatus.CANCELLED,
      ].includes(b.status)).sort((a, b) => `${a.date}T${a.startTime || ''}`.localeCompare(`${b.date}T${b.startTime || ''}`));
    } catch (error) {
      console.error('Failed to get interpreter schedule', error);
      throw error;
    }
  },

  recordInterpreterResponseByStaff: async (bookingId: string, accepted: boolean): Promise<void> => {
    await httpsCallable(functions, 'adminAssignmentAction')({ action: 'RECORD_RESPONSE', bookingId, accepted });
  },

  recordSessionCompletedByStaff: async (bookingId: string): Promise<void> => {
    await httpsCallable(functions, 'adminAssignmentAction')({ action: 'COMPLETE_SESSION', bookingId });
  },

  acceptOffer: async (assignmentId: string): Promise<void> => {
    try {
      const respond = httpsCallable(functions, 'respondToAssignment');
      await respond({ assignmentId, response: AssignmentStatus.ACCEPTED });
    } catch (e) {
      console.error('Failed to accept offer', e);
      throw e;
    }
  },

  declineOffer: async (assignmentId: string): Promise<void> => {
    try {
      const respond = httpsCallable(functions, 'respondToAssignment');
      await respond({ assignmentId, response: AssignmentStatus.DECLINED });
    } catch (e) {
      console.error('Failed to decline offer', e);
      throw e;
    }
  },

  linkClientToBooking: async (bookingId: string, clientId: string): Promise<void> => {
    try {
      const client = await ClientService.getById(clientId);
      await updateDoc(doc(db, COLLECTION_NAME, bookingId), {
        clientId,
        ...(client?.companyName ? { clientName: client.companyName } : {}),
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Failed to link client to booking', e);
      throw e;
    }
  },

  linkOrphanedBookings: async (email: string, clientId: string): Promise<number> => {
    let count = 0;
    try {
      const client = await ClientService.getById(clientId);
      const originalEmail = email.trim();
      const normalizedEmail = originalEmail.toLowerCase();
      const queries = [normalizedEmail, originalEmail]
        .filter((value, index, arr) => value && arr.indexOf(value) === index)
        .map(value => query(collection(db, COLLECTION_NAME), where('guestContact.email', '==', value)));
      const snapshots = await Promise.all(queries.map(getDocs));
      const docsById = new Map<string, any>();
      snapshots.forEach(snap => snap.docs.forEach(d => docsById.set(d.id, d)));
      const batch = writeBatch(db);

      docsById.forEach(d => {
        const data = d.data();
        if (data.clientId !== clientId) {
          batch.update(d.ref, {
            clientId,
            clientName: client?.companyName || data.clientName || data.guestContact?.organisation || data.guestContact?.name || 'Client',
            updatedAt: serverTimestamp()
          });
          count++;
        }
      });

      if (count > 0) await batch.commit();
      return count;
    } catch (e) {
      console.error('Failed to link orphaned bookings', e);
      throw e;
    }
  },

  delete: async (id: string): Promise<void> => {
    await httpsCallable(functions, 'deletePlatformEntity')({ entityType: 'BOOKING', id });
  }
};
