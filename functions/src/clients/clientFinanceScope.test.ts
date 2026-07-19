import { describe, expect, it } from 'vitest';
import {
  projectClientFinanceHierarchy,
  projectClientInvoiceLineHierarchy,
} from './clientFinanceScope';

describe('client finance hierarchy projection', () => {
  it('projects a fully scoped single-department invoice', () => {
    expect(projectClientFinanceHierarchy([
      { id: 'job-b', clientId: 'client-a', clientDepartmentId: 'dept-a', requestedByAgentId: 'agent-b', requestedByUserId: 'user-b' },
      { id: 'job-a', clientId: 'client-a', clientDepartmentId: 'dept-a', requestedByAgentId: 'agent-a', requestedByUserId: 'user-a' },
    ])).toEqual({
      bookingIds: ['job-a', 'job-b'],
      clientDepartmentIds: ['dept-a'],
      requestedByAgentIds: ['agent-a', 'agent-b'],
      requestedByUserIds: ['user-a', 'user-b'],
      clientDepartmentId: 'dept-a',
      hierarchyScopeStatus: 'COMPLETE',
      hierarchyCoverage: {
        bookingCount: 2,
        departmentLinkedBookings: 2,
        requesterLinkedBookings: 2,
        fullyScopedBookings: 2,
      },
      hierarchyProjectionVersion: 1,
    });
  });

  it('marks mixed historical coverage as partial without inventing a single department', () => {
    const projection = projectClientFinanceHierarchy([
      { id: 'job-a', clientDepartmentId: 'dept-a' },
      { id: 'job-b' },
      { id: 'job-c', clientDepartmentId: 'dept-b', requestedByAgentId: 'agent-c' },
    ]);
    expect(projection.hierarchyScopeStatus).toBe('PARTIAL');
    expect(projection.clientDepartmentIds).toEqual(['dept-a', 'dept-b']);
    expect(projection.clientDepartmentId).toBeUndefined();
    expect(projection.hierarchyCoverage).toEqual({
      bookingCount: 3,
      departmentLinkedBookings: 2,
      requesterLinkedBookings: 1,
      fullyScopedBookings: 1,
    });
  });

  it('distinguishes client-only and unlinked invoices', () => {
    expect(projectClientFinanceHierarchy([{ id: 'job-a', clientId: 'client-a' }]).hierarchyScopeStatus).toBe('CLIENT_ONLY');
    expect(projectClientFinanceHierarchy([]).hierarchyScopeStatus).toBe('UNLINKED');
  });

  it('copies exact booking scope to an invoice line', () => {
    expect(projectClientInvoiceLineHierarchy({
      clientId: 'client-a',
      clientDepartmentId: 'dept-a',
      requestedByAgentId: 'agent-a',
      requestedByUserId: 'user-a',
    })).toMatchObject({
      clientId: 'client-a',
      clientDepartmentId: 'dept-a',
      requestedByAgentId: 'agent-a',
      requestedByUserId: 'user-a',
      hierarchyScopeStatus: 'COMPLETE',
    });
  });
});
