
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
import { JobNumberService } from './jobNumberService';
import { SourceTracking } from './sourceTracking';
import { JobEventType } from '../domains/jobs/jobEvents';
import { getAssignmentPendingStatus, getNeedsAssignmentStatus, validateWorkflowTransition } from '../domains/jobs/workflow';

const COLLECTION_NAME = 'bookings';
const ASSIGNMENTS_COLLECTION = 'assignments';

const addJobEvent = async (
  booking: Pick<Booking, 'id' | 'organizationId' | 'status'>,
  type: JobEventType,
  metadata: Record<string, unknown> = {}
) => {
  try {
    await addDoc(collection(db, 'jobEvents'), {
      jobId: booking.id,
      organizationId: booking.organizationId || 'lingland-main',
      type,
      source: 'system',
      ...(typeof metadata.description === 'string' ? { description: metadata.description } : {}),
      metadata,
      createdAt: new Date().toISOString()
    });
  } catch (e) {
    console.warn('[BookingService] Failed to write job event', e);
  }
};

const hasTimesheetForBooking = async (bookingId: string): Promise<boolean> => {
  try {
    const q = query(collection(db, 'timesheets'), where('bookingId', '==', bookingId));
    const snap = await getDocs(q);
    return !snap.empty;
  } catch {
    return false;
  }
};

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
      const q = query(collection(db, 'jobEvents'), where('jobId', '==', jobId), orderBy('createdAt', 'desc'));
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
    const referencedBooking = await JobNumberService.ensureBookingReference(bookingData);
    const sourceTracking = SourceTracking.fromSource({
      sourceSystem: bookingData.sourceSystem || 'STAFF_MANUAL',
      sourceBaseId: bookingData.sourceBaseId,
      sourceTable: bookingData.sourceTable,
      sourceView: bookingData.sourceView,
      sourceRecordId: bookingData.sourceRecordId,
      legacyRef: bookingData.legacyRef || bookingData.legacyAirtableRef || referencedBooking.displayRef || referencedBooking.jobNumber,
      snapshot: bookingData.sourceSystem === 'AIRTABLE' ? bookingData : undefined,
      lastSyncRunId: bookingData.lastSyncRunId,
      syncedAt: bookingData.lastSyncedAt
    });
    const newBooking = SourceTracking.merge({ 
      ...bookingData,
      ...referencedBooking,
      status: bookingData.status || BookingStatus.INCOMING,
      organizationId: bookingData.organizationId || 'lingland-main',
      createdAt: serverTimestamp(), 
      updatedAt: serverTimestamp() 
    }, {
      ...sourceTracking,
      syncStatus: bookingData.syncStatus || sourceTracking.syncStatus
    });
    try {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), newBooking);

      // Notify Admin
      const admins = await getAdminUsers();
      admins.forEach(admin => {
        NotificationService.notify(admin.id, 'New Booking Request', `Reference ${newBooking.bookingRef}: ${bookingData.clientName} requested a ${bookingData.languageTo} interpreter for ${bookingData.date}.`, NotificationType.INFO, `/admin/bookings/${docRef.id}`);
      });

      // Email System
      if (newBooking.status === BookingStatus.INCOMING) {
        await EmailService.sendStatusEmail({ ...newBooking, id: docRef.id } as Booking, BookingStatus.INCOMING);
      }

      return { id: docRef.id, ...newBooking } as unknown as Booking;
    } catch (e) {
      console.error('Failed to create booking', e);
      throw e;
    }
  },

  createGuestBooking: async (input: any): Promise<Booking> => {
    let expectedEndTime = '';
    if (input.startTime && input.durationMinutes) {
      const start = new Date(`2000-01-01T${input.startTime}`);
      const end = new Date(start.getTime() + input.durationMinutes * 60000);
      expectedEndTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    // 1. Handle Client Association
    let clientId = '';
    const email = input.guestContact?.email?.trim().toLowerCase();
    if (email) {
      const existingClient = await ClientService.getByEmail(email);
      if (existingClient) {
        clientId = existingClient.id;
      } else {
        const newGuestClient = await ClientService.createClientFromGuest(input.guestContact);
        clientId = newGuestClient.id;
      }
    }

    const referencedBooking = await JobNumberService.ensureBookingReference(input);
    const sourceTracking = SourceTracking.fromSource({
      sourceSystem: input.sourceSystem || 'CLIENT_PORTAL',
      sourceBaseId: input.sourceBaseId,
      sourceTable: input.sourceTable,
      sourceView: input.sourceView,
      sourceRecordId: input.sourceRecordId,
      legacyRef: input.legacyRef || referencedBooking.displayRef || referencedBooking.jobNumber,
      snapshot: input.sourceSystem === 'AIRTABLE' ? input : undefined,
      lastSyncRunId: input.lastSyncRunId,
      syncedAt: input.lastSyncedAt
    });
    const newBooking = SourceTracking.merge({
      ...input,
      ...referencedBooking,
      guestContact: input.guestContact ? { ...input.guestContact, email } : input.guestContact,
      clientId, // Linked to the new or existing GUEST client
      status: BookingStatus.INCOMING,
      expectedEndTime,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, {
      ...sourceTracking,
      syncStatus: input.syncStatus || sourceTracking.syncStatus
    });

    try {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), newBooking);

      // Notify Admin
      const admins = await getAdminUsers();
      admins.forEach(admin => {
        NotificationService.notify(admin.id, 'New Guest Booking', `Reference ${newBooking.bookingRef}: New request for ${input.languageTo}.`, NotificationType.URGENT, `/admin/bookings/${docRef.id}`);
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
      const currentBooking = await BookingService.getById(id);
      if (!currentBooking) throw new Error('Booking not found');
      const hasTimesheet = await hasTimesheetForBooking(id);
      validateWorkflowTransition(currentBooking.status, status, { hasTimesheet });

      if (status === BookingStatus.CANCELLED) {
        const batch = writeBatch(db);
        batch.update(doc(db, COLLECTION_NAME, id), { status, updatedAt: serverTimestamp() });
        const assignmentsQuery = query(collection(db, ASSIGNMENTS_COLLECTION), where('bookingId', '==', id), where('status', '==', AssignmentStatus.OFFERED));
        const assignmentsSnap = await getDocs(assignmentsQuery);
        assignmentsSnap.docs.forEach(d => batch.update(d.ref, { status: AssignmentStatus.DECLINED, respondedAt: new Date().toISOString() }));
        await batch.commit();
      } else {
        await updateDoc(doc(db, COLLECTION_NAME, id), { status, updatedAt: serverTimestamp() });
      }

      const booking = await BookingService.getById(id);
      if (booking) {
        await addJobEvent(booking, status === BookingStatus.CANCELLED ? 'BOOKING_CANCELLED' : 'STATUS_CHANGED', {
          fromStatus: currentBooking.status,
          toStatus: status
        });
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

      const pendingStatus = getAssignmentPendingStatus();
      validateWorkflowTransition(bookingData.status, pendingStatus, { adminOverride: true });

      // Direct assignment still requires interpreter acceptance before BOOKED.
      await updateDoc(bookingRef, {
        status: pendingStatus,
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
      let hasDirectAssignment = false;
      assignmentsSnap.docs.forEach(d => {
        if (d.data().interpreterId !== interpreterId) {
          batch.update(d.ref, { status: AssignmentStatus.DECLINED, respondedAt: new Date().toISOString() });
        } else {
          hasDirectAssignment = true;
          batch.update(d.ref, { status: AssignmentStatus.OFFERED, offeredAt: new Date().toISOString() });
        }
      });
      if (!hasDirectAssignment) {
        const assignmentRef = doc(collection(db, ASSIGNMENTS_COLLECTION));
        batch.set(assignmentRef, { bookingId, interpreterId, status: AssignmentStatus.OFFERED, offeredAt: new Date().toISOString(), assignmentType: 'DIRECT' });
      }
      await batch.commit();

      // Notify Interpreter (real Firestore user lookup)
      const interpreterUser = await getInterpreterUser(interpreterId);
      if (interpreterUser) {
        NotificationService.notify(interpreterUser.id, 'New Direct Assignment', `Please review the assignment for ${bookingData?.languageTo || 'Job'} on ${bookingData?.date}.`, NotificationType.INFO, `/interpreter/jobs/${bookingId}`);
      }

      // Email to Interpreter
      await EmailService.sendStatusEmail({ ...bookingData, status: pendingStatus }, pendingStatus, {
        interpreterId: interpreterId,
        interpreterName: intName,
        interpreterEmail: intEmail || interpreterUser?.email
      });
      await addJobEvent({ ...bookingData, status: pendingStatus }, 'DIRECT_ASSIGNMENT_SENT', {
        fromStatus: bookingData.status,
        toStatus: pendingStatus,
        interpreterId
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

      const nextStatus = getNeedsAssignmentStatus();

      // Update booking without treating assignment removal as cancellation.
      await updateDoc(bookingRef, {
        status: nextStatus,
        interpreterId: null,
        interpreterName: null,
        interpreterPhotoUrl: null,
        updatedAt: serverTimestamp()
      });

      // Assignment status describes the interpreter relationship separately.
      if (interpreterId) {
        const assignmentsQuery = query(collection(db, ASSIGNMENTS_COLLECTION),
          where('bookingId', '==', bookingId),
          where('interpreterId', '==', interpreterId)
        );
        const assignmentsSnap = await getDocs(assignmentsQuery);
        const batch = writeBatch(db);
        assignmentsSnap.docs.forEach(d => {
          batch.update(d.ref, { status: AssignmentStatus.REMOVED, respondedAt: new Date().toISOString(), removalReason: reason || null });
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
          await EmailService.sendAssignmentRemovedEmail({ ...bookingData, status: nextStatus }, {
            interpreterId: interpreterId,
            interpreterName: bookingData.interpreterName || 'Interpreter',
            interpreterEmail: interpreterUser.email,
            removalReason: reason || 'Administrative reassignment'
          });
        }
      }
      await addJobEvent({ ...bookingData, status: nextStatus }, 'ASSIGNMENT_REMOVED', {
        fromStatus: bookingData.status,
        toStatus: nextStatus,
        interpreterId,
        reason: reason || null
      });
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

  ensureInterpreterAssignment: async (bookingId: string, interpreterId: string): Promise<BookingAssignment> => {
    const existing = await BookingService.getAssignmentsByBookingId(bookingId);
    const match = existing.find(a => a.interpreterId === interpreterId && [AssignmentStatus.OFFERED, AssignmentStatus.ACCEPTED].includes(a.status));
    if (match) return match;

    const newAssignment = {
      bookingId,
      interpreterId,
      status: AssignmentStatus.OFFERED,
      offeredAt: new Date().toISOString(),
      assignmentType: 'DIRECT'
    } as BookingAssignment & { assignmentType?: string };

    try {
      const docRef = await addDoc(collection(db, ASSIGNMENTS_COLLECTION), newAssignment);
      const booking = await BookingService.getById(bookingId);
      if (booking) {
        await addJobEvent(booking, 'DIRECT_ASSIGNMENT_SENT', {
          interpreterId,
          assignmentId: docRef.id,
          recoveredFromLegacyDirectAssignment: true
        });
      }
      return { ...newAssignment, id: docRef.id } as BookingAssignment;
    } catch {
      const mockAssignment = { ...newAssignment, id: `a-${Date.now()}` } as BookingAssignment;
      MOCK_ASSIGNMENTS.push(mockAssignment);
      saveMockData();
      return mockAssignment;
    }
  },

  createAssignment: async (bookingId: string, interpreterId: string): Promise<BookingAssignment> => {
    const newAssignment = { bookingId, interpreterId, status: AssignmentStatus.OFFERED, offeredAt: new Date().toISOString() };
    try {
      const docRef = await addDoc(collection(db, ASSIGNMENTS_COLLECTION), newAssignment);
      const pendingStatus = getAssignmentPendingStatus();
      await updateDoc(doc(db, COLLECTION_NAME, bookingId), { status: pendingStatus, updatedAt: serverTimestamp() });

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

      await EmailService.sendStatusEmail({ ...bookingData, status: pendingStatus }, pendingStatus, {
        interpreterId,
        interpreterName: intName,
        interpreterEmail: intEmail || interpreterUser?.email
      });
      await addJobEvent({ ...bookingData, status: pendingStatus }, 'JOB_OFFER_SENT', {
        fromStatus: bookingData.status,
        toStatus: pendingStatus,
        interpreterId
      });

      return { id: docRef.id, ...newAssignment } as BookingAssignment;
    } catch (e) {
      const mockAssignment = { id: `a-${Date.now()}`, ...newAssignment } as BookingAssignment;
      MOCK_ASSIGNMENTS.push(mockAssignment);
      const b = MOCK_BOOKINGS.find(book => book.id === bookingId);
      if (b && [BookingStatus.INCOMING, BookingStatus.OPENED, BookingStatus.NEEDS_ASSIGNMENT].includes(b.status)) b.status = BookingStatus.ASSIGNMENT_PENDING;
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
      return all.filter(b => [BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING, 'PENDING_ASSIGNMENT' as any, BookingStatus.BOOKED, BookingStatus.READY_FOR_INVOICE, BookingStatus.INVOICED, BookingStatus.PAID].includes(b.status)).sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      console.error('Failed to get interpreter schedule', error);
      return [];
    }
  },

  recordInterpreterResponseByStaff: async (bookingId: string, accepted: boolean): Promise<void> => {
    try {
      const bookingRef = doc(db, COLLECTION_NAME, bookingId);
      const bookingSnap = await getDoc(bookingRef);
      if (!bookingSnap.exists()) throw new Error('Booking not found');

      const bookingData = { id: bookingId, ...bookingSnap.data() } as Booking;
      if (!bookingData.interpreterId) throw new Error('No interpreter assigned to this booking');

      const intSnap = await getDoc(doc(db, 'interpreters', bookingData.interpreterId));
      const intData = intSnap.exists() ? (intSnap.data() as Interpreter) : undefined;
      const intName = bookingData.interpreterName || intData?.name || 'Interpreter';

      const assignmentsQuery = query(
        collection(db, ASSIGNMENTS_COLLECTION),
        where('bookingId', '==', bookingId),
        where('interpreterId', '==', bookingData.interpreterId)
      );
      const assignmentsSnap = await getDocs(assignmentsQuery);
      const batch = writeBatch(db);
      const responseAt = new Date().toISOString();

      if (assignmentsSnap.empty) {
        const assignmentRef = doc(collection(db, ASSIGNMENTS_COLLECTION));
        batch.set(assignmentRef, {
          bookingId,
          interpreterId: bookingData.interpreterId,
          status: accepted ? AssignmentStatus.ACCEPTED : AssignmentStatus.DECLINED,
          offeredAt: responseAt,
          respondedAt: responseAt,
          assignmentType: 'STAFF_MANUAL',
          recordedByStaff: true
        });
      } else {
        assignmentsSnap.docs.forEach(d => {
          batch.update(d.ref, {
            status: accepted ? AssignmentStatus.ACCEPTED : AssignmentStatus.DECLINED,
            respondedAt: responseAt,
            recordedByStaff: true
          });
        });
      }

      if (accepted) {
        batch.update(bookingRef, {
          status: BookingStatus.BOOKED,
          interpreterName: intName,
          interpreterPhotoUrl: intData?.photoUrl || bookingData.interpreterPhotoUrl || null,
          updatedAt: serverTimestamp()
        });
      } else {
        batch.update(bookingRef, {
          status: getNeedsAssignmentStatus(),
          interpreterId: null,
          interpreterName: null,
          interpreterPhotoUrl: null,
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();

      if (accepted) {
        const intUser = await getInterpreterUser(bookingData.interpreterId);
        const intEmail = intData?.email || intUser?.email || '';
        await EmailService.sendStatusEmail({ ...bookingData, status: BookingStatus.BOOKED }, BookingStatus.BOOKED, {
          interpreterId: bookingData.interpreterId,
          interpreterName: intName,
          interpreterEmail: intEmail
        });
      }

      await addJobEvent({ ...bookingData, status: accepted ? BookingStatus.BOOKED : getNeedsAssignmentStatus() }, accepted ? 'ASSIGNMENT_ACCEPTED' : 'ASSIGNMENT_DECLINED', {
        fromStatus: bookingData.status,
        toStatus: accepted ? BookingStatus.BOOKED : getNeedsAssignmentStatus(),
        interpreterId: bookingData.interpreterId,
        description: accepted ? 'Interpreter acceptance was recorded manually by staff.' : 'Interpreter decline was recorded manually by staff.',
        recordedByStaff: true,
        source: 'manual_staff'
      });
    } catch (e) {
      console.error('Failed to record interpreter response by staff', e);
      throw e;
    }
  },

  recordSessionCompletedByStaff: async (bookingId: string): Promise<void> => {
    try {
      const bookingRef = doc(db, COLLECTION_NAME, bookingId);
      const bookingSnap = await getDoc(bookingRef);
      if (!bookingSnap.exists()) throw new Error('Booking not found');

      const bookingData = { id: bookingId, ...bookingSnap.data() } as Booking;
      validateWorkflowTransition(bookingData.status, BookingStatus.SESSION_COMPLETED, { adminOverride: true });

      await updateDoc(bookingRef, {
        status: BookingStatus.SESSION_COMPLETED,
        updatedAt: serverTimestamp()
      });

      await addJobEvent({ ...bookingData, status: BookingStatus.SESSION_COMPLETED }, 'SESSION_COMPLETED', {
        fromStatus: bookingData.status,
        toStatus: BookingStatus.SESSION_COMPLETED,
        interpreterId: bookingData.interpreterId || null,
        description: 'Session completion was recorded manually by staff.',
        recordedByStaff: true,
        source: 'manual_staff'
      });
    } catch (e) {
      console.error('Failed to record session completion by staff', e);
      throw e;
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

        if (![BookingStatus.OPENED, BookingStatus.ASSIGNMENT_PENDING, 'PENDING_ASSIGNMENT' as any].includes(bookingData.status)) {
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
          interpreterPhotoUrl: intSnap.exists() ? (intSnap.data() as Interpreter).photoUrl || null : null,
          updatedAt: serverTimestamp()
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
        await addJobEvent({ ...bookingData, id: data.bookingId, status: BookingStatus.BOOKED }, 'ASSIGNMENT_ACCEPTED', {
          fromStatus: bookingData.status,
          toStatus: BookingStatus.BOOKED,
          interpreterId: data.interpreterId,
          assignmentId
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
            status: getNeedsAssignmentStatus(),
            interpreterId: null,
            interpreterName: null,
            updatedAt: serverTimestamp()
          });
          const booking = await BookingService.getById(assignment.bookingId);
          if (booking) {
            await addJobEvent(booking, 'ASSIGNMENT_DECLINED', {
              toStatus: getNeedsAssignmentStatus(),
              interpreterId: assignment.interpreterId,
              assignmentId
            });
          }

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
