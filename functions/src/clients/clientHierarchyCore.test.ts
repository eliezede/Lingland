import { describe, expect, it } from 'vitest';
import { buildClientHierarchySeedPreview } from './clientHierarchyCore';

describe('client hierarchy seed preview', () => {
  it('creates one deterministic agent and membership for a repeated requester email', () => {
    const preview = buildClientHierarchySeedPreview([
      {
        id: 'canonical',
        data: {
          companyName: 'Example Solicitors',
          bookingContactName: 'Alex Smith',
          bookingEmail: 'alex@example.org',
          bookingPhone: '023 8012 3456',
        },
      },
      {
        id: 'duplicate',
        data: {
          companyName: 'Example Solicitors LLP',
          contactPerson: 'Alex Smith',
          email: 'ALEX@example.org',
        },
      },
    ], 'canonical');

    expect(preview.agents).toHaveLength(1);
    expect(preview.agents[0]).toMatchObject({
      email: 'alex@example.org',
      displayName: 'Alex Smith',
      sourceClientIds: ['canonical', 'duplicate'],
      agentType: 'PERSON',
      roles: ['REQUESTER'],
    });
    expect(preview.memberships).toHaveLength(1);
    expect(preview.memberships[0]).toMatchObject({ clientId: 'canonical', accessLevel: 'AGENT' });
    expect(preview.bookingAgentBySourceClientId).toEqual({
      canonical: preview.agents[0].id,
      duplicate: preview.agents[0].id,
    });
  });

  it('keeps requester and finance roles while classifying shared mailboxes', () => {
    const preview = buildClientHierarchySeedPreview([
      {
        id: 'canonical',
        data: {
          bookingContactName: 'Jamie Jones',
          bookingEmail: 'jamie@example.org',
          invoiceContact: 'Accounts Team',
          invoiceEmail: 'accounts@example.org',
        },
      },
    ], 'canonical');

    expect(preview.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({ email: 'jamie@example.org', agentType: 'PERSON', roles: ['REQUESTER'] }),
      expect.objectContaining({ email: 'accounts@example.org', agentType: 'SHARED_MAILBOX', roles: ['FINANCE'] }),
    ]));
    expect(preview.memberships).toEqual(expect.arrayContaining([
      expect.objectContaining({ accessLevel: 'AGENT', roles: ['REQUESTER'] }),
      expect.objectContaining({ accessLevel: 'CLIENT_FINANCE', roles: ['FINANCE'] }),
    ]));
    expect(preview.bookingAgentBySourceClientId).toHaveProperty('canonical');
  });

  it('does not invent an agent identity when a contact has no valid email', () => {
    const preview = buildClientHierarchySeedPreview([
      { id: 'canonical', data: { contactPerson: 'Unknown Requester' } },
    ], 'canonical');

    expect(preview.agents).toHaveLength(0);
    expect(preview.memberships).toHaveLength(0);
    expect(preview.unresolvedContacts).toEqual([
      expect.objectContaining({ sourceClientId: 'canonical', name: 'Unknown Requester', role: 'REQUESTER' }),
    ]);
  });

  it('does not auto-link a shared mailbox as the requester of historical bookings', () => {
    const preview = buildClientHierarchySeedPreview([
      { id: 'canonical', data: { bookingEmail: 'bookings@example.org' } },
    ], 'canonical');

    expect(preview.agents[0].agentType).toBe('SHARED_MAILBOX');
    expect(preview.bookingAgentBySourceClientId).toEqual({});
  });

  it('recognises operational mailbox patterns instead of inventing named people', () => {
    const preview = buildClientHierarchySeedPreview([
      {
        id: 'canonical',
        data: {
          contactPerson: 'Sharon Ellis-Smith',
          bookingEmail: 'caseprogressionmags.wessex@cps.gov.uk, allocatedtrialscc.wessex@cps.gov.uk',
        },
      },
    ], 'canonical');

    expect(preview.agents).toHaveLength(2);
    expect(preview.agents.every(agent => agent.agentType === 'SHARED_MAILBOX')).toBe(true);
    expect(preview.agents.map(agent => agent.displayName)).toEqual([
      'Allocatedtrialscc Wessex',
      'Caseprogressionmags Wessex',
    ]);
    expect(preview.bookingAgentBySourceClientId).toEqual({});
  });

  it('uses the Airtable client key to preserve a department hidden by the company label', () => {
    const preview = buildClientHierarchySeedPreview([
      {
        id: 'canonical',
        data: {
          companyName: 'Roach Pittis Solicitors',
          airtableClientKey: 'roach pittis, criminal department',
          bookingEmail: 'main@example.org',
        },
      },
      {
        id: 'crime',
        data: {
          companyName: 'Roach Pittis Solicitors',
          airtableClientKey: 'roach pittis solicitors - crime',
          bookingEmail: 'crime@example.org',
        },
      },
    ], 'canonical');

    expect(preview.departments).toEqual([
      expect.objectContaining({
        name: 'Criminal Department',
        confidence: 'INFERRED',
        sourceClientIds: ['canonical', 'crime'],
      }),
    ]);
    expect(preview.departmentBySourceClientId.canonical).toBe(preview.departments[0].id);
    expect(preview.departmentBySourceClientId.crime).toBe(preview.departments[0].id);
    expect(preview.memberships.find(membership => membership.sourceClientIds.includes('crime'))?.departmentIds)
      .toEqual([preview.departments[0].id]);
  });

  it('preserves an operating site added by an organisation-name variant', () => {
    const preview = buildClientHierarchySeedPreview([
      {
        id: 'canonical',
        data: {
          companyName: 'Priory Hospital Southampton',
          bookingEmail: 'katy@priorygroup.com',
        },
      },
      {
        id: 'alias',
        data: {
          companyName: 'The Priory Hospital Southampton',
          bookingEmail: 'bethany@priorygroup.com',
        },
      },
      {
        id: 'marchwood',
        data: {
          companyName: 'The Priory Southampton Hospital, Marchwood',
          bookingEmail: 'sandpipercrew@priorygroup.com',
        },
      },
    ], 'canonical');

    expect(preview.departments).toEqual([
      expect.objectContaining({
        name: 'Marchwood',
        confidence: 'INFERRED',
        sourceClientIds: ['marchwood'],
      }),
    ]);
    expect(preview.departmentBySourceClientId).toEqual({
      marchwood: preview.departments[0].id,
    });
    expect(preview.agents.find(agent => agent.email === 'sandpipercrew@priorygroup.com'))
      .toMatchObject({ agentType: 'SHARED_MAILBOX', displayName: 'Sandpipercrew' });
    expect(preview.bookingAgentBySourceClientId).not.toHaveProperty('marchwood');
  });

  it('does not turn a legal-name alias into a department', () => {
    const preview = buildClientHierarchySeedPreview([
      { id: 'canonical', data: { companyName: 'Example Solicitors' } },
      { id: 'alias', data: { companyName: 'The Example Solicitors LLP' } },
    ], 'canonical');

    expect(preview.departments).toHaveLength(0);
  });

  it('extracts delimiter-separated wards and uses the ward name to identify functional mailboxes', () => {
    const preview = buildClientHierarchySeedPreview([
      {
        id: 'canonical',
        data: {
          companyName: 'Priory Hospital Southampton',
          bookingEmail: 'katy@priorygroup.com',
        },
      },
      {
        id: 'sandpiper',
        data: {
          companyName: 'Priory - Sandpiper Ward',
          airtableClientKey: 'southampton priory hospital',
          bookingContactName: 'Natalie Tanner - Priory Hospital Southampton',
          bookingEmail: 'southamptonsandpiper@priorygroup.com',
        },
      },
      {
        id: 'starling',
        data: {
          companyName: 'Starling Ward-Priory Hospital Southampton',
          bookingEmail: 'person@priorygroup.com',
        },
      },
    ], 'canonical');

    expect(preview.departments).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Sandpiper Ward', sourceClientIds: ['sandpiper'] }),
      expect.objectContaining({ name: 'Starling Ward', sourceClientIds: ['starling'] }),
    ]));
    expect(preview.agents.find(agent => agent.email === 'southamptonsandpiper@priorygroup.com'))
      .toMatchObject({ agentType: 'SHARED_MAILBOX', displayName: 'Southamptonsandpiper' });
    expect(preview.bookingAgentBySourceClientId).not.toHaveProperty('sandpiper');
  });
});
