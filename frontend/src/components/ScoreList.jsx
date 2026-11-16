import { useId, useState } from 'react';
import { agentAvatar, agentIndex } from '../agentAssets';

const CLAMP_CHARACTERS = 160;

// What the other agents said about one agent's draft.
const reviewsOf = (character, peerScores = []) => peerScores.flatMap((judgeResult) => (judgeResult.scores || [])
  .filter((row) => row.character === character)
  .map((row) => ({
    judge: row.judge || judgeResult.judge,
    score: Number(row.weighted_total ?? row.total ?? 0),
    note: judgeResult.fallback ? '' : String(row.note || '').trim(),
  })));

// Round 2 scores. Pressing a row opens that agent's own draft and how the
// other four scored it, one row at a time.
export default function ScoreList({
  agents, candidates, peerScores, winnerCharacter, scoreOf, maxScore, characters, labels, formatText, formatScore,
  roundId, alternates = {}, canAskAlternate, onRequestAlternate,
}) {
  const [openCharacter, setOpenCharacter] = useState(null);
  const [isDraftExpanded, setIsDraftExpanded] = useState(false);
  const idPrefix = useId();
  const [loadingCharacter, setLoadingCharacter] = useState(null);
  const [failedCharacter, setFailedCharacter] = useState(null);

  const askAlternate = async (character) => {
    setLoadingCharacter(character);
    setFailedCharacter(null);
    try {
      await onRequestAlternate(roundId, character);
    } catch (err) {
      console.error('Alternate reply failed:', err);
      setFailedCharacter(character);
    } finally {
      setLoadingCharacter(null);
    }
  };
  const nameOf = (character) => characters[agentIndex(character)]?.name || character;

  const toggle = (character) => {
    setIsDraftExpanded(false);
    setOpenCharacter((current) => (current === character ? null : character));
  };

  return (
    <div className="panel-reflection-list">
      {agents.map((agent) => {
        const { character } = agent;
        const score = scoreOf(character);
        const pct = score != null ? Math.round((score / Math.max(maxScore, 0.01)) * 100) : 0;
        const isOpen = openCharacter === character;
        const draft = formatText(candidates.find((candidate) => candidate.character === character)?.reply ?? '').trim();
        const reviews = reviewsOf(character, peerScores);
        const canOpen = Boolean(draft || reviews.length);
        const isLong = draft.length > CLAMP_CHARACTERS;
        const detailsId = `${idPrefix}-score-${character}`;
        return (
          <div
            key={character}
            className={`panel-reflection-item agent-${character.toLowerCase()}${character === winnerCharacter ? ' win' : ''}${isOpen ? ' is-open' : ''}`}
          >
            <button
              type="button"
              className="panel-reflection-head score-row-button"
              disabled={!canOpen}
              aria-expanded={isOpen}
              aria-controls={detailsId}
              aria-label={labels.open.replace('{name}', nameOf(character))}
              onClick={() => toggle(character)}
            >
              <img src={agentAvatar(character)} alt="" className="panel-agent-av" />
              <span className="panel-agent-name">{nameOf(character)}</span>
              <span className="panel-score-bar">
                <span className="panel-score-fill" style={{ width: `${pct}%` }} />
              </span>
              <span className="panel-score-num">{score != null ? formatScore(score) : '—'}</span>
              {canOpen && <span className="score-row-chevron" aria-hidden="true" />}
            </button>

            {isOpen && (
              <div className="score-details" id={detailsId}>
                {draft && (
                  <>
                    <span className="score-details-label">{labels.said.replace('{name}', nameOf(character))}</span>
                    <p className={`score-details-draft${isLong && !isDraftExpanded ? ' is-clamped' : ''}`}>{draft}</p>
                    {isLong && (
                      <button type="button" className="draft-card-more" aria-expanded={isDraftExpanded} onClick={() => setIsDraftExpanded((value) => !value)}>
                        {isDraftExpanded ? labels.less : labels.more}
                      </button>
                    )}
                  </>
                )}
                {character !== winnerCharacter && (alternates[character] || canAskAlternate) && (
                  <div className="alt-reply">
                    <span className="score-details-label">{labels.altTitle.replace('{name}', nameOf(character))}</span>
                    {alternates[character] ? (
                      <p className="alt-reply-text">{formatText(alternates[character])}</p>
                    ) : (
                      <button
                        type="button"
                        className="alt-reply-button"
                        disabled={loadingCharacter === character}
                        onClick={() => askAlternate(character)}
                      >
                        {loadingCharacter === character
                          ? <><span className="alt-reply-dots" aria-hidden="true"><b /><b /><b /></span>{labels.altLoading.replace('{name}', nameOf(character))}</>
                          : labels.altButton.replace('{name}', nameOf(character))}
                      </button>
                    )}
                    {failedCharacter === character && <p className="alt-reply-error" role="alert">{labels.altError}</p>}
                  </div>
                )}
                {reviews.length > 0 && (
                  <>
                    <span className="score-details-label">{labels.scoredBy}</span>
                    <ul className="score-details-reviews">
                      {reviews.map((review) => (
                        <li key={review.judge} className={`agent-${review.judge.toLowerCase()}`}>
                          <img src={agentAvatar(review.judge)} alt="" />
                          <span className="score-details-judge">{nameOf(review.judge)}</span>
                          <b>{review.score.toFixed(1)}</b>
                          {review.note && <p>{review.note}</p>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
