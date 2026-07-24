"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preserveStatusIfLocalAhead = exports.allocateInvoiceLineAmount = exports.mapClientInvoiceStatusToPaymentStatus = exports.mapClientInvoiceStatusToBookingStatus = exports.mapInterpreterInvoiceStatusValue = exports.mapClientInvoiceStatusValue = exports.mapExplicitTranslationStatus = exports.mapExplicitRedbookStatus = exports.canonicalAirtableStatus = exports.STATUS_RANK = void 0;
exports.STATUS_RANK = {
    DRAFT: 0,
    INCOMING: 1,
    NEEDS_ASSIGNMENT: 2,
    ASSIGNMENT_PENDING: 3,
    PENDING_ASSIGNMENT: 3,
    OPENED: 3,
    QUOTE_PENDING: 3,
    BOOKED: 4,
    SESSION_COMPLETED: 5,
    TIMESHEET_SUBMITTED: 6,
    TIMESHEET_VERIFIED: 7,
    VERIFIED: 7,
    READY_FOR_INVOICE: 8,
    INVOICING: 8,
    INVOICED: 9,
    PAID: 10,
    ADMIN: 50,
    ADMIN_HOLD: 50,
    CANCELLED: 99,
};
const canonicalAirtableStatus = (value) => value.trim().toLowerCase().replace(/\s+/g, ' ');
exports.canonicalAirtableStatus = canonicalAirtableStatus;
const REDBOOK_STATUS_MAP = {
    incoming: 'INCOMING',
    'incoming 23': 'INCOMING',
    quote: 'QUOTE_PENDING',
    opened: 'OPENED',
    'opened tr': 'OPENED',
    'assigned tr': 'OPENED',
    admin: 'ADMIN',
    'admin tr': 'ADMIN',
    booked: 'BOOKED',
    cancelled: 'CANCELLED',
    'early cancellation': 'CANCELLED',
    'unfilled/missed': 'CANCELLED',
    unclaimed: 'NEEDS_ASSIGNMENT',
    invoicing: 'INVOICING',
    'sent and invoicing tr': 'INVOICING',
    'invoice sage': 'INVOICING',
    invoiced: 'INVOICED',
    'invoiced and completed': 'INVOICED',
    paid: 'PAID',
    russian: 'INCOMING',
};
const TRANSLATION_STATUS_MAP = {
    ...REDBOOK_STATUS_MAP,
    completed: 'READY_FOR_INVOICE',
    verified: 'READY_FOR_INVOICE',
};
const mapExplicitRedbookStatus = (value) => REDBOOK_STATUS_MAP[(0, exports.canonicalAirtableStatus)(value)];
exports.mapExplicitRedbookStatus = mapExplicitRedbookStatus;
const mapExplicitTranslationStatus = (value) => TRANSLATION_STATUS_MAP[(0, exports.canonicalAirtableStatus)(value)];
exports.mapExplicitTranslationStatus = mapExplicitTranslationStatus;
const isExplicitlyUnpaid = (value) => /\b(unpaid|not paid|outstanding|overdue|awaiting payment|part(?:ially)? paid)\b/i.test(value);
const isExplicitlyPaid = (value) => !isExplicitlyUnpaid(value)
    && /\b(paid|payment received|settled|cleared)\b/i.test(value);
const mapClientInvoiceStatusValue = (rawStatus, signals = {}) => {
    const value = (0, exports.canonicalAirtableStatus)(rawStatus);
    if (/\bcancel(?:led|ed)?\b/.test(value))
        return 'CANCELLED';
    if (/\binvoic(?:e|ed|ing)\s+by\s+interp(?:reter)?\b/.test(value))
        return 'DRAFT';
    if (signals.paid || isExplicitlyPaid(value))
        return 'PAID';
    if (signals.sent
        || isExplicitlyUnpaid(value)
        || /\b(sent|emailed|issued|invoic(?:ed|ing)|awaiting|outstanding|overdue)\b/.test(value))
        return 'SENT';
    return 'DRAFT';
};
exports.mapClientInvoiceStatusValue = mapClientInvoiceStatusValue;
const mapInterpreterInvoiceStatusValue = (rawStatus) => {
    const value = (0, exports.canonicalAirtableStatus)(rawStatus);
    if (/\bcancel(?:led|ed)?\b/.test(value))
        return 'CANCELLED';
    if (/\breject(?:ed)?\b/.test(value))
        return 'REJECTED';
    if (isExplicitlyPaid(value))
        return 'PAID';
    if (/\bapprov(?:ed)?\b/.test(value))
        return 'APPROVED';
    return 'SUBMITTED';
};
exports.mapInterpreterInvoiceStatusValue = mapInterpreterInvoiceStatusValue;
const mapClientInvoiceStatusToBookingStatus = (invoiceStatus) => {
    if (invoiceStatus === 'PAID')
        return 'PAID';
    if (invoiceStatus === 'SENT')
        return 'INVOICED';
    if (invoiceStatus === 'CANCELLED')
        return 'READY_FOR_INVOICE';
    return 'INVOICING';
};
exports.mapClientInvoiceStatusToBookingStatus = mapClientInvoiceStatusToBookingStatus;
const mapClientInvoiceStatusToPaymentStatus = (invoiceStatus) => {
    if (invoiceStatus === 'PAID')
        return 'PAID';
    if (invoiceStatus === 'SENT')
        return 'INVOICED';
    if (invoiceStatus === 'CANCELLED')
        return 'ISSUE';
    return 'READY_FOR_INVOICE';
};
exports.mapClientInvoiceStatusToPaymentStatus = mapClientInvoiceStatusToPaymentStatus;
const allocateInvoiceLineAmount = (total, index, lineCount) => {
    if (lineCount <= 1)
        return Number(total.toFixed(2));
    const totalCents = Math.round(total * 100);
    const baseCents = Math.trunc(totalCents / lineCount);
    const remainderCents = totalCents - (baseCents * lineCount);
    return (baseCents + (index === lineCount - 1 ? remainderCents : 0)) / 100;
};
exports.allocateInvoiceLineAmount = allocateInvoiceLineAmount;
const preserveStatusIfLocalAhead = (existingStatus, incomingStatus, sourceOfTruth) => {
    if (!existingStatus || sourceOfTruth === 'AIRTABLE')
        return incomingStatus;
    if (incomingStatus === 'CANCELLED' || incomingStatus === 'PAID')
        return incomingStatus;
    return (exports.STATUS_RANK[existingStatus] || 0) > (exports.STATUS_RANK[incomingStatus] || 0)
        ? existingStatus
        : incomingStatus;
};
exports.preserveStatusIfLocalAhead = preserveStatusIfLocalAhead;
//# sourceMappingURL=statusMapping.js.map