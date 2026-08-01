import { describe, expect, it } from 'vitest';
import {
  PublicRequesterContextTokenData,
  validatePublicRequesterSelection,
} from './publicRequesterContextCore';

const token = (): PublicRequesterContextTokenData => ({
  version: 1,
  authUid: 'anonymous-user',
  emailHash: 'email-hash',
  agentId: 'agent-a',
  agentType: 'PERSON',
  expiresAtMs: 2_000,
  clients: [{
    clientId: 'client-a',
    membershipId: 'membership-a',
    membershipStatus: 'ACTIVE',
    allowedDepartmentIds: ['department-a'],
  }],
});

describe('public requester context selection', () => {
  it('accepts an evidence-backed organisation and department', () => {
    expect(validatePublicRequesterSelection(token(), {
      authUid: 'anonymous-user',
      emailHash: 'email-hash',
      clientId: 'client-a',
      departmentId: 'department-a',
      nowMs: 1_000,
    })).toMatchObject({ ok: true, departmentId: 'department-a', proposedDepartmentName: '' });
  });

  it('allows an organisation-wide request without inventing a department', () => {
    expect(validatePublicRequesterSelection(token(), {
      authUid: 'anonymous-user',
      emailHash: 'email-hash',
      clientId: 'client-a',
      nowMs: 1_000,
    })).toMatchObject({ ok: true, departmentId: '', proposedDepartmentName: '' });
  });

  it('accepts a genuinely new department as a pending proposal', () => {
    expect(validatePublicRequesterSelection(token(), {
      authUid: 'anonymous-user',
      emailHash: 'email-hash',
      clientId: 'client-a',
      proposedDepartmentName: 'New Community Team',
      nowMs: 1_000,
    })).toMatchObject({ ok: true, departmentId: '', proposedDepartmentName: 'New Community Team' });
  });

  it('rejects a client or department outside the signed context', () => {
    expect(validatePublicRequesterSelection(token(), {
      authUid: 'anonymous-user',
      emailHash: 'email-hash',
      clientId: 'client-b',
      nowMs: 1_000,
    })).toMatchObject({ ok: false, code: 'CLIENT_NOT_ALLOWED' });
    expect(validatePublicRequesterSelection(token(), {
      authUid: 'anonymous-user',
      emailHash: 'email-hash',
      clientId: 'client-a',
      departmentId: 'department-b',
      nowMs: 1_000,
    })).toMatchObject({ ok: false, code: 'DEPARTMENT_NOT_ALLOWED' });
  });

  it('rejects replay from another session or after expiry', () => {
    expect(validatePublicRequesterSelection(token(), {
      authUid: 'other-user',
      emailHash: 'email-hash',
      clientId: 'client-a',
      nowMs: 1_000,
    })).toMatchObject({ ok: false, code: 'TOKEN_INVALID' });
    expect(validatePublicRequesterSelection(token(), {
      authUid: 'anonymous-user',
      emailHash: 'email-hash',
      clientId: 'client-a',
      nowMs: 2_001,
    })).toMatchObject({ ok: false, code: 'TOKEN_EXPIRED' });
  });

  it('routes a hidden existing name through staff review instead of creating a dead end', () => {
    expect(validatePublicRequesterSelection(token(), {
      authUid: 'anonymous-user',
      emailHash: 'email-hash',
      clientId: 'client-a',
      proposedDepartmentName: 'existing department',
      nowMs: 1_000,
    })).toMatchObject({ ok: true, proposedDepartmentName: 'existing department' });
  });

  it('rejects selecting an existing department and proposing another at the same time', () => {
    expect(validatePublicRequesterSelection(token(), {
      authUid: 'anonymous-user',
      emailHash: 'email-hash',
      clientId: 'client-a',
      departmentId: 'department-a',
      proposedDepartmentName: 'Another Team',
      nowMs: 1_000,
    })).toMatchObject({ ok: false, code: 'DEPARTMENT_CONFLICT' });
  });
});
