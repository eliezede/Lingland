import { describe, expect, it } from 'vitest';
import {
  buildClientHierarchyScopeBatchPlan,
  buildClientFinanceBackfillPlan,
  buildClientHierarchyIntegrityAudit,
  ClientHierarchyIntegrityInput,
  createBookingHierarchyFingerprint,
} from './clientHierarchyIntegrityCore';

const base = (): ClientHierarchyIntegrityInput => ({
  clients: [{ id: 'client-a', data: { companyName: 'Client A', recordState: 'ACTIVE' } }],
  departments: [{ id: 'dept-a', data: { clientId: 'client-a', status: 'ACTIVE' } }],
  agents: [{ id: 'agent-a', data: { userId: 'user-a', status: 'ACTIVE' } }],
  memberships: [{ id: 'member-a', data: { clientId: 'client-a', agentId: 'agent-a', userId: 'user-a', departmentIds: ['dept-a'], status: 'ACTIVE' } }],
  users: [{ id: 'user-a', data: { role: 'CLIENT', clientId: 'client-a', status: 'ACTIVE' } }],
  bookings: [{ id: 'job-a', data: { clientId: 'client-a', clientDepartmentId: 'dept-a', requestedByAgentId: 'agent-a', requestedByUserId: 'user-a' } }],
  invoices: [{ id: 'invoice-a', data: { clientId: 'client-a', status: 'SENT' } }],
  invoiceLines: [{ id: 'line-a', data: { invoiceId: 'invoice-a', bookingId: 'job-a', clientId: 'client-a' } }],
});

describe('client hierarchy integrity audit', () => {
  it('previews a deterministic, non-destructive legacy job scope batch', () => {
    const input = base();
    input.bookings = [
      { id: 'job-a', data: { clientId: 'client-a', displayRef: 'LING26.10001' } },
      { id: 'job-b', data: { clientId: 'client-a', clientDepartmentId: 'dept-a' } },
    ];
    input.invoiceLines = [{ id: 'line-a', data: { invoiceId: 'invoice-a', bookingId: 'job-a' } }];

    const plan = buildClientHierarchyScopeBatchPlan(input, {
      clientId: 'client-a',
      clientDepartmentId: 'dept-a',
      bookingIds: ['job-b', 'job-a'],
    });

    expect(plan).toMatchObject({
      requestedBookingCount: 2,
      eligibleBookingCount: 1,
      unchangedBookingCount: 1,
      financeLinkedBookingCount: 1,
      linkedInvoiceIds: ['invoice-a'],
      blockers: [],
    });
    expect(plan.jobs[0]).toMatchObject({
      bookingId: 'job-a',
      reference: 'LING26.10001',
      currentClientDepartmentId: '',
      nextClientDepartmentId: 'dept-a',
    });
    expect(plan.fingerprint).toHaveLength(64);

    const reordered = buildClientHierarchyScopeBatchPlan(input, {
      clientId: 'client-a',
      clientDepartmentId: 'dept-a',
      bookingIds: ['job-a', 'job-b'],
    });
    expect(reordered.fingerprint).toBe(plan.fingerprint);
  });

  it('blocks a batch from moving jobs across clients or overwriting an existing scope', () => {
    const input = base();
    input.clients.push({ id: 'client-b', data: { companyName: 'Client B', recordState: 'ACTIVE' } });
    input.bookings = [
      { id: 'job-a', data: { clientId: 'client-b' } },
      { id: 'job-b', data: { clientId: 'client-a', clientDepartmentId: 'dept-b' } },
      { id: 'job-c', data: { clientId: 'client-a', requestedByAgentId: 'agent-b' } },
    ];

    const plan = buildClientHierarchyScopeBatchPlan(input, {
      clientId: 'client-a',
      clientDepartmentId: 'dept-a',
      requestedByAgentId: 'agent-a',
      bookingIds: ['job-a', 'job-b', 'job-c', 'job-missing'],
    });

    expect(plan.eligibleBookingCount).toBe(0);
    expect(plan.blockers.map(blocker => blocker.code)).toEqual([
      'CLIENT_MISMATCH',
      'DEPARTMENT_CONFLICT',
      'REQUESTER_CONFLICT',
      'BOOKING_NOT_FOUND',
    ]);
  });

  it('invalidates a batch preview when any selected job hierarchy changes', () => {
    const input = base();
    input.bookings[0].data = { clientId: 'client-a' };
    const target = {
      clientId: 'client-a',
      clientDepartmentId: 'dept-a',
      bookingIds: ['job-a'],
    };
    const initial = buildClientHierarchyScopeBatchPlan(input, target);
    input.bookings[0].data.clientSnapshot = { organizationName: 'Changed after preview' };
    const changed = buildClientHierarchyScopeBatchPlan(input, target);
    expect(changed.fingerprint).not.toBe(initial.fingerprint);
  });

  it('binds a job repair fingerprint to every hierarchy relationship', () => {
    const baseFingerprint = createBookingHierarchyFingerprint('job-a', {
      clientId: 'client-a',
      clientDepartmentId: 'dept-a',
      requestedByAgentId: 'agent-a',
      requestedByUserId: 'user-a',
      clientSnapshot: { organizationName: 'Client A' },
    });
    expect(createBookingHierarchyFingerprint('job-a', {
      clientId: 'client-a',
      clientDepartmentId: 'dept-b',
      requestedByAgentId: 'agent-a',
      requestedByUserId: 'user-a',
      clientSnapshot: { organizationName: 'Client A' },
    })).not.toBe(baseFingerprint);
    expect(createBookingHierarchyFingerprint('job-a', {
      clientId: 'client-a',
      clientDepartmentId: 'dept-a',
      requestedByAgentId: 'agent-a',
      requestedByUserId: 'user-a',
      clientSnapshot: { organizationName: 'Client B' },
    })).not.toBe(baseFingerprint);
    expect(createBookingHierarchyFingerprint('job-a', {
      requestedByUserId: 'user-a',
      requestedByAgentId: 'agent-a',
      clientDepartmentId: 'dept-a',
      clientId: 'client-a',
      clientSnapshot: { requesterEmail: '', organizationName: 'Client A' },
    })).toBe(baseFingerprint);
  });

  it('plans deterministic invoice and line hierarchy backfill', () => {
    const plan = buildClientFinanceBackfillPlan(base());
    expect(plan.invoiceUpdates).toHaveLength(1);
    expect(plan.lineUpdates).toHaveLength(1);
    expect(plan.invoiceUpdates[0].patch).toMatchObject({
      clientId: 'client-a',
      bookingIds: ['job-a'],
      clientDepartmentIds: ['dept-a'],
      requestedByAgentIds: ['agent-a'],
      hierarchyScopeStatus: 'COMPLETE',
    });
    expect(plan.blockedInvoiceIds).toEqual([]);
  });

  it('recognises a direct booking invoice link when legacy line records are absent', () => {
    const input = base();
    input.invoiceLines = [];
    input.bookings[0].data.clientInvoiceId = 'invoice-a';
    const plan = buildClientFinanceBackfillPlan(input);

    expect(plan.unlinkedInvoiceIds).toEqual([]);
    expect(plan.blockedInvoiceIds).toEqual([]);
    expect(plan.invoiceUpdates[0].patch).toMatchObject({
      clientId: 'client-a',
      bookingIds: ['job-a'],
      clientDepartmentIds: ['dept-a'],
      requestedByAgentIds: ['agent-a'],
    });
  });

  it('becomes cutover-ready after the projected fields are applied', () => {
    const input = base();
    const plan = buildClientFinanceBackfillPlan(input);
    input.invoices[0].data = { ...input.invoices[0].data, ...plan.invoiceUpdates[0].patch };
    input.invoiceLines[0].data = { ...input.invoiceLines[0].data, ...plan.lineUpdates[0].patch };
    const audit = buildClientHierarchyIntegrityAudit(input);
    expect(audit.summary.criticalIssues).toBe(0);
    expect(audit.summary.invoicesNeedingHierarchyBackfill).toBe(0);
    expect(audit.readyForMembershipCutover).toBe(true);
  });

  it('blocks invoices that link jobs from different clients', () => {
    const input = base();
    input.clients.push({ id: 'client-b', data: { recordState: 'ACTIVE' } });
    input.bookings.push({ id: 'job-b', data: { clientId: 'client-b' } });
    input.invoiceLines.push({ id: 'line-b', data: { invoiceId: 'invoice-a', bookingId: 'job-b' } });
    const plan = buildClientFinanceBackfillPlan(input);
    expect(plan.blockedInvoiceIds).toEqual(['invoice-a']);
    expect(plan.invoiceUpdates).toEqual([]);
    expect(plan.blockedInvoices[0]).toMatchObject({
      reason: 'MULTIPLE_CLIENTS',
      bookingIds: ['job-a', 'job-b'],
      missingBookingIds: [],
      bookings: [
        expect.objectContaining({ bookingId: 'job-a', issueCodes: [] }),
        expect.objectContaining({ bookingId: 'job-b', issueCodes: [] }),
      ],
    });
  });

  it('repairs an unlinked legacy invoice from a unique account key', () => {
    const input = base();
    input.clients[0].data.sageAccountRef = 'HAM013';
    input.invoices[0].data = {
      clientId: 'airtable_client_ham013',
      clientName: 'Airtable Client',
      status: 'PAID',
    };
    input.invoiceLines[0].data = { invoiceId: 'invoice-a' };

    const plan = buildClientFinanceBackfillPlan(input);

    expect(plan.blockedInvoiceIds).toEqual([]);
    expect(plan.inferredClientAssignments).toEqual([expect.objectContaining({
      invoiceId: 'invoice-a',
      clientId: 'client-a',
      confidence: 'HIGH',
      method: 'ACCOUNT_KEY',
    })]);
    expect(plan.invoiceUpdates[0].patch).toMatchObject({
      clientId: 'client-a',
      hierarchyScopeStatus: 'UNLINKED',
      clientIdentityResolution: {
        status: 'RESOLVED',
        method: 'ACCOUNT_KEY',
      },
    });
  });

  it('blocks an ambiguous unlinked invoice identity', () => {
    const input = base();
    input.clients[0].data.companyName = 'Shared Client';
    input.clients.push({ id: 'client-b', data: { companyName: 'Shared Client', recordState: 'ACTIVE' } });
    input.invoices[0].data = { clientId: 'airtable_client_missing', clientName: 'Shared Client' };
    input.invoiceLines[0].data = { invoiceId: 'invoice-a' };

    const plan = buildClientFinanceBackfillPlan(input);

    expect(plan.blockedInvoiceIds).toEqual(['invoice-a']);
    expect(plan.blockedInvoices[0]).toMatchObject({
      invoiceId: 'invoice-a',
      reason: 'CLIENT_IDENTITY_UNRESOLVED',
      candidateClientIds: ['client-a', 'client-b'],
    });
  });

  it('blocks invoices whose linked job still uses the generic Airtable client', () => {
    const input = base();
    input.clients.push({ id: 'airtable_client_airtable-client', data: { companyName: 'Airtable Client' } });
    input.bookings[0].data.clientId = 'airtable_client_airtable-client';
    input.invoices[0].data.clientId = 'airtable_client_missing';

    const audit = buildClientHierarchyIntegrityAudit(input);

    expect(audit.issueCounts.BOOKING_CLIENT_PLACEHOLDER).toBe(1);
    expect(audit.financeBackfill.blockedInvoiceIds).toEqual(['invoice-a']);
  });

  it('reports invalid department, agent and orphan line relationships', () => {
    const input = base();
    input.bookings[0].data.clientDepartmentId = 'dept-missing';
    input.bookings[0].data.requestedByAgentId = 'agent-missing';
    input.invoiceLines.push({ id: 'line-orphan', data: { invoiceId: 'invoice-missing' } });
    const audit = buildClientHierarchyIntegrityAudit(input);
    expect(audit.issueCounts.BOOKING_DEPARTMENT_INVALID).toBe(1);
    expect(audit.issueCounts.BOOKING_AGENT_MISSING).toBe(1);
    expect(audit.issueCounts.INVOICE_LINE_ORPHAN).toBe(1);
    expect(audit.readyForMembershipCutover).toBe(false);
    expect(audit.financeBackfill.blockedInvoiceIds).toEqual(['invoice-a']);
    expect(audit.financeBackfill.blockedInvoices[0].bookings[0]).toMatchObject({
      bookingId: 'job-a',
      clientId: 'client-a',
      clientDepartmentId: 'dept-missing',
      requestedByAgentId: 'agent-missing',
      issueCodes: ['DEPARTMENT_INVALID', 'AGENT_MISSING'],
    });
    expect(audit.financeBackfill.blockedInvoices[0].bookings[0].hierarchyFingerprint).toHaveLength(64);
  });

  it('reports missing linked booking IDs separately from repairable jobs', () => {
    const input = base();
    input.invoiceLines[0].data.bookingId = 'job-missing';

    const plan = buildClientFinanceBackfillPlan(input);

    expect(plan.blockedInvoices[0]).toMatchObject({
      reason: 'BOOKING_LINK_MISSING',
      bookingIds: ['job-missing'],
      missingBookingIds: ['job-missing'],
      bookings: [],
    });
  });
});
