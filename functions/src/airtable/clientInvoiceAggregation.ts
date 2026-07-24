import { allocateInvoiceLineAmount } from './statusMapping';

export type ClientInvoiceAggregationRow<TBooking> = {
  sourceRecordId: string;
  invoiceNumber: string;
  hasInvoiceReference: boolean;
  linkedSourceIds: string[];
  bookings: TBooking[];
  grossAmount: number;
  subtotalAmount: number;
  status: string;
};

export type ClientInvoiceAggregationLine<TBooking> = {
  key: string;
  booking: TBooking | null;
  sourceRecordIds: string[];
  grossAmount: number;
  subtotalAmount: number;
};

export type ClientInvoiceAggregationGroup<TBooking> = {
  key: string;
  invoiceNumber: string;
  hasInvoiceReference: boolean;
  rows: ClientInvoiceAggregationRow<TBooking>[];
  sourceRecordIds: string[];
  linkedSourceIds: string[];
  bookings: TBooking[];
  grossAmount: number;
  subtotalAmount: number;
  status: string;
  sourceStatuses: string[];
  statusMismatch: boolean;
  lines: ClientInvoiceAggregationLine<TBooking>[];
};

const money = (value: number) => Number(value.toFixed(2));

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const aggregateStatus = (statuses: string[]) => {
  const normalized = unique(statuses.map(status => status.trim().toUpperCase()));
  if (normalized.length === 1) return normalized[0];
  const active = normalized.filter(status => status !== 'CANCELLED');
  if (!active.length) return 'CANCELLED';
  if (active.every(status => status === 'PAID')) return 'PAID';
  if (active.every(status => status === 'PAID' || status === 'SENT')) return 'SENT';
  return 'DRAFT';
};

export const aggregateClientInvoiceRows = <TBooking>(
  rows: ClientInvoiceAggregationRow<TBooking>[],
  getBookingId: (booking: TBooking) => string,
): ClientInvoiceAggregationGroup<TBooking>[] => {
  const grouped = new Map<string, ClientInvoiceAggregationRow<TBooking>[]>();

  rows.forEach(row => {
    const referenceKey = row.hasInvoiceReference
      ? row.invoiceNumber.trim().toLowerCase()
      : `source:${row.sourceRecordId}`;
    const current = grouped.get(referenceKey) || [];
    current.push(row);
    grouped.set(referenceKey, current);
  });

  return Array.from(grouped.entries()).map(([key, groupedRows]) => {
    const bookingsById = new Map<string, TBooking>();
    const linesByKey = new Map<string, ClientInvoiceAggregationLine<TBooking>>();

    groupedRows.forEach(row => {
      const rowBookings = Array.from(new Map(
        row.bookings
          .map(booking => [getBookingId(booking), booking] as const)
          .filter(([bookingId]) => Boolean(bookingId)),
      ).values());
      rowBookings.forEach(booking => bookingsById.set(getBookingId(booking), booking));

      if (!rowBookings.length) {
        linesByKey.set(`unmatched:${row.sourceRecordId}`, {
          key: `unmatched:${row.sourceRecordId}`,
          booking: null,
          sourceRecordIds: [row.sourceRecordId],
          grossAmount: money(row.grossAmount),
          subtotalAmount: money(row.subtotalAmount),
        });
        return;
      }

      rowBookings.forEach((booking, index) => {
        const bookingId = getBookingId(booking);
        const grossAmount = allocateInvoiceLineAmount(row.grossAmount, index, rowBookings.length);
        const subtotalAmount = allocateInvoiceLineAmount(row.subtotalAmount, index, rowBookings.length);
        const existing = linesByKey.get(bookingId);
        if (existing) {
          existing.sourceRecordIds = unique([...existing.sourceRecordIds, row.sourceRecordId]);
          existing.grossAmount = money(existing.grossAmount + grossAmount);
          existing.subtotalAmount = money(existing.subtotalAmount + subtotalAmount);
          return;
        }
        linesByKey.set(bookingId, {
          key: bookingId,
          booking,
          sourceRecordIds: [row.sourceRecordId],
          grossAmount,
          subtotalAmount,
        });
      });
    });

    const sourceStatuses = unique(groupedRows.map(row => row.status.trim().toUpperCase()));
    return {
      key,
      invoiceNumber: groupedRows[0].invoiceNumber,
      hasInvoiceReference: groupedRows[0].hasInvoiceReference,
      rows: groupedRows,
      sourceRecordIds: unique(groupedRows.map(row => row.sourceRecordId)),
      linkedSourceIds: unique(groupedRows.flatMap(row => row.linkedSourceIds)),
      bookings: Array.from(bookingsById.values()),
      grossAmount: money(groupedRows.reduce((total, row) => total + row.grossAmount, 0)),
      subtotalAmount: money(groupedRows.reduce((total, row) => total + row.subtotalAmount, 0)),
      status: aggregateStatus(sourceStatuses),
      sourceStatuses,
      statusMismatch: sourceStatuses.length > 1,
      lines: Array.from(linesByKey.values()),
    };
  });
};
