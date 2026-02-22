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
  const { model1_name, model2_name, topic, pov1, pov2, max_turns } = config;

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
          <div className="debate-waiting">Debate is starting...</div>
        )}

        {turns.map((turn) => (
          <div
            key={turn.turn_number}
            className={`turn-card ${turn.speaker === 'model1' ? 'turn-card-a' : 'turn-card-b'}`}
          >
            <div className="turn-card-inner">
              <div className="turn-header">
                <span className="turn-speaker">{turn.speaker_name}</span>
                <span className="turn-number-badge">Turn {turn.turn_number}</span>
              </div>
              <div className="turn-content markdown-content">
                <ReactMarkdown>{turn.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}

        {loadingTurn && (
          <div className={`turn-card turn-loading ${loadingTurn.speaker === 'model1' ? 'turn-card-a' : 'turn-card-b'}`}>
            <div className="turn-card-inner">
              <div className="turn-header">
                <span className="turn-speaker">{loadingTurn.speaker_name}</span>
                <span className="turn-number-badge">Turn {loadingTurn.turn_number}</span>
              </div>
              <div className="loading-dots">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        {status === 'completed' && turns.length > 0 && (
          <div className="debate-done">
            Debate complete &mdash; {turns.length} of {max_turns} turns
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
