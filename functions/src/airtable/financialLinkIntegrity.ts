import {
  mapClientInvoiceStatusValue,
  mapInterpreterInvoiceStatusValue,
} from './statusMapping';

export type FinancialBookingLinkIssue = {
  id: string;
  bookingId: string;
  jobNumber: string;
  clientId: string;
  clientName: string;
  sourceSystem: string;
  sourceTable: string;
  sourceRecordId: string;
  sourceInvoiceReference: string;
  status: string;
  billingState: string;
  paymentStatus: string;
  invoiceIds: string[];
  reason: 'CLIENT_INVOICE_LINK_MISSING' | 'CLIENT_INVOICE_DOCUMENT_MISSING' | 'BOOKING_INVOICE_BACKLINK_MISSING';
  severity: 'MEDIUM' | 'HIGH';
  recommendedAction: string;
};

type DocumentRecord = {
  id: string;
  data: Record<string, unknown>;
};

type BookingInvoiceAuditInput = {
  bookings: DocumentRecord[];
  clientInvoices: DocumentRecord[];
  clientInvoiceLines: DocumentRecord[];
};

const text = (value: unknown) => String(value || '').trim();

const upper = (value: unknown) => text(value).toUpperCase();

export const getExpectedFinancialInvoiceStatus = (
  invoiceType: 'CLIENT' | 'INTERPRETER',
  data: Record<string, unknown>,
) => {
  const rawStatus = text(data.airtableStatus);
  if (!rawStatus) return '';

  const hasPaidEvidence = data.airtablePaid === true || Boolean(text(data.paidAt));
  if (invoiceType === 'CLIENT') {
    return mapClientInvoiceStatusValue(rawStatus, {
      paid: hasPaidEvidence,
      sent: data.airtableSent === true || Boolean(text(data.sentAt)),
    });
  }

  return hasPaidEvidence ? 'PAID' : mapInterpreterInvoiceStatusValue(rawStatus);
};

const stringList = (value: unknown) => Array.isArray(value)
  ? value.map(text).filter(Boolean)
  : [text(value)].filter(Boolean);

const financialSignal = (booking: Record<string, unknown>) => {
  const status = upper(booking.status);
  const billingState = upper(booking.billingState);
  const paymentStatus = upper(booking.paymentStatus);
  const signals = booking.airtableStatusSignals && typeof booking.airtableStatusSignals === 'object'
    ? booking.airtableStatusSignals as Record<string, unknown>
    : {};
  return ['INVOICED', 'PAID'].includes(status)
    || ['INVOICED', 'PAID'].includes(billingState)
    || ['INVOICED', 'PAID'].includes(paymentStatus)
    || Boolean(signals.hasClientInvoice)
    || Boolean(text(signals.invoiceNumber));
};

const sourceInvoiceReference = (booking: Record<string, unknown>) => {
  const signals = booking.airtableStatusSignals && typeof booking.airtableStatusSignals === 'object'
    ? booking.airtableStatusSignals as Record<string, unknown>
    : {};
  return text(
    booking.clientInvoiceNumber
    || booking.clientInvoiceReference
    || signals.invoiceNumber
    || booking.airtableFinancialStatus,
  );
};

export const auditBookingInvoiceLinks = ({
  bookings,
  clientInvoices,
  clientInvoiceLines,
}: BookingInvoiceAuditInput): FinancialBookingLinkIssue[] => {
  const invoiceIds = new Set(clientInvoices.map(invoice => invoice.id));
  const lineInvoiceIdsByBookingId = new Map<string, Set<string>>();

  clientInvoiceLines.forEach(line => {
    const bookingId = text(line.data.bookingId);
    const invoiceId = text(line.data.invoiceId || line.data.clientInvoiceId);
    if (!bookingId || !invoiceId) return;
    const current = lineInvoiceIdsByBookingId.get(bookingId) || new Set<string>();
    current.add(invoiceId);
    lineInvoiceIdsByBookingId.set(bookingId, current);
  });

  return bookings.flatMap<FinancialBookingLinkIssue>(booking => {
    if (!financialSignal(booking.data)) return [];

    const directInvoiceIds = stringList(booking.data.clientInvoiceId);
    const lineInvoiceIds = Array.from(lineInvoiceIdsByBookingId.get(booking.id) || []);
    const linkedInvoiceIds = Array.from(new Set([...directInvoiceIds, ...lineInvoiceIds]));
    const missingInvoiceIds = linkedInvoiceIds.filter(invoiceId => !invoiceIds.has(invoiceId));
    const status = upper(booking.data.status);
    const billingState = upper(booking.data.billingState);
    const paymentStatus = upper(booking.data.paymentStatus);
    const common = {
      bookingId: booking.id,
      jobNumber: text(booking.data.jobNumber || booking.data.displayRef || booking.data.bookingRef || booking.id),
      clientId: text(booking.data.clientId),
      clientName: text(booking.data.clientName),
      sourceSystem: upper(booking.data.sourceSystem),
      sourceTable: text(booking.data.sourceTable),
      sourceRecordId: text(booking.data.sourceRecordId),
      sourceInvoiceReference: sourceInvoiceReference(booking.data),
      status,
      billingState,
      paymentStatus,
      invoiceIds: linkedInvoiceIds,
    };

    if (!linkedInvoiceIds.length) {
      return [{
        id: `booking_${booking.id}_client_invoice_link_missing`,
        ...common,
        reason: 'CLIENT_INVOICE_LINK_MISSING' as const,
        severity: 'HIGH' as const,
        recommendedAction: common.sourceSystem === 'AIRTABLE'
          ? 'Import the linked Airtable invoice and persist its booking line before financial sign-off.'
          : 'Create or link the client invoice document before treating this job as invoiced or paid.',
      }];
    }

    if (missingInvoiceIds.length) {
      return [{
        id: `booking_${booking.id}_client_invoice_document_missing`,
        ...common,
        invoiceIds: missingInvoiceIds,
        reason: 'CLIENT_INVOICE_DOCUMENT_MISSING' as const,
        severity: 'HIGH' as const,
        recommendedAction: 'Restore or import the referenced invoice document, then rebuild its invoice lines.',
      }];
    }

    if (!directInvoiceIds.length && lineInvoiceIds.length) {
      return [{
        id: `booking_${booking.id}_invoice_backlink_missing`,
        ...common,
        reason: 'BOOKING_INVOICE_BACKLINK_MISSING' as const,
        severity: 'MEDIUM' as const,
        recommendedAction: 'Backfill the booking clientInvoiceId from its verified invoice line.',
      }];
    }

    return [];
  });
};
