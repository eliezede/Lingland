"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectClientNotificationUserIds = void 0;
const text = (value) => String(value ?? '').trim();
const list = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const intersects = (left, right) => left.some(value => right.includes(value));
const selectClientNotificationUserIds = (memberships, scope, purpose) => {
    const departmentIds = list(scope.departmentIds);
    const agentIds = list(scope.agentIds);
    const recipients = new Set(list(scope.directUserIds));
    memberships.forEach(membership => {
        if (text(membership.status || 'ACTIVE').toUpperCase() !== 'ACTIVE')
            return;
        const userId = text(membership.userId);
        if (!userId)
            return;
        const accessLevel = text(membership.accessLevel || 'AGENT').toUpperCase();
        const roles = list(membership.roles).map(role => role.toUpperCase());
        const membershipDepartments = list(membership.departmentIds);
        const ownAgent = text(membership.agentId) && agentIds.includes(text(membership.agentId));
        const departmentMatch = departmentIds.length > 0 && intersects(departmentIds, membershipDepartments);
        const organisationWide = membershipDepartments.length === 0;
        if (accessLevel === 'CLIENT_MASTER' || ownAgent) {
            recipients.add(userId);
            return;
        }
        if (purpose === 'BOOKING' && accessLevel === 'DEPARTMENT_MANAGER' && departmentMatch) {
            recipients.add(userId);
            return;
        }
        if (purpose === 'FINANCE' && (accessLevel === 'CLIENT_FINANCE' || roles.includes('FINANCE'))) {
            if (departmentMatch || organisationWide)
                recipients.add(userId);
        }
    });
    return Array.from(recipients).sort((left, right) => left.localeCompare(right));
};
exports.selectClientNotificationUserIds = selectClientNotificationUserIds;
//# sourceMappingURL=clientNotificationPolicy.js.map