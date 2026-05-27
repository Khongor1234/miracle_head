import './LandingPage.css';

const CHARACTERS = [
  {
    id: 'joy',
    name: 'ヨロコビ',
    en: 'Joy',
    role: '希望と前進',
    description: 'あなたの状況から希望を見つけ出します。空虚な楽観論ではなく、小さな前進と可能性を照らします。',
    img: '/characters/joy.png',
  },
  {
    id: 'sadness',
    name: 'カナシミ',
    en: 'Sadness',
    role: '悲しみと意味',
    description: '傷つくことをそのまま受け止めます。感情を言語化し、それが裏側から支配するのを止めます。',
    img: '/characters/sadness.png',
  },
  {
    id: 'anger',
    name: 'イカリ',
    en: 'Anger',
    role: '境界線と正義',
    description: '苛立ちを明確さに変えます。戦う価値があるものと、手放すべきものを見極めます。',
    img: '/characters/anger.png',
  },
  {
    id: 'fear',
    name: 'ビビリ',
    en: 'Fear',
    role: 'リスクと安全',
    description: '本当の脅威と不安のノイズを仕分けます。恐れをチェックリストと行動計画に変換します。',
    img: '/characters/fear.png',
  },
  {
    id: 'disgust',
    name: 'ムカムカ',
    en: 'Disgust',
    role: '基準と尊厳',
    description: '自己尊重を守ります。何かが間違っていると、まだ言葉にできない前から気づかせます。',
    img: '/characters/disgust.png',
  },
];

const STEPS = [
  {
    number: '01',
    title: '悩みを打ち明ける',
    body: '何でも書いてください — 迷っている決断、うまく言葉にできない感情、どこかおかしいと感じる状況。',
  },
  {
    number: '02',
    title: '5つの視点、同時に',
    body: '各感情が独立して回答を起草します。集団思考なし。一つの視点が他を圧倒することもありません。',
  },
  {
    number: '03',
    title: 'ピアレビューが最善の回答を選ぶ',
    body: 'チームが各候補を採点します。真のコンセンサスを獲得した回答があなたに届きます。',
  },
];

export default function LandingPage({ onEnter }) {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <span className="landing-logo">Miracle Head</span>
        <button className="landing-nav-cta" onClick={onEnter} type="button">
          アプリを開く
        </button>
      </nav>

      <section className="landing-hero">
        <p className="landing-chip">AI感情カウンセリング</p>
        <h1 className="landing-headline">
          すべての感情が、<br />
          <em>今ここに。</em>
        </h1>
        <p className="landing-sub">
          ほとんどのアドバイスは、一つの視点から来ます。Miracle Headは、あなたの状況を
          ヨロコビ・カナシミ・イカリ・ビビリ・ムカムカという5つの感情知性に通し、
          チームの信頼を勝ち取った回答を届けます。
        </p>
        <button className="landing-cta" onClick={onEnter} type="button">
          相談をはじめる
          <span className="landing-cta-arrow">→</span>
        </button>
      </section>

      <section className="landing-characters">
        <header className="landing-section-header">
          <h2>あなたのカウンセリングチーム</h2>
          <p>ピクサー映画『インサイド・ヘッド』より着想 — 5つの感情レンズ、ひとつの統合された回答。</p>
        </header>
        <div className="landing-character-grid">
          {CHARACTERS.map((c) => (
            <div key={c.id} className={`character-card character-${c.id}`}>
              <div className="character-avatar">
                <img
                  src={c.img}
                  alt={`${c.name} (${c.en})`}
                  className="character-img"
                />
              </div>
              <div className="character-names">
                <span className="character-jp-name">{c.name}</span>
                <span className="character-en-name">{c.en}</span>
              </div>
              <p className="character-role">{c.role}</p>
              <p className="character-desc">{c.description}</p>
            </div>
          ))}
        </div>
        <p className="carousel-hint">
          <span className="carousel-hint-arrow">→</span>
          スワイプして全員を見る
        </p>
      </section>

      <section className="landing-how">
        <header className="landing-section-header">
          <h2>使い方</h2>
        </header>
        <div className="landing-steps">
          {STEPS.map((step) => (
            <div key={step.number} className="landing-step">
              <span className="step-number">{step.number}</span>
              <h3 className="step-title">{step.title}</h3>
              <p className="step-body">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-footer-cta">
        <h2>心の声を、クリアに聞く準備はできていますか？</h2>
        <button className="landing-cta" onClick={onEnter} type="button">
          Miracle Headを開く
          <span className="landing-cta-arrow">→</span>
        </button>
      </section>

      <footer className="landing-footer">
        <span>Miracle Head · AI感情カウンセリング</span>
        <span>ピクサー映画『インサイド・ヘッド』より着想</span>
      </footer>
    </div>
  );
}
