import { useState } from 'react';
import LoopVideo from './LoopVideo';
import { AGENT_ORDER, agentFrame, agentLoop } from '../agentAssets';

// How high each member stands (px), so the five form a gentle arc.
const ARC_LIFT = [0, 12, 20, 12, 0];

// The empty chat: the five agents stand in an arc and come alive on hover or
// focus; clicking one shows what that agent listens for.
export default function CouncilWelcome({ labels, characters, suggestions, disabled, isReducedMotion, onPickSuggestion }) {
  const [activeCharacter, setActiveCharacter] = useState(null);
  const [selectedCharacter, setSelectedCharacter] = useState('Joy');
  const selected = characters[AGENT_ORDER.indexOf(selectedCharacter)];

  return (
    <div className="council">
      <p className="council-eyebrow">{labels.eyebrow}</p>
      <div className="council-arc" role="list">
        {AGENT_ORDER.map((character, index) => {
          const info = characters[index];
          const isActive = activeCharacter === character;
          const isSelected = selectedCharacter === character;
          return (
            <button
              key={character}
              type="button"
              role="listitem"
              className={`council-member agent-${character.toLowerCase()}${isSelected ? ' is-selected' : ''}`}
              style={{ '--arc-index': index, '--lift': `${ARC_LIFT[index]}px` }}
              aria-pressed={isSelected}
              aria-label={`${info?.name} — ${info?.role}`}
              onMouseEnter={() => setActiveCharacter(character)}
              onMouseLeave={() => setActiveCharacter(null)}
              onFocus={() => setActiveCharacter(character)}
              onBlur={() => setActiveCharacter(null)}
              onClick={() => setSelectedCharacter(character)}
            >
              <span className="council-portrait">
                <LoopVideo
                  className="council-video"
                  src={agentLoop(character)}
                  poster={agentFrame(character)}
                  isActive={isActive || isSelected}
                  isReducedMotion={isReducedMotion}
                  label={info?.name}
                />
              </span>
              <span className="council-name">{info?.name}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className={`council-spotlight agent-${selectedCharacter.toLowerCase()}`} key={selectedCharacter}>
          <span className="council-role">{selected.role}</span>
          <p>{selected.description}</p>
        </div>
      )}

      <h2 className="council-greeting">{labels.greeting}</h2>

      {suggestions?.length > 0 && (
        <div className="council-suggestions">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              className="council-suggestion"
              type="button"
              disabled={disabled}
              onClick={() => onPickSuggestion(suggestion)}
            >
              <span>{suggestion}</span>
              <span className="council-suggestion-arrow" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
