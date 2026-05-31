export type JobStatus =
    | 'DRAFT'
    | 'INCOMING'
    | 'NEEDS_ASSIGNMENT'
    | 'ASSIGNMENT_PENDING'
    | 'OPENED'
    | 'PENDING_ASSIGNMENT'
    | 'QUOTE_PENDING'
    | 'BOOKED'
    | 'SESSION_COMPLETED'
    | 'TIMESHEET_SUBMITTED'
    | 'TIMESHEET_VERIFIED'
    | 'VERIFIED'
    | 'READY_FOR_INVOICE'
    | 'INVOICING'
    | 'INVOICED'
    | 'PAID'
    | 'ADMIN_HOLD'
    | 'CANCELLED';

export const JobStatus = {
    DRAFT: 'DRAFT' as const,
    INCOMING: 'INCOMING' as const,
    NEEDS_ASSIGNMENT: 'NEEDS_ASSIGNMENT' as const,
    ASSIGNMENT_PENDING: 'ASSIGNMENT_PENDING' as const,
    OPENED: 'OPENED' as const,
    PENDING_ASSIGNMENT: 'PENDING_ASSIGNMENT' as const,
    QUOTE_PENDING: 'QUOTE_PENDING' as const,
    BOOKED: 'BOOKED' as const,
    SESSION_COMPLETED: 'SESSION_COMPLETED' as const,
    TIMESHEET_SUBMITTED: 'TIMESHEET_SUBMITTED' as const,
    TIMESHEET_VERIFIED: 'TIMESHEET_VERIFIED' as const,
    VERIFIED: 'VERIFIED' as const,
    READY_FOR_INVOICE: 'READY_FOR_INVOICE' as const,
    INVOICING: 'INVOICING' as const,
    INVOICED: 'INVOICED' as const,
    PAID: 'PAID' as const,
    ADMIN_HOLD: 'ADMIN_HOLD' as const,
    CANCELLED: 'CANCELLED' as const,
};

export const isJobActive = (status: JobStatus): boolean => {
    return [
        'INCOMING',
        'NEEDS_ASSIGNMENT',
        'ASSIGNMENT_PENDING',
        'OPENED',
        'PENDING_ASSIGNMENT',
        'QUOTE_PENDING',
        'BOOKED',
        'SESSION_COMPLETED',
        'TIMESHEET_SUBMITTED',
        'TIMESHEET_VERIFIED',
        'READY_FOR_INVOICE',
        'INVOICED'
    ].includes(status);
};
