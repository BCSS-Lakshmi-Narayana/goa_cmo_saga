/**
 * Content languages tracked for Goa. Mirrors the backend enums
 * (Keyword/Event: en, hi, mr, kok, all; NewsArticle: en, mr, kok, hi, unknown).
 *
 * Konkani is Goa's official language (Devanagari script; Romi Konkani in Latin
 * script is common on social media). Marathi is the second press language.
 */
export const LANGUAGE_LABELS = {
  en: 'English',
  kok: 'Konkani',
  mr: 'Marathi',
  hi: 'Hindi',
  all: 'All',
  unknown: 'Unknown',
};

/* Options for keyword / event language pickers, in display order. */
export const KEYWORD_LANGUAGE_OPTIONS = ['en', 'kok', 'mr', 'hi', 'all'].map((value) => ({
  value,
  label: LANGUAGE_LABELS[value],
}));

export const languageLabel = (code) => LANGUAGE_LABELS[code] || LANGUAGE_LABELS.en;

/**
 * Google Input Tools code for phonetic typing. Google has no Konkani input
 * tool; Konkani is written in Devanagari, so the Marathi one produces
 * the right script.
 */
export const transliterationCode = (lang) =>
  ({ kok: 'mr-t-i0-und', mr: 'mr-t-i0-und', hi: 'hi-t-i0-und' }[lang] || 'hi-t-i0-und');
