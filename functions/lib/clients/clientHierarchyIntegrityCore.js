"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildClientInvoiceBookingRepairPlan = exports.buildClientFinanceBackfillPlan = exports.buildClientHierarchyIntegrityAudit = exports.buildClientHierarchyScopeBatchPlan = exports.createBookingHierarchyFingerprint = void 0;
const node_crypto_1 = require("node:crypto");
const clientFinanceScope_1 = require("./clientFinanceScope");
const clientIdentityResolution_1 = require("./clientIdentityResolution");
const text = (value) => String(value ?? '').trim();
const values = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const unique = (items) => Array.from(new Set(items.filter(Boolean))).sort((a, b) => a.localeCompare(b));
const sameStrings = (left, right) => JSON.stringify(unique(values(left))) === JSON.stringify(unique(values(right)));
const sameValue = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
const createBookingHierarchyFingerprint = (bookingId, data) => {
    const snapshot = data.clientSnapshot && typeof data.clientSnapshot === 'object'
        ? data.clientSnapshot
        : {};
    return (0, node_crypto_1.createHash)('sha256')
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
exports.createBookingHierarchyFingerprint = createBookingHierarchyFingerprint;
const clientResolver = (clients) => {
    const byId = new Map(clients.map(client => [client.id, client]));
    const resolve = (requestedId) => {
        let currentId = requestedId;
        for (let depth = 0; currentId && depth < 5; depth += 1) {
            const current = byId.get(currentId);
            if (!current)
                return { id: currentId, exists: false, redirected: currentId !== requestedId };
            const nextId = text(current.data.mergedIntoClientId);
            if (!nextId || nextId === currentId)
                return { id: currentId, exists: true, redirected: currentId !== requestedId };
            currentId = nextId;
        }
        return { id: currentId, exists: false, redirected: currentId !== requestedId };
    };
    return { byId, resolve };
};
const buildClientHierarchyScopeBatchPlan = (input, requestedTarget) => {
    const target = {
        clientId: text(requestedTarget.clientId),
        clientDepartmentId: text(requestedTarget.clientDepartmentId),
        requestedByAgentId: text(requestedTarget.requestedByAgentId),
    };
    const requestedBookingIds = unique(requestedTarget.bookingIds.map(text));
    const bookingById = new Map(input.bookings.map(booking => [booking.id, booking]));
    const { resolve } = clientResolver(input.clients);
    const invoiceIdsByBooking = new Map();
    input.invoiceLines.forEach(line => {
        const bookingId = text(line.data.bookingId);
        const invoiceId = text(line.data.invoiceId || line.data.clientInvoiceId);
        if (!bookingId || !invoiceId)
            return;
        invoiceIdsByBooking.set(bookingId, unique([...(invoiceIdsByBooking.get(bookingId) || []), invoiceId]));
    });
    input.bookings.forEach(booking => {
        const invoiceId = text(booking.data.clientInvoiceId);
        if (!invoiceId)
            return;
        invoiceIdsByBooking.set(booking.id, unique([...(invoiceIdsByBooking.get(booking.id) || []), invoiceId]));
    });
    const jobs = [];
    const blockers = [];
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
            reference: text(booking.data.displayRef
                || booking.data.jobNumber
                || booking.data.bookingRef
                || booking.data.legacyPlatformRef
                || bookingId),
            date: text(booking.data.date),
            status: text(booking.data.status),
            currentFingerprint: (0, exports.createBookingHierarchyFingerprint)(bookingId, booking.data),
            currentClientDepartmentId: currentDepartmentId,
            currentRequestedByAgentId: currentAgentId,
            nextClientDepartmentId: nextDepartmentId,
            nextRequestedByAgentId: nextAgentId,
            linkedInvoiceIds: invoiceIdsByBooking.get(bookingId) || [],
        });
    });
    const stableJobs = [...jobs].sort((left, right) => left.bookingId.localeCompare(right.bookingId));
    const stableBlockers = [...blockers].sort((left, right) => (left.bookingId.localeCompare(right.bookingId) || left.code.localeCompare(right.code)));
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
        fingerprint: (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(stable)).digest('hex'),
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
exports.buildClientHierarchyScopeBatchPlan = buildClientHierarchyScopeBatchPlan;
const buildFinancePlan = (input) => {
    const { byId: clients, resolve } = clientResolver(input.clients);
    const bookingById = new Map(input.bookings.map(booking => [booking.id, booking]));
    const departments = new Map(input.departments.map(department => [department.id, department]));
    const agents = new Map(input.agents.map(agent => [agent.id, agent]));
    const membershipKeys = new Set(input.memberships
        .filter(membership => text(membership.data.status).toUpperCase() !== 'INACTIVE')
        .map(membership => `${resolve(text(membership.data.clientId)).id}:${text(membership.data.agentId)}`));
    const linesByInvoice = new Map();
    input.invoiceLines.forEach(line => {
        const invoiceId = text(line.data.invoiceId || line.data.clientInvoiceId);
        if (!invoiceId)
            return;
        linesByInvoice.set(invoiceId, [...(linesByInvoice.get(invoiceId) || []), line]);
    });
    const bookingIdsByDirectInvoice = new Map();
    input.bookings.forEach(booking => {
        const invoiceId = text(booking.data.clientInvoiceId);
        if (!invoiceId)
            return;
        bookingIdsByDirectInvoice.set(invoiceId, [...(bookingIdsByDirectInvoice.get(invoiceId) || []), booking.id]);
    });
    const invoiceUpdates = [];
    const lineUpdates = [];
    const blockedInvoiceIds = [];
    const unlinkedInvoiceIds = [];
    const inferredClientAssignments = [];
    const blockedInvoices = [];
    input.invoices.forEach(invoice => {
        const lines = linesByInvoice.get(invoice.id) || [];
        const bookingIds = unique([
            ...lines.map(line => text(line.data.bookingId)),
            ...values(invoice.data.bookingIds),
            text(invoice.data.bookingId),
            ...(bookingIdsByDirectInvoice.get(invoice.id) || []),
        ]);
        const bookings = bookingIds.map(id => bookingById.get(id)).filter((booking) => Boolean(booking));
        const missingBookingIds = bookingIds.filter(id => !bookingById.has(id));
        const linkedClientIds = unique(bookings.map(booking => {
            const bookingClient = resolve(text(booking.data.clientId));
            return bookingClient.exists && !(0, clientIdentityResolution_1.isPlaceholderClientIdentity)(bookingClient.id, clients.get(bookingClient.id)?.data)
                ? bookingClient.id
                : '';
        }));
        const currentClient = resolve(text(invoice.data.clientId));
        const currentClientValid = currentClient.exists
            && !(0, clientIdentityResolution_1.isPlaceholderClientIdentity)(currentClient.id, clients.get(currentClient.id)?.data);
        const identityResolution = (0, clientIdentityResolution_1.resolveClientIdentity)(invoice, input.clients);
        const inferredClientId = !currentClientValid && identityResolution.status === 'RESOLVED'
            ? text(identityResolution.clientId)
            : '';
        const blockedBookings = bookings.map(booking => {
            const bookingClient = resolve(text(booking.data.clientId));
            const issueCodes = [];
            if (!bookingClient.exists || !bookingClient.id || (0, clientIdentityResolution_1.isPlaceholderClientIdentity)(bookingClient.id, clients.get(bookingClient.id)?.data)) {
                issueCodes.push('CLIENT_INVALID');
            }
            const departmentId = text(booking.data.clientDepartmentId);
            const department = departmentId ? departments.get(departmentId) : undefined;
            if (departmentId && (!department || resolve(text(department.data.clientId)).id !== bookingClient.id)) {
                issueCodes.push('DEPARTMENT_INVALID');
            }
            const agentId = text(booking.data.requestedByAgentId);
            if (agentId && !agents.has(agentId))
                issueCodes.push('AGENT_MISSING');
            else if (agentId && !membershipKeys.has(`${bookingClient.id}:${agentId}`))
                issueCodes.push('AGENT_NOT_MEMBER');
            return {
                bookingId: booking.id,
                reference: text(booking.data.displayRef || booking.data.jobNumber || booking.data.bookingRef || booking.data.legacyPlatformRef || booking.id),
                clientId: text(booking.data.clientId),
                clientName: text(booking.data.clientName || booking.data.guestContact?.organisation),
                clientDepartmentId: departmentId,
                requestedByAgentId: agentId,
                date: text(booking.data.date),
                serviceType: text(booking.data.serviceType || booking.data.serviceCategory),
                issueCodes,
                hierarchyFingerprint: (0, exports.createBookingHierarchyFingerprint)(booking.id, booking.data),
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
        if (bookingIds.length === 0)
            unlinkedInvoiceIds.push(invoice.id);
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
                };
                inferredClientAssignments.push(assignment);
            }
        }
        const hierarchy = (0, clientFinanceScope_1.projectClientFinanceHierarchy)(bookings.map(booking => ({ id: booking.id, ...booking.data })));
        const invoicePatch = { ...hierarchy };
        if (canonicalClientId)
            invoicePatch.clientId = canonicalClientId;
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
            if (!(field in invoicePatch))
                return false;
            return field.endsWith('Ids') || field === 'bookingIds'
                ? !sameStrings(invoice.data[field], invoicePatch[field])
                : !sameValue(invoice.data[field], invoicePatch[field]);
        }) || clearFields.length > 0;
        if (changed)
            invoiceUpdates.push({ id: invoice.id, patch: invoicePatch, clearFields });
        lines.forEach(line => {
            const bookingId = text(line.data.bookingId);
            const booking = bookingId ? bookingById.get(bookingId) : undefined;
            const lineHierarchy = (0, clientFinanceScope_1.projectClientInvoiceLineHierarchy)(booking ? { id: booking.id, ...booking.data } : null);
            const patch = {
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
        fingerprint: (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(stable)).digest('hex'),
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
const buildClientHierarchyIntegrityAudit = (input) => {
    const issues = [];
    const addIssue = (issue) => issues.push(issue);
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
        if (!canonical.exists)
            addIssue({ code: 'MEMBERSHIP_CLIENT_MISSING', severity: 'CRITICAL', entityType: 'clientMembership', entityId: membership.id, clientId, message: 'Membership points to a missing client.' });
        else if (canonical.redirected)
            addIssue({ code: 'MEMBERSHIP_CLIENT_REDIRECT', severity: 'WARNING', entityType: 'clientMembership', entityId: membership.id, clientId, message: `Membership still points to merged client ${clientId}.` });
        if (!agents.has(agentId))
            addIssue({ code: 'MEMBERSHIP_AGENT_MISSING', severity: 'CRITICAL', entityType: 'clientMembership', entityId: membership.id, clientId: canonical.id, message: 'Membership points to a missing agent.' });
        values(membership.data.departmentIds).forEach(departmentId => {
            const department = departments.get(departmentId);
            if (!department || resolve(text(department.data.clientId)).id !== canonical.id) {
                addIssue({ code: 'MEMBERSHIP_DEPARTMENT_INVALID', severity: 'CRITICAL', entityType: 'clientMembership', entityId: membership.id, clientId: canonical.id, message: `Department ${departmentId} is outside this membership client.` });
            }
        });
        const userId = text(membership.data.userId);
        const agentUserId = text(agents.get(agentId)?.data.userId);
        if (userId && !users.has(userId))
            addIssue({ code: 'MEMBERSHIP_USER_MISSING', severity: 'CRITICAL', entityType: 'clientMembership', entityId: membership.id, clientId: canonical.id, message: `Linked user ${userId} does not exist.` });
        if (userId && agentUserId && userId !== agentUserId)
            addIssue({ code: 'MEMBERSHIP_AGENT_USER_MISMATCH', severity: 'CRITICAL', entityType: 'clientMembership', entityId: membership.id, clientId: canonical.id, message: 'Membership and agent point to different user accounts.' });
    });
    input.bookings.forEach(booking => {
        const clientId = text(booking.data.clientId);
        const canonical = resolve(clientId);
        const placeholderClient = canonical.exists && (0, clientIdentityResolution_1.isPlaceholderClientIdentity)(canonical.id, clients.get(canonical.id)?.data);
        if (placeholderClient)
            addIssue({ code: 'BOOKING_CLIENT_PLACEHOLDER', severity: 'CRITICAL', entityType: 'booking', entityId: booking.id, clientId, message: 'Job points to a generic placeholder instead of a real client.' });
        else if (!clientId || !canonical.exists)
            addIssue({ code: 'BOOKING_CLIENT_MISSING', severity: 'CRITICAL', entityType: 'booking', entityId: booking.id, clientId, message: 'Job has no valid client relationship.' });
        else if (canonical.redirected)
            addIssue({ code: 'BOOKING_CLIENT_REDIRECT', severity: 'WARNING', entityType: 'booking', entityId: booking.id, clientId, message: `Job still points to merged client ${clientId}.` });
        const departmentId = text(booking.data.clientDepartmentId);
        if (!departmentId)
            bookingsWithoutDepartment += 1;
        else {
            const department = departments.get(departmentId);
            if (!department || resolve(text(department.data.clientId)).id !== canonical.id)
                addIssue({ code: 'BOOKING_DEPARTMENT_INVALID', severity: 'CRITICAL', entityType: 'booking', entityId: booking.id, clientId: canonical.id, message: `Job department ${departmentId} does not belong to its client.` });
        }
        const agentId = text(booking.data.requestedByAgentId);
        if (!agentId)
            bookingsWithoutRequester += 1;
        else if (!agents.has(agentId))
            addIssue({ code: 'BOOKING_AGENT_MISSING', severity: 'CRITICAL', entityType: 'booking', entityId: booking.id, clientId: canonical.id, message: `Job requester ${agentId} does not exist.` });
        else if (!membershipKeys.has(`${canonical.id}:${agentId}`))
            addIssue({ code: 'BOOKING_AGENT_NOT_MEMBER', severity: 'WARNING', entityType: 'booking', entityId: booking.id, clientId: canonical.id, message: 'Job requester has no membership for this client.' });
    });
    input.invoices.forEach(invoice => {
        const clientId = text(invoice.data.clientId);
        const canonical = resolve(clientId);
        const placeholderClient = canonical.exists && (0, clientIdentityResolution_1.isPlaceholderClientIdentity)(canonical.id, clients.get(canonical.id)?.data);
        if ((placeholderClient || !clientId || !canonical.exists) && repairableInvoiceIds.has(invoice.id))
            addIssue({ code: 'INVOICE_CLIENT_REPAIRABLE', severity: 'WARNING', entityType: 'clientInvoice', entityId: invoice.id, clientId, message: 'Invoice client can be restored from deterministic identity evidence.' });
        else if (placeholderClient)
            addIssue({ code: 'INVOICE_CLIENT_PLACEHOLDER', severity: 'CRITICAL', entityType: 'clientInvoice', entityId: invoice.id, clientId, message: 'Invoice points to a generic placeholder instead of a real client.' });
        else if (!clientId || !canonical.exists)
            addIssue({ code: 'INVOICE_CLIENT_MISSING', severity: 'CRITICAL', entityType: 'clientInvoice', entityId: invoice.id, clientId, message: 'Invoice has no valid client relationship.' });
        else if (canonical.redirected)
            addIssue({ code: 'INVOICE_CLIENT_REDIRECT', severity: 'WARNING', entityType: 'clientInvoice', entityId: invoice.id, clientId, message: `Invoice still points to merged client ${clientId}.` });
    });
    input.invoiceLines.forEach(line => {
        const invoiceId = text(line.data.invoiceId || line.data.clientInvoiceId);
        const bookingId = text(line.data.bookingId);
        if (!invoiceId || !invoiceIds.has(invoiceId))
            addIssue({ code: 'INVOICE_LINE_ORPHAN', severity: 'CRITICAL', entityType: 'clientInvoiceLine', entityId: line.id, message: 'Invoice line points to a missing invoice.' });
        if (bookingId && !bookingIds.has(bookingId))
            addIssue({ code: 'INVOICE_LINE_BOOKING_MISSING', severity: 'WARNING', entityType: 'clientInvoiceLine', entityId: line.id, message: `Invoice line points to missing job ${bookingId}.` });
    });
    (input.notifications || []).forEach(notification => {
        const userId = text(notification.data.userId);
        if (userId && !users.has(userId))
            addIssue({ code: 'NOTIFICATION_USER_MISSING', severity: 'WARNING', entityType: 'notification', entityId: notification.id, message: `Notification recipient ${userId} does not exist.` });
    });
    const criticalIssues = issues.filter(issue => issue.severity === 'CRITICAL').length;
    const warningIssues = issues.length - criticalIssues;
    return {
        generatedAt: input.generatedAt || new Date().toISOString(),
        readOnly: true,
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
        issueCounts: issues.reduce((counts, issue) => ({ ...counts, [issue.code]: (counts[issue.code] || 0) + 1 }), {}),
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
exports.buildClientHierarchyIntegrityAudit = buildClientHierarchyIntegrityAudit;
exports.buildClientFinanceBackfillPlan = buildFinancePlan;
const buildClientInvoiceBookingRepairPlan = (input, requestedInvoiceId, requestedClientId) => {
    const invoiceId = text(requestedInvoiceId);
    const requestedTargetId = text(requestedClientId);
    const financePlan = buildFinancePlan(input);
    const financeBlocker = financePlan.blockedInvoices.find(item => item.invoiceId === invoiceId);
    const { byId: clients, resolve } = clientResolver(input.clients);
    const target = resolve(requestedTargetId);
    const targetDocument = target.exists ? clients.get(target.id) : undefined;
    const targetIsValid = Boolean(target.exists
        && target.id === requestedTargetId
        && targetDocument
        && !(0, clientIdentityResolution_1.isPlaceholderClientIdentity)(target.id, targetDocument.data)
        && text(targetDocument.data.recordState).toUpperCase() !== 'MERGED');
    const blockers = [];
    if (!financeBlocker) {
        blockers.push({ code: 'INVOICE_NOT_BLOCKED', message: 'This invoice is no longer in the blocked repair queue.' });
    }
    else if (!['MULTIPLE_CLIENTS', 'INVALID_BOOKING_SCOPE'].includes(financeBlocker.reason)) {
        blockers.push({ code: 'UNSUPPORTED_REASON', message: 'This blocker requires invoice identity or missing-job repair instead.' });
    }
    if (!targetIsValid) {
        blockers.push({ code: 'TARGET_INVALID', message: 'Select an active canonical client, not a placeholder or merged record.' });
    }
    const currentInvoiceClient = financeBlocker ? resolve(financeBlocker.currentClientId) : { id: '', exists: false, redirected: false };
    const allowedClientIds = unique([
        ...(financeBlocker?.candidateClientIds || []).map(clientId => resolve(clientId)).filter(item => item.exists).map(item => item.id),
        currentInvoiceClient.exists ? currentInvoiceClient.id : '',
    ]);
    if (targetIsValid && financeBlocker && !allowedClientIds.includes(target.id)) {
        blockers.push({
            code: 'TARGET_NOT_CANDIDATE',
            message: 'The selected client is not supported by the invoice or linked-job evidence in this dry run.',
        });
    }
    if (financeBlocker && financeBlocker.bookings.length === 0) {
        blockers.push({ code: 'NO_LINKED_JOBS', message: 'This invoice has no linked jobs that can be repaired as a batch.' });
    }
    const organizationName = targetDocument
        ? text(targetDocument.data.companyName || targetDocument.data.name || target.id)
        : '';
    const departmentById = new Map(input.departments.map(item => [item.id, item]));
    const agentById = new Map(input.agents.map(item => [item.id, item]));
    const activeMemberships = input.memberships.filter(item => text(item.data.status).toUpperCase() !== 'INACTIVE');
    const bookingById = new Map(input.bookings.map(item => [item.id, item]));
    let unchangedBookingCount = 0;
    let departmentsCleared = 0;
    let requestersCleared = 0;
    const jobs = blockers.length > 0 || !financeBlocker || !targetDocument
        ? []
        : financeBlocker.bookings.flatMap(blockedBooking => {
            const booking = bookingById.get(blockedBooking.bookingId);
            if (!booking)
                return [];
            const currentDepartmentId = text(booking.data.clientDepartmentId);
            const department = currentDepartmentId ? departmentById.get(currentDepartmentId) : undefined;
            const departmentClient = department ? resolve(text(department.data.clientId)) : null;
            const nextDepartmentId = department
                && text(department.data.status).toUpperCase() !== 'ARCHIVED'
                && departmentClient?.exists
                && departmentClient.id === target.id
                ? currentDepartmentId
                : '';
            const currentAgentId = text(booking.data.requestedByAgentId);
            const agent = currentAgentId ? agentById.get(currentAgentId) : undefined;
            const membership = agent ? activeMemberships.find(item => {
                if (text(item.data.agentId) !== currentAgentId)
                    return false;
                const membershipClient = resolve(text(item.data.clientId));
                if (!membershipClient.exists || membershipClient.id !== target.id)
                    return false;
                const departmentIds = values(item.data.departmentIds);
                const accessLevel = text(item.data.accessLevel).toUpperCase();
                return !nextDepartmentId || departmentIds.length === 0 || accessLevel === 'CLIENT_MASTER' || departmentIds.includes(nextDepartmentId);
            }) : undefined;
            const membershipUserId = text(membership?.data.userId);
            const agentUserId = text(agent?.data.userId);
            const requesterUserConflict = Boolean(membershipUserId && agentUserId && membershipUserId !== agentUserId);
            const nextAgentId = agent
                && text(agent.data.status).toUpperCase() !== 'INACTIVE'
                && text(agent.data.agentType).toUpperCase() !== 'SHARED_MAILBOX'
                && membership
                && !requesterUserConflict
                ? currentAgentId
                : '';
            const nextRequestedByUserId = nextAgentId ? (membershipUserId || agentUserId) : '';
            const departmentName = nextDepartmentId ? text(department?.data.name) : '';
            const requesterName = nextAgentId ? text(agent?.data.displayName || agent?.data.name) : '';
            const requesterEmail = nextAgentId ? text(agent?.data.email).toLowerCase() : '';
            const currentSnapshot = booking.data.clientSnapshot && typeof booking.data.clientSnapshot === 'object'
                ? booking.data.clientSnapshot
                : {};
            const nextSnapshot = { ...currentSnapshot, organizationName };
            if (departmentName)
                nextSnapshot.departmentName = departmentName;
            else
                delete nextSnapshot.departmentName;
            if (requesterName)
                nextSnapshot.requesterName = requesterName;
            else
                delete nextSnapshot.requesterName;
            if (requesterEmail)
                nextSnapshot.requesterEmail = requesterEmail;
            else
                delete nextSnapshot.requesterEmail;
            const nextData = {
                ...booking.data,
                clientId: target.id,
                clientName: organizationName,
                clientIdentityStatus: 'RESOLVED',
                clientSnapshot: nextSnapshot,
            };
            if (nextDepartmentId)
                nextData.clientDepartmentId = nextDepartmentId;
            else
                delete nextData.clientDepartmentId;
            if (nextAgentId)
                nextData.requestedByAgentId = nextAgentId;
            else
                delete nextData.requestedByAgentId;
            if (nextRequestedByUserId)
                nextData.requestedByUserId = nextRequestedByUserId;
            else
                delete nextData.requestedByUserId;
            const currentFingerprint = (0, exports.createBookingHierarchyFingerprint)(booking.id, booking.data);
            const nextFingerprint = (0, exports.createBookingHierarchyFingerprint)(booking.id, nextData);
            if (currentFingerprint === nextFingerprint) {
                unchangedBookingCount += 1;
                return [];
            }
            if (currentDepartmentId && !nextDepartmentId)
                departmentsCleared += 1;
            if (currentAgentId && !nextAgentId)
                requestersCleared += 1;
            return [{
                    bookingId: booking.id,
                    reference: text(booking.data.displayRef || booking.data.jobNumber || booking.data.bookingRef || booking.data.legacyPlatformRef || booking.id),
                    date: text(booking.data.date),
                    currentFingerprint,
                    nextFingerprint,
                    currentClientId: text(booking.data.clientId),
                    nextClientId: target.id,
                    currentClientDepartmentId: currentDepartmentId,
                    nextClientDepartmentId: nextDepartmentId,
                    currentRequestedByAgentId: currentAgentId,
                    nextRequestedByAgentId: nextAgentId,
                    nextRequestedByUserId,
                    departmentName,
                    requesterName,
                    requesterEmail,
                }];
        }).sort((left, right) => left.bookingId.localeCompare(right.bookingId));
    const stable = {
        financeFingerprint: financePlan.fingerprint,
        invoiceId,
        clientId: targetIsValid ? target.id : requestedTargetId,
        jobs: jobs.map(job => ({
            bookingId: job.bookingId,
            currentFingerprint: job.currentFingerprint,
            nextFingerprint: job.nextFingerprint,
        })),
        blockers: blockers.map(blocker => blocker.code).sort(),
    };
    return {
        fingerprint: (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(stable)).digest('hex'),
        financeFingerprint: financePlan.fingerprint,
        invoiceId,
        invoiceNumber: financeBlocker?.invoiceNumber || '',
        invoiceClientName: financeBlocker?.clientName || '',
        reason: financeBlocker?.reason || '',
        clientId: targetIsValid ? target.id : requestedTargetId,
        organizationName,
        candidateClientIds: allowedClientIds,
        requestedBookingCount: financeBlocker?.bookings.length || 0,
        repairableBookingCount: jobs.length,
        unchangedBookingCount,
        departmentsCleared,
        requestersCleared,
        jobs,
        blockers,
    };
};
exports.buildClientInvoiceBookingRepairPlan = buildClientInvoiceBookingRepairPlan;
//# sourceMappingURL=clientHierarchyIntegrityCore.js.map