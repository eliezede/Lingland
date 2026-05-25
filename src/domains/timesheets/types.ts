import { TenantScopedEntity } from '../../shared/types/baseEntity';

export type TimesheetStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'INVOICED';

export interface Timesheet extends TenantScopedEntity {
    jobId: string; // Alias to bookingId for now
    interpreterId: string;
    clientId: string;

    status: TimesheetStatus;

    submittedAt?: string;
    actualStart: string;
    actualEnd: string;
    breakDurationMinutes: number;

    adminApproved: boolean;
    adminApprovedAt?: string;

    readyForClientInvoice: boolean;
    readyForInterpreterInvoice: boolean;

    unitsBillableToClient: number;
    unitsPayableToInterpreter: number;
    clientAmountCalculated: number;
    interpreterAmountCalculated: number;

    clientInvoiceId?: string | null;
    interpreterInvoiceId?: string | null;
    supportingDocumentUrl?: string;
}
