import { useEffect, useRef, useState } from 'react';
import './CounselingChat.css';

const agentClass = (character) => `agent-${String(character || '').toLowerCase()}`;
const scoreValue = (item) => item?.weighted_total ?? item?.average_weighted_total ?? item?.total ?? item?.average_total ?? 0;
const discussionItems = (round) => (round.discussion || []).filter((item) => item.type === 'candidate');
const formatScore = (value) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return number.toFixed(2).replace(/\.00$/, '');
};

export default function CounselingChat({
  conversation,
  model,
  agents,
  defaultAgents,
  reviewRounds,
  onModelChange,
  onAgentsChange,
  onSendMessage,
  sending,
  liveRound,
  error,
}) {
  const [draft, setDraft] = useState('');
  const [reviewOpen, setReviewOpen] = useState(true);
  const [personaOpen, setPersonaOpen] = useState(false);
  const bottomRef = useRef(null);

  const messages = conversation?.messages ?? [];
  const rounds = conversation?.agent_rounds ?? [];
  const activeAgents = agents?.length ? agents : defaultAgents;
  const personasLocked = sending;
  const hasPersonaConfig = activeAgents.length > 0;
  const personaError = !personasLocked && hasPersonaConfig && (
    activeAgents.length !== 5 || activeAgents.some((agent) => !agent.persona?.trim())
  );
  const latestSavedRound = rounds.length ? rounds[rounds.length - 1] : null;
  const reviewRound = liveRound || latestSavedRound;
  const isLiveReview = Boolean(liveRound && sending);
  const displayRounds = reviewRound
    ? (
      (reviewRound.rounds || []).length
        ? reviewRound.rounds
        : [{
          round_number: 1,
          candidates: reviewRound.candidates || [],
          peer_scores: reviewRound.peer_scores || [],
          totals: reviewRound.totals || [],
          discussion: reviewRound.discussion || [],
          winner: reviewRound.winner || null,
        }]
    )
    : [];
  const finalWinnerReady = Boolean(
    reviewRound?.winner
    && (!isLiveReview || displayRounds.length >= (reviewRound.review_rounds || reviewRounds || 1)),
  );
  const finalTotals = reviewRound?.totals?.length
    ? reviewRound.totals
    : (displayRounds[displayRounds.length - 1]?.totals || []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const submit = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending || personaError) return;
    setReviewOpen(true);
    setPersonaOpen(false);
    setDraft('');
    await onSendMessage(text);
  };

  const updatePersona = (character, persona) => {
    onAgentsChange(
      activeAgents.map((agent) => (
        agent.character === character ? { ...agent, persona } : agent
      )),
    );
  };

  const resetPersonas = () => {
    onAgentsChange(defaultAgents.map((agent) => ({ ...agent })));
  };

  const openPersonas = () => {
    setPersonaOpen(true);
    setReviewOpen(false);
  };

  const openReview = () => {
    setReviewOpen(true);
    setPersonaOpen(false);
  };

  return (
    <div className="counseling-shell">
      <section className="chat-pane">
        <header className="chat-header">
          <div>
            <h1>Role-Playing Counseling Dialogue</h1>
            <p>Client messages are reviewed by five internal counselor agents before one response is shown.</p>
          </div>
          <div className="model-control">
            <label htmlFor="model">LLM model</label>
            <input
              id="model"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
            />
          </div>
        </header>

        <div className="message-list">
          {messages.length === 0 && (
            <div className="empty-chat">
              <span>Counselor</span>
              <p>こんにちは。今ここで話したいことを、そのまま書いてください。</p>
            </div>
          )}

          {messages.map((message) => (
            <div className={`message-row ${message.role}`} key={message.id}>
              <div className="avatar">{message.role === 'client' ? 'Client' : 'Counselor'}</div>
              <div className="bubble">
                {message.source_agent && (
                  <div className={`source-agent ${agentClass(message.source_agent)}`}>
                    selected by {message.source_agent}
                  </div>
                )}
                {message.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="message-row counselor">
              <div className="avatar">Counselor</div>
              <div className="bubble pending">
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <div className="chat-error">{error}</div>}

        <form className="message-form" onSubmit={submit}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="相談内容を入力してください..."
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
          />
          <button type="submit" disabled={sending || !draft.trim() || personaError}>
            {sending ? 'Thinking...' : 'Send'}
          </button>
        </form>
      </section>

      <button
        className={`persona-handle ${personaOpen ? 'open' : ''} ${reviewOpen ? 'drawer-open' : ''} ${personaError ? 'needs-attention' : ''}`}
        onClick={openPersonas}
        type="button"
      >
        Agent Personas
      </button>

      <button
        className={`review-handle ${reviewOpen ? 'open' : ''} ${personaOpen ? 'drawer-open' : ''}`}
        onClick={openReview}
        type="button"
      >
        5 Agent Review
      </button>

      <aside className={`persona-drawer ${personaOpen ? 'open' : 'closed'}`}>
        <div className="review-head">
          <div>
            <span>Persona Settings</span>
            <strong>Agent Personas</strong>
          </div>
          <button onClick={() => setPersonaOpen(false)} type="button">Close</button>
        </div>

        {personaOpen && (
          <div className="review-content">
            <section className={`persona-editor ${personasLocked ? 'locked' : ''}`}>
              <div className="persona-editor-head">
                <div>
                  <span>Editing Status</span>
                  <strong>{personasLocked ? 'Locked while sending' : 'Editable'}</strong>
                </div>
                <button type="button" onClick={resetPersonas} disabled={personasLocked || !defaultAgents.length}>
                  Reset
                </button>
              </div>

              <div className="persona-grid">
                {activeAgents.map((agent) => (
                  <label className={`persona-card ${agentClass(agent.character)}`} key={agent.character}>
                    <span>{agent.character}</span>
                    <textarea
                      value={agent.persona}
                      onChange={(event) => updatePersona(agent.character, event.target.value)}
                      disabled={personasLocked}
                      rows={5}
                    />
                  </label>
                ))}
              </div>

              {personaError && (
                <div className="persona-error">All five agent personas are required before starting the session.</div>
              )}

              <div className="round-control">
                <div>
                  <span>Review rounds</span>
                  <strong>Fixed 2-round reflection</strong>
                </div>
                <div className="round-options fixed" aria-label="Review rounds">
                  <span>2 rounds</span>
                </div>
              </div>
            </section>
          </div>
        )}
      </aside>

      <aside className={`agent-review ${reviewOpen ? 'open' : 'closed'}`}>
        <div className="review-head">
          <div>
            <span>{isLiveReview ? 'Live Discussion' : 'Latest Saved Discussion'}</span>
            <strong>5 Agent Review</strong>
          </div>
          <button onClick={() => setReviewOpen(false)} type="button">Close</button>
        </div>

        {reviewOpen && (
          <div className="review-content">
            {sending && (
              <div className="discussion-live">
                <div className="live-title">Agents are discussing...</div>
                {activeAgents.map((agent) => (
                  <div className={`live-agent ${agentClass(agent.character)}`} key={agent.character}>
                    <span>{agent.character}</span>
                    <b /><b /><b />
                  </div>
                ))}
              </div>
            )}

            {!reviewRound ? (
              <div className="review-empty">The internal agent discussion will appear here after the first client message.</div>
            ) : (
              <>
                {reviewRound.high_risk && (
                  <div className="risk-badge">Self-harm safety path triggered</div>
                )}

                {displayRounds.map((round) => (
                  <div className="round-section" key={round.round_number}>
                    <div className="round-head">
                      <strong>Round {round.round_number}</strong>
                      <span>{round.round_number > 1 ? 'Revised after seeing other agents' : 'Initial agent replies'}</span>
                    </div>

                    <div className="discussion-section">
                      <div className="section-label">{isLiveReview ? 'Live Discussion' : 'Internal Discussion'}</div>
                      {discussionItems(round).length === 0 && (
                        <div className="review-empty compact">Waiting for the first agent reply...</div>
                      )}
                      {discussionItems(round).map((item, index) => (
                        <div
                          className={`discussion-item ${agentClass(item.character)} discussion-${item.type}`}
                          key={`${round.round_number}-${item.character}-${item.type}-${index}`}
                        >
                          <div className="discussion-meta">
                            <strong>{item.character}</strong>
                            <span>{item.title}</span>
                          </div>
                          <p>{item.content}</p>
                        </div>
                      ))}
                    </div>

                    <div className="candidate-list">
                      <div className="section-label">Candidate Replies</div>
                      {(round.candidates || []).map((candidate) => (
                        <div className={`candidate-card ${agentClass(candidate.character)}`} key={`${round.round_number}-${candidate.character}`}>
		                          <div className="candidate-head">
		                            <strong>{candidate.character}</strong>
		                          </div>
		                          <p>{candidate.reply}</p>
                        </div>
                      ))}
	                    </div>

                    {(round.peer_scores || []).length > 0 && (
                      <div className="peer-section">
                        <div className="section-label">Peer Scores</div>
                        {(round.peer_scores || []).map((judgeResult) => (
                          <div className={`peer-card ${agentClass(judgeResult.judge)}`} key={`${round.round_number}-${judgeResult.judge}`}>
                            <div className="peer-head">
                              <strong>{judgeResult.judge}</strong>
                              <span>scored other agents</span>
                            </div>
                            <div className="peer-score-list">
                              {(judgeResult.scores || []).map((score) => (
                                <div key={`${judgeResult.judge}-${score.character}`}>
                                  <span>{score.character}</span>
                                  <b>{formatScore(scoreValue(score))}</b>
                                  <small>weighted</small>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
	                  </div>
	                ))}
                {finalWinnerReady && (
                  <div className="final-result">
                    <div className="section-label">Final Result</div>
                    <div className="winner-card">
                      <span>Winner</span>
                      <strong>{reviewRound.winner.character}</strong>
                      <small>{formatScore(scoreValue(reviewRound.winner))} weighted score</small>
                      <p>{reviewRound.winner.reply}</p>
                    </div>
                    {(finalTotals || []).length > 0 && (
                      <div className="final-ranking">
                        {finalTotals.map((candidate, index) => (
                          <div className={`ranking-row ${agentClass(candidate.character)}`} key={`final-${candidate.character}`}>
                            <span>#{index + 1}</span>
                            <strong>{candidate.character}</strong>
                            <b>{formatScore(scoreValue(candidate))}</b>
                            <small>weighted avg from 4 peer agents</small>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
	              </>
	            )}
          </div>
        )}
      </aside>
    </div>
  );
}
