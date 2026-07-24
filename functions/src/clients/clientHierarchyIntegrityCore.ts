import { createHash } from 'node:crypto';
import {
  projectClientFinanceHierarchy,
  projectClientInvoiceLineHierarchy,
} from './clientFinanceScope';
import { isPlaceholderClientIdentity, resolveClientIdentity } from './clientIdentityResolution';

export interface IntegrityDocument {
  id: string;
  data: Record<string, unknown>;
}

export interface ClientHierarchyIntegrityInput {
  clients: IntegrityDocument[];
  departments: IntegrityDocument[];
  agents: IntegrityDocument[];
  memberships: IntegrityDocument[];
  users: IntegrityDocument[];
  bookings: IntegrityDocument[];
  invoices: IntegrityDocument[];
  invoiceLines: IntegrityDocument[];
  notifications?: IntegrityDocument[];
  generatedAt?: string;
  truncated?: boolean;
}

export type ClientHierarchyIssueSeverity = 'CRITICAL' | 'WARNING';

export interface ClientHierarchyIssue {
  code: string;
  severity: ClientHierarchyIssueSeverity;
  entityType: string;
  entityId: string;
  clientId?: string;
  message: string;
}

export interface ClientFinanceBackfillUpdate {
  id: string;
  patch: Record<string, unknown>;
  clearFields: string[];
}

export type ClientBookingHierarchyIssueCode =
  | 'CLIENT_INVALID'
  | 'DEPARTMENT_INVALID'
  | 'AGENT_MISSING'
  | 'AGENT_NOT_MEMBER';

export interface ClientFinanceBlockedBooking {
  bookingId: string;
  reference: string;
  clientId: string;
  clientName: string;
  clientDepartmentId: string;
  requestedByAgentId: string;
  date: string;
  serviceType: string;
  issueCodes: ClientBookingHierarchyIssueCode[];
  hierarchyFingerprint: string;
}

export interface ClientFinanceBackfillPlan {
  fingerprint: string;
  invoicesScanned: number;
  linesScanned: number;
  invoiceUpdates: ClientFinanceBackfillUpdate[];
  lineUpdates: ClientFinanceBackfillUpdate[];
  blockedInvoiceIds: string[];
  unlinkedInvoiceIds: string[];
  inferredClientAssignments: Array<{
    invoiceId: string;
    clientId: string;
    confidence: 'HIGH' | 'MEDIUM';
    method: 'LINKED_JOB' | 'ACCOUNT_KEY' | 'EXACT_NAME';
    evidence: string[];
  }>;
  blockedInvoices: Array<{
    invoiceId: string;
    reason: 'MULTIPLE_CLIENTS' | 'BOOKING_LINK_MISSING' | 'INVALID_BOOKING_SCOPE' | 'CLIENT_IDENTITY_UNRESOLVED';
    candidateClientIds: string[];
    evidence: string[];
    currentClientId: string;
    clientName: string;
    invoiceNumber: string;
    status: string;
    bookingIds: string[];
    missingBookingIds: string[];
    bookings: ClientFinanceBlockedBooking[];
  }>;
}

export type ClientHierarchyScopeBatchBlockerCode =
  | 'BOOKING_NOT_FOUND'
  | 'CLIENT_MISMATCH'
  | 'DEPARTMENT_CONFLICT'
  | 'REQUESTER_CONFLICT';

export interface ClientHierarchyScopeBatchTarget {
  clientId: string;
  clientDepartmentId?: string;
  requestedByAgentId?: string;
  bookingIds: string[];
}

export interface ClientHierarchyScopeBatchJob {
  bookingId: string;
  reference: string;
  date: string;
  status: string;
  currentFingerprint: string;
  currentClientDepartmentId: string;
  currentRequestedByAgentId: string;
  nextClientDepartmentId: string;
  nextRequestedByAgentId: string;
  linkedInvoiceIds: string[];
}

export interface ClientHierarchyScopeBatchPlan {
  fingerprint: string;
  target: {
    clientId: string;
    clientDepartmentId: string;
    requestedByAgentId: string;
  };
  requestedBookingCount: number;
  eligibleBookingCount: number;
  unchangedBookingCount: number;
  financeLinkedBookingCount: number;
  linkedInvoiceIds: string[];
  jobs: ClientHierarchyScopeBatchJob[];
  blockers: Array<{
    bookingId: string;
    code: ClientHierarchyScopeBatchBlockerCode;
    message: string;
  }>;
}

const text = (value: unknown) => String(value ?? '').trim();
const values = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean))).sort((a, b) => a.localeCompare(b));
const sameStrings = (left: unknown, right: unknown) => JSON.stringify(unique(values(left))) === JSON.stringify(unique(values(right)));
const sameValue = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

export const createBookingHierarchyFingerprint = (bookingId: string, data: Record<string, unknown>) => {
  const snapshot = data.clientSnapshot && typeof data.clientSnapshot === 'object'
    ? data.clientSnapshot as Record<string, unknown>
    : {};
  return createHash('sha256')
    .update(JSON.stringify({
      bookingId,
      clientId: text(data.clientId),
      clientDepartmentId: text(data.clientDepartmentId),
      requestedByAgentId: text(data.requestedByAgentId),
      requestedByUserId: text(data.requestedByUserId),
      clientSnapshot: {
        organizationName: text(snapshot.organizationName),
        departmentName: text(snapshot.departmentName),
        requesterName: text(snapshot.requesterName),
        requesterEmail: text(snapshot.requesterEmail),
      },
    }))
    .digest('hex');
};

const clientResolver = (clients: IntegrityDocument[]) => {
  const byId = new Map(clients.map(client => [client.id, client]));
  const resolve = (requestedId: string) => {
    let currentId = requestedId;
    for (let depth = 0; currentId && depth < 5; depth += 1) {
      const current = byId.get(currentId);
      if (!current) return { id: currentId, exists: false, redirected: currentId !== requestedId };
      const nextId = text(current.data.mergedIntoClientId);
      if (!nextId || nextId === currentId) return { id: currentId, exists: true, redirected: currentId !== requestedId };
      currentId = nextId;
    }
    return { id: currentId, exists: false, redirected: currentId !== requestedId };
  };
  return { byId, resolve };
};

export const buildClientHierarchyScopeBatchPlan = (
  input: ClientHierarchyIntegrityInput,
  requestedTarget: ClientHierarchyScopeBatchTarget,
): ClientHierarchyScopeBatchPlan => {
  const target = {
    clientId: text(requestedTarget.clientId),
    clientDepartmentId: text(requestedTarget.clientDepartmentId),
    requestedByAgentId: text(requestedTarget.requestedByAgentId),
  };
  const requestedBookingIds = unique(requestedTarget.bookingIds.map(text));
  const bookingById = new Map(input.bookings.map(booking => [booking.id, booking]));
  const { resolve } = clientResolver(input.clients);
  const invoiceIdsByBooking = new Map<string, string[]>();

  input.invoiceLines.forEach(line => {
    const bookingId = text(line.data.bookingId);
    const invoiceId = text(line.data.invoiceId || line.data.clientInvoiceId);
    if (!bookingId || !invoiceId) return;
    invoiceIdsByBooking.set(bookingId, unique([...(invoiceIdsByBooking.get(bookingId) || []), invoiceId]));
  });
  input.bookings.forEach(booking => {
    const invoiceId = text(booking.data.clientInvoiceId);
    if (!invoiceId) return;
    invoiceIdsByBooking.set(booking.id, unique([...(invoiceIdsByBooking.get(booking.id) || []), invoiceId]));
  });

  const jobs: ClientHierarchyScopeBatchJob[] = [];
  const blockers: ClientHierarchyScopeBatchPlan['blockers'] = [];
  let unchangedBookingCount = 0;

  requestedBookingIds.forEach(bookingId => {
    const booking = bookingById.get(bookingId);
    if (!booking) {
      blockers.push({
        bookingId,
        code: 'BOOKING_NOT_FOUND',
        message: 'The selected job no longer exists.',
      });
      return;
    }
    const currentClient = resolve(text(booking.data.clientId));
    if (!currentClient.exists || currentClient.id !== target.clientId) {
      blockers.push({
        bookingId,
        code: 'CLIENT_MISMATCH',
        message: 'The selected job is outside this canonical client.',
      });
      return;
    }

    const currentDepartmentId = text(booking.data.clientDepartmentId);
    const currentAgentId = text(booking.data.requestedByAgentId);
    if (target.clientDepartmentId && currentDepartmentId && currentDepartmentId !== target.clientDepartmentId) {
      blockers.push({
        bookingId,
        code: 'DEPARTMENT_CONFLICT',
        message: 'The selected job already belongs to another department.',
      });
      return;
    }
    if (target.requestedByAgentId && currentAgentId && currentAgentId !== target.requestedByAgentId) {
      blockers.push({
        bookingId,
        code: 'REQUESTER_CONFLICT',
        message: 'The selected job already belongs to another requester.',
      });
      return;
    }

    const nextDepartmentId = currentDepartmentId || target.clientDepartmentId;
    const nextAgentId = currentAgentId || target.requestedByAgentId;
    if (nextDepartmentId === currentDepartmentId && nextAgentId === currentAgentId) {
      unchangedBookingCount += 1;
      return;
    }

    jobs.push({
      bookingId,
      reference: text(
        booking.data.displayRef
        || booking.data.jobNumber
        || booking.data.bookingRef
        || booking.data.legacyPlatformRef
        || bookingId,
      ),
      date: text(booking.data.date),
      status: text(booking.data.status),
      currentFingerprint: createBookingHierarchyFingerprint(bookingId, booking.data),
      currentClientDepartmentId: currentDepartmentId,
      currentRequestedByAgentId: currentAgentId,
      nextClientDepartmentId: nextDepartmentId,
      nextRequestedByAgentId: nextAgentId,
      linkedInvoiceIds: invoiceIdsByBooking.get(bookingId) || [],
    });
  });

  const stableJobs = [...jobs].sort((left, right) => left.bookingId.localeCompare(right.bookingId));
  const stableBlockers = [...blockers].sort((left, right) => (
    left.bookingId.localeCompare(right.bookingId) || left.code.localeCompare(right.code)
  ));
  const linkedInvoiceIds = unique(stableJobs.flatMap(job => job.linkedInvoiceIds));
  const stable = {
    target,
    requestedBookingIds,
    jobs: stableJobs.map(job => ({
      bookingId: job.bookingId,
      currentFingerprint: job.currentFingerprint,
      nextClientDepartmentId: job.nextClientDepartmentId,
      nextRequestedByAgentId: job.nextRequestedByAgentId,
      linkedInvoiceIds: job.linkedInvoiceIds,
    })),
    blockers: stableBlockers.map(blocker => ({ bookingId: blocker.bookingId, code: blocker.code })),
  };

  return {
    fingerprint: createHash('sha256').update(JSON.stringify(stable)).digest('hex'),
    target,
    requestedBookingCount: requestedBookingIds.length,
    eligibleBookingCount: stableJobs.length,
    unchangedBookingCount,
    financeLinkedBookingCount: stableJobs.filter(job => job.linkedInvoiceIds.length > 0).length,
    linkedInvoiceIds,
    jobs: stableJobs,
    blockers: stableBlockers,
  };
};

const buildFinancePlan = (input: ClientHierarchyIntegrityInput): ClientFinanceBackfillPlan => {
  const { byId: clients, resolve } = clientResolver(input.clients);
  const bookingById = new Map(input.bookings.map(booking => [booking.id, booking]));
  const departments = new Map(input.departments.map(department => [department.id, department]));
  const agents = new Map(input.agents.map(agent => [agent.id, agent]));
  const membershipKeys = new Set(input.memberships
    .filter(membership => text(membership.data.status).toUpperCase() !== 'INACTIVE')
    .map(membership => `${resolve(text(membership.data.clientId)).id}:${text(membership.data.agentId)}`));
  const linesByInvoice = new Map<string, IntegrityDocument[]>();
  input.invoiceLines.forEach(line => {
    const invoiceId = text(line.data.invoiceId || line.data.clientInvoiceId);
    if (!invoiceId) return;
    linesByInvoice.set(invoiceId, [...(linesByInvoice.get(invoiceId) || []), line]);
  });
  const bookingIdsByDirectInvoice = new Map<string, string[]>();
  input.bookings.forEach(booking => {
    const invoiceId = text(booking.data.clientInvoiceId);
    if (!invoiceId) return;
    bookingIdsByDirectInvoice.set(invoiceId, [...(bookingIdsByDirectInvoice.get(invoiceId) || []), booking.id]);
  });

  const invoiceUpdates: ClientFinanceBackfillUpdate[] = [];
  const lineUpdates: ClientFinanceBackfillUpdate[] = [];
  const blockedInvoiceIds: string[] = [];
  const unlinkedInvoiceIds: string[] = [];
  const inferredClientAssignments: ClientFinanceBackfillPlan['inferredClientAssignments'] = [];
  const blockedInvoices: ClientFinanceBackfillPlan['blockedInvoices'] = [];

  input.invoices.forEach(invoice => {
    const lines = linesByInvoice.get(invoice.id) || [];
    const bookingIds = unique([
      ...lines.map(line => text(line.data.bookingId)),
      ...values(invoice.data.bookingIds),
      text(invoice.data.bookingId),
      ...(bookingIdsByDirectInvoice.get(invoice.id) || []),
    ]);
    const bookings = bookingIds.map(id => bookingById.get(id)).filter((booking): booking is IntegrityDocument => Boolean(booking));
    const missingBookingIds = bookingIds.filter(id => !bookingById.has(id));
    const linkedClientIds = unique(bookings.map(booking => {
      const bookingClient = resolve(text(booking.data.clientId));
      return bookingClient.exists && !isPlaceholderClientIdentity(bookingClient.id, clients.get(bookingClient.id)?.data)
        ? bookingClient.id
        : '';
    }));
    const currentClient = resolve(text(invoice.data.clientId));
    const currentClientValid = currentClient.exists
      && !isPlaceholderClientIdentity(currentClient.id, clients.get(currentClient.id)?.data);
    const identityResolution = resolveClientIdentity(invoice, input.clients);
    const inferredClientId = !currentClientValid && identityResolution.status === 'RESOLVED'
      ? text(identityResolution.clientId)
      : '';
    const blockedBookings: ClientFinanceBlockedBooking[] = bookings.map(booking => {
      const bookingClient = resolve(text(booking.data.clientId));
      const issueCodes: ClientBookingHierarchyIssueCode[] = [];
      if (!bookingClient.exists || !bookingClient.id || isPlaceholderClientIdentity(bookingClient.id, clients.get(bookingClient.id)?.data)) {
        issueCodes.push('CLIENT_INVALID');
      }
      const departmentId = text(booking.data.clientDepartmentId);
      const department = departmentId ? departments.get(departmentId) : undefined;
      if (departmentId && (!department || resolve(text(department.data.clientId)).id !== bookingClient.id)) {
        issueCodes.push('DEPARTMENT_INVALID');
      }
      const agentId = text(booking.data.requestedByAgentId);
      if (agentId && !agents.has(agentId)) issueCodes.push('AGENT_MISSING');
      else if (agentId && !membershipKeys.has(`${bookingClient.id}:${agentId}`)) issueCodes.push('AGENT_NOT_MEMBER');
      return {
        bookingId: booking.id,
        reference: text(booking.data.displayRef || booking.data.jobNumber || booking.data.bookingRef || booking.data.legacyPlatformRef || booking.id),
        clientId: text(booking.data.clientId),
        clientName: text(booking.data.clientName || (booking.data.guestContact as Record<string, unknown> | undefined)?.organisation),
        clientDepartmentId: departmentId,
        requestedByAgentId: agentId,
        date: text(booking.data.date),
        serviceType: text(booking.data.serviceType || booking.data.serviceCategory),
        issueCodes,
        hierarchyFingerprint: createBookingHierarchyFingerprint(booking.id, booking.data),
      };
    });
    const missingLinkedBooking = missingBookingIds.length > 0;
    const invalidBookingScope = blockedBookings.some(booking => booking.issueCodes.length > 0);
    const invalidUnlinkedClient = bookingIds.length === 0 && !currentClientValid && !inferredClientId;
    const blockedReason = linkedClientIds.length > 1
      ? 'MULTIPLE_CLIENTS'
      : missingLinkedBooking
        ? 'BOOKING_LINK_MISSING'
        : invalidBookingScope
          ? 'INVALID_BOOKING_SCOPE'
          : invalidUnlinkedClient
            ? 'CLIENT_IDENTITY_UNRESOLVED'
            : '';
    if (blockedReason) {
      blockedInvoiceIds.push(invoice.id);
      blockedInvoices.push({
        invoiceId: invoice.id,
        reason: blockedReason,
        candidateClientIds: unique([...identityResolution.candidateClientIds, ...linkedClientIds]),
        evidence: identityResolution.evidence,
        currentClientId: text(invoice.data.clientId),
        clientName: text(invoice.data.clientName || invoice.data.companyName),
        invoiceNumber: text(invoice.data.invoiceNumber || invoice.data.reference || invoice.data.legacyRef),
        status: text(invoice.data.status),
        bookingIds,
        missingBookingIds,
        bookings: blockedBookings,
      });
      return;
    }
    if (bookingIds.length === 0) unlinkedInvoiceIds.push(invoice.id);
    const canonicalClientId = linkedClientIds[0] || (currentClientValid ? currentClient.id : '') || inferredClientId;
    if (!currentClientValid && canonicalClientId) {
      const linkedJobResolution = Boolean(linkedClientIds[0]);
      const method = linkedJobResolution ? 'LINKED_JOB' : identityResolution.method;
      const confidence = linkedJobResolution ? 'HIGH' : identityResolution.confidence;
      if (method && confidence) {
        const assignment = {
          invoiceId: invoice.id,
          clientId: canonicalClientId,
          confidence,
          method,
          evidence: linkedJobResolution ? [`Linked job client: ${canonicalClientId}`] : identityResolution.evidence,
        } as const;
        inferredClientAssignments.push(assignment);
      }
    }
    const hierarchy = projectClientFinanceHierarchy(bookings.map(booking => ({ id: booking.id, ...booking.data })));
    const invoicePatch: Record<string, unknown> = { ...hierarchy };
    if (canonicalClientId) invoicePatch.clientId = canonicalClientId;
    const inferredAssignment = inferredClientAssignments.find(assignment => assignment.invoiceId === invoice.id);
    if (inferredAssignment) {
      invoicePatch.clientIdentityResolution = {
        status: 'RESOLVED',
        method: inferredAssignment.method,
        confidence: inferredAssignment.confidence,
        evidence: inferredAssignment.evidence,
        previousClientId: text(invoice.data.clientId),
        version: 1,
      };
    }
    const invoiceFields = [
      'clientId', 'bookingIds', 'clientDepartmentIds', 'requestedByAgentIds', 'requestedByUserIds',
      'clientDepartmentId', 'requestedByAgentId', 'hierarchyScopeStatus', 'hierarchyCoverage', 'hierarchyProjectionVersion',
      'clientIdentityResolution',
    ];
    const clearFields = ['clientDepartmentId', 'requestedByAgentId']
      .filter(field => !(field in invoicePatch) && field in invoice.data);
    const changed = invoiceFields.some(field => {
      if (!(field in invoicePatch)) return false;
      return field.endsWith('Ids') || field === 'bookingIds'
        ? !sameStrings(invoice.data[field], invoicePatch[field])
        : !sameValue(invoice.data[field], invoicePatch[field]);
    }) || clearFields.length > 0;
    if (changed) invoiceUpdates.push({ id: invoice.id, patch: invoicePatch, clearFields });

    lines.forEach(line => {
      const bookingId = text(line.data.bookingId);
      const booking = bookingId ? bookingById.get(bookingId) : undefined;
      const lineHierarchy = projectClientInvoiceLineHierarchy(booking ? { id: booking.id, ...booking.data } : null);
      const patch: Record<string, unknown> = {
        ...lineHierarchy,
        ...(canonicalClientId ? { clientId: canonicalClientId } : {}),
      };
      const scopedFields = [
        'clientId', 'clientDepartmentId', 'requestedByAgentId', 'requestedByUserId',
        'hierarchyScopeStatus', 'hierarchyProjectionVersion',
      ];
      const lineClearFields = ['clientDepartmentId', 'requestedByAgentId', 'requestedByUserId']
        .filter(field => !(field in patch) && field in line.data);
      if (scopedFields.some(field => field in patch && !sameValue(line.data[field], patch[field])) || lineClearFields.length > 0) {
        lineUpdates.push({ id: line.id, patch, clearFields: lineClearFields });
      }
    });
  });

  const stable = {
    invoices: invoiceUpdates.map(update => ({ id: update.id, patch: update.patch, clearFields: update.clearFields })).sort((a, b) => a.id.localeCompare(b.id)),
    lines: lineUpdates.map(update => ({ id: update.id, patch: update.patch, clearFields: update.clearFields })).sort((a, b) => a.id.localeCompare(b.id)),
    blockedInvoiceIds: unique(blockedInvoiceIds),
    unlinkedInvoiceIds: unique(unlinkedInvoiceIds),
    blockedInvoices: [...blockedInvoices].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId)),
  };
  return {
    fingerprint: createHash('sha256').update(JSON.stringify(stable)).digest('hex'),
    invoicesScanned: input.invoices.length,
    linesScanned: input.invoiceLines.length,
    invoiceUpdates,
    lineUpdates,
    blockedInvoiceIds: stable.blockedInvoiceIds,
    unlinkedInvoiceIds: stable.unlinkedInvoiceIds,
    inferredClientAssignments,
    blockedInvoices,
  };
};

export const buildClientHierarchyIntegrityAudit = (input: ClientHierarchyIntegrityInput) => {
  const issues: ClientHierarchyIssue[] = [];
  const addIssue = (issue: ClientHierarchyIssue) => issues.push(issue);
  const { byId: clients, resolve } = clientResolver(input.clients);
  const departments = new Map(input.departments.map(item => [item.id, item]));
  const agents = new Map(input.agents.map(item => [item.id, item]));
  const memberships = new Map(input.memberships.map(item => [item.id, item]));
  const users = new Map(input.users.map(item => [item.id, item]));
  const invoiceIds = new Set(input.invoices.map(item => item.id));
  const bookingIds = new Set(input.bookings.map(item => item.id));
  const membershipKeys = new Set(input.memberships.map(item => `${resolve(text(item.data.clientId)).id}:${text(item.data.agentId)}`));
  const financeBackfill = buildFinancePlan(input);
  const repairableInvoiceIds = new Set(financeBackfill.inferredClientAssignments.map(assignment => assignment.invoiceId));

  let bookingsWithoutDepartment = 0;
  let bookingsWithoutRequester = 0;
  input.memberships.forEach(membership => {
    const clientId = text(membership.data.clientId);
    const canonical = resolve(clientId);
    const agentId = text(membership.data.agentId);
    if (!canonical.exists) addIssue({ code: 'MEMBERSHIP_CLIENT_MISSING', severity: 'CRITICAL', entityType: 'clientMembership', entityId: membership.id, clientId, message: 'Membership points to a missing client.' });
    else if (canonical.redirected) addIssue({ code: 'MEMBERSHIP_CLIENT_REDIRECT', severity: 'WARNING', entityType: 'clientMembership', entityId: membership.id, clientId, message: `Membership still points to merged client ${clientId}.` });
    if (!agents.has(agentId)) addIssue({ code: 'MEMBERSHIP_AGENT_MISSING', severity: 'CRITICAL', entityType: 'clientMembership', entityId: membership.id, clientId: canonical.id, message: 'Membership points to a missing agent.' });
    values(membership.data.departmentIds).forEach(departmentId => {
      const department = departments.get(departmentId);
      if (!department || resolve(text(department.data.clientId)).id !== canonical.id) {
        addIssue({ code: 'MEMBERSHIP_DEPARTMENT_INVALID', severity: 'CRITICAL', entityType: 'clientMembership', entityId: membership.id, clientId: canonical.id, message: `Department ${departmentId} is outside this membership client.` });
      }
    });
    const userId = text(membership.data.userId);
    const agentUserId = text(agents.get(agentId)?.data.userId);
    if (userId && !users.has(userId)) addIssue({ code: 'MEMBERSHIP_USER_MISSING', severity: 'CRITICAL', entityType: 'clientMembership', entityId: membership.id, clientId: canonical.id, message: `Linked user ${userId} does not exist.` });
    if (userId && agentUserId && userId !== agentUserId) addIssue({ code: 'MEMBERSHIP_AGENT_USER_MISMATCH', severity: 'CRITICAL', entityType: 'clientMembership', entityId: membership.id, clientId: canonical.id, message: 'Membership and agent point to different user accounts.' });
  });

  input.bookings.forEach(booking => {
    const clientId = text(booking.data.clientId);
    const canonical = resolve(clientId);
    const placeholderClient = canonical.exists && isPlaceholderClientIdentity(canonical.id, clients.get(canonical.id)?.data);
    if (placeholderClient) addIssue({ code: 'BOOKING_CLIENT_PLACEHOLDER', severity: 'CRITICAL', entityType: 'booking', entityId: booking.id, clientId, message: 'Job points to a generic placeholder instead of a real client.' });
    else if (!clientId || !canonical.exists) addIssue({ code: 'BOOKING_CLIENT_MISSING', severity: 'CRITICAL', entityType: 'booking', entityId: booking.id, clientId, message: 'Job has no valid client relationship.' });
    else if (canonical.redirected) addIssue({ code: 'BOOKING_CLIENT_REDIRECT', severity: 'WARNING', entityType: 'booking', entityId: booking.id, clientId, message: `Job still points to merged client ${clientId}.` });
    const departmentId = text(booking.data.clientDepartmentId);
    if (!departmentId) bookingsWithoutDepartment += 1;
    else {
      const department = departments.get(departmentId);
      if (!department || resolve(text(department.data.clientId)).id !== canonical.id) addIssue({ code: 'BOOKING_DEPARTMENT_INVALID', severity: 'CRITICAL', entityType: 'booking', entityId: booking.id, clientId: canonical.id, message: `Job department ${departmentId} does not belong to its client.` });
    }
    const agentId = text(booking.data.requestedByAgentId);
    if (!agentId) bookingsWithoutRequester += 1;
    else if (!agents.has(agentId)) addIssue({ code: 'BOOKING_AGENT_MISSING', severity: 'CRITICAL', entityType: 'booking', entityId: booking.id, clientId: canonical.id, message: `Job requester ${agentId} does not exist.` });
    else if (!membershipKeys.has(`${canonical.id}:${agentId}`)) addIssue({ code: 'BOOKING_AGENT_NOT_MEMBER', severity: 'WARNING', entityType: 'booking', entityId: booking.id, clientId: canonical.id, message: 'Job requester has no membership for this client.' });
  });

  input.invoices.forEach(invoice => {
    const clientId = text(invoice.data.clientId);
    const canonical = resolve(clientId);
    const placeholderClient = canonical.exists && isPlaceholderClientIdentity(canonical.id, clients.get(canonical.id)?.data);
    if ((placeholderClient || !clientId || !canonical.exists) && repairableInvoiceIds.has(invoice.id)) addIssue({ code: 'INVOICE_CLIENT_REPAIRABLE', severity: 'WARNING', entityType: 'clientInvoice', entityId: invoice.id, clientId, message: 'Invoice client can be restored from deterministic identity evidence.' });
    else if (placeholderClient) addIssue({ code: 'INVOICE_CLIENT_PLACEHOLDER', severity: 'CRITICAL', entityType: 'clientInvoice', entityId: invoice.id, clientId, message: 'Invoice points to a generic placeholder instead of a real client.' });
    else if (!clientId || !canonical.exists) addIssue({ code: 'INVOICE_CLIENT_MISSING', severity: 'CRITICAL', entityType: 'clientInvoice', entityId: invoice.id, clientId, message: 'Invoice has no valid client relationship.' });
    else if (canonical.redirected) addIssue({ code: 'INVOICE_CLIENT_REDIRECT', severity: 'WARNING', entityType: 'clientInvoice', entityId: invoice.id, clientId, message: `Invoice still points to merged client ${clientId}.` });
  });

  input.invoiceLines.forEach(line => {
    const invoiceId = text(line.data.invoiceId || line.data.clientInvoiceId);
    const bookingId = text(line.data.bookingId);
    if (!invoiceId || !invoiceIds.has(invoiceId)) addIssue({ code: 'INVOICE_LINE_ORPHAN', severity: 'CRITICAL', entityType: 'clientInvoiceLine', entityId: line.id, message: 'Invoice line points to a missing invoice.' });
    if (bookingId && !bookingIds.has(bookingId)) addIssue({ code: 'INVOICE_LINE_BOOKING_MISSING', severity: 'WARNING', entityType: 'clientInvoiceLine', entityId: line.id, message: `Invoice line points to missing job ${bookingId}.` });
  });

  (input.notifications || []).forEach(notification => {
    const userId = text(notification.data.userId);
    if (userId && !users.has(userId)) addIssue({ code: 'NOTIFICATION_USER_MISSING', severity: 'WARNING', entityType: 'notification', entityId: notification.id, message: `Notification recipient ${userId} does not exist.` });
  });

  const criticalIssues = issues.filter(issue => issue.severity === 'CRITICAL').length;
  const warningIssues = issues.length - criticalIssues;
  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    readOnly: true as const,
    truncated: input.truncated === true,
    readyForMembershipCutover: !input.truncated && criticalIssues === 0 && financeBackfill.invoiceUpdates.length === 0 && financeBackfill.lineUpdates.length === 0,
    readyForFinanceScope: !input.truncated && criticalIssues === 0 && financeBackfill.blockedInvoiceIds.length === 0 && financeBackfill.invoiceUpdates.length === 0,
    summary: {
      clients: clients.size,
      departments: departments.size,
      agents: agents.size,
      memberships: memberships.size,
      bookings: input.bookings.length,
      invoices: input.invoices.length,
      invoiceLines: input.invoiceLines.length,
      bookingsWithoutDepartment,
      bookingsWithoutRequester,
      invoicesNeedingHierarchyBackfill: financeBackfill.invoiceUpdates.length,
      invoiceLinesNeedingHierarchyBackfill: financeBackfill.lineUpdates.length,
      invoicesWithoutJobLinks: financeBackfill.unlinkedInvoiceIds.length,
      blockedCrossClientInvoices: financeBackfill.blockedInvoiceIds.length,
      invoicesWithSuggestedClientRepair: financeBackfill.inferredClientAssignments.length,
      criticalIssues,
      warningIssues,
    },
    issueCounts: issues.reduce<Record<string, number>>((counts, issue) => ({ ...counts, [issue.code]: (counts[issue.code] || 0) + 1 }), {}),
    issues: issues.slice(0, 250),
    financeBackfill: {
      fingerprint: financeBackfill.fingerprint,
      invoicesScanned: financeBackfill.invoicesScanned,
      linesScanned: financeBackfill.linesScanned,
      invoiceUpdates: financeBackfill.invoiceUpdates.length,
      lineUpdates: financeBackfill.lineUpdates.length,
      blockedInvoiceIds: financeBackfill.blockedInvoiceIds.slice(0, 50),
      unlinkedInvoiceIds: financeBackfill.unlinkedInvoiceIds.slice(0, 50),
      inferredClientAssignments: financeBackfill.inferredClientAssignments.slice(0, 50),
      blockedInvoices: financeBackfill.blockedInvoices.slice(0, 50),
    },
  };
};

export const buildClientFinanceBackfillPlan = buildFinancePlan;
