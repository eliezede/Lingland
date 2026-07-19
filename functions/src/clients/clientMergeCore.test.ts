import { describe, expect, it } from 'vitest';
import { buildClientIdentityAudit } from './clientIdentityAuditCore';
import { buildClientMergePreview } from './clientMergeCore';

describe('client merge preview', () => {
  const candidate = buildClientIdentityAudit({
    clients: [
      { id: 'canonical', companyName: 'Example Trust', sageAccountRef: 'EX-1', invoiceEmail: 'finance@example.test' },
      { id: 'duplicate', companyName: 'Example Trust', sageAccountRef: 'EX-1', billingAddress: '1 High Street, SO14 1AA' },
    ],
    bookingCounts: { canonical: 4, duplicate: 2 },
  }).organizationCandidates[0];

  const documents = [
    { id: 'canonical', version: 'v1', data: { companyName: 'Example Trust', sageAccountRef: 'EX-1', invoiceEmail: 'finance@example.test' } },
    { id: 'duplicate', version: 'v2', data: { companyName: 'Example Trust', sageAccountRef: 'EX-1', billingAddress: '1 High Street, SO14 1AA', bookingContactName: 'Sam Requester', bookingEmail: 'sam@example.test' } },
  ];

  const dependencies = [
    { collection: 'bookings', id: 'job-1', clientId: 'duplicate', version: 'j1' },
    { collection: 'timesheets', id: 'ts-1', clientId: 'duplicate', version: 't1' },
  ];

  it('preserves canonical values and fills only empty canonical fields', () => {
    const preview = buildClientMergePreview(candidate, 'canonical', documents, dependencies);
    expect(preview.canExecute).toBe(true);
    expect(preview.canonicalPatch).toMatchObject({
      billingAddress: '1 High Street, SO14 1AA',
      recordState: 'ACTIVE',
      mergedClientIds: ['duplicate'],
    });
    expect(preview.canonicalPatch.companyName).toBeUndefined();
    expect(preview.totals).toMatchObject({ jobs: 1, timesheets: 1, dependencyRecords: 2 });
    expect(preview.hierarchy).toMatchObject({
      bookingAgentLinks: 1,
      totals: { agents: 2, memberships: 2, sharedMailboxes: 1 },
    });
  });

  it('produces the same concurrency fingerprint regardless of input order', () => {
    const forward = buildClientMergePreview(candidate, 'canonical', documents, dependencies);
    const reversed = buildClientMergePreview(candidate, 'canonical', documents.slice().reverse(), dependencies.slice().reverse());
    expect(forward.expectedFingerprint).toBe(reversed.expectedFingerprint);
  });

  it('can recalculate a preview from its resolved selections when protected fields are empty', () => {
    const initial = buildClientMergePreview(candidate, 'canonical', documents, dependencies);
    const recalculated = buildClientMergePreview(candidate, 'canonical', documents, dependencies, [], initial.fieldSelections);

    expect(recalculated.expectedFingerprint).toBe(initial.expectedFingerprint);
    expect(recalculated.fieldSelections.sageAccountRef).toBe('canonical');
  });

  it('allows an explicitly reviewed source value to replace a wrong canonical field', () => {
    const conflictingDocuments = documents.map(document => ({
      ...document,
      data: {
        ...document.data,
        billingAddress: document.id === 'canonical' ? 'Wrong Council Address' : 'Correct Trust Address',
      },
    }));
    const preview = buildClientMergePreview(
      candidate,
      'canonical',
      conflictingDocuments,
      dependencies,
      [],
      { billingAddress: 'duplicate' },
    );

    expect(preview.canonicalPatch.billingAddress).toBe('Correct Trust Address');
    expect(preview.fieldSelections.billingAddress).toBe('duplicate');
    expect(preview.fields.find(field => field.field === 'billingAddress')).toMatchObject({
      sourceClientId: 'duplicate',
      overridesCanonical: true,
    });
  });
});
