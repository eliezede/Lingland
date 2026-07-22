import { describe, expect, it } from 'vitest';
import { recommendCanonicalClient } from './clientIdentityRecommendations';

describe('Airtable client identity recommendations', () => {
  it('recommends a unique canonical client from a stable account key', () => {
    const result = recommendCanonicalClient({
      id: 'source',
      label: 'HHFT Urology',
      names: ['HHFT Urology'],
      accountKeys: ['HHFT01'],
    }, [{
      id: 'client-hhft',
      label: 'Hampshire Hospitals NHS Foundation Trust',
      names: ['Hampshire Hospitals NHS Foundation Trust'],
      accountKeys: ['HHFT01'],
    }]);

    expect(result).toMatchObject({
      canonicalClientId: 'client-hhft',
      confidence: 'HIGH',
      autoReviewEligible: true,
    });
    expect(result?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ACCOUNT_KEY', strength: 'STRONG' }),
    ]));
  });

  it('never treats broad NHS or public mailbox domains as organisation evidence', () => {
    const result = recommendCanonicalClient({
      id: 'source',
      label: 'Unrelated Department',
      names: ['Unrelated Department'],
      emails: ['requester@nhs.net'],
    }, [{
      id: 'client-hospital',
      label: 'Hospital Trust',
      names: ['Hospital Trust'],
      emails: ['finance@nhs.net'],
    }]);

    expect(result).toBeNull();
  });

  it('keeps address-only department evidence as manual review', () => {
    const result = recommendCanonicalClient({
      id: 'department',
      label: 'Urology Department',
      names: ['Urology Department'],
      addresses: ['Aldermaston Road, Basingstoke, RG24 9NA'],
    }, [{
      id: 'client-hospital',
      label: 'North Hampshire Hospital',
      names: ['North Hampshire Hospital'],
      addresses: ['Aldermaston Road, Basingstoke, RG24 9NA'],
    }]);

    expect(result).toMatchObject({
      canonicalClientId: 'client-hospital',
      confidence: 'MEDIUM',
      autoReviewEligible: false,
    });
  });

  it('downgrades a close high-confidence tie instead of selecting it for batch review', () => {
    const result = recommendCanonicalClient({
      id: 'source',
      label: 'Example Trust',
      names: ['Example Trust'],
    }, [
      { id: 'client-a', label: 'Example Trust', names: ['Example Trust'] },
      { id: 'client-b', label: 'Example Trust', names: ['Example Trust'] },
    ]);

    expect(result).toMatchObject({
      confidence: 'MEDIUM',
      autoReviewEligible: false,
    });
    expect(result?.alternatives).toHaveLength(1);
  });

  it('keeps a specific domain plus partial name similarity in manual review', () => {
    const result = recommendCanonicalClient({
      id: 'source',
      label: 'Southampton City Council Children Services',
      names: ['Southampton City Council Children Services'],
      emails: ['team@southampton.gov.uk'],
    }, [{
      id: 'client-scc',
      label: 'Southampton City Council',
      names: ['Southampton City Council'],
      emails: ['accounts@southampton.gov.uk'],
    }]);

    expect(result).toMatchObject({
      canonicalClientId: 'client-scc',
      confidence: 'MEDIUM',
      autoReviewEligible: false,
    });
    expect(result?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ORGANISATION_DOMAIN' }),
      expect.objectContaining({ code: 'SIMILAR_NAME' }),
    ]));
  });
});
