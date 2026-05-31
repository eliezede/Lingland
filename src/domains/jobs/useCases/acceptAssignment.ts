import { doc, getDoc, updateDoc, collection, query, where, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { JobStatus } from '../status';
import { Job } from '../types';
import { AssignmentStatus } from '../../../shared/types/common';
import { NotificationService } from '../../../services/notificationService';
import { EmailService } from '../../../services/emailService';
import { MOCK_USERS, MOCK_BOOKINGS, MOCK_INTERPRETERS, MOCK_ASSIGNMENTS, saveMockData } from '../../../services/mockData';
import { NotificationType, Interpreter } from '../../../types';

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

export const acceptAssignment = async (assignmentId: string): Promise<void> => {
    try {
        const assignmentRef = doc(db, 'assignments', assignmentId);
        const snap = await getDoc(assignmentRef);
        if (snap.exists()) {
            const data = snap.data() as any;

            // Check if job is still available.
            const jobRef = doc(db, 'bookings', data.bookingId);
            const jobSnap = await getDoc(jobRef);
            const jobData = jobSnap.data() as Job;

            if (![JobStatus.ASSIGNMENT_PENDING, JobStatus.PENDING_ASSIGNMENT, 'OPENED' as any].includes(jobData.status)) {
                throw new Error('This job is no longer available.');
            }

            // Fetch interpreter name
            const intSnap = await getDoc(doc(db, 'interpreters', data.interpreterId));
            const intName = intSnap.exists() ? (intSnap.data() as Interpreter).name : 'Unknown';

            await updateDoc(assignmentRef, { status: AssignmentStatus.ACCEPTED, respondedAt: new Date().toISOString() });

            // Premium Workflow: Go to BOOKED status
            await updateDoc(jobRef, {
                status: JobStatus.BOOKED,
                interpreterId: data.interpreterId,
                interpreterName: intName
            });

            // Notify Admins
            const admins = MOCK_USERS.filter(u => u.role === 'ADMIN');
            admins.forEach(admin => {
                NotificationService.notify(
                    admin.id,
                    'Interpreter Accepted Offer',
                    `Job #${data.bookingId} has been accepted and is waiting for your final confirmation.`,
                    NotificationType.URGENT,
                    `/admin/bookings/${data.bookingId}`
                );
            });

            // Email System - send BOOKED email to both client and interpreter
            const intUserForEmail = await getInterpreterUser(data.interpreterId);
            const intSnapForEmail = await getDoc(doc(db, 'interpreters', data.interpreterId));
            const intEmailDirect = intSnapForEmail.exists() ? (intSnapForEmail.data() as Interpreter).email : '';

            await EmailService.sendStatusEmail({ ...jobData, id: data.bookingId } as any, JobStatus.BOOKED as any, {
                interpreterId: data.interpreterId,
                interpreterName: intName,
                interpreterEmail: intEmailDirect || intUserForEmail?.email
            });

        }
    } catch (e) {
        const a = MOCK_ASSIGNMENTS.find(assign => assign.id === assignmentId);
        if (a) {
            a.status = AssignmentStatus.ACCEPTED;
            const b = MOCK_BOOKINGS.find(book => book.id === a.bookingId);
            const i = MOCK_INTERPRETERS.find(inter => inter.id === a.interpreterId);
            if (b) {
                b.status = JobStatus.BOOKED as any;
                b.interpreterId = a.interpreterId;
                if (i) b.interpreterName = i.name;
            }
            saveMockData();
        }
    }
};
