import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../api';
import JudgeReport from './JudgeReport';
import './DebateView.css';

export default function DebateView({ debate, loadingTurn }) {
  const bottomRef = useRef(null);
  const [judgeResult, setJudgeResult] = useState(debate.judge_result || null);
  const [judgingLoading, setJudgingLoading] = useState(false);
  const [judgeError, setJudgeError] = useState(null);

  // Sync judge state when switching debates
  useEffect(() => {
    setJudgeResult(debate.judge_result || null);
    setJudgeError(null);
  }, [debate.id]);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [debate?.turns?.length, loadingTurn, judgeResult]);

  const handleRequestJudgment = async () => {
    setJudgingLoading(true);
    setJudgeError(null);
    try {
      const result = await api.judgeDebate(debate.id);
      setJudgeResult(result);
    } catch (e) {
      setJudgeError(e.message || 'Failed to run judge.');
    } finally {
      setJudgingLoading(false);
    }
  };

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

        {status === 'completed' && config.judge_model && (
          <div className="judge-section">
            {!judgeResult && !judgingLoading && (
              <button className="judge-btn" onClick={handleRequestJudgment}>
                Request Judgment
              </button>
            )}
            {judgingLoading && (
              <div className="judge-loading">
                <div className="loading-dots">
                  <span /><span /><span />
                </div>
                <span>Judge is deliberating...</span>
              </div>
            )}
            {judgeError && (
              <div className="judge-error">
                {judgeError}
                <button className="judge-retry-btn" onClick={handleRequestJudgment}>
                  Retry
                </button>
              </div>
            )}
            {judgeResult && <JudgeReport result={judgeResult} />}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
