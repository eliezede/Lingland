import { describe, expect, it } from 'vitest';
import { getAirtableSourceExclusion } from './airtableSourcePolicy';

describe('Airtable source policy', () => {
  it('excludes only the reviewed historical web translation mock', () => {
    expect(getAirtableSourceExclusion('Web translations', 'recgjQV5LKVHldhdS')).toMatchObject({
      sourceRecordId: 'recgjQV5LKVHldhdS',
    });
    expect(getAirtableSourceExclusion('web translations', 'recgjQV5LKVHldhdS')).toBeTruthy();
    expect(getAirtableSourceExclusion('Web translations', 'recRealRecord12345')).toBeUndefined();
    expect(getAirtableSourceExclusion('Translations', 'recgjQV5LKVHldhdS')).toBeUndefined();
  });
});
