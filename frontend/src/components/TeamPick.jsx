import { AGENT_ORDER } from '../agentAssets';

const scoreOf = (row) => Number(row?.average_weighted_total ?? row?.weighted_total ?? row?.average_total ?? row?.total ?? 0);
const formatScore = (value) => (Number.isFinite(value) ? value.toFixed(1) : '—');

// Under a counselor reply: which agent the team picked, with a mini bar per
// agent's score. Clicking opens the full review panel.
export default function TeamPick({ round, label, onOpen }) {
  const totals = round?.totals || [];
  if (!totals.length) return null;
  const maxScore = Math.max(...totals.map(scoreOf), 1);
  const winner = round.winner?.character;

  return (
    <button type="button" className="team-pick" onClick={onOpen}>
      <span className="team-pick-bars" aria-hidden="true">
        {AGENT_ORDER.map((character) => {
          const row = totals.find((item) => item.character === character);
          const height = row ? Math.max(18, (scoreOf(row) / maxScore) * 100) : 18;
          return (
            <span
              key={character}
              className={`team-pick-bar agent-${character.toLowerCase()}${character === winner ? ' is-winner' : ''}`}
              style={{ '--bar-height': `${height}%` }}
            />
          );
        })}
      </span>
      <span className="team-pick-label">{label}</span>
      <span className="team-pick-score">{formatScore(scoreOf(round.winner))}</span>
    </button>
  );
}
