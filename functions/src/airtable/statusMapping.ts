export const STATUS_RANK: Record<string, number> = {
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

export const canonicalAirtableStatus = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const REDBOOK_STATUS_MAP: Record<string, string> = {
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

const TRANSLATION_STATUS_MAP: Record<string, string> = {
  ...REDBOOK_STATUS_MAP,
  completed: 'READY_FOR_INVOICE',
  verified: 'READY_FOR_INVOICE',
};

export const mapExplicitRedbookStatus = (value: string) => REDBOOK_STATUS_MAP[canonicalAirtableStatus(value)];
export const mapExplicitTranslationStatus = (value: string) => TRANSLATION_STATUS_MAP[canonicalAirtableStatus(value)];

const isExplicitlyUnpaid = (value: string) => /\b(unpaid|not paid|outstanding|overdue|awaiting payment|part(?:ially)? paid)\b/i.test(value);
const isExplicitlyPaid = (value: string) => !isExplicitlyUnpaid(value)
  && /\b(paid|payment received|settled|cleared)\b/i.test(value);

export const mapClientInvoiceStatusValue = (
  rawStatus: string,
  signals: { paid?: boolean; sent?: boolean } = {}
) => {
  const value = canonicalAirtableStatus(rawStatus);
  if (/\bcancel(?:led|ed)?\b/.test(value)) return 'CANCELLED';
  if (/\binvoic(?:e|ed|ing)\s+by\s+interp(?:reter)?\b/.test(value)) return 'DRAFT';
  if (signals.paid || isExplicitlyPaid(value)) return 'PAID';
  if (
    signals.sent
    || isExplicitlyUnpaid(value)
    || /\b(sent|emailed|issued|invoic(?:ed|ing)|awaiting|outstanding|overdue)\b/.test(value)
  ) return 'SENT';
  return 'DRAFT';
};

export const mapInterpreterInvoiceStatusValue = (rawStatus: string) => {
  const value = canonicalAirtableStatus(rawStatus);
  if (/\bcancel(?:led|ed)?\b/.test(value)) return 'CANCELLED';
  if (/\breject(?:ed)?\b/.test(value)) return 'REJECTED';
  if (isExplicitlyPaid(value)) return 'PAID';
  if (/\bapprov(?:ed)?\b/.test(value)) return 'APPROVED';
  return 'SUBMITTED';
};

export const mapClientInvoiceStatusToBookingStatus = (invoiceStatus: string) => {
  if (invoiceStatus === 'PAID') return 'PAID';
  if (invoiceStatus === 'SENT') return 'INVOICED';
  if (invoiceStatus === 'CANCELLED') return 'READY_FOR_INVOICE';
  return 'INVOICING';
};

export const mapClientInvoiceStatusToPaymentStatus = (invoiceStatus: string) => {
  if (invoiceStatus === 'PAID') return 'PAID';
  if (invoiceStatus === 'SENT') return 'INVOICED';
  if (invoiceStatus === 'CANCELLED') return 'ISSUE';
  return 'READY_FOR_INVOICE';
};

export const allocateInvoiceLineAmount = (total: number, index: number, lineCount: number) => {
  if (lineCount <= 1) return Number(total.toFixed(2));
  const totalCents = Math.round(total * 100);
  const baseCents = Math.trunc(totalCents / lineCount);
  const remainderCents = totalCents - (baseCents * lineCount);
  return (baseCents + (index === lineCount - 1 ? remainderCents : 0)) / 100;
};

export const preserveStatusIfLocalAhead = (
  existingStatus: string | undefined,
  incomingStatus: string,
  sourceOfTruth: string | undefined
) => {
  if (!existingStatus || sourceOfTruth === 'AIRTABLE') return incomingStatus;
  if (incomingStatus === 'CANCELLED' || incomingStatus === 'PAID') return incomingStatus;
  return (STATUS_RANK[existingStatus] || 0) > (STATUS_RANK[incomingStatus] || 0)
    ? existingStatus
    : incomingStatus;
};
