import { JobStatus } from './status';

export const allowedTransitions: Record<JobStatus, JobStatus[]> = {
    INCOMING: ['OPENED', 'PENDING_ASSIGNMENT', 'CANCELLED'],
    OPENED: ['BOOKED', 'INCOMING', 'CANCELLED'],
    PENDING_ASSIGNMENT: ['OPENED', 'QUOTE_PENDING', 'BOOKED', 'INCOMING', 'CANCELLED'],
    QUOTE_PENDING: ['BOOKED', 'CANCELLED'],
    BOOKED: ['TIMESHEET_SUBMITTED', 'SESSION_COMPLETED', 'CANCELLED'],
    SESSION_COMPLETED: ['TIMESHEET_SUBMITTED'],
    TIMESHEET_SUBMITTED: ['READY_FOR_INVOICE', 'VERIFIED'],
    VERIFIED: ['READY_FOR_INVOICE', 'INVOICING'],
    READY_FOR_INVOICE: ['INVOICED'],
    INVOICING: ['INVOICED', 'READY_FOR_INVOICE'],
    INVOICED: ['PAID'],
    PAID: [],
    CANCELLED: [],
};

export const canTransition = (current: JobStatus, next: JobStatus): boolean => {
    return allowedTransitions[current]?.includes(next) ?? false;
};
