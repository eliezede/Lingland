import { describe, expect, it } from 'vitest';
import { selectClientNotificationUserIds } from './clientNotificationPolicy';

const memberships = [
  { userId: 'requester-a', agentId: 'agent-a', status: 'ACTIVE', accessLevel: 'AGENT', roles: ['REQUESTER'], departmentIds: ['dept-a'] },
  { userId: 'manager-a', agentId: 'manager-agent', status: 'ACTIVE', accessLevel: 'DEPARTMENT_MANAGER', roles: ['REQUESTER'], departmentIds: ['dept-a'] },
  { userId: 'finance-a', agentId: 'finance-agent', status: 'ACTIVE', accessLevel: 'CLIENT_FINANCE', roles: ['FINANCE'], departmentIds: ['dept-a'] },
  { userId: 'finance-b', agentId: 'finance-b-agent', status: 'ACTIVE', accessLevel: 'CLIENT_FINANCE', roles: ['FINANCE'], departmentIds: ['dept-b'] },
  { userId: 'master', agentId: 'master-agent', status: 'ACTIVE', accessLevel: 'CLIENT_MASTER', roles: [], departmentIds: [] },
  { userId: 'inactive', agentId: 'agent-a', status: 'INACTIVE', accessLevel: 'AGENT', roles: ['REQUESTER'], departmentIds: ['dept-a'] },
];

describe('client notification recipient policy', () => {
  it('routes booking updates to the requester, department manager and master', () => {
    expect(selectClientNotificationUserIds(memberships, {
      departmentIds: ['dept-a'],
      agentIds: ['agent-a'],
      directUserIds: ['requester-a'],
    }, 'BOOKING')).toEqual(['manager-a', 'master', 'requester-a']);
  });

  it('routes finance updates only to finance users in scope and masters', () => {
    expect(selectClientNotificationUserIds(memberships, {
      departmentIds: ['dept-a'],
      agentIds: [],
      directUserIds: [],
    }, 'FINANCE')).toEqual(['finance-a', 'master']);
  });

  it('allows organisation-wide finance memberships to receive unscoped invoices', () => {
    const recipients = selectClientNotificationUserIds([
      ...memberships,
      { userId: 'finance-all', status: 'ACTIVE', accessLevel: 'CLIENT_FINANCE', roles: ['FINANCE'], departmentIds: [] },
    ], { departmentIds: [] }, 'FINANCE');
    expect(recipients).toEqual(['finance-all', 'master']);
  });
});
