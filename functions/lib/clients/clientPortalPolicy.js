"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canReadClientInvoice = exports.canReadClientFinance = exports.canManageClientBooking = exports.buildClientPortalPolicy = void 0;
const text = (value) => String(value ?? '').trim();
const unique = (values) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
const buildClientPortalPolicy = (membership, activeDepartmentIds) => {
    const departments = unique(activeDepartmentIds.map(text));
    if (!membership) {
        return {
            accessLevel: 'LEGACY',
            roles: ['REQUESTER'],
            allowedDepartmentIds: departments,
            canRequest: true,
            canViewBookings: true,
        };
    }
    const status = text(membership.status || 'ACTIVE').toUpperCase();
    const accessLevel = text(membership.accessLevel || 'AGENT').toUpperCase();
    const roles = unique((Array.isArray(membership.roles) ? membership.roles : []).map(role => text(role).toUpperCase()));
    const membershipDepartments = new Set((Array.isArray(membership.departmentIds) ? membership.departmentIds : []).map(text));
    const unrestricted = accessLevel === 'CLIENT_MASTER'
        || (accessLevel === 'CLIENT_FINANCE' && membershipDepartments.size === 0);
    const canRequest = status === 'ACTIVE' && (roles.includes('REQUESTER') || accessLevel === 'CLIENT_MASTER');
    return {
        accessLevel,
        roles,
        allowedDepartmentIds: status === 'ACTIVE'
            ? departments.filter(departmentId => unrestricted || membershipDepartments.has(departmentId))
            : [],
        canRequest,
        canViewBookings: status === 'ACTIVE' && (canRequest
            || ['CLIENT_MASTER', 'DEPARTMENT_MANAGER'].includes(accessLevel)),
    };
};
exports.buildClientPortalPolicy = buildClientPortalPolicy;
const canManageClientBooking = (booking, access) => {
    if (text(booking.clientId) !== access.clientId)
        return false;
    if (access.legacyFallback || access.accessLevel === 'CLIENT_MASTER')
        return true;
    if (access.agentId && text(booking.requestedByAgentId) === access.agentId)
        return true;
    if (text(booking.requestedByUserId) === access.userId)
        return true;
    return access.accessLevel === 'DEPARTMENT_MANAGER'
        && Boolean(text(booking.clientDepartmentId))
        && access.allowedDepartmentIds.includes(text(booking.clientDepartmentId));
};
exports.canManageClientBooking = canManageClientBooking;
const canReadClientFinance = (access) => (access.legacyFallback
    || ['CLIENT_MASTER', 'CLIENT_FINANCE'].includes(text(access.accessLevel).toUpperCase())
    || access.roles.map(role => text(role).toUpperCase()).includes('FINANCE'));
exports.canReadClientFinance = canReadClientFinance;
const canReadClientInvoice = (invoice, access) => {
    if (text(invoice.clientId) !== access.clientId || !(0, exports.canReadClientFinance)(access))
        return false;
    const accessLevel = text(access.accessLevel).toUpperCase();
    if (access.legacyFallback || accessLevel === 'CLIENT_MASTER')
        return true;
    const invoiceDepartmentIds = unique([
        ...(Array.isArray(invoice.clientDepartmentIds) ? invoice.clientDepartmentIds.map(text) : []),
        text(invoice.clientDepartmentId),
    ]);
    const invoiceAgentIds = unique([
        ...(Array.isArray(invoice.requestedByAgentIds) ? invoice.requestedByAgentIds.map(text) : []),
        text(invoice.requestedByAgentId),
    ]);
    if (access.agentId && invoiceAgentIds.includes(access.agentId))
        return true;
    if (invoiceDepartmentIds.length > 0) {
        return invoiceDepartmentIds.some(departmentId => access.allowedDepartmentIds.includes(departmentId));
    }
    // Historical client-wide invoices remain visible during backfill. The
    // integrity audit reports every invoice using this compatibility path.
    return text(invoice.hierarchyScopeStatus) !== 'UNLINKED';
};
exports.canReadClientInvoice = canReadClientInvoice;
//# sourceMappingURL=clientPortalPolicy.js.map