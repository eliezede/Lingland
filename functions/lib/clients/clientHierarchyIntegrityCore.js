"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildClientFinanceBackfillPlan = exports.buildClientHierarchyIntegrityAudit = void 0;
const node_crypto_1 = require("node:crypto");
const clientFinanceScope_1 = require("./clientFinanceScope");
const clientIdentityResolution_1 = require("./clientIdentityResolution");
const text = (value) => String(value ?? '').trim();
const values = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const unique = (items) => Array.from(new Set(items.filter(Boolean))).sort((a, b) => a.localeCompare(b));
const sameStrings = (left, right) => JSON.stringify(unique(values(left))) === JSON.stringify(unique(values(right)));
const sameValue = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
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
const buildFinancePlan = (input) => {
    const { byId: clients, resolve } = clientResolver(input.clients);
    const bookingById = new Map(input.bookings.map(booking => [booking.id, booking]));
    const departments = new Map(input.departments.map(department => [department.id, department]));
    const agents = new Map(input.agents.map(agent => [agent.id, agent]));
    const membershipKeys = new Set(input.memberships.map(membership => (`${resolve(text(membership.data.clientId)).id}:${text(membership.data.agentId)}`)));
    const linesByInvoice = new Map();
    input.invoiceLines.forEach(line => {
        const invoiceId = text(line.data.invoiceId || line.data.clientInvoiceId);
        if (!invoiceId)
            return;
        linesByInvoice.set(invoiceId, [...(linesByInvoice.get(invoiceId) || []), line]);
    });
    const invoiceUpdates = [];
    const lineUpdates = [];
    const blockedInvoiceIds = [];
    const unlinkedInvoiceIds = [];
    const inferredClientAssignments = [];
    const blockedInvoices = [];
    input.invoices.forEach(invoice => {
        const lines = linesByInvoice.get(invoice.id) || [];
        const bookingIds = unique(lines.map(line => text(line.data.bookingId)));
        const bookings = bookingIds.map(id => bookingById.get(id)).filter((booking) => Boolean(booking));
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
        const missingLinkedBooking = bookingIds.length !== bookings.length;
        const invalidBookingScope = bookings.some(booking => {
            const bookingClient = resolve(text(booking.data.clientId));
            if (!bookingClient.exists || !bookingClient.id || (0, clientIdentityResolution_1.isPlaceholderClientIdentity)(bookingClient.id, clients.get(bookingClient.id)?.data))
                return true;
            const departmentId = text(booking.data.clientDepartmentId);
            const department = departmentId ? departments.get(departmentId) : undefined;
            if (departmentId && (!department || resolve(text(department.data.clientId)).id !== bookingClient.id))
                return true;
            const agentId = text(booking.data.requestedByAgentId);
            if (agentId && (!agents.has(agentId) || !membershipKeys.has(`${bookingClient.id}:${agentId}`)))
                return true;
            return false;
        });
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
                candidateClientIds: identityResolution.candidateClientIds,
                evidence: identityResolution.evidence,
                currentClientId: text(invoice.data.clientId),
                clientName: text(invoice.data.clientName || invoice.data.companyName),
                invoiceNumber: text(invoice.data.invoiceNumber || invoice.data.reference || invoice.data.legacyRef),
                status: text(invoice.data.status),
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
//# sourceMappingURL=clientHierarchyIntegrityCore.js.map