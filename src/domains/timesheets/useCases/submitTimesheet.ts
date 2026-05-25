import { Timesheet } from '../types';
import { TimesheetRepository } from '../repository';
import { JobRepository } from '../../jobs/repository';
import { JobStatus } from '../../jobs/status';

export interface SubmitTimesheetDependencies {
    timesheetRepo: TimesheetRepository;
    jobRepo: JobRepository;
}

export const submitTimesheet = async (
    data: Partial<Timesheet>,
    deps: SubmitTimesheetDependencies
): Promise<Timesheet> => {
    const { timesheetRepo, jobRepo } = deps;

    const newTs: Omit<Timesheet, 'id'> = {
        jobId: data.jobId!,
        interpreterId: data.interpreterId!,
        clientId: data.clientId!,
        organizationId: data.organizationId || 'default-org',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        actualStart: data.actualStart!,
        actualEnd: data.actualEnd!,
        breakDurationMinutes: data.breakDurationMinutes || 0,
        adminApproved: false,
        status: 'SUBMITTED' as const,
        readyForClientInvoice: false,
        readyForInterpreterInvoice: false,
        clientInvoiceId: null,
        interpreterInvoiceId: null,
        unitsBillableToClient: 0,
        unitsPayableToInterpreter: 0,
        clientAmountCalculated: 0,
        interpreterAmountCalculated: 0
    };

    const createdTs = await timesheetRepo.create(newTs);

    // Sync Job Status
    await jobRepo.updateStatus(newTs.jobId, 'TIMESHEET_SUBMITTED' as JobStatus);

    return createdTs;
};
