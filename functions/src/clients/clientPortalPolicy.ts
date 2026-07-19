export interface ClientPortalMembershipPolicyInput {
  status?: unknown;
  accessLevel?: unknown;
  roles?: unknown;
  departmentIds?: unknown;
}

export interface ClientPortalPolicy {
  accessLevel: string;
  roles: string[];
  allowedDepartmentIds: string[];
  canRequest: boolean;
  canViewBookings: boolean;
}

export interface ClientBookingScopeInput {
  clientId?: unknown;
  clientDepartmentId?: unknown;
  requestedByAgentId?: unknown;
  requestedByUserId?: unknown;
}

export interface ClientInvoiceScopeInput {
  clientId?: unknown;
  clientDepartmentId?: unknown;
  clientDepartmentIds?: unknown;
  requestedByAgentId?: unknown;
  requestedByAgentIds?: unknown;
  hierarchyScopeStatus?: unknown;
}

const text = (value: unknown) => String(value ?? '').trim();
const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

export const buildClientPortalPolicy = (
  membership: ClientPortalMembershipPolicyInput | null,
  activeDepartmentIds: string[],
): ClientPortalPolicy => {
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
  const membershipDepartments = new Set(
    (Array.isArray(membership.departmentIds) ? membership.departmentIds : []).map(text),
  );
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
    canViewBookings: status === 'ACTIVE' && (
      canRequest
      || ['CLIENT_MASTER', 'DEPARTMENT_MANAGER'].includes(accessLevel)
    ),
  };
};

export const canManageClientBooking = (
  booking: ClientBookingScopeInput,
  access: {
    clientId: string;
    userId: string;
    agentId: string;
    accessLevel: string;
    allowedDepartmentIds: string[];
    legacyFallback: boolean;
  },
) => {
  if (text(booking.clientId) !== access.clientId) return false;
  if (access.legacyFallback || access.accessLevel === 'CLIENT_MASTER') return true;
  if (access.agentId && text(booking.requestedByAgentId) === access.agentId) return true;
  if (text(booking.requestedByUserId) === access.userId) return true;
  return access.accessLevel === 'DEPARTMENT_MANAGER'
    && Boolean(text(booking.clientDepartmentId))
    && access.allowedDepartmentIds.includes(text(booking.clientDepartmentId));
};

export const canReadClientFinance = (access: {
  accessLevel: string;
  roles: string[];
  legacyFallback: boolean;
}) => (
  access.legacyFallback
  || ['CLIENT_MASTER', 'CLIENT_FINANCE'].includes(text(access.accessLevel).toUpperCase())
  || access.roles.map(role => text(role).toUpperCase()).includes('FINANCE')
);

export const canReadClientInvoice = (
  invoice: ClientInvoiceScopeInput,
  access: {
    clientId: string;
    agentId: string;
    accessLevel: string;
    roles: string[];
    allowedDepartmentIds: string[];
    legacyFallback: boolean;
  },
) => {
  if (text(invoice.clientId) !== access.clientId || !canReadClientFinance(access)) return false;
  const accessLevel = text(access.accessLevel).toUpperCase();
  if (access.legacyFallback || accessLevel === 'CLIENT_MASTER') return true;

  const invoiceDepartmentIds = unique([
    ...(Array.isArray(invoice.clientDepartmentIds) ? invoice.clientDepartmentIds.map(text) : []),
    text(invoice.clientDepartmentId),
  ]);
  const invoiceAgentIds = unique([
    ...(Array.isArray(invoice.requestedByAgentIds) ? invoice.requestedByAgentIds.map(text) : []),
    text(invoice.requestedByAgentId),
  ]);

  if (access.agentId && invoiceAgentIds.includes(access.agentId)) return true;
  if (invoiceDepartmentIds.length > 0) {
    return invoiceDepartmentIds.some(departmentId => access.allowedDepartmentIds.includes(departmentId));
  }

  // Historical client-wide invoices remain visible during backfill. The
  // integrity audit reports every invoice using this compatibility path.
  return text(invoice.hierarchyScopeStatus) !== 'UNLINKED';
};
