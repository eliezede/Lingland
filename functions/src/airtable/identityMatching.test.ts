import { describe, expect, it } from 'vitest';
import { findUniquePhoneCandidate, normalizeIdentityName, normalizeIdentityPhone } from './identityMatching';

describe('Airtable identity matching', () => {
  it('normalizes case, accents and punctuation consistently', () => {
    expect(normalizeIdentityName('  Violetta Pugh ')).toBe('violetta pugh');
    expect(normalizeIdentityName('Jos\u00e9  da-Silva')).toBe('jose da silva');
  });

  it('normalizes UK international and local phone formats', () => {
    expect(normalizeIdentityPhone('+44 7700 900123')).toBe('07700900123');
    expect(normalizeIdentityPhone('0044 7700 900123')).toBe('07700900123');
    expect(normalizeIdentityPhone('+44 (0)7700 900123')).toBe('07700900123');
    expect(normalizeIdentityPhone('07700 900123')).toBe('07700900123');
  });

  it('returns a phone candidate only when the match is unique', () => {
    const people = [{ id: 'a', phone: '+44 7700 900123' }, { id: 'b', phone: '07800 111222' }];
    expect(findUniquePhoneCandidate(people, '07700 900123')?.id).toBe('a');
    expect(findUniquePhoneCandidate([{ id: 'a', normalizedPhone: '07700900123' }], '+44 7700 900123')?.id).toBe('a');
    expect(findUniquePhoneCandidate([...people, { id: 'c', phone: '07700 900123' }], '07700 900123')).toBeNull();
  });
});
