import { useEffect, useState } from 'react';
import { agentAvatar, agentIndex } from '../agentAssets';
import { usePrefersReducedMotion } from '../hooks/useMotion';

const ADVANCE_MS = 4500;
// While reviews stream in, step through each new one quickly, never skipping.
const CATCH_UP_MS = 1200;

// Every peer review as one list: who scored whom, the score and the reason.
function flattenReviews(peerScores = []) {
  return peerScores.flatMap((judgeResult) => (judgeResult.scores || []).map((row) => ({
    judge: row.judge || judgeResult.judge,
    character: row.character,
    score: Number(row.weighted_total ?? row.total ?? 0),
    note: judgeResult.fallback ? '' : String(row.note || '').trim(),
  })));
}

// Shows the peer reviews one at a time. While a reply is being made it
// walks through each new review as it arrives; afterwards it moves on by
// itself (pausable). The parent remounts it per round, so it starts at 1.
export default function ReviewSpotlight({ peerScores, characters, labels, isLive }) {
  const reviews = flattenReviews(peerScores);
  const isReducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [isFollowing, setIsFollowing] = useState(true);
  const [isPausedByUser, setIsPausedByUser] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const total = reviews.length;
  const current = Math.min(index, total - 1);
  const isPlaying = !isLive && total > 1 && !isPausedByUser && !isHovered && !isReducedMotion;
  const isCatchingUp = isLive && isFollowing && current < total - 1;

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % total), ADVANCE_MS);
    return () => clearInterval(timer);
  }, [isPlaying, total]);

  // One step per timeout, restarted only when the shown review changes, so
  // new reviews arriving faster than CATCH_UP_MS cannot keep resetting it.
  useEffect(() => {
    if (!isCatchingUp) return undefined;
    const timer = setTimeout(() => setIndex(current + 1), CATCH_UP_MS);
    return () => clearTimeout(timer);
  }, [isCatchingUp, current]);

  if (!total) return null;

  const review = reviews[current];
  const nameOf = (character) => characters[agentIndex(character)]?.name || character;
  const go = (step) => {
    setIsFollowing(false);
    setIndex((current + step + total) % total);
  };

  return (
    <section
      className={`review-spot${isPlaying ? ' is-playing' : ''}`}
      aria-roledescription="carousel"
      aria-label={labels.title}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      <header className="review-spot-head">
        <span>{isLive ? labels.liveTitle : labels.title}</span>
        <span className="review-spot-count">{current + 1} / {total}</span>
      </header>

      <div className="review-spot-card" key={`${review.judge}-${review.character}-${current}`} aria-live="polite">
        <div className="review-spot-who">
          <span className={`review-spot-agent agent-${review.judge.toLowerCase()}`}>
            <img src={agentAvatar(review.judge)} alt="" />
            {nameOf(review.judge)}
          </span>
          <span className="review-spot-arrow" aria-hidden="true">→</span>
          <span className={`review-spot-agent agent-${review.character.toLowerCase()}`}>
            <img src={agentAvatar(review.character)} alt="" />
            {nameOf(review.character)}
          </span>
          <strong className="review-spot-score">{review.score.toFixed(1)}</strong>
        </div>
        <p className="review-spot-note">{review.note || labels.noNote}</p>
      </div>

      <div className="review-spot-controls">
        <button type="button" className="review-spot-btn" onClick={() => go(-1)} aria-label={labels.previous}>‹</button>
        <span className="review-spot-progress" aria-hidden="true">
          <span key={current} style={{ '--advance-ms': `${ADVANCE_MS}ms` }} />
        </span>
        {!isLive && total > 1 && (
          <button
            type="button"
            className="review-spot-btn"
            onClick={() => setIsPausedByUser((paused) => !paused)}
            aria-label={isPausedByUser ? labels.play : labels.pause}
            aria-pressed={isPausedByUser}
          >
            {isPausedByUser ? '▶' : '❚❚'}
          </button>
        )}
        <button type="button" className="review-spot-btn" onClick={() => go(1)} aria-label={labels.next}>›</button>
      </div>
    </section>
  );
}
