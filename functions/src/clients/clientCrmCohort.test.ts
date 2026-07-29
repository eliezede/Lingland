import { describe, expect, it } from 'vitest';
import {
  buildIncomingCrmPatch,
  isCurrentCrmRecord,
  isIncomingCrmRecord,
  shouldTagAirtableCrmIntake,
  scopeIntegrityInputToCurrentCrm,
} from './clientCrmCohort';
import { ClientHierarchyIntegrityInput } from './clientHierarchyIntegrityCore';

const baseInput = (): ClientHierarchyIntegrityInput => ({
  clients: [
    { id: 'current-client', data: { companyName: 'Current' } },
    { id: 'incoming-client', data: { companyName: 'Incoming', crmCohort: 'INCOMING' } },
  ],
  departments: [
    { id: 'current-department', data: { clientId: 'current-client' } },
    { id: 'incoming-department', data: { clientId: 'incoming-client' } },
  ],
  agents: [
    { id: 'current-agent', data: {} },
    { id: 'incoming-agent', data: {} },
  ],
  memberships: [
    { id: 'current-membership', data: { clientId: 'current-client', agentId: 'current-agent' } },
    { id: 'incoming-membership', data: { clientId: 'incoming-client', agentId: 'incoming-agent' } },
  ],
  users: [],
  bookings: [
    { id: 'current-booking', data: { clientId: 'current-client', requestedByAgentId: 'current-agent' } },
    { id: 'incoming-booking', data: { clientId: 'current-client', crmCohort: 'INCOMING' } },
  ],
  invoices: [
    { id: 'current-invoice', data: { clientId: 'current-client' } },
    { id: 'incoming-invoice', data: { clientId: 'current-client', crmCohort: 'INCOMING' } },
  ],
  invoiceLines: [
    { id: 'current-line', data: { invoiceId: 'current-invoice', bookingId: 'current-booking' } },
    { id: 'incoming-line', data: { invoiceId: 'incoming-invoice', bookingId: 'incoming-booking' } },
  ],
  notifications: [],
  generatedAt: '2026-07-29T00:00:00.000Z',
  truncated: false,
});

describe('Client CRM cohort scope', () => {
  it('treats legacy records without a cohort as part of the current baseline', () => {
    expect(isCurrentCrmRecord({})).toBe(true);
    expect(isIncomingCrmRecord({})).toBe(false);
  });

  it('recognises incoming records case-insensitively', () => {
    expect(isIncomingCrmRecord({ crmCohort: ' incoming ' })).toBe(true);
    expect(isCurrentCrmRecord({ crmCohort: 'INCOMING' })).toBe(false);
  });

  it('tags only new unclassified Airtable records', () => {
    expect(shouldTagAirtableCrmIntake({ sourceSystem: 'AIRTABLE' })).toBe(true);
    expect(shouldTagAirtableCrmIntake({ sourceSystem: 'STAFF_MANUAL' })).toBe(false);
    expect(shouldTagAirtableCrmIntake({
      sourceSystem: 'AIRTABLE',
      crmCohort: 'CURRENT',
    })).toBe(false);
    expect(buildIncomingCrmPatch('2026-07-29T12:00:00.000Z')).toEqual({
      crmCohort: 'INCOMING',
      crmReviewStatus: 'UNREVIEWED',
      crmCohortAssignedAt: '2026-07-29T12:00:00.000Z',
    });
  });

  it('excludes incoming clients and their hierarchy, jobs and finance records', () => {
    const scoped = scopeIntegrityInputToCurrentCrm(baseInput());

    expect(scoped.input.clients.map(document => document.id)).toEqual(['current-client']);
    expect(scoped.input.departments.map(document => document.id)).toEqual(['current-department']);
    expect(scoped.input.agents.map(document => document.id)).toEqual(['current-agent']);
    expect(scoped.input.memberships.map(document => document.id)).toEqual(['current-membership']);
    expect(scoped.input.bookings.map(document => document.id)).toEqual(['current-booking']);
    expect(scoped.input.invoices.map(document => document.id)).toEqual(['current-invoice']);
    expect(scoped.input.invoiceLines.map(document => document.id)).toEqual(['current-line']);
    expect(scoped.excludedIncomingRecords).toEqual({
      clients: 1,
      departments: 1,
      agents: 1,
      memberships: 1,
      bookings: 1,
      invoices: 1,
      invoiceLines: 1,
    });
  });
});
