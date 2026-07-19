import { describe, expect, it } from 'vitest';
import {
  buildClientPortalPolicy,
  canManageClientBooking,
  canReadClientInvoice,
  canReadClientFinance,
} from './clientPortalPolicy';

describe('client portal membership policy', () => {
  it('keeps legacy client accounts operational during migration', () => {
    expect(buildClientPortalPolicy(null, ['dept-b', 'dept-a'])).toEqual({
      accessLevel: 'LEGACY',
      roles: ['REQUESTER'],
      allowedDepartmentIds: ['dept-a', 'dept-b'],
      canRequest: true,
      canViewBookings: true,
    });
  });

  it('limits an agent to its assigned departments', () => {
    expect(buildClientPortalPolicy({
      status: 'ACTIVE',
      accessLevel: 'AGENT',
      roles: ['REQUESTER'],
      departmentIds: ['dept-b'],
    }, ['dept-a', 'dept-b'])).toMatchObject({
      allowedDepartmentIds: ['dept-b'],
      canRequest: true,
    });
  });

  it('allows a client master to choose any active department', () => {
    expect(buildClientPortalPolicy({
      status: 'ACTIVE',
      accessLevel: 'CLIENT_MASTER',
      roles: ['FINANCE'],
      departmentIds: [],
    }, ['dept-a', 'dept-b'])).toMatchObject({
      allowedDepartmentIds: ['dept-a', 'dept-b'],
      canRequest: true,
    });
  });

  it('does not grant requester capability to finance-only access', () => {
    expect(buildClientPortalPolicy({
      status: 'ACTIVE',
      accessLevel: 'CLIENT_FINANCE',
      roles: ['FINANCE'],
    }, ['dept-a'])).toMatchObject({
      allowedDepartmentIds: ['dept-a'],
      canRequest: false,
      canViewBookings: false,
    });
  });

  it('removes all access from an inactive membership', () => {
    expect(buildClientPortalPolicy({
      status: 'INACTIVE',
      accessLevel: 'CLIENT_MASTER',
      roles: ['REQUESTER'],
    }, ['dept-a'])).toMatchObject({
      allowedDepartmentIds: [],
      canRequest: false,
    });
  });

  it('limits booking management to the requester or a department manager scope', () => {
    const agentAccess = {
      clientId: 'client-a', userId: 'user-a', agentId: 'agent-a', accessLevel: 'AGENT',
      allowedDepartmentIds: ['dept-a'], legacyFallback: false,
    };
    expect(canManageClientBooking({ clientId: 'client-a', requestedByAgentId: 'agent-a' }, agentAccess)).toBe(true);
    expect(canManageClientBooking({ clientId: 'client-a', requestedByAgentId: 'agent-b' }, agentAccess)).toBe(false);

    expect(canManageClientBooking({ clientId: 'client-a', clientDepartmentId: 'dept-a' }, {
      ...agentAccess, agentId: 'manager-a', accessLevel: 'DEPARTMENT_MANAGER',
    })).toBe(true);
    expect(canManageClientBooking({ clientId: 'client-a', clientDepartmentId: 'dept-b' }, {
      ...agentAccess, agentId: 'manager-a', accessLevel: 'DEPARTMENT_MANAGER',
    })).toBe(false);
  });

  it('allows client masters and legacy accounts across their canonical client only', () => {
    const booking = { clientId: 'client-a', requestedByAgentId: 'agent-b' };
    const base = {
      clientId: 'client-a', userId: 'user-a', agentId: 'agent-a', accessLevel: 'CLIENT_MASTER',
      allowedDepartmentIds: [], legacyFallback: false,
    };
    expect(canManageClientBooking(booking, base)).toBe(true);
    expect(canManageClientBooking({ ...booking, clientId: 'client-b' }, base)).toBe(false);
    expect(canManageClientBooking(booking, { ...base, accessLevel: 'LEGACY', legacyFallback: true })).toBe(true);
  });

  it('separates requester access from client finance access', () => {
    expect(canReadClientFinance({
      accessLevel: 'AGENT', roles: ['REQUESTER'], legacyFallback: false,
    })).toBe(false);
    expect(canReadClientFinance({
      accessLevel: 'CLIENT_FINANCE', roles: [], legacyFallback: false,
    })).toBe(true);
    expect(canReadClientFinance({
      accessLevel: 'AGENT', roles: ['finance'], legacyFallback: false,
    })).toBe(true);
    expect(canReadClientFinance({
      accessLevel: 'LEGACY', roles: [], legacyFallback: true,
    })).toBe(true);
  });

  it('scopes finance memberships to assigned departments when invoice links exist', () => {
    const access = {
      clientId: 'client-a',
      agentId: 'finance-a',
      accessLevel: 'CLIENT_FINANCE',
      roles: ['FINANCE'],
      allowedDepartmentIds: ['dept-a'],
      legacyFallback: false,
    };
    expect(canReadClientInvoice({ clientId: 'client-a', clientDepartmentIds: ['dept-a'] }, access)).toBe(true);
    expect(canReadClientInvoice({ clientId: 'client-a', clientDepartmentIds: ['dept-b'] }, access)).toBe(false);
    expect(canReadClientInvoice({ clientId: 'client-b', clientDepartmentIds: ['dept-a'] }, access)).toBe(false);
  });

  it('keeps a controlled compatibility path for historical client-only invoices', () => {
    const access = {
      clientId: 'client-a',
      agentId: 'finance-a',
      accessLevel: 'CLIENT_FINANCE',
      roles: ['FINANCE'],
      allowedDepartmentIds: ['dept-a'],
      legacyFallback: false,
    };
    expect(canReadClientInvoice({ clientId: 'client-a', hierarchyScopeStatus: 'CLIENT_ONLY' }, access)).toBe(true);
    expect(canReadClientInvoice({ clientId: 'client-a', hierarchyScopeStatus: 'UNLINKED' }, access)).toBe(false);
  });
});
