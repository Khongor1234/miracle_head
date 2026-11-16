import { useLang } from '../LanguageContext';
import './LangSwitch.css';

const OPTIONS = [
  { lang: 'ja', label: '日本語' },
  { lang: 'en', label: 'EN' },
];

// Shows both languages with the active one filled in, so the button never
// reads as the language you are already in.
export default function LangSwitch({ className = '' }) {
  const { lang, setLang, t } = useLang();
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label={t.langSwitchLabel}>
      <span className={`lang-switch-thumb is-${lang}`} aria-hidden="true" />
      {OPTIONS.map((option) => (
        <button
          key={option.lang}
          type="button"
          lang={option.lang}
          className={`lang-switch-option${option.lang === lang ? ' is-active' : ''}`}
          aria-pressed={option.lang === lang}
          onClick={() => setLang(option.lang)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
