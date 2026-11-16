import { createContext, useContext, useEffect, useState } from 'react';
import { translations } from './i18n';
import { LANG_STORAGE_KEY, initialLanguage } from './languagePreference';

const LanguageContext = createContext(null);

function readSavedLanguage() {
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return null; // Storage blocked: fall back to the browser's language.
  }
}

function saveLanguage(lang) {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => initialLanguage({
    saved: readSavedLanguage(),
    browserLanguages: navigator.languages?.length ? navigator.languages : [navigator.language],
  }));

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (next) => {
    saveLanguage(next);
    setLangState(next);
  };

  const t = translations[lang];
  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLang = () => useContext(LanguageContext);
