import { describe, expect, it } from 'vitest';
import { formatLanguagePair } from './languageDisplay';

describe('language display', () => {
  it('formats normal language fields once', () => {
    expect(formatLanguagePair('English', 'Polish')).toBe('English to Polish');
  });

  it('does not duplicate an imported pair stored in either field', () => {
    expect(formatLanguagePair('English to French', 'English')).toBe('English to French');
    expect(formatLanguagePair('English', 'French to English')).toBe('French to English');
  });

  it('normalizes imported arrow notation', () => {
    expect(formatLanguagePair('', 'English -> Arabic')).toBe('English to Arabic');
  });
});
