import { describe, expect, it } from 'vitest';
import { buildInterpreterActivationPatch } from './accountActivationPolicy';

const now = '2026-07-12T12:00:00.000Z';

describe('interpreter activation policy', () => {
  it('activates a passive Airtable workforce profile without erasing history metadata', () => {
    const patch = buildInterpreterActivationPatch({
      status: 'IMPORTED',
      sourceSystem: 'AIRTABLE',
      onboarding: { overallStatus: 'COMPLETED' },
    }, now);
    expect(patch.status).toBe('ACTIVE');
    expect(patch.onboarding).toBeUndefined();
  });

  it('keeps an existing active or translation-only profile operational', () => {
    expect(buildInterpreterActivationPatch({ status: 'ACTIVE' }, now).status).toBe('ACTIVE');
    expect(buildInterpreterActivationPatch({ status: 'ONLY_TRANSL' }, now).status).toBe('ONLY_TRANSL');
  });

  it('does not reactivate a suspended profile', () => {
    const patch = buildInterpreterActivationPatch({ status: 'SUSPENDED' }, now);
    expect(patch.status).toBe('SUSPENDED');
    expect(patch.isAvailable).toBe(false);
  });

  it('keeps genuine new applicants in onboarding', () => {
    const patch = buildInterpreterActivationPatch({ status: 'APPLICANT' }, now);
    expect(patch.status).toBe('ONBOARDING');
    expect(patch.onboarding.overallStatus).toBe('DOCUMENTS_PENDING');
  });
});
