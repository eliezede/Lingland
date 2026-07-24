import { describe, expect, it } from 'vitest';
import { validateProfessionalIdentityLinkRequest } from './professionalIdentityLinkPolicy';

describe('professional identity link policy', () => {
  const request = {
    professionalRecordId: 'recYDgdk20Pi20SmE',
    interpreterId: 'professional-123',
    sourceName: 'Example Professional',
    reason: 'Confirmed against the Airtable profile and contact details.',
  };

  it('accepts a reviewed Super Admin mapping', () => {
    expect(validateProfessionalIdentityLinkRequest(request, 'SUPER_ADMIN')).toEqual(request);
  });

  it('rejects non Super Admin actors', () => {
    expect(() => validateProfessionalIdentityLinkRequest(request, 'ADMIN')).toThrow(
      'Only a Super Admin',
    );
  });

  it('rejects a job record or malformed source identity', () => {
    expect(() => validateProfessionalIdentityLinkRequest({
      ...request,
      professionalRecordId: 'not-an-airtable-id',
    }, 'SUPER_ADMIN')).toThrow('valid Airtable professional record ID');
  });

  it('requires an auditable reason', () => {
    expect(() => validateProfessionalIdentityLinkRequest({
      ...request,
      reason: 'ok',
    }, 'SUPER_ADMIN')).toThrow('short reason');
  });
});
