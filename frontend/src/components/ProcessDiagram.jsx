import { AGENT_ORDER, agentAvatar } from '../agentAssets';

// The idle right panel: how a reply is made, drawn as three steps with a
// pulse running down the line between them.
export default function ProcessDiagram({ labels }) {
  return (
    <div className="process">
      <p className="process-title">{labels.title}</p>
      <ol className="process-steps">
        <li className="process-step" style={{ '--step': 0 }}>
          <span className="process-visual process-faces" aria-hidden="true">
            {AGENT_ORDER.map((character, index) => (
              <img key={character} src={agentAvatar(character)} alt="" style={{ '--face': index }} />
            ))}
          </span>
          <span className="process-text">
            <strong>{labels.steps[0].title}</strong>
            <span>{labels.steps[0].body}</span>
          </span>
        </li>
        <li className="process-step" style={{ '--step': 1 }}>
          <span className="process-visual process-bars" aria-hidden="true">
            {AGENT_ORDER.map((character, index) => (
              <i key={character} className={`agent-${character.toLowerCase()}`} style={{ '--bar': index }} />
            ))}
          </span>
          <span className="process-text">
            <strong>{labels.steps[1].title}</strong>
            <span>{labels.steps[1].body}</span>
          </span>
        </li>
        <li className="process-step" style={{ '--step': 2 }}>
          <span className="process-visual process-reply" aria-hidden="true">
            <img src={agentAvatar('Sadness')} alt="" />
            <i />
          </span>
          <span className="process-text">
            <strong>{labels.steps[2].title}</strong>
            <span>{labels.steps[2].body}</span>
          </span>
        </li>
      </ol>
      <p className="process-hint">{labels.hint}</p>
    </div>
  );
}
