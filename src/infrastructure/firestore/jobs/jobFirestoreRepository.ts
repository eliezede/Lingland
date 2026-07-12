import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { JobRepository, AssignmentRepository } from '../../../domains/jobs/repository';
import { Job, JobAssignment } from '../../../domains/jobs/types';
import { JobStatus } from '../../../domains/jobs/status';
import { AssignmentStatus } from '../../../shared/types/common';
import { validateWorkflowTransition } from '../../../domains/jobs/workflow';

export const createJobFirestoreRepository = (tenantId: string): JobRepository => ({
    async getById(id: string): Promise<Job | null> {
        try {
            const snap = await getDoc(doc(db, 'bookings', id));
            if (snap.exists()) {
                 const data = snap.data() as Job;
                 // Guardrail: Allow if organizationId matches OR if data has no organizationId (legacy/default)
                 if (data.organizationId && data.organizationId !== tenantId && tenantId !== 'lingland-main') return null; 
                 return { ...data, id: snap.id };
            }
        } catch (error) {
            throw error;
        }
        return null;
    },

    async create(job): Promise<Job> {
        const jobWithTenant = { ...job, organizationId: tenantId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
        try {
            const ref = await addDoc(collection(db, 'bookings'), jobWithTenant);
            return { id: ref.id, ...(jobWithTenant as any) };
        } catch (error) {
            throw error;
        }
    },

    async update(id, data): Promise<void> {
        const job = await this.getById(id);
        if (!job) throw new Error('Job not found or unauthorized'); // Guardrail

        try {
            await updateDoc(doc(db, 'bookings', id), { ...data, updatedAt: serverTimestamp() });
        } catch (error) {
            throw error;
        }
    },

    async updateStatus(id, newStatus): Promise<void> {
        const job = await this.getById(id);
        if (!job) throw new Error('Job not found or unauthorized');
        let hasTimesheet = false;
        if (newStatus === JobStatus.READY_FOR_INVOICE) {
            try {
                const tsQuery = query(collection(db, 'timesheets'), where('bookingId', '==', id));
                hasTimesheet = !(await getDocs(tsQuery)).empty;
            } catch {
                hasTimesheet = false;
            }
        }
        validateWorkflowTransition(job.status, newStatus, { hasTimesheet });

        if (newStatus === JobStatus.CANCELLED) {
            try {
                const batch = writeBatch(db);
                batch.update(doc(db, 'bookings', id), { status: newStatus as any, updatedAt: serverTimestamp() });
                const q = query(collection(db, 'assignments'),
                    where('bookingId', '==', id),
                    where('status', '==', AssignmentStatus.OFFERED));
                const snap = await getDocs(q);
                snap.docs.forEach(d => batch.update(d.ref, { status: AssignmentStatus.DECLINED, respondedAt: new Date().toISOString() }));
                await batch.commit();
                return;
            } catch (error) {
                throw error;
            }
        }

        await this.update(id, { status: newStatus as any });
    }
});

export const createAssignmentFirestoreRepository = (tenantId: string): AssignmentRepository => ({
    async getByJobIdAndStatus(jobId, status): Promise<JobAssignment[]> {
        try {
            // Query cross-check: assignments theoretically belong to a job, verify job tenant?
            // For assignments, we fetch by jobId. If job is secure, assignments are secure.
            const q = query(collection(db, 'assignments'),
                where('bookingId', '==', jobId),
                where('status', '==', status));
            const snap = await getDocs(q);
            return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        } catch (error) {
            throw error;
        }
    },

    async resolveAssignmentsForJob(jobId, acceptedInterpreterId): Promise<void> {
        try {
            const q = query(collection(db, 'assignments'),
                where('bookingId', '==', jobId),
                where('status', '==', AssignmentStatus.OFFERED));
            const snap = await getDocs(q);
            const batch = writeBatch(db);
            snap.docs.forEach(d => {
                if (d.data().interpreterId !== acceptedInterpreterId) {
                    batch.update(d.ref, { status: AssignmentStatus.DECLINED, respondedAt: new Date().toISOString() });
                } else {
                    batch.update(d.ref, { status: AssignmentStatus.ACCEPTED, respondedAt: new Date().toISOString() });
                }
            });
            await batch.commit();
        } catch (error) {
            throw error;
        }
    }
});
