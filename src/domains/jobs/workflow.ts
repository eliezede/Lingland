import { BookingStatus } from '../../types';
import { JobStatus } from './status';
import { canTransition } from './stateMachine';

export type WorkflowStatus = BookingStatus | JobStatus | string;

export interface WorkflowValidationContext {
    hasTimesheet?: boolean;
    adminOverride?: boolean;
}

const legacyStatusMap: Record<string, JobStatus> = {
    OPENED: JobStatus.ASSIGNMENT_PENDING,
    PENDING_ASSIGNMENT: JobStatus.ASSIGNMENT_PENDING,
    ADMIN: JobStatus.ADMIN_HOLD,
    VERIFIED: JobStatus.TIMESHEET_VERIFIED,
    INVOICING: JobStatus.READY_FOR_INVOICE,
};

export const normalizeWorkflowStatus = (status: WorkflowStatus): JobStatus => {
    const raw = String(status || JobStatus.INCOMING);
    return legacyStatusMap[raw] || (raw as JobStatus);
};

export const isAssignmentPendingStatus = (status: WorkflowStatus): boolean => {
    return normalizeWorkflowStatus(status) === JobStatus.ASSIGNMENT_PENDING;
};

export const isNeedsAssignmentStatus = (status: WorkflowStatus): boolean => {
    return normalizeWorkflowStatus(status) === JobStatus.NEEDS_ASSIGNMENT;
};

export const validateWorkflowTransition = (
    currentStatus: WorkflowStatus,
    nextStatus: WorkflowStatus,
    context: WorkflowValidationContext = {}
): void => {
    const current = normalizeWorkflowStatus(currentStatus);
    const next = normalizeWorkflowStatus(nextStatus);

    if (current === next) return;

    if (next === JobStatus.READY_FOR_INVOICE && !context.hasTimesheet && !context.adminOverride) {
        throw new Error('Timesheet verification is required before moving a job to Ready for Invoice.');
    }

    if (!canTransition(current, next)) {
        throw new Error(`Invalid workflow transition: ${current} -> ${next}`);
    }
};

export const getNeedsAssignmentStatus = (): BookingStatus => BookingStatus.NEEDS_ASSIGNMENT;
export const getAssignmentPendingStatus = (): BookingStatus => BookingStatus.ASSIGNMENT_PENDING;
