import { useState } from 'react';
import { agentAvatar, agentIndex } from '../agentAssets';

const CLAMP_CHARACTERS = 160;

// The five agents of round 1. A finished agent's face opens what it said
// (its own draft) in a small card; nothing opens by itself.
export default function DraftStrip({ agents, candidates, isSending, characters, labels, formatText }) {
  const [openCharacter, setOpenCharacter] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const draftOf = (character) => candidates.find((candidate) => candidate.character === character);
  const nameOf = (character) => characters[agentIndex(character)]?.name || character;
  const open = openCharacter ? draftOf(openCharacter) : null;
  const text = open ? formatText(open.reply).trim() : '';
  const isLong = text.length > CLAMP_CHARACTERS;

  const toggle = (character) => {
    setIsExpanded(false);
    setOpenCharacter((current) => (current === character ? null : character));
  };

  return (
    <>
      <div className="panel-agent-strip">
        {agents.map((agent) => {
          const isDone = Boolean(draftOf(agent.character));
          const isOpen = openCharacter === agent.character;
          return (
            <button
              type="button"
              key={agent.character}
              className={`panel-strip-agent agent-${agent.character.toLowerCase()}${isOpen ? ' is-open' : ''}`}
              disabled={!isDone}
              aria-pressed={isOpen}
              aria-label={isDone ? labels.open.replace('{name}', nameOf(agent.character)) : nameOf(agent.character)}
              onClick={() => toggle(agent.character)}
            >
              <img src={agentAvatar(agent.character)} alt="" className="panel-agent-av" />
              {isDone
                ? <span className="panel-strip-check">✓</span>
                : isSending
                  ? <span className="panel-strip-dots"><b /><b /><b /></span>
                  : null}
            </button>
          );
        })}
      </div>

      {open ? (
        <div className={`draft-card agent-${open.character.toLowerCase()}`} key={open.character}>
          <div className="draft-card-head">
            <img src={agentAvatar(open.character)} alt="" />
            <strong>{nameOf(open.character)}</strong>
            <span>{labels.said}</span>
            <button type="button" className="draft-card-close" onClick={() => setOpenCharacter(null)} aria-label={labels.close}>×</button>
          </div>
          <p className={`draft-card-text${isLong && !isExpanded ? ' is-clamped' : ''}`}>{text}</p>
          {isLong && (
            <button type="button" className="draft-card-more" aria-expanded={isExpanded} onClick={() => setIsExpanded((value) => !value)}>
              {isExpanded ? labels.less : labels.more}
            </button>
          )}
        </div>
      ) : (
        candidates.length > 0 && <p className="draft-hint">{labels.hint}</p>
      )}
    </>
  );
}
