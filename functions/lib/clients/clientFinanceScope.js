"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectClientInvoiceLineHierarchy = exports.projectClientFinanceHierarchy = void 0;
const text = (value) => String(value ?? '').trim();
const unique = (values) => Array.from(new Set(values.map(text).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));
const projectClientFinanceHierarchy = (bookings) => {
    const linked = bookings.filter(booking => text(booking.id));
    const bookingIds = unique(linked.map(booking => booking.id));
    const clientDepartmentIds = unique(linked.map(booking => booking.clientDepartmentId));
    const requestedByAgentIds = unique(linked.map(booking => booking.requestedByAgentId));
    const requestedByUserIds = unique(linked.map(booking => booking.requestedByUserId));
    const departmentLinkedBookings = linked.filter(booking => text(booking.clientDepartmentId)).length;
    const requesterLinkedBookings = linked.filter(booking => (text(booking.requestedByAgentId) || text(booking.requestedByUserId))).length;
    const fullyScopedBookings = linked.filter(booking => (text(booking.clientDepartmentId)
        && (text(booking.requestedByAgentId) || text(booking.requestedByUserId)))).length;
    let hierarchyScopeStatus = 'UNLINKED';
    if (linked.length > 0) {
        if (fullyScopedBookings === linked.length)
            hierarchyScopeStatus = 'COMPLETE';
        else if (departmentLinkedBookings > 0 || requesterLinkedBookings > 0)
            hierarchyScopeStatus = 'PARTIAL';
        else
            hierarchyScopeStatus = 'CLIENT_ONLY';
    }
    return {
        bookingIds,
        clientDepartmentIds,
        requestedByAgentIds,
        requestedByUserIds,
        ...(clientDepartmentIds.length === 1 ? { clientDepartmentId: clientDepartmentIds[0] } : {}),
        ...(requestedByAgentIds.length === 1 ? { requestedByAgentId: requestedByAgentIds[0] } : {}),
        hierarchyScopeStatus,
        hierarchyCoverage: {
            bookingCount: linked.length,
            departmentLinkedBookings,
            requesterLinkedBookings,
            fullyScopedBookings,
        },
        hierarchyProjectionVersion: 1,
    };
};
exports.projectClientFinanceHierarchy = projectClientFinanceHierarchy;
const projectClientInvoiceLineHierarchy = (booking) => {
    if (!booking) {
        return {
            hierarchyScopeStatus: 'UNLINKED',
            hierarchyProjectionVersion: 1,
        };
    }
    const clientId = text(booking.clientId);
    const clientDepartmentId = text(booking.clientDepartmentId);
    const requestedByAgentId = text(booking.requestedByAgentId);
    const requestedByUserId = text(booking.requestedByUserId);
    return {
        ...(clientId ? { clientId } : {}),
        ...(clientDepartmentId ? { clientDepartmentId } : {}),
        ...(requestedByAgentId ? { requestedByAgentId } : {}),
        ...(requestedByUserId ? { requestedByUserId } : {}),
        hierarchyScopeStatus: clientDepartmentId && (requestedByAgentId || requestedByUserId)
            ? 'COMPLETE'
            : (clientDepartmentId || requestedByAgentId || requestedByUserId)
                ? 'PARTIAL'
                : 'CLIENT_ONLY',
        hierarchyProjectionVersion: 1,
    };
};
exports.projectClientInvoiceLineHierarchy = projectClientInvoiceLineHierarchy;
//# sourceMappingURL=clientFinanceScope.js.map