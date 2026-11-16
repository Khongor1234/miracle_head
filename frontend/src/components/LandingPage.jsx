import { useState } from 'react';
import { useLang } from '../LanguageContext';
import LoopVideo from './LoopVideo';
import { useOnScreen, usePointerTilt, usePrefersReducedMotion, useReveal } from '../hooks/useMotion';
import './LandingPage.css';

const CHARACTER_IDS = ['joy', 'sadness', 'anger', 'fear', 'disgust'];
const STEP_NUMBERS = ['01', '02', '03'];
const HERO_VIDEO = '/motion/hero.mp4';
const HERO_POSTER = '/motion/hero.webp';
const characterFrame = (id) => `/characters/frames/${id}.webp`;
const characterLoop = (id) => `/characters/loops/${id}.mp4`;

function HeroStage({ isReducedMotion, label }) {
  const [stageRef, isOnScreen] = useOnScreen(0.25);
  const tilt = usePointerTilt();

  return (
    <div className="hero-stage" ref={stageRef} data-reveal {...tilt}>
      <div className="hero-stage-inner">
        <LoopVideo
          className="hero-stage-video"
          src={HERO_VIDEO}
          poster={HERO_POSTER}
          isActive={isOnScreen}
          isReducedMotion={isReducedMotion}
          label={label}
        />
      </div>
    </div>
  );
}

function CharacterCard({ id, character, index, isReducedMotion }) {
  const [isHovered, setIsHovered] = useState(false);
  const [cardRef, isOnScreen] = useOnScreen(0.6);
  const tilt = usePointerTilt();
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
  const isActive = isTouch ? isOnScreen : isHovered;

  return (
    <article
      ref={cardRef}
      className={`character-card character-${id}${isActive ? ' is-playing' : ''}`}
      style={{ '--reveal-delay': `${index * 90}ms` }}
      data-reveal
      tabIndex={0}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={(event) => { setIsHovered(false); tilt.onPointerLeave(event); }}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      onPointerMove={tilt.onPointerMove}
    >
      <div className="character-avatar">
        <LoopVideo
          className="character-video"
          src={characterLoop(id)}
          poster={characterFrame(id)}
          isActive={isActive}
          isReducedMotion={isReducedMotion}
          label={character.name}
        />
        <span className="character-glow" aria-hidden="true" />
      </div>
      <div className="character-names">
        <span className="character-jp-name">{character.name}</span>
      </div>
      <p className="character-role">{character.role}</p>
      <p className="character-desc">{character.description}</p>
    </article>
  );
}

export default function LandingPage({ onEnter }) {
  const { lang, setLang, t } = useLang();
  const isReducedMotion = usePrefersReducedMotion();
  const rootRef = useReveal();

  return (
    <div className="landing" ref={rootRef}>
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
        <div className="hero-orbs" aria-hidden="true">
          {CHARACTER_IDS.map((id) => <span key={id} className={`hero-orb orb-${id}`} />)}
        </div>
        <div className="hero-copy">
          <p className="landing-chip hero-enter" style={{ '--enter-delay': '0ms' }}>{t.landing.chip}</p>
          <h1 className="landing-headline">
            <span className="hero-enter" style={{ '--enter-delay': '90ms' }}>{t.landing.headline}</span><br />
            <em className="hero-enter" style={{ '--enter-delay': '200ms' }}>{t.landing.headlineEm}</em>
          </h1>
          <p className="landing-sub hero-enter" style={{ '--enter-delay': '320ms' }}>{t.landing.sub}</p>
          <button className="landing-cta hero-enter" style={{ '--enter-delay': '440ms' }} onClick={onEnter} type="button">
            {t.landing.ctaStart}
            <span className="landing-cta-arrow">→</span>
          </button>
        </div>
        <HeroStage isReducedMotion={isReducedMotion} label={t.landing.heroVideoLabel} />
      </section>

      <section className="landing-characters">
        <header className="landing-section-header" data-reveal>
          <h2>{t.landing.teamTitle}</h2>
          <p>{t.landing.teamSub}</p>
        </header>
        <div className="landing-character-grid">
          {CHARACTER_IDS.map((id, i) => (
            <CharacterCard
              key={id}
              id={id}
              index={i}
              character={t.characters[i]}
              isReducedMotion={isReducedMotion}
            />
          ))}
        </div>
        <p className="carousel-hint">
          <span className="carousel-hint-arrow">→</span>
          {t.landing.swipeHint}
        </p>
      </section>

      <section className="landing-how">
        <header className="landing-section-header" data-reveal>
          <h2>{t.landing.howTitle}</h2>
        </header>
        <div className="landing-steps" data-reveal>
          {t.steps.map((step, i) => (
            <div key={STEP_NUMBERS[i]} className="landing-step" style={{ '--reveal-delay': `${i * 140}ms` }}>
              <span className="step-number">{STEP_NUMBERS[i]}</span>
              <h3 className="step-title">{step.title}</h3>
              <p className="step-body">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-footer-cta" data-reveal>
        <div className="footer-cta-faces" aria-hidden="true">
          {CHARACTER_IDS.map((id, i) => (
            <img key={id} src={`/characters/avatars/${id}.webp`} alt="" style={{ '--bob-delay': `${i * 0.35}s` }} />
          ))}
        </div>
        <h2>{t.landing.footerCtaTitle}</h2>
        <button className="landing-cta" onClick={onEnter} type="button">
          {t.landing.footerCtaBtn}
          <span className="landing-cta-arrow">→</span>
        </button>
        <p className="landing-disclaimer">{t.landing.disclaimer}</p>
      </section>

      <footer className="landing-footer">
        <span>{t.landing.footerBrand}</span>
        <span>{t.landing.footerInspired}</span>
      </footer>
    </div>
  );
}
