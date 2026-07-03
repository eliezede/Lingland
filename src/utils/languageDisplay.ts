const LANGUAGE_PAIR_PATTERN = /^\s*(.+?)\s+(?:to|->|→)\s+(.+?)\s*$/i;

export const formatLanguagePair = (languageFrom?: string, languageTo?: string) => {
  const from = (languageFrom || '').trim();
  const to = (languageTo || '').trim();

  if (!to) return from ? `${from} to N/A` : 'N/A';
  if (LANGUAGE_PAIR_PATTERN.test(to)) return to.replace(/\s+/g, ' ');
  return `${from || 'English'} to ${to}`;
};

export const formatLanguageSearchText = (languageFrom?: string, languageTo?: string) => (
  `${languageFrom || ''} ${languageTo || ''} ${formatLanguagePair(languageFrom, languageTo)}`
);
