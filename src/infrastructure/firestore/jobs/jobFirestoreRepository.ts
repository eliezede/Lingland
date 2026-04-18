import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { JobRepository, AssignmentRepository } from '../../../domains/jobs/repository';
import { Job, JobAssignment } from '../../../domains/jobs/types';
import { JobStatus } from '../../../domains/jobs/status';
import { AssignmentStatus } from '../../../shared/types/common';
import { MOCK_BOOKINGS, MOCK_ASSIGNMENTS, saveMockData } from '../../../services/mockData';

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
        } catch { /* fallback to mock */ }
        const mock = MOCK_BOOKINGS.find(b => b.id === id) as any;
        if (mock && (!mock.organizationId || mock.organizationId === tenantId)) return mock;
        return null;
    },

    async create(job): Promise<Job> {
        const jobWithTenant = { ...job, organizationId: tenantId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
        try {
            const ref = await addDoc(collection(db, 'bookings'), jobWithTenant);
            return { id: ref.id, ...(jobWithTenant as any) };
        } catch {
            const mockJob = { id: `job_${Date.now()}`, ...jobWithTenant } as any;
            MOCK_BOOKINGS.push(mockJob);
            saveMockData();
            return mockJob;
        }
    },

    async update(id, data): Promise<void> {
        const job = await this.getById(id);
        if (!job) throw new Error('Job not found or unauthorized'); // Guardrail

        try {
            await updateDoc(doc(db, 'bookings', id), { ...data, updatedAt: serverTimestamp() });
        } catch {
            const b = MOCK_BOOKINGS.find(b => b.id === id);
            if (b) Object.assign(b, data);
            saveMockData();
        }
    },

    async updateStatus(id, newStatus): Promise<void> {
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
        } catch {
            return MOCK_ASSIGNMENTS.filter((a: any) => a.bookingId === jobId && a.status === status) as any;
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
        } catch {
            MOCK_ASSIGNMENTS.forEach(a => {
                if (a.bookingId === jobId && a.status === AssignmentStatus.OFFERED) {
                    if (a.interpreterId !== acceptedInterpreterId) {
                        a.status = AssignmentStatus.DECLINED;
                    } else {
                        a.status = AssignmentStatus.ACCEPTED;
                    }
                }
            });
            saveMockData();
        }
    }
});
