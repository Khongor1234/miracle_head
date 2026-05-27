import { useEffect, useRef, useState } from 'react';
import './CounselingChat.css';

const CHARACTER_IMGS = {
  Joy:     '/characters/joy.png',
  Sadness: '/characters/sadness.png',
  Anger:   '/characters/anger.png',
  Fear:    '/characters/fear.png',
  Disgust: '/characters/disgust.png',
};

const agentClass = (character) => `agent-${String(character || '').toLowerCase()}`;
const scoreValue = (item) => item?.weighted_total ?? item?.average_weighted_total ?? item?.total ?? item?.average_total ?? 0;
const discussionItems = (round) => (round.discussion || []).filter((item) => item.type === 'candidate');
const formatScore = (value) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return number.toFixed(2).replace(/\.00$/, '');
};
const displayText = (value) => {
  const text = String(value ?? '');
  let current = text.trim();
  for (let index = 0; index < 4; index += 1) {
    if (!current) break;
    // Try standard JSON parse first
    try {
      const parsed = JSON.parse(current);
      if (typeof parsed === 'string') { current = parsed.trim(); continue; }
      if (parsed && typeof parsed === 'object' && typeof parsed.reply !== 'undefined') {
        current = String(parsed.reply).trim();
        continue;
      }
      break;
    } catch { /* fall through to sanitized parse */ }
    // Sanitize literal (unescaped) newlines inside string values and retry
    try {
      const sanitized = current.replace(/(?<!\\)\n/g, '\\n');
      const parsed = JSON.parse(sanitized);
      if (typeof parsed === 'string') { current = parsed.trim(); continue; }
      if (parsed && typeof parsed === 'object' && typeof parsed.reply !== 'undefined') {
        current = String(parsed.reply).trim();
        continue;
      }
    } catch { /* ignore */ }
    break;
  }
  // If still looks like raw JSON, extract with regex as last resort
  if (current.trimStart().startsWith('{')) {
    const match = current.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/s);
    if (match) {
      try { return JSON.parse(`"${match[1]}"`).trim(); } catch { return match[1].trim(); }
    }
    return text; // fallback to original if regex also fails
  }
  return current || text;
};

function CounselorAvatar({ sourceAgent }) {
  const imgSrc = CHARACTER_IMGS[sourceAgent];
  if (imgSrc) {
    return (
      <div className="avatar">
        <img src={imgSrc} alt={sourceAgent} />
      </div>
    );
  }
  return <div className="avatar-initials">相</div>;
}

function ClientAvatar() {
  return (
    <div className="avatar-initials">You</div>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

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
  const textareaRef = useRef(null);

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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(e);
    }
  };

  const updatePersona = (character, persona) => {
    onAgentsChange(
      activeAgents.map((agent) => (agent.character === character ? { ...agent, persona } : agent)),
    );
  };

  const resetPersonas = () => onAgentsChange(defaultAgents.map((agent) => ({ ...agent })));

  const openPersonas = () => { setPersonaOpen(true); setReviewOpen(false); };
  const openReview  = () => { setReviewOpen(true);  setPersonaOpen(false); };

  return (
    <div className="counseling-shell">
      <section className="chat-pane">

        {/* ── Header ── */}
        <header className="chat-header">
          <div className="chat-header-title">
            <h1>AIカウンセリング</h1>
            <p>5つの感情エージェントが内部で検討し、最善の回答を届けます</p>
          </div>
          <div className="model-control">
            <label htmlFor="model-input">モデル</label>
            <select
              id="model-input"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={sending}
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
              <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
              <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
              <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
            </select>
          </div>
        </header>

        {/* ── Messages ── */}
        <div className="message-list">
          {messages.length === 0 && (
            <div className="empty-chat">
              <div className="empty-chat-avatar">
                <img src="/characters/joy.png" alt="カウンセラー" />
              </div>
              <p className="empty-chat-label">カウンセラー</p>
              <p>こんにちは。今ここで話したいことを、そのまま書いてください。</p>
            </div>
          )}

          {messages.map((message) => (
            <div className={`message-row ${message.role}`} key={message.id}>
              {message.role === 'client'
                ? <ClientAvatar />
                : <CounselorAvatar sourceAgent={message.source_agent} />
              }
              <div className="bubble">
                {message.source_agent && message.role === 'counselor' && (
                  <div className={`source-agent ${agentClass(message.source_agent)}`}>
                    {message.source_agent} が選ばれました
                  </div>
                )}
                {displayText(message.content)}
              </div>
            </div>
          ))}

          {sending && (
            <div className="message-row counselor">
              <CounselorAvatar sourceAgent={null} />
              <div className="bubble pending">
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <div className="chat-error">{error}</div>}

        {/* ── Input ── */}
        <form className="message-form" onSubmit={submit}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="相談内容を入力してください..."
            rows={1}
            onKeyDown={handleKeyDown}
          />
          <button className="send-btn" type="submit" disabled={sending || !draft.trim() || personaError} aria-label="送信">
            <SendIcon />
          </button>
        </form>
      </section>

      {/* ── Floating buttons ── */}
      <button
        className={`persona-handle ${personaOpen ? 'open' : ''} ${reviewOpen ? 'drawer-open' : ''} ${personaError ? 'needs-attention' : ''}`}
        onClick={openPersonas}
        type="button"
      >
        {personaError ? '⚠ ' : ''}エージェント設定
      </button>

      <button
        className={`review-handle ${reviewOpen ? 'open' : ''} ${personaOpen ? 'drawer-open' : ''}`}
        onClick={openReview}
        type="button"
      >
        5エージェントレビュー
      </button>

      {/* ── Persona drawer ── */}
      <aside className={`persona-drawer ${personaOpen ? 'open' : 'closed'}`}>
        <div className="review-head">
          <div>
            <span>設定</span>
            <strong>エージェント設定</strong>
          </div>
          <button onClick={() => setPersonaOpen(false)} type="button">閉じる</button>
        </div>

        {personaOpen && (
          <div className="review-content">
            <section className={`persona-editor ${personasLocked ? 'locked' : ''}`}>
              <div className="persona-editor-head">
                <div>
                  <span>編集状態</span>
                  <strong>{personasLocked ? '送信中はロック' : '編集可能'}</strong>
                </div>
                <button type="button" onClick={resetPersonas} disabled={personasLocked || !defaultAgents.length}>
                  リセット
                </button>
              </div>

              <div className="persona-grid">
                {activeAgents.map((agent) => (
                  <label className={`persona-card ${agentClass(agent.character)}`} key={agent.character}>
                    <div className="persona-card-head">
                      <img
                        src={CHARACTER_IMGS[agent.character]}
                        alt={agent.character}
                        className="persona-avatar-mini"
                      />
                      <span>{agent.character}</span>
                    </div>
                    <textarea
                      value={agent.persona}
                      onChange={(event) => updatePersona(agent.character, event.target.value)}
                      disabled={personasLocked}
                      rows={4}
                    />
                  </label>
                ))}
              </div>

              {personaError && (
                <div className="persona-error">セッション開始前に5つすべてのエージェントペルソナが必要です。</div>
              )}

              <div className="round-control">
                <div>
                  <span>レビューラウンド</span>
                  <strong>固定 2ラウンド</strong>
                </div>
                <div className="round-options fixed">
                  <span>2ラウンド</span>
                </div>
              </div>
            </section>
          </div>
        )}
      </aside>

      {/* ── Agent review drawer ── */}
      <aside className={`agent-review ${reviewOpen ? 'open' : 'closed'}`}>
        <div className="review-head">
          <div>
            <span>{isLiveReview ? 'ライブ討議中' : '最新の保存済み討議'}</span>
            <strong>5エージェントレビュー</strong>
          </div>
          <button onClick={() => setReviewOpen(false)} type="button">閉じる</button>
        </div>

        {reviewOpen && (
          <div className="review-content">
            {sending && (
              <div className="discussion-live">
                <div className="live-title">エージェントが検討中...</div>
                {activeAgents.map((agent) => (
                  <div className={`live-agent ${agentClass(agent.character)}`} key={agent.character}>
                    {CHARACTER_IMGS[agent.character] && (
                      <img src={CHARACTER_IMGS[agent.character]} alt={agent.character} className="review-avatar-mini" />
                    )}
                    <span>{agent.character}</span>
                    <b /><b /><b />
                  </div>
                ))}
              </div>
            )}

            {!reviewRound ? (
              <div className="review-empty">最初のメッセージを送信すると、エージェントの内部討議がここに表示されます。</div>
            ) : (
              <>
                {reviewRound.high_risk && (
                  <div className="risk-badge">⚠ 危機介入モードが有効です</div>
                )}

                {displayRounds.map((round) => (
                  <div className="round-section" key={round.round_number}>
                    <div className="round-head">
                      <strong>ラウンド {round.round_number}</strong>
                      <span>{round.round_number > 1 ? '他エージェントの意見を見て修正' : '各エージェントの初回回答'}</span>
                    </div>

                    <div className="discussion-section">
                      <div className="section-label">{isLiveReview ? 'ライブ討議' : '内部討議'}</div>
                      {discussionItems(round).length === 0 && (
                        <div className="review-empty compact">最初のエージェント回答を待機中...</div>
                      )}
                      {discussionItems(round).map((item, index) => (
                        <div
                          className={`discussion-item ${agentClass(item.character)} discussion-${item.type}`}
                          key={`${round.round_number}-${item.character}-${item.type}-${index}`}
                        >
                          <div className="discussion-meta">
                            {CHARACTER_IMGS[item.character] && (
                              <img src={CHARACTER_IMGS[item.character]} alt={item.character} className="review-avatar-mini" />
                            )}
                            <strong>{item.character}</strong>
                            <span>{item.title}</span>
                          </div>
                          <p>{displayText(item.content)}</p>
                        </div>
                      ))}
                    </div>

                    <div className="candidate-list">
                      <div className="section-label">候補回答</div>
                      {(round.candidates || []).map((candidate) => (
                        <div className={`candidate-card ${agentClass(candidate.character)}`} key={`${round.round_number}-${candidate.character}`}>
                          <div className="candidate-head">
                            {CHARACTER_IMGS[candidate.character] && (
                              <img src={CHARACTER_IMGS[candidate.character]} alt={candidate.character} className="review-avatar-mini" />
                            )}
                            <strong>{candidate.character}</strong>
                          </div>
                          <p>{displayText(candidate.reply)}</p>
                        </div>
                      ))}
                    </div>

                  </div>
                ))}

                {finalWinnerReady && (
                  <div className="final-result">
                    <div className="section-label">最終結果</div>
                    <div className={`winner-card ${agentClass(reviewRound.winner.character)}`}>
                      {CHARACTER_IMGS[reviewRound.winner.character] && (
                        <img src={CHARACTER_IMGS[reviewRound.winner.character]} alt={reviewRound.winner.character} className="review-avatar-mini" />
                      )}
                      <span>勝者</span>
                      <strong>{reviewRound.winner.character}</strong>
                      <small>{formatScore(scoreValue(reviewRound.winner))} 加重スコア</small>
                      <p>{displayText(reviewRound.winner.reply)}</p>
                    </div>
                    {(finalTotals || []).length > 0 && (
                      <div className="final-ranking">
                        {finalTotals.map((candidate, index) => (
                          <div className={`ranking-row ${agentClass(candidate.character)}`} key={`final-${candidate.character}`}>
                            <span>#{index + 1}</span>
                            {CHARACTER_IMGS[candidate.character] && (
                              <img src={CHARACTER_IMGS[candidate.character]} alt={candidate.character} className="review-avatar-mini" />
                            )}
                            <strong>{candidate.character}</strong>
                            <b>{formatScore(scoreValue(candidate))}</b>
                            <small>4エージェントの加重平均</small>
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
