import {
  ClientHierarchyIntegrityInput,
  IntegrityDocument,
} from './clientHierarchyIntegrityCore';

export const isIncomingCrmRecord = (data: Record<string, unknown> | undefined) => (
  String(data?.crmCohort || '').trim().toUpperCase() === 'INCOMING'
);

export const isCurrentCrmRecord = (data: Record<string, unknown> | undefined) => (
  !isIncomingCrmRecord(data)
);

export const shouldTagAirtableCrmIntake = (data: Record<string, unknown> | undefined) => (
  String(data?.sourceSystem || '').trim().toUpperCase() === 'AIRTABLE'
  && !String(data?.crmCohort || '').trim()
);

export const buildIncomingCrmPatch = (assignedAt = new Date().toISOString()) => ({
  crmCohort: 'INCOMING' as const,
  crmReviewStatus: 'UNREVIEWED' as const,
  crmCohortAssignedAt: assignedAt,
});

const clientIdOf = (document: IntegrityDocument) => String(document.data.clientId || '').trim();
const invoiceIdOf = (document: IntegrityDocument) => String(
  document.data.invoiceId || document.data.clientInvoiceId || '',
).trim();

export interface ClientCrmScopeExclusions {
  clients: number;
  departments: number;
  agents: number;
  memberships: number;
  bookings: number;
  invoices: number;
  invoiceLines: number;
}

export const scopeIntegrityInputToCurrentCrm = (
  input: ClientHierarchyIntegrityInput,
): {
  input: ClientHierarchyIntegrityInput;
  excludedIncomingRecords: ClientCrmScopeExclusions;
} => {
  const clients = input.clients.filter(document => isCurrentCrmRecord(document.data));
  const clientIds = new Set(clients.map(document => document.id));
  const bookings = input.bookings.filter(document => isCurrentCrmRecord(document.data));
  const invoices = input.invoices.filter(document => isCurrentCrmRecord(document.data));
  const invoiceIds = new Set(invoices.map(document => document.id));
  const departments = input.departments.filter(document => clientIds.has(clientIdOf(document)));
  const memberships = input.memberships.filter(document => clientIds.has(clientIdOf(document)));
  const relevantAgentIds = new Set([
    ...memberships.map(document => String(document.data.agentId || '').trim()),
    ...bookings.map(document => String(document.data.requestedByAgentId || '').trim()),
  ].filter(Boolean));
  const agents = input.agents.filter(document => (
    relevantAgentIds.has(document.id)
    || clientIds.has(clientIdOf(document))
  ));
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
