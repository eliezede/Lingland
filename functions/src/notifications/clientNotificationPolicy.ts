export interface ClientNotificationMembershipInput {
  userId?: unknown;
  agentId?: unknown;
  status?: unknown;
  accessLevel?: unknown;
  roles?: unknown;
  departmentIds?: unknown;
}

export interface ClientNotificationScopeInput {
  departmentIds?: unknown;
  agentIds?: unknown;
  directUserIds?: unknown;
}

export type ClientNotificationPurpose = 'BOOKING' | 'FINANCE';

const text = (value: unknown) => String(value ?? '').trim();
const list = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const intersects = (left: string[], right: string[]) => left.some(value => right.includes(value));

export const selectClientNotificationUserIds = (
  memberships: ClientNotificationMembershipInput[],
  scope: ClientNotificationScopeInput,
  purpose: ClientNotificationPurpose,
) => {
  const departmentIds = list(scope.departmentIds);
  const agentIds = list(scope.agentIds);
  const recipients = new Set(list(scope.directUserIds));

  memberships.forEach(membership => {
    if (text(membership.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return;
    const userId = text(membership.userId);
    if (!userId) return;
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
      if (departmentMatch || organisationWide) recipients.add(userId);
    }
  });

  return Array.from(recipients).sort((left, right) => left.localeCompare(right));
};
