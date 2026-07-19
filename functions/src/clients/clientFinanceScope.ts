export interface ClientFinanceBookingInput {
  id?: unknown;
  clientId?: unknown;
  clientDepartmentId?: unknown;
  requestedByAgentId?: unknown;
  requestedByUserId?: unknown;
}

export type ClientFinanceHierarchyStatus = 'COMPLETE' | 'PARTIAL' | 'CLIENT_ONLY' | 'UNLINKED';

export interface ClientFinanceHierarchyProjection {
  bookingIds: string[];
  clientDepartmentIds: string[];
  requestedByAgentIds: string[];
  requestedByUserIds: string[];
  clientDepartmentId?: string;
  requestedByAgentId?: string;
  hierarchyScopeStatus: ClientFinanceHierarchyStatus;
  hierarchyCoverage: {
    bookingCount: number;
    departmentLinkedBookings: number;
    requesterLinkedBookings: number;
    fullyScopedBookings: number;
  };
  hierarchyProjectionVersion: 1;
}

const text = (value: unknown) => String(value ?? '').trim();
const unique = (values: unknown[]) => Array.from(new Set(values.map(text).filter(Boolean)))
  .sort((left, right) => left.localeCompare(right));

export const projectClientFinanceHierarchy = (
  bookings: ClientFinanceBookingInput[],
): ClientFinanceHierarchyProjection => {
  const linked = bookings.filter(booking => text(booking.id));
  const bookingIds = unique(linked.map(booking => booking.id));
  const clientDepartmentIds = unique(linked.map(booking => booking.clientDepartmentId));
  const requestedByAgentIds = unique(linked.map(booking => booking.requestedByAgentId));
  const requestedByUserIds = unique(linked.map(booking => booking.requestedByUserId));
  const departmentLinkedBookings = linked.filter(booking => text(booking.clientDepartmentId)).length;
  const requesterLinkedBookings = linked.filter(booking => (
    text(booking.requestedByAgentId) || text(booking.requestedByUserId)
  )).length;
  const fullyScopedBookings = linked.filter(booking => (
    text(booking.clientDepartmentId)
    && (text(booking.requestedByAgentId) || text(booking.requestedByUserId))
  )).length;

  let hierarchyScopeStatus: ClientFinanceHierarchyStatus = 'UNLINKED';
  if (linked.length > 0) {
    if (fullyScopedBookings === linked.length) hierarchyScopeStatus = 'COMPLETE';
    else if (departmentLinkedBookings > 0 || requesterLinkedBookings > 0) hierarchyScopeStatus = 'PARTIAL';
    else hierarchyScopeStatus = 'CLIENT_ONLY';
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

export const projectClientInvoiceLineHierarchy = (booking: ClientFinanceBookingInput | null | undefined) => {
  if (!booking) {
    return {
      hierarchyScopeStatus: 'UNLINKED' as const,
      hierarchyProjectionVersion: 1 as const,
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
      ? 'COMPLETE' as const
      : (clientDepartmentId || requestedByAgentId || requestedByUserId)
        ? 'PARTIAL' as const
        : 'CLIENT_ONLY' as const,
    hierarchyProjectionVersion: 1 as const,
  };
};
