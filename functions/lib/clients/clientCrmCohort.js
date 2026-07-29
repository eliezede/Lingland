"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scopeIntegrityInputToCurrentCrm = exports.buildIncomingCrmPatch = exports.shouldTagAirtableCrmIntake = exports.isCurrentCrmRecord = exports.isIncomingCrmRecord = void 0;
const isIncomingCrmRecord = (data) => (String(data?.crmCohort || '').trim().toUpperCase() === 'INCOMING');
exports.isIncomingCrmRecord = isIncomingCrmRecord;
const isCurrentCrmRecord = (data) => (!(0, exports.isIncomingCrmRecord)(data));
exports.isCurrentCrmRecord = isCurrentCrmRecord;
const shouldTagAirtableCrmIntake = (data) => (String(data?.sourceSystem || '').trim().toUpperCase() === 'AIRTABLE'
    && !String(data?.crmCohort || '').trim());
exports.shouldTagAirtableCrmIntake = shouldTagAirtableCrmIntake;
const buildIncomingCrmPatch = (assignedAt = new Date().toISOString()) => ({
    crmCohort: 'INCOMING',
    crmReviewStatus: 'UNREVIEWED',
    crmCohortAssignedAt: assignedAt,
});
exports.buildIncomingCrmPatch = buildIncomingCrmPatch;
const clientIdOf = (document) => String(document.data.clientId || '').trim();
const invoiceIdOf = (document) => String(document.data.invoiceId || document.data.clientInvoiceId || '').trim();
const scopeIntegrityInputToCurrentCrm = (input) => {
    const clients = input.clients.filter(document => (0, exports.isCurrentCrmRecord)(document.data));
    const clientIds = new Set(clients.map(document => document.id));
    const bookings = input.bookings.filter(document => (0, exports.isCurrentCrmRecord)(document.data));
    const invoices = input.invoices.filter(document => (0, exports.isCurrentCrmRecord)(document.data));
    const invoiceIds = new Set(invoices.map(document => document.id));
    const departments = input.departments.filter(document => clientIds.has(clientIdOf(document)));
    const memberships = input.memberships.filter(document => clientIds.has(clientIdOf(document)));
    const relevantAgentIds = new Set([
        ...memberships.map(document => String(document.data.agentId || '').trim()),
        ...bookings.map(document => String(document.data.requestedByAgentId || '').trim()),
    ].filter(Boolean));
    const agents = input.agents.filter(document => (relevantAgentIds.has(document.id)
        || clientIds.has(clientIdOf(document))));
    const invoiceLines = input.invoiceLines.filter(document => invoiceIds.has(invoiceIdOf(document)));
    return {
        input: {
            ...input,
            clients,
            departments,
            agents,
            memberships,
            bookings,
            invoices,
            invoiceLines,
        },
        excludedIncomingRecords: {
            clients: input.clients.length - clients.length,
            departments: input.departments.length - departments.length,
            agents: input.agents.length - agents.length,
            memberships: input.memberships.length - memberships.length,
            bookings: input.bookings.length - bookings.length,
            invoices: input.invoices.length - invoices.length,
            invoiceLines: input.invoiceLines.length - invoiceLines.length,
        },
    };
};
exports.scopeIntegrityInputToCurrentCrm = scopeIntegrityInputToCurrentCrm;
//# sourceMappingURL=clientCrmCohort.js.map