const LANGUAGE_PAIR_PATTERN = /^\s*(.+?)\s+(?:to|->|\u2192)\s+(.+?)\s*$/i;

const normalizedPair = (value: string) => {
  const match = value.match(LANGUAGE_PAIR_PATTERN);
  return match ? `${match[1].trim()} to ${match[2].trim()}` : '';
};

export const formatLanguagePair = (languageFrom?: string, languageTo?: string) => {
  const from = (languageFrom || '').trim();
  const to = (languageTo || '').trim();

  const pairFromTarget = normalizedPair(to);
  if (pairFromTarget) return pairFromTarget;
  const pairFromSource = normalizedPair(from);
  if (pairFromSource) return pairFromSource;
  if (!to) return from ? `${from} to N/A` : 'N/A';
  if (from && from.toLowerCase() === to.toLowerCase()) return from;
  return `${from || 'English'} to ${to}`;
};

export const formatLanguageSearchText = (languageFrom?: string, languageTo?: string) => (
  `${languageFrom || ''} ${languageTo || ''} ${formatLanguagePair(languageFrom, languageTo)}`
);
