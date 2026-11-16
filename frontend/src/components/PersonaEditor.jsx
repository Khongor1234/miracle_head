import { useId, useState } from 'react';
import { agentAvatar, agentIndex } from '../agentAssets';

const MAX_PERSONA_LENGTH = 2000;

// Agent settings: a compact list of the five agents; each opens to edit its
// persona, shows when it differs from the default and can be restored alone.
export default function PersonaEditor({
  agents, defaultAgents, characters, labels, isLocked, hasError,
  onChange, onResetAll, onResetOne,
}) {
  const [openCharacter, setOpenCharacter] = useState(null);
  // The editor appears in the side panel and in the phone drawer: keep ids unique.
  const idPrefix = useId();
  const defaultPersona = (character) => defaultAgents.find((agent) => agent.character === character)?.persona ?? '';
  const isEdited = (agent) => defaultAgents.length > 0 && agent.persona !== defaultPersona(agent.character);
  const editedCount = agents.filter(isEdited).length;

  return (
    <section className={`persona-editor${isLocked ? ' locked' : ''}`}>
      <header className="persona-toolbar">
        <span className={`persona-status${isLocked ? ' is-locked' : ''}`}>
          <i aria-hidden="true" />
          {isLocked ? labels.locked : labels.editable}
        </span>
        {editedCount > 0 && (
          <span className="persona-edited-count">{labels.editedCount.replace('{n}', editedCount)}</span>
        )}
        <button
          type="button"
          className="persona-reset-all"
          onClick={onResetAll}
          disabled={isLocked || editedCount === 0}
        >
          {labels.resetAll}
        </button>
      </header>

      <p className="persona-intro">{labels.intro}</p>

      <ul className="persona-list">
        {agents.map((agent) => {
          const info = characters[agentIndex(agent.character)] || {};
          const isOpen = openCharacter === agent.character;
          const edited = isEdited(agent);
          const isEmpty = !agent.persona?.trim();
          const bodyId = `${idPrefix}-persona-${agent.character}`;
          return (
            <li
              key={agent.character}
              className={`persona-item agent-${agent.character.toLowerCase()}${isOpen ? ' is-open' : ''}${isEmpty ? ' is-empty' : ''}`}
            >
              <button
                type="button"
                className="persona-summary"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => setOpenCharacter(isOpen ? null : agent.character)}
              >
                <img src={agentAvatar(agent.character)} alt="" className="persona-face" />
                <span className="persona-who">
                  <strong>{info.name || agent.character}</strong>
                  <span>{info.role}</span>
                </span>
                {edited && <em className="persona-badge">{labels.edited}</em>}
                {isEmpty && <em className="persona-badge is-warning">{labels.empty}</em>}
                <span className="persona-chevron" aria-hidden="true" />
              </button>

              <div className="persona-body" id={bodyId} hidden={!isOpen}>
                <textarea
                  value={agent.persona}
                  onChange={(event) => onChange(agent.character, event.target.value)}
                  disabled={isLocked}
                  rows={9}
                  maxLength={MAX_PERSONA_LENGTH}
                  aria-label={labels.fieldLabel.replace('{name}', info.name || agent.character)}
                />
                <div className="persona-foot">
                  <span className="persona-count">
                    {agent.persona.length} / {MAX_PERSONA_LENGTH}
                  </span>
                  <button
                    type="button"
                    className="persona-reset-one"
                    onClick={() => onResetOne(agent.character)}
                    disabled={isLocked || !edited}
                  >
                    {labels.resetOne}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {hasError && <div className="persona-error" role="alert">{labels.error}</div>}

      <div className="persona-rounds">
        <span>{labels.roundsLabel}</span>
        <strong>{labels.roundsValue}</strong>
      </div>
    </section>
  );
}
