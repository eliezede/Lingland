import { describe, expect, it } from 'vitest';
import {
  buildClientBookProjection,
  ClientBookCanonicalResolution,
  ClientBookSourceRecord,
} from './clientBookProjection';

const source = (overrides: Partial<ClientBookSourceRecord>): ClientBookSourceRecord => ({
  sourceRecordId: 'rec-book-1',
  companyName: 'Example Trust',
  stableKey: 'example trust',
  bookingAgent: 'Alex Requester',
  bookingEmail: 'alex@example.test',
  bookingPhone: '01234 567890',
  invoiceEmail: '',
  ...overrides,
});

const resolution = (overrides: Partial<ClientBookCanonicalResolution>): ClientBookCanonicalResolution => ({
  sourceRecordId: 'rec-book-1',
  canonicalClientId: 'client-example',
  canonicalCompanyName: 'Example Trust',
  ...overrides,
});

describe('Clients Book CRM projection', () => {
  it('projects several source contacts into one canonical organisation', () => {
    const result = buildClientBookProjection([
      source({}),
      source({
        sourceRecordId: 'rec-book-2',
        bookingAgent: 'Jamie Requester',
        bookingEmail: 'jamie@example.test',
      }),
    ], [
      resolution({}),
      resolution({ sourceRecordId: 'rec-book-2' }),
    ]);

    expect(result.unresolvedSourceRecordIds).toEqual([]);
    expect(result.projections).toHaveLength(1);
    expect(result.projections[0]).toMatchObject({
      canonicalClientId: 'client-example',
      sourceRecordIds: ['rec-book-1', 'rec-book-2'],
    });
    expect(result.projections[0].hierarchy.agents).toHaveLength(2);
    expect(result.projections[0].hierarchy.memberships).toHaveLength(2);
  });

  it('combines requester and finance roles for the same email', () => {
    const result = buildClientBookProjection([
      source({ invoiceEmail: 'alex@example.test', invoiceContact: 'Alex Requester' }),
    ], [resolution({})]);

    expect(result.projections[0].hierarchy.agents[0].roles).toEqual(['FINANCE', 'REQUESTER']);
    expect(result.projections[0].hierarchy.memberships[0].roles).toEqual(['FINANCE', 'REQUESTER']);
  });

  it('classifies operational mailboxes without creating a portal person', () => {
    const result = buildClientBookProjection([
      source({ bookingAgent: 'Bookings', bookingEmail: 'bookings@example.test' }),
    ], [resolution({})]);

    expect(result.projections[0].hierarchy.agents[0]).toMatchObject({
      email: 'bookings@example.test',
      agentType: 'SHARED_MAILBOX',
    });
  });

  it('infers a department only after the source was linked to a canonical organisation', () => {
    const result = buildClientBookProjection([
      source({
        companyName: 'Example Trust - Radiology Department',
        stableKey: 'example trust radiology department',
      }),
    ], [resolution({})]);

    expect(result.projections[0].hierarchy.departments).toEqual([
      expect.objectContaining({ clientId: 'client-example', name: 'Radiology Department' }),
    ]);
    expect(result.projections[0].hierarchy.memberships[0].departmentIds).toHaveLength(1);
  });

  it('keeps sources without a deterministic canonical link out of the projection', () => {
    const result = buildClientBookProjection([
      source({}),
      source({ sourceRecordId: 'rec-unresolved', companyName: 'Unknown' }),
    ], [resolution({})]);

    expect(result.unresolvedSourceRecordIds).toEqual(['rec-unresolved']);
    expect(result.projections[0].sourceRecordIds).toEqual(['rec-book-1']);
  });

  it('produces the same fingerprint regardless of Airtable row order', () => {
    const first = source({});
    const second = source({ sourceRecordId: 'rec-book-2', bookingEmail: 'two@example.test' });
    const resolutions = [resolution({}), resolution({ sourceRecordId: 'rec-book-2' })];

    const left = buildClientBookProjection([first, second], resolutions).projections[0].snapshotHash;
    const right = buildClientBookProjection([second, first], resolutions.slice().reverse()).projections[0].snapshotHash;
    expect(left).toBe(right);
  });
});
