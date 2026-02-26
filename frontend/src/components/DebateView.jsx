import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import JudgeReport from './JudgeReport';
import './DebateView.css';

export default function DebateView({ debate, loadingTurn }) {
  const bottomRef = useRef(null);

  const config = debate?.config ?? {};
  const turns = debate?.turns ?? [];
  const status = debate?.status;
  const judge_result = debate?.judge_result;
  const { model1_name, model2_name, topic, pov1, pov2, max_turns } = config;

  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const lastContentLen = lastTurn ? lastTurn.content?.length : 0;

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turns.length, lastContentLen, loadingTurn, judge_result]);

  if (!debate) return null;

  // Check if a turn is currently being streamed (match on msg_index or turn_number)
  const isStreaming = (turn) =>
    loadingTurn && (loadingTurn.msg_index || loadingTurn.turn_number) === (turn.msg_index || turn.turn_number);

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
          <div className="debate-waiting">
            <div className="debate-starting-spinner" />
            <span>Debate is starting...</span>
          </div>
        )}

        {turns.map((turn) => {
          const isA = turn.speaker === 'model1';
          const streaming = isStreaming(turn);
          return (
            <div
              key={turn.msg_index || turn.turn_number}
              className={`turn-card ${isA ? 'turn-card-a' : 'turn-card-b'}`}
            >
              <div className="turn-card-inner">
                <div className="turn-header">
                  <span className="turn-speaker">{turn.speaker_name}</span>
                  <div className="turn-header-right">
                    <span className={`turn-stance-tag ${isA ? 'turn-stance-for' : 'turn-stance-against'}`}>
                      {isA ? 'For' : 'Against'}
                    </span>
                    <span className="turn-number-badge">Turn {turn.turn_number}{turn.msg_index ? ` (${turn.msg_index}/${max_turns * 2})` : ''}</span>
                  </div>
                </div>
                {turn.content ? (
                  streaming ? (
                    // During streaming, render as plain text to avoid
                    // ReactMarkdown re-parsing the entire string on every
                    // token flush, which blocks the main thread and
                    // prevents the browser from painting intermediate states.
                    <div className="turn-content markdown-content streaming-text">
                      {turn.content}
                      <span className="typing-cursor" />
                    </div>
                  ) : (
                    <div className="turn-content markdown-content">
                      <ReactMarkdown>{turn.content}</ReactMarkdown>
                    </div>
                  )
                ) : streaming ? (
                  <div className="loading-dots">
                    <span /><span /><span />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {status === 'completed' && turns.length > 0 && (
          <div className="debate-done">
            Debate complete &mdash; {turns.length} messages across {Math.max(...turns.map((t) => t.turn_number))} turn{Math.max(...turns.map((t) => t.turn_number)) !== 1 ? 's' : ''}
          </div>
        )}

        {status === 'completed' && config.judge_model && (
          <div className="judge-section">
            {!judge_result && (
              <div className="judge-loading">
                <div className="loading-dots">
                  <span /><span /><span />
                </div>
                <span>Judge is deliberating...</span>
              </div>
            )}
            {judge_result && <JudgeReport result={judge_result} />}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
