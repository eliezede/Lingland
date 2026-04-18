
import {
  collection, getDocs, getDoc, doc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, writeBatch, limit
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Booking, BookingStatus, BookingAssignment, AssignmentStatus, Interpreter, NotificationType, Client } from '../types';
import { ClientService } from './clientService';
import { MOCK_INTERPRETERS, MOCK_ASSIGNMENTS, saveMockData, MOCK_BOOKINGS, MOCK_USERS } from './mockData';
import { NotificationService } from './notificationService';
import { EmailService } from './emailService';

const COLLECTION_NAME = 'bookings';
const ASSIGNMENTS_COLLECTION = 'assignments';

// Helper: find the Firebase Auth user document for an interpreter by their profile ID.
// Falls back to MOCK_USERS for local dev.
const getInterpreterUser = async (interpreterId: string): Promise<{ id: string; email?: string; displayName?: string } | undefined> => {
  try {
    const q = query(collection(db, 'users'), where('profileId', '==', interpreterId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...(d.data() as any) };
    }
  } catch (_) { /* fall through to mock */ }
  return MOCK_USERS.find(u => u.profileId === interpreterId) as any;
};

// Helper: Get all users with ADMIN or SUPER_ADMIN role for notifications
const getAdminUsers = async (): Promise<{ id: string; email: string }[]> => {
  try {
    const q = query(collection(db, 'users'), where('role', 'in', ['ADMIN', 'SUPER_ADMIN']));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  } catch (error) {
    console.error("Failed to fetch admin users for notification", error);
    return MOCK_USERS.filter(u => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') as any;
  }
};

export const BookingService = {
  getAll: async (): Promise<Booking[]> => {
    try {
      const q = query(collection(db, COLLECTION_NAME), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
    } catch (error) {
      console.error('Failed to get all bookings', error);
      return [];
    }
  },

  getById: async (id: string): Promise<Booking | undefined> => {
    try {
      const snap = await getDoc(doc(db, COLLECTION_NAME, id));
      if (snap.exists()) return { id: snap.id, ...snap.data() } as Booking;
      return undefined;
    } catch (error) {
      console.error('Failed to get booking by id', error);
      return undefined;
    }
  },

  getByInterpreterId: async (interpreterId: string): Promise<Booking[]> => {
    try {
      const q = query(collection(db, COLLECTION_NAME), where('interpreterId', '==', interpreterId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
    } catch (e) {
      console.error('Failed to get bookings by interpreter', e);
      return [];
    }
  },

  getJobEvents: async (jobId: string): Promise<any[]> => {
    try {
      const q = query(collection(db, 'jobEvents'), where('jobId', '==', jobId), orderBy('createdAt', 'asc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    } catch {
      return [];
    }
  },

  getByClientId: async (clientId: string): Promise<Booking[]> => {
    try {
      const q = query(collection(db, COLLECTION_NAME), where('clientId', '==', clientId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
    } catch (e) {
      console.error('Failed to get bookings by client', e);
      return [];
    }
  },

  create: async (bookingData: any): Promise<Booking> => {
    const newBooking = { 
      ...bookingData, 
      status: bookingData.status || BookingStatus.INCOMING,
      organizationId: bookingData.organizationId || 'lingland-main',
      createdAt: serverTimestamp(), 
      updatedAt: serverTimestamp() 
    };
    try {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), newBooking);

      // Notify Admin
      const admins = await getAdminUsers();
      admins.forEach(admin => {
        NotificationService.notify(admin.id, 'New Booking Request', `Client ${bookingData.clientName} requested a ${bookingData.languageTo} interpreter for ${bookingData.date}.`, NotificationType.INFO, `/admin/bookings/${docRef.id}`);
      });

      // Email System
      await EmailService.sendStatusEmail({ ...newBooking, id: docRef.id } as Booking, BookingStatus.INCOMING);

      return { id: docRef.id, ...newBooking } as unknown as Booking;
    } catch (e) {
      console.error('Failed to create booking', e);
      throw e;
    }
  },

  createGuestBooking: async (input: any): Promise<Booking> => {
    const bookingRef = `LL-${Math.floor(1000 + Math.random() * 9000)}`;
    
    let expectedEndTime = '';
    if (input.startTime && input.durationMinutes) {
      const start = new Date(`2000-01-01T${input.startTime}`);
      const end = new Date(start.getTime() + input.durationMinutes * 60000);
      expectedEndTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    // 1. Handle Client Association
    let clientId = '';
    const email = input.guestContact?.email;
    if (email) {
      const existingClient = await ClientService.getByEmail(email);
      if (existingClient) {
        clientId = existingClient.id;
      } else {
        const newGuestClient = await ClientService.createClientFromGuest(input.guestContact);
        clientId = newGuestClient.id;
      }
    }

    const newBooking = {
      ...input,
      clientId, // Linked to the new or existing GUEST client
      bookingRef,
      status: BookingStatus.INCOMING,
      expectedEndTime,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), newBooking);

      // Notify Admin
      const admins = await getAdminUsers();
      admins.forEach(admin => {
        NotificationService.notify(admin.id, 'New Guest Booking', `Reference ${bookingRef}: New request for ${input.languageTo}.`, NotificationType.URGENT, `/admin/bookings/${docRef.id}`);
      });

      // Email System
      await EmailService.sendStatusEmail({ ...newBooking, id: docRef.id } as Booking, BookingStatus.INCOMING);

      return { id: docRef.id, ...newBooking } as unknown as Booking;
    } catch (e) {
      console.error('Failed to create guest booking', e);
      throw e;
    }
  },

  updateStatus: async (id: string, status: BookingStatus): Promise<void> => {
    try {
      await updateDoc(doc(db, COLLECTION_NAME, id), { status, updatedAt: serverTimestamp() });

      const booking = await BookingService.getById(id);
      if (booking) {
        let intEmail = '';
        if (booking.interpreterId) {
          const intUser = await getInterpreterUser(booking.interpreterId);
          const intSnap = await getDoc(doc(db, 'interpreters', booking.interpreterId));
          const intDirectEmail = intSnap.exists() ? (intSnap.data() as any).email : '';
          intEmail = intDirectEmail || intUser?.email || '';
        }
        await EmailService.sendStatusEmail(booking, status, {
          interpreterId: booking.interpreterId,
          interpreterName: booking.interpreterName,
          interpreterEmail: intEmail
        });
      }
    } catch (e) {
      console.warn('Firebase updateStatus failed', e);
      throw e;
    }
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
    try {
      const bookingRef = doc(db, COLLECTION_NAME, bookingId);
      const bookingSnap = await getDoc(bookingRef);
      const bookingData = { ...bookingSnap.data(), id: bookingId } as Booking;

      // Fetch interpreter name AND email from Firestore interpreters collection
      const intSnap = await getDoc(doc(db, 'interpreters', interpreterId));
      const intData = intSnap.exists() ? (intSnap.data() as Interpreter) : undefined;
      const intName = intData?.name || 'Unknown';
      const intEmail = intData?.email || '';

      // Update booking to OPENED (Pending Interpreter Verification/Acceptance)
      await updateDoc(bookingRef, {
        status: BookingStatus.OPENED,
        interpreterId: interpreterId,
        interpreterName: intName,
        interpreterPhotoUrl: intData?.photoUrl || null,
        updatedAt: serverTimestamp()
      });

      // Cancel/Decline other pending offers for this booking
      const assignmentsQuery = query(collection(db, ASSIGNMENTS_COLLECTION),
        where('bookingId', '==', bookingId),
        where('status', '==', AssignmentStatus.OFFERED)
      );
      const assignmentsSnap = await getDocs(assignmentsQuery);
      const batch = writeBatch(db);
      assignmentsSnap.docs.forEach(d => {
        if (d.data().interpreterId !== interpreterId) {
          batch.update(d.ref, { status: AssignmentStatus.DECLINED, respondedAt: new Date().toISOString() });
        } else {
          batch.update(d.ref, { status: AssignmentStatus.ACCEPTED, respondedAt: new Date().toISOString() });
        }
      });
      await batch.commit();

      // Notify Interpreter (real Firestore user lookup)
      const interpreterUser = await getInterpreterUser(interpreterId);
      if (interpreterUser) {
        NotificationService.notify(interpreterUser.id, 'Job Confirmed', `Your assignment for ${bookingData?.languageTo || 'Job'} on ${bookingData?.date} is officially confirmed.`, NotificationType.SUCCESS, `/interpreter/jobs/${bookingId}`);
      }

      // Email to Interpreter
      await EmailService.sendStatusEmail(bookingData, BookingStatus.OPENED, {
        interpreterId: interpreterId,
        interpreterName: intName,
        interpreterEmail: intEmail || interpreterUser?.email
      });

    } catch (e) {
      console.error('Failed to assign interpreter', e);
      throw e;
    }
  },

  unassignInterpreterFromBooking: async (bookingId: string, reason?: string): Promise<void> => {
    try {
      const bookingRef = doc(db, COLLECTION_NAME, bookingId);
      const bookingSnap = await getDoc(bookingRef);
      if (!bookingSnap.exists()) throw new Error('Booking not found');

      const bookingData = { id: bookingId, ...bookingSnap.data() } as Booking;
      const interpreterId = bookingData.interpreterId;

      // Update booking: reset status to INCOMING so admin can re-allocate
      await updateDoc(bookingRef, {
        status: BookingStatus.INCOMING,
        interpreterId: null,
        interpreterName: null,
        interpreterPhotoUrl: null,
        updatedAt: serverTimestamp()
      });

      // Update assignment: mark as DECLINED or CANCELLED if exists
      if (interpreterId) {
        const assignmentsQuery = query(collection(db, ASSIGNMENTS_COLLECTION),
          where('bookingId', '==', bookingId),
          where('interpreterId', '==', interpreterId)
        );
        const assignmentsSnap = await getDocs(assignmentsQuery);
        const batch = writeBatch(db);
        assignmentsSnap.docs.forEach(d => {
          batch.update(d.ref, { status: AssignmentStatus.DECLINED, respondedAt: new Date().toISOString() });
        });
        await batch.commit();

        // Notify Interpreter
        const interpreterUser = await getInterpreterUser(interpreterId);
        if (interpreterUser) {
          NotificationService.notify(
            interpreterUser.id,
            'Assignment Removed',
            `You have been unassigned from the job on ${bookingData.date}. Please check your portal for updates.`,
            NotificationType.URGENT,
            '/interpreter/jobs'
          );

          // Send Email
          await EmailService.sendStatusEmail({ ...bookingData, status: BookingStatus.CANCELLED }, BookingStatus.CANCELLED, {
            interpreterId: interpreterId,
            interpreterName: bookingData.interpreterName || 'Interpreter',
            interpreterEmail: interpreterUser.email,
            cancelReason: reason || 'Administrative reshuffling or client request'
          });
        }
      }
    } catch (e) {
      console.error('Failed to unassign interpreter', e);
      throw e;
    }
  },

  findInterpretersByLanguage: async (language: string): Promise<Interpreter[]> => {
    try {
      const snap = await getDocs(query(collection(db, 'interpreters'), where('status', '==', 'ACTIVE')));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Interpreter));
      return all.filter(i => i.languages.some(l => l.toLowerCase().includes(language.toLowerCase())));
    } catch (error) {
      return MOCK_INTERPRETERS.filter(i => i.languages.some(l => l.toLowerCase().includes(language.toLowerCase())));
    }
  },

  getAssignmentsByBookingId: async (bookingId: string): Promise<BookingAssignment[]> => {
    try {
      const q = query(collection(db, ASSIGNMENTS_COLLECTION), where('bookingId', '==', bookingId));
      const snap = await getDocs(q);
      const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as BookingAssignment));
      return results.length > 0 ? results : MOCK_ASSIGNMENTS.filter(a => a.bookingId === bookingId);
    } catch (error) {
      return MOCK_ASSIGNMENTS.filter(a => a.bookingId === bookingId);
    }
  },

  createAssignment: async (bookingId: string, interpreterId: string): Promise<BookingAssignment> => {
    const newAssignment = { bookingId, interpreterId, status: AssignmentStatus.OFFERED, offeredAt: new Date().toISOString() };
    try {
      const docRef = await addDoc(collection(db, ASSIGNMENTS_COLLECTION), newAssignment);
      await updateDoc(doc(db, COLLECTION_NAME, bookingId), { status: BookingStatus.OPENED });

      // Fetch interpreter info from Firestore
      const intSnap = await getDoc(doc(db, 'interpreters', interpreterId));
      const intData = intSnap.exists() ? (intSnap.data() as Interpreter) : undefined;
      const intName = intData?.name || '';
      const intEmail = intData?.email || '';

      // Fetch booking data for email template
      const bookingSnap = await getDoc(doc(db, COLLECTION_NAME, bookingId));
      const bookingData = { ...bookingSnap.data(), id: bookingId } as Booking;

      // Notify Interpreter via real Firestore user lookup
      const interpreterUser = await getInterpreterUser(interpreterId);
      if (interpreterUser) {
        NotificationService.notify(interpreterUser.id, 'New Job Offer', 'You have a new interpreting request matching your profile.', NotificationType.INFO, '/interpreter/jobs');
      }

      await EmailService.sendStatusEmail(bookingData, BookingStatus.OPENED, {
        interpreterId,
        interpreterName: intName,
        interpreterEmail: intEmail || interpreterUser?.email
      });

      return { id: docRef.id, ...newAssignment } as BookingAssignment;
    } catch (e) {
      const mockAssignment = { id: `a-${Date.now()}`, ...newAssignment } as BookingAssignment;
      MOCK_ASSIGNMENTS.push(mockAssignment);
      const b = MOCK_BOOKINGS.find(book => book.id === bookingId);
      if (b && (b.status === BookingStatus.INCOMING || b.status === BookingStatus.OPENED)) b.status = BookingStatus.OPENED;
      saveMockData();
      return mockAssignment;
    }
  },

  getRecentBookings: async (limitCount: number = 5): Promise<Booking[]> => {
    try {
      const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'), limit(limitCount));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
    } catch (error) {
      console.error('Failed to get recent bookings', error);
      return [];
    }
  },

  checkScheduleConflict: async (interpreterId: string, date: string, startTime: string, durationMinutes: number, excludeBookingId?: string): Promise<Booking | null> => {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('interpreterId', '==', interpreterId),
        where('date', '==', date),
        where('status', '==', BookingStatus.BOOKED)
      );
      const snap = await getDocs(q);
      const bookings = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));

      const targetStart = new Date(`${date}T${startTime}`);
      const targetEnd = new Date(targetStart.getTime() + durationMinutes * 60000);

      for (const existing of bookings) {
        if (existing.id === excludeBookingId) continue;
        const existingStart = new Date(`${existing.date}T${existing.startTime}`);
        const existingEnd = new Date(existingStart.getTime() + existing.durationMinutes * 60000);
        if (targetStart < existingEnd && targetEnd > existingStart) return existing;
      }
      return null;
    } catch (e) {
      // Minimal fallback to mock
      return null;
    }
  },

  getInterpreterOffers: async (interpreterId: string): Promise<BookingAssignment[]> => {
    try {
      const q = query(collection(db, ASSIGNMENTS_COLLECTION), where('interpreterId', '==', interpreterId), where('status', '==', AssignmentStatus.OFFERED));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as BookingAssignment));
    } catch (error) {
      console.error('Failed to get interpreter offers', error);
      return [];
    }
  },

  getInterpreterSchedule: async (interpreterId: string): Promise<Booking[]> => {
    try {
      const q = query(collection(db, COLLECTION_NAME), where('interpreterId', '==', interpreterId));
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
      return all.filter(b => [BookingStatus.OPENED, 'PENDING_ASSIGNMENT' as any, BookingStatus.BOOKED, BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICED, BookingStatus.PAID].includes(b.status)).sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      console.error('Failed to get interpreter schedule', error);
      return [];
    }
  },

  acceptOffer: async (assignmentId: string): Promise<void> => {
    try {
      const assignmentRef = doc(db, ASSIGNMENTS_COLLECTION, assignmentId);
      const snap = await getDoc(assignmentRef);
      if (snap.exists()) {
        const data = snap.data() as BookingAssignment;

        // Check if booking is already accepted or confirmed
        const bookingRef = doc(db, COLLECTION_NAME, data.bookingId);
        const bookingSnap = await getDoc(bookingRef);
        const bookingData = bookingSnap.data() as Booking;

        if (bookingData.status !== BookingStatus.OPENED) {
          throw new Error('This job is no longer available.');
        }

        // Fetch interpreter name
        const intSnap = await getDoc(doc(db, 'interpreters', data.interpreterId));
        const intName = intSnap.exists() ? (intSnap.data() as Interpreter).name : 'Unknown';

        await updateDoc(assignmentRef, { status: AssignmentStatus.ACCEPTED, respondedAt: new Date().toISOString() });

        // Premium Workflow: Go to BOOKED status
        await updateDoc(bookingRef, {
          status: BookingStatus.BOOKED,
          interpreterId: data.interpreterId,
          interpreterName: intName,
          interpreterPhotoUrl: (intSnap.data() as Interpreter).photoUrl || null
        });

        // NT-03: Notify real Firestore admins (not mock users)
        const realAdmins = await getAdminUsers();
        realAdmins.forEach(admin => {
          NotificationService.notify(admin.id, '✅ Interpreter Accepted Offer', `Job #${data.bookingId.substring(0, 8).toUpperCase()} has been confirmed by ${intName}. Ready for deployment.`, NotificationType.SUCCESS, `/admin/bookings/${data.bookingId}`);
        });

        // Email System - send BOOKED email to both client and interpreter
        const intUserForEmail = await getInterpreterUser(data.interpreterId);
        const intSnapForEmail = await getDoc(doc(db, 'interpreters', data.interpreterId));
        const intEmailDirect = intSnapForEmail.exists() ? (intSnapForEmail.data() as Interpreter).email : '';
        await EmailService.sendStatusEmail({ ...bookingData, id: data.bookingId }, BookingStatus.BOOKED, {
          interpreterId: data.interpreterId,
          interpreterName: intName,
          interpreterEmail: intEmailDirect || intUserForEmail?.email
        });

      }
    } catch (e) {
      console.error('Failed to accept offer', e);
      throw e;
    }
  },

  declineOffer: async (assignmentId: string): Promise<void> => {
    try {
      const assignmentRef = doc(db, ASSIGNMENTS_COLLECTION, assignmentId);
      const snap = await getDoc(assignmentRef);

      await updateDoc(assignmentRef, { status: AssignmentStatus.DECLINED, respondedAt: new Date().toISOString() });

      if (snap.exists()) {
        const assignment = snap.data() as BookingAssignment;

        // BK-06: Check if ALL offers for this booking have now been declined
        const remainingQ = query(
          collection(db, ASSIGNMENTS_COLLECTION),
          where('bookingId', '==', assignment.bookingId),
          where('status', '==', AssignmentStatus.OFFERED)
        );
        const remainingSnap = await getDocs(remainingQ);

        if (remainingSnap.empty) {
          // No more open offers — revert booking to INCOMING so admin can re-allocate
          await updateDoc(doc(db, COLLECTION_NAME, assignment.bookingId), {
            status: BookingStatus.INCOMING,
            interpreterId: null,
            interpreterName: null,
            updatedAt: serverTimestamp()
          });

          // Alert admins that re-assignment is needed
          const admins = await getAdminUsers();
          admins.forEach(admin => {
            NotificationService.notify(
              admin.id,
              '⚠️ All Offers Declined',
              `All interpreters declined booking ${assignment.bookingId.substring(0, 8).toUpperCase()}. Re-assignment required.`,
              NotificationType.URGENT,
              `/admin/bookings/${assignment.bookingId}`
            );
          });
        }
      }
    } catch (e) {
      console.error('Failed to decline offer', e);
      throw e;
    }
  },

  linkClientToBooking: async (bookingId: string, clientId: string): Promise<void> => {
    try {
      await updateDoc(doc(db, COLLECTION_NAME, bookingId), { clientId, updatedAt: serverTimestamp() });
    } catch (e) {
      console.error('Failed to link client to booking', e);
      throw e;
    }
  },

  linkOrphanedBookings: async (email: string, clientId: string): Promise<number> => {
    let count = 0;
    try {
      // Find all bookings where guestContact.email matches and clientId is missing
      const q = query(
        collection(db, COLLECTION_NAME),
        where('guestContact.email', '==', email)
      );
      const snap = await getDocs(q);
      const batch = writeBatch(db);

      snap.docs.forEach(d => {
        const data = d.data();
        if (!data.clientId) {
          batch.update(d.ref, { clientId, updatedAt: serverTimestamp() });
          count++;
        }
      });

      if (count > 0) await batch.commit();
      return count;
    } catch (e) {
      console.error('Failed to link orphaned bookings', e);
      return count;
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      // 1. Delete associated assignments first in Firebase
      const assignmentsQuery = query(collection(db, ASSIGNMENTS_COLLECTION), where('bookingId', '==', id));
      const assignmentsSnap = await getDocs(assignmentsQuery);
      const batch = writeBatch(db);
      assignmentsSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();

      // 2. Delete the booking from Firebase
      await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (e) {
      console.error('Firebase deletion failed', e);
      throw e;
    }
  }
};
