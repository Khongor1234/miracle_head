import { useLang } from '../LanguageContext';
import './LandingPage.css';

const CHARACTER_IDS = ['joy', 'sadness', 'anger', 'fear', 'disgust'];
const CHARACTER_IMGS = {
  joy:     '/characters/joy.png',
  sadness: '/characters/sadness.png',
  anger:   '/characters/anger.png',
  fear:    '/characters/fear.png',
  disgust: '/characters/disgust.png',
};
const STEP_NUMBERS = ['01', '02', '03'];

export default function LandingPage({ onEnter }) {
  const { lang, setLang, t } = useLang();

  return (
    <div className="landing">
      <nav className="landing-nav">
        <span className="landing-logo">Miracle Head</span>
        <div className="landing-nav-right">
          <button
            className="lang-toggle"
            onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}
            type="button"
          >
            {lang === 'ja' ? 'EN' : '日本語'}
          </button>
          <button className="landing-nav-cta" onClick={onEnter} type="button">
            {t.landing.navCta}
          </button>
        </div>
      </nav>

      <section className="landing-hero">
        <p className="landing-chip">{t.landing.chip}</p>
        <h1 className="landing-headline">
          {t.landing.headline}<br />
          <em>{t.landing.headlineEm}</em>
        </h1>
        <p className="landing-sub">{t.landing.sub}</p>
        <button className="landing-cta" onClick={onEnter} type="button">
          {t.landing.ctaStart}
          <span className="landing-cta-arrow">→</span>
        </button>
      </section>

      <section className="landing-characters">
        <header className="landing-section-header">
          <h2>{t.landing.teamTitle}</h2>
          <p>{t.landing.teamSub}</p>
        </header>
        <div className="landing-character-grid">
          {CHARACTER_IDS.map((id, i) => {
            const c = t.characters[i];
            return (
              <div key={id} className={`character-card character-${id}`}>
                <div className="character-avatar">
                  <img src={CHARACTER_IMGS[id]} alt={c.name} className="character-img" />
                </div>
                <div className="character-names">
                  <span className="character-jp-name">{c.name}</span>
                </div>
                <p className="character-role">{c.role}</p>
                <p className="character-desc">{c.description}</p>
              </div>
            );
          })}
        </div>
        <p className="carousel-hint">
          <span className="carousel-hint-arrow">→</span>
          {t.landing.swipeHint}
        </p>
      </section>

      <section className="landing-how">
        <header className="landing-section-header">
          <h2>{t.landing.howTitle}</h2>
        </header>
        <div className="landing-steps">
          {t.steps.map((step, i) => (
            <div key={STEP_NUMBERS[i]} className="landing-step">
              <span className="step-number">{STEP_NUMBERS[i]}</span>
              <h3 className="step-title">{step.title}</h3>
              <p className="step-body">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-footer-cta">
        <h2>{t.landing.footerCtaTitle}</h2>
        <button className="landing-cta" onClick={onEnter} type="button">
          {t.landing.footerCtaBtn}
          <span className="landing-cta-arrow">→</span>
        </button>
      </section>

      <footer className="landing-footer">
        <span>{t.landing.footerBrand}</span>
        <span>{t.landing.footerInspired}</span>
      </footer>
    </div>
  );
}
