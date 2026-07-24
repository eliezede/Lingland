"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateClientInvoiceRows = exports.shouldReportInvoiceLinkConflict = exports.requiresIssuedInvoiceIntegrity = void 0;
const statusMapping_1 = require("./statusMapping");
const money = (value) => Number(value.toFixed(2));
const unique = (values) => Array.from(new Set(values.filter(Boolean)));
const aggregateStatus = (statuses) => {
    const normalized = unique(statuses.map(status => status.trim().toUpperCase()));
    const active = normalized.filter(status => status !== 'CANCELLED');
    if (!active.length)
        return 'CANCELLED';
    if (active.includes('PAID'))
        return 'PAID';
    if (active.includes('SENT'))
        return 'SENT';
    return 'DRAFT';
};
const hasIncompatibleStatuses = (statuses) => {
    const normalized = unique(statuses.map(status => status.trim().toUpperCase()));
    return normalized.includes('CANCELLED') && normalized.some(status => status !== 'CANCELLED');
};
const requiresIssuedInvoiceIntegrity = (status) => (['SENT', 'PAID'].includes(status.trim().toUpperCase()));
exports.requiresIssuedInvoiceIntegrity = requiresIssuedInvoiceIntegrity;
const shouldReportInvoiceLinkConflict = (status, hasJobLinkConflict) => hasJobLinkConflict && (0, exports.requiresIssuedInvoiceIntegrity)(status);
exports.shouldReportInvoiceLinkConflict = shouldReportInvoiceLinkConflict;
const aggregateClientInvoiceRows = (rows, getBookingId) => {
    const grouped = new Map();
    rows.forEach(row => {
        const referenceKey = row.hasInvoiceReference
            ? row.invoiceNumber.trim().toLowerCase()
            : `source:${row.sourceRecordId}`;
        const current = grouped.get(referenceKey) || [];
        current.push(row);
        grouped.set(referenceKey, current);
    });
    return Array.from(grouped.entries()).map(([key, groupedRows]) => {
        const bookingsById = new Map();
        const linesByKey = new Map();
        groupedRows.forEach(row => {
            const rowBookings = Array.from(new Map(row.bookings
                .map(booking => [getBookingId(booking), booking])
                .filter(([bookingId]) => Boolean(bookingId))).values());
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
                const grossAmount = (0, statusMapping_1.allocateInvoiceLineAmount)(row.grossAmount, index, rowBookings.length);
                const subtotalAmount = (0, statusMapping_1.allocateInvoiceLineAmount)(row.subtotalAmount, index, rowBookings.length);
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
            statusMismatch: hasIncompatibleStatuses(sourceStatuses),
            lines: Array.from(linesByKey.values()),
        };
    });
};
exports.aggregateClientInvoiceRows = aggregateClientInvoiceRows;
//# sourceMappingURL=clientInvoiceAggregation.js.map