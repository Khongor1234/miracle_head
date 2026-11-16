/**
 * Which interface language to start in: the visitor's own earlier choice,
 * else their browser's language (Japanese browsers get Japanese, everyone
 * else English, since an English reader cannot use a Japanese-only page).
 */

export const SUPPORTED_LANGS = ['ja', 'en'];
export const LANG_STORAGE_KEY = 'miracle_head_lang';

export function languageFromBrowser(browserLanguages = []) {
  const first = String(browserLanguages.find(Boolean) || '').toLowerCase();
  return first.startsWith('ja') ? 'ja' : 'en';
}

export function initialLanguage({ saved, browserLanguages } = {}) {
  if (SUPPORTED_LANGS.includes(saved)) return saved;
  return languageFromBrowser(browserLanguages);
}
