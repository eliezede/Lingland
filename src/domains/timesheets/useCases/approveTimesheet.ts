import { TimesheetRepository } from '../repository';
import { JobRepository } from '../../jobs/repository';
import { JobStatus } from '../../jobs/status';

export interface ApproveTimesheetDependencies {
    timesheetRepo: TimesheetRepository;
    jobRepo: JobRepository;
}

export const approveTimesheet = async (
    id: string,
    deps: ApproveTimesheetDependencies,
    overrides?: { clientAmount?: number, interpreterAmount?: number }
): Promise<void> => {
    const { timesheetRepo, jobRepo } = deps;

    const tsData = await timesheetRepo.getById(id);
    if (!tsData) throw new Error('Timesheet not found');

    const updates: any = {
        adminApproved: true,
        adminApprovedAt: new Date().toISOString(),
        status: 'APPROVED',
        readyForClientInvoice: true,
        readyForInterpreterInvoice: true,
        updatedAt: new Date().toISOString(),
        ...(overrides || {})
    };

    if (overrides?.clientAmount) updates.clientAmountCalculated = overrides.clientAmount;
    if (overrides?.interpreterAmount) updates.interpreterAmountCalculated = overrides.interpreterAmount;

    await timesheetRepo.update(id, updates);

    // Sync Job Status
    await jobRepo.updateStatus(tsData.jobId, JobStatus.READY_FOR_INVOICE);
};
