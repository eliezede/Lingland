import { JobStatus } from '../status';
import { AssignmentStatus } from '../../../shared/types/common';
import { NotificationService } from '../../../services/notificationService';
import { EmailService } from '../../../services/emailService';
import { NotificationType } from '../../../types';
import { JobRepository, AssignmentRepository } from '../repository';
import { InterpreterRepository } from '../../interpreters/repository';
import { UserRepository } from '../../users/repository';

export interface AssignInterpreterDependencies {
    jobRepo: JobRepository;
    assignmentRepo: AssignmentRepository;
    interpreterRepo: InterpreterRepository;
    userRepo: UserRepository;
}

export const assignInterpreter = async (
    jobId: string,
    interpreterId: string,
    deps: AssignInterpreterDependencies
): Promise<void> => {
    const { jobRepo, assignmentRepo, interpreterRepo, userRepo } = deps;

    // 1. Fetch Job
    const jobData = await jobRepo.getById(jobId);
    if (!jobData) throw new Error('Job not found');

    // 2. Fetch Interpreter snapshot (for pure domain reference)
    const intData = await interpreterRepo.getSnapshotById(interpreterId);
    const intName = intData?.name || 'Unknown';
    const intEmail = intData?.email || '';

    // 3. Update Job state
    await jobRepo.update(jobId, {
        status: JobStatus.OPENED,
        interpreterId: interpreterId,
        interpreterName: intName,
    });

    // 4. Resolve competing assignments
    await assignmentRepo.resolveAssignmentsForJob(jobId, interpreterId);

    // 5. Notifications
    const interpreterUser = await userRepo.getByProfileId(interpreterId);
    if (interpreterUser) {
        NotificationService.notify(
            interpreterUser.id,
            'New Direct Assignment',
            `You have been directly assigned a new ${jobData.languageTo || 'Job'} job on ${jobData.date}. Please review and accept.`,
            NotificationType.JOB_OFFER,
            `/interpreter/jobs`
        );
    }

    // 6. Email Trigger
    await EmailService.sendStatusEmail(jobData as any, JobStatus.OPENED as any, {
        interpreterId: interpreterId,
        interpreterName: intName,
        interpreterEmail: intEmail || interpreterUser?.email
    });
};
