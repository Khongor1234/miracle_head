import LoopVideo from './LoopVideo';
import { AGENT_ORDER, agentAvatar, agentFrame, agentLoop } from '../agentAssets';
import { usePrefersReducedMotion } from '../hooks/useMotion';

// Share of the bar each phase fills, so the bar keeps moving forward.
const PROGRESS = { starting: 0.08, drafting: 0.15, reviewing: 0.75, finishing: 0.95 };
const DRAFTING_SPAN = 0.55;

function thinkingPhase({ draftedCount, agentCount, hasWinner }) {
  if (hasWinner) return 'finishing';
  if (agentCount > 0 && draftedCount >= agentCount) return 'reviewing';
  if (draftedCount > 0) return 'drafting';
  return 'starting';
}

function progressFor(phase, draftedCount, agentCount) {
  if (phase !== 'drafting' || !agentCount) return PROGRESS[phase];
  return PROGRESS.drafting + DRAFTING_SPAN * (draftedCount / agentCount);
}

// Shown in the chat while the five agents work on a reply.
export default function ThinkingIndicator({ labels, draftedCharacters, agentCount, hasWinner }) {
  const isReducedMotion = usePrefersReducedMotion();
  const draftedCount = draftedCharacters.length;
  const phase = thinkingPhase({ draftedCount, agentCount, hasWinner });
  const progress = progressFor(phase, draftedCount, agentCount);
  const label = phase === 'drafting'
    ? labels.drafting.replace('{done}', draftedCount).replace('{total}', agentCount)
    : labels[phase];

  return (
    <div className={`thinking-card phase-${phase}`} role="status" aria-live="polite">
      <div className="thinking-team" aria-hidden="true">
        {AGENT_ORDER.map((character, index) => {
          const isDone = draftedCharacters.includes(character);
          return (
            <span
              key={character}
              className={`thinking-face${isDone ? ' is-done' : ''}`}
              style={{ '--wave-delay': `${index * 0.14}s` }}
            >
              {isDone
                ? <img src={agentAvatar(character)} alt="" />
                : (
                  <LoopVideo
                    className="thinking-video"
                    src={agentLoop(character)}
                    poster={agentFrame(character)}
                    isActive
                    isReducedMotion={isReducedMotion}
                  />
                )}
              {isDone && <b className="thinking-check">✓</b>}
            </span>
          );
        })}
      </div>
      <p className="thinking-label" key={label}>{label}</p>
      <div className="thinking-bar">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
    </div>
  );
}
