import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './DebateView.css';

export default function DebateView({ debate, loadingTurn }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [debate?.turns?.length, loadingTurn]);

  if (!debate) return null;

  const { config, turns = [], status } = debate;
  const {
    model1_name,
    model2_name,
    topic,
    pov1,
    pov2,
    max_turns,
  } = config;

  return (
    <div className="debate-view">
      <div className="debate-header">
        <div className="debate-topic">{topic}</div>
        <div className="debate-sides">
          <div className="side side-left">
            <span className="side-name">{model1_name}</span>
            <span className="side-pov">{pov1}</span>
          </div>
          <div className="side-vs">vs</div>
          <div className="side side-right">
            <span className="side-name">{model2_name}</span>
            <span className="side-pov">{pov2}</span>
          </div>
        </div>
      </div>

      <div className="turns-container">
        {turns.length === 0 && status === 'in_progress' && (
          <div className="debate-waiting">Debate starting...</div>
        )}

        {turns.map((turn) => (
          <div
            key={turn.turn_number}
            className={`turn-bubble ${turn.speaker === 'model1' ? 'turn-left' : 'turn-right'}`}
          >
            <div className="turn-label">
              {turn.speaker_name} <span className="turn-number">Turn {turn.turn_number}</span>
            </div>
            <div className="turn-content markdown-content">
              <ReactMarkdown>{turn.content}</ReactMarkdown>
            </div>
          </div>
        ))}

        {loadingTurn && (
          <div className={`turn-bubble ${loadingTurn.speaker === 'model1' ? 'turn-left' : 'turn-right'} turn-loading`}>
            <div className="turn-label">
              {loadingTurn.speaker_name} <span className="turn-number">Turn {loadingTurn.turn_number}</span>
            </div>
            <div className="loading-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}

        {status === 'completed' && turns.length > 0 && (
          <div className="debate-done">Debate complete — {turns.length} of {max_turns} turns</div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
