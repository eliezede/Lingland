import { describe, expect, it } from 'vitest';
import { canReuseLegacyBookingIdentity } from './redbookBookingIdentity';

describe('canReuseLegacyBookingIdentity', () => {
  it('never merges two distinct Airtable source rows', () => {
    expect(canReuseLegacyBookingIdentity({
      sourceRecordId: 'rec-existing',
      legacyAirtableRef: 'LING26.17412 Dari',
    }, 'LING26.17412 Polish')).toBe(false);
  });

  it('reuses an untracked historical row with the exact full reference', () => {
    expect(canReuseLegacyBookingIdentity({
      legacyAirtableRef: 'LING26.17412 Polish',
    }, 'ling26.17412 polish')).toBe(true);
  });

  it('does not merge different languages that share one number', () => {
    expect(canReuseLegacyBookingIdentity({
      legacyAirtableRef: 'LING26.17412 Dari',
    }, 'LING26.17412 Polish')).toBe(false);
  });

  it('allows a legacy row with no complete reference to be adopted', () => {
    expect(canReuseLegacyBookingIdentity({}, 'LING26.17412 Polish')).toBe(true);
  });
});
