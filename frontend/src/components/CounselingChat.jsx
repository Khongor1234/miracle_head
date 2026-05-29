import { useEffect, useRef, useState } from 'react';
import { useLang } from '../LanguageContext';
import { api } from '../api';
import './CounselingChat.css';

const CHARACTER_IMGS = {
  Joy:     '/characters/joy.png',
  Sadness: '/characters/sadness.png',
  Anger:   '/characters/anger.png',
  Fear:    '/characters/fear.png',
  Disgust: '/characters/disgust.png',
};

const CHARACTER_JP = {
  Joy:     'ヨロコビ',
  Sadness: 'カナシミ',
  Anger:   'イカリ',
  Fear:    'ビビリ',
  Disgust: 'ムカムカ',
};

const LOCAL_MODEL = 'gemma-4-31B-it-4bit';

const jpName = (character, lang) => lang === 'en' ? (character || '') : (CHARACTER_JP[character] || character);

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
    try {
      const parsed = JSON.parse(current);
      if (typeof parsed === 'string') { current = parsed.trim(); continue; }
      if (parsed && typeof parsed === 'object' && typeof parsed.reply !== 'undefined') {
        current = String(parsed.reply).trim();
        continue;
      }
      break;
    } catch { /* fall through to sanitized parse */ }
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
  if (current.trimStart().startsWith('{')) {
    const match = current.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/s);
    if (match) {
      try { return JSON.parse(`"${match[1]}"`).trim(); } catch { return match[1].trim(); }
    }
    return text;
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
  return <div className="avatar-initials">You</div>;
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function SpeakerIcon({ playing }) {
  if (playing) {
    return (
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
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
  const { lang, setLang, t } = useLang();
  const c = t.chat;

  const [draft, setDraft] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [agentPanelTab, setAgentPanelTab] = useState('process');
  const [messagesVisible, setMessagesVisible] = useState(true);
  const [ttsPlayingId, setTtsPlayingId] = useState(null);
  const [ttsLoadingId, setTtsLoadingId] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const audioRef = useRef(null);

  const handleTTS = async (messageId, text, character) => {
    if (ttsPlayingId === messageId) {
      audioRef.current?.pause();
      audioRef.current = null;
      setTtsPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setTtsPlayingId(null);
    setTtsLoadingId(messageId);
    try {
      const blob = await api.tts(text, character);
      const typedBlob = new Blob([blob], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(typedBlob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); setTtsPlayingId(null); audioRef.current = null; };
      audio.onerror = (e) => {
        console.error('Audio playback error:', e, audio.error);
        URL.revokeObjectURL(url);
        setTtsPlayingId(null);
        audioRef.current = null;
      };
      await audio.play();
      setTtsPlayingId(messageId);
      setTtsLoadingId(null);
    } catch (err) {
      console.error('TTS error:', err);
      setTtsLoadingId(null);
    }
  };

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

  const round1Data = displayRounds.find((r) => r.round_number === 1) || displayRounds[0];
  const round1Candidates = round1Data?.candidates || [];
  const agentR1Done = (character) => round1Candidates.some((c) => c.character === character);
  const round1AllDone = activeAgents.length > 0 && activeAgents.every((a) => agentR1Done(a.character));
  const agentScore = (character) => {
    if (!finalTotals.length) return null;
    const entry = finalTotals.find((t) => t.character === character);
    return entry != null ? scoreValue(entry) : null;
  };
  const latestRound = displayRounds.length ? displayRounds[displayRounds.length - 1] : null;
  const latestDiscussion = latestRound ? discussionItems(latestRound) : [];
  const round2PeerScores = latestRound?.peer_scores || [];
  const maxScore = finalTotals.length ? Math.max(...finalTotals.map((t) => scoreValue(t))) : 1;
  const winnerCharacter = reviewRound?.winner?.character;

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
    await onSendMessage(text, lang);
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
            <h1>{c.title}</h1>
            <p>{c.subtitle}</p>
          </div>
          <div className="header-controls">
            <button
              className="lang-toggle"
              type="button"
              onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}
            >
              {lang === 'ja' ? 'EN' : '日本語'}
            </button>
            <div className="model-control">
              <label htmlFor="model-input">{c.modelLabel}</label>
              <select
                id="model-input"
                value={model || LOCAL_MODEL}
                onChange={(e) => onModelChange(e.target.value)}
                disabled={sending}
              >
                <option value={LOCAL_MODEL}>Gemma 4 31B IT 4bit</option>
              </select>
            </div>
          </div>
        </header>

        {/* ── Messages ── */}
        <div className="message-list">
          {messages.length === 0 && (
            <div className="empty-chat">
              <div className="empty-chat-avatar">
                <img src="/characters/joy.png" alt={c.counselorName} />
              </div>
              <p className="empty-chat-label">{c.counselorName}</p>
              <p>{c.counselorGreeting}</p>
              {c.suggestions?.length > 0 && (
                <div className="suggestion-chips">
                  {c.suggestions.map((s, i) => (
                    <button
                      key={i}
                      className="suggestion-chip"
                      type="button"
                      disabled={sending}
                      onClick={() => { setDraft(s); textareaRef.current?.focus(); }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((message) => (
            <div className={`message-row ${message.role}`} key={message.id}>
              {message.role === 'client'
                ? <ClientAvatar />
                : <CounselorAvatar sourceAgent={message.source_agent} />
              }
              <div className={`bubble${message.role === 'counselor' && message.source_agent ? ` ${agentClass(message.source_agent)}` : ''}`}>
                {message.source_agent && message.role === 'counselor' && (
                  <div className={`source-agent ${agentClass(message.source_agent)}`}>
                    {jpName(message.source_agent, lang)} {c.selectedAgent}
                  </div>
                )}
                <span className="bubble-text">{displayText(message.content)}</span>
                {message.role === 'counselor' && (
                  <button
                    className={`tts-btn${ttsPlayingId === message.id ? ' playing' : ''}`}
                    type="button"
                    disabled={ttsLoadingId === message.id}
                    onClick={() => handleTTS(message.id, displayText(message.content), message.source_agent)}
                    aria-label={ttsPlayingId === message.id ? 'Stop' : 'Play'}
                  >
                    {ttsLoadingId === message.id
                      ? <span className="tts-dots"><b /><b /><b /></span>
                      : <SpeakerIcon playing={ttsPlayingId === message.id} />
                    }
                  </button>
                )}
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
            placeholder={c.placeholder}
            rows={1}
            onKeyDown={handleKeyDown}
          />
          <button className="send-btn" type="submit" disabled={sending || !draft.trim() || personaError} aria-label={c.sendLabel}>
            <SendIcon />
          </button>
        </form>
      </section>

      {/* ── Inline agent panel (desktop right column) ── */}
      <aside className="agent-panel-right">
        <div className="panel-tabs">
          <button
            className={`panel-tab ${agentPanelTab === 'process' ? 'active' : ''}`}
            onClick={() => setAgentPanelTab('process')}
            type="button"
          >
            {c.processTab}
          </button>
          <button
            className={`panel-tab ${agentPanelTab === 'persona' ? 'active' : ''} ${agentPanelTab !== 'persona' && personaError ? 'needs-attention' : ''}`}
            onClick={() => setAgentPanelTab('persona')}
            type="button"
          >
            {personaError && agentPanelTab !== 'persona' ? '⚠ ' : ''}{c.personaTab}
          </button>
        </div>

        <div className="panel-content">
          {agentPanelTab === 'process' && (
            <div>
              {/* Global message toggle */}
              <button
                className="panel-msg-toggle"
                type="button"
                onClick={() => setMessagesVisible((v) => !v)}
              >
                {messagesVisible ? (c.hideMessages ?? 'メッセージを隠す') : (c.showMessages ?? 'メッセージを表示')}
              </button>

              {!reviewRound && !sending ? (
                <div className="panel-idle">{c.panelIdleMsg}</div>
              ) : (
                <>
                  {/* ── Round 1 — 議論 ── */}
                  <div className="panel-flow-card">
                    <div className="panel-round-head">
                      <span className="panel-round-label">{c.round1Title}</span>
                      {(round1AllDone || sending) && (
                        <span className={`panel-rstatus ${round1AllDone ? 'prs-done' : 'prs-generating'}`}>
                          {round1AllDone ? c.roundDone : c.roundGenerating}
                        </span>
                      )}
                    </div>

                    {/* Agent status strip */}
                    <div className="panel-agent-strip">
                      {activeAgents.map((agent) => (
                        <div className={`panel-strip-agent ${agentClass(agent.character)}`} key={agent.character} title={agent.character}>
                          {CHARACTER_IMGS[agent.character] && (
                            <img src={CHARACTER_IMGS[agent.character]} alt={agent.character} className="panel-agent-av" />
                          )}
                          {agentR1Done(agent.character)
                            ? <span className="panel-strip-check">✓</span>
                            : sending
                              ? <span className="panel-strip-dots"><b /><b /><b /></span>
                              : null}
                        </div>
                      ))}
                    </div>

                    {/* Round 1 candidate reply messages */}
                    {messagesVisible && round1Candidates.length > 0 && (
                      <div className="panel-msg-list">
                        {round1Candidates.map((candidate) => (
                          <div className={`panel-msg-bubble ${agentClass(candidate.character)}`} key={`r1-${candidate.character}`}>
                            <div className="panel-msg-head">
                              {CHARACTER_IMGS[candidate.character] && (
                                <img src={CHARACTER_IMGS[candidate.character]} alt={candidate.character} className="panel-agent-av" />
                              )}
                              <strong>{jpName(candidate.character, lang)}</strong>
                            </div>
                            <p>{displayText(candidate.reply)}</p>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>

                  {/* ── Round 2 — 振り返り & 議論 ── */}
                  <div className={`panel-flow-card${!round1AllDone ? ' dimmed' : ''}`}>
                    <div className="panel-round-head">
                      <span className="panel-round-label">{c.round2Title}</span>
                      <span className={`panel-rstatus ${finalWinnerReady ? 'prs-done' : round1AllDone && sending ? 'prs-scoring' : 'prs-wait'}`}>
                        {finalWinnerReady ? c.roundDone : round1AllDone && sending ? c.roundScoring : c.roundWaiting}
                      </span>
                    </div>

                    {/* Reflection — each agent + their score */}
                    <div className="panel-reflection-list">
                      {activeAgents.map((agent) => {
                        const score = agentScore(agent.character);
                        const pct = score != null ? Math.round((score / Math.max(maxScore, 0.01)) * 100) : 0;
                        const isWinner = agent.character === winnerCharacter;
                        const peerEntry = round2PeerScores.find((ps) => ps.character === agent.character);
                        return (
                          <div className={`panel-reflection-item ${agentClass(agent.character)}${isWinner ? ' win' : ''}`} key={`r2-${agent.character}`}>
                            <div className="panel-reflection-head">
                              {CHARACTER_IMGS[agent.character] && (
                                <img src={CHARACTER_IMGS[agent.character]} alt={agent.character} className="panel-agent-av" />
                              )}
                              <span className="panel-agent-name">{jpName(agent.character, lang)}</span>
                              <div className="panel-score-bar">
                                <div className="panel-score-fill" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="panel-score-num">{score != null ? formatScore(score) : '—'}</span>
                            </div>
                            {messagesVisible && peerEntry?.scores?.length > 0 && (
                              <div className="panel-peer-list">
                                {peerEntry.scores.map((ps) => (
                                  <div className={`panel-peer-item ${agentClass(ps.character)}`} key={`ps-${agent.character}-${ps.character}`}>
                                    <span className="panel-peer-name">{ps.character}</span>
                                    <b className="panel-peer-score-num">{ps.score ?? '—'}</b>
                                    {ps.comment && <p>{ps.comment}</p>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Round 2 Discussion */}
                    {latestDiscussion.length > 0 && (
                      <>
                        <div className="panel-section-divider">{c.discussionLabel ?? '議論'}</div>
                        {messagesVisible && (
                          <div className="panel-msg-list">
                            {latestDiscussion.map((item, i) => (
                              <div className={`panel-msg-bubble ${agentClass(item.character)}`} key={`d2-${i}`}>
                                <div className="panel-msg-head">
                                  {CHARACTER_IMGS[item.character] && (
                                    <img src={CHARACTER_IMGS[item.character]} alt={item.character} className="panel-agent-av" />
                                  )}
                                  <strong>{jpName(item.character, lang)}</strong>
                                  {item.title && <span className="panel-msg-title">{item.title}</span>}
                                </div>
                                <p>{displayText(item.content)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* ── Winner reply ── */}
                  {finalWinnerReady && (
                    <div className={`panel-winner-card ${agentClass(winnerCharacter)}`}>
                      <div className="panel-winner-title">{c.panelWinnerTitle}</div>
                      <div className="panel-winner-name">
                        {CHARACTER_IMGS[winnerCharacter] && (
                          <img src={CHARACTER_IMGS[winnerCharacter]} alt={winnerCharacter} className="panel-agent-av" />
                        )}
                        <strong>{jpName(winnerCharacter, lang)}</strong>
                        <span className="panel-winner-score">{formatScore(scoreValue(reviewRound.winner))} {c.weightedScore}</span>
                      </div>
                      {messagesVisible && reviewRound.winner.reply && (
                        <p className="panel-winner-reply-text">{displayText(reviewRound.winner.reply)}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {agentPanelTab === 'persona' && (
            <section className={`persona-editor ${personasLocked ? 'locked' : ''}`}>
              <div className="persona-editor-head">
                <div>
                  <span>{c.editStatusLabel}</span>
                  <strong>{personasLocked ? c.locked : c.editable}</strong>
                </div>
                <button type="button" onClick={resetPersonas} disabled={personasLocked || !defaultAgents.length}>
                  {c.resetBtn}
                </button>
              </div>
              <div className="persona-grid">
                {activeAgents.map((agent) => (
                  <label className={`persona-card ${agentClass(agent.character)}`} key={agent.character}>
                    <div className="persona-card-head">
                      <img src={CHARACTER_IMGS[agent.character]} alt={agent.character} className="persona-avatar-mini" />
                      <span>{jpName(agent.character, lang)}</span>
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
              {personaError && <div className="persona-error">{c.personaError}</div>}
              <div className="round-control">
                <div>
                  <span>{c.reviewRoundsLabel}</span>
                  <strong>{c.reviewRoundsFixed}</strong>
                </div>
                <div className="round-options fixed">
                  <span>{c.reviewRoundsValue}</span>
                </div>
              </div>
            </section>
          )}
        </div>
      </aside>

      {/* ── Floating buttons ── */}
      <button
        className={`persona-handle ${personaOpen ? 'open' : ''} ${reviewOpen ? 'drawer-open' : ''} ${personaError ? 'needs-attention' : ''}`}
        onClick={openPersonas}
        type="button"
      >
        {personaError ? '⚠ ' : ''}{c.agentSettingsBtn}
      </button>

      <button
        className={`review-handle ${reviewOpen ? 'open' : ''} ${personaOpen ? 'drawer-open' : ''}`}
        onClick={openReview}
        type="button"
      >
        {c.reviewBtn}
      </button>

      {/* ── Persona drawer ── */}
      <aside className={`persona-drawer ${personaOpen ? 'open' : 'closed'}`}>
        <div className="review-head">
          <div>
            <span>{c.settingsLabel}</span>
            <strong>{c.agentSettingsTitle}</strong>
          </div>
          <button onClick={() => setPersonaOpen(false)} type="button">{c.closeBtn}</button>
        </div>

        {personaOpen && (
          <div className="review-content">
            <section className={`persona-editor ${personasLocked ? 'locked' : ''}`}>
              <div className="persona-editor-head">
                <div>
                  <span>{c.editStatusLabel}</span>
                  <strong>{personasLocked ? c.locked : c.editable}</strong>
                </div>
                <button type="button" onClick={resetPersonas} disabled={personasLocked || !defaultAgents.length}>
                  {c.resetBtn}
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
                      <span>{jpName(agent.character, lang)}</span>
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
                <div className="persona-error">{c.personaError}</div>
              )}

              <div className="round-control">
                <div>
                  <span>{c.reviewRoundsLabel}</span>
                  <strong>{c.reviewRoundsFixed}</strong>
                </div>
                <div className="round-options fixed">
                  <span>{c.reviewRoundsValue}</span>
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
            <span>{isLiveReview ? c.liveDiscussionLabel : c.savedDiscussionLabel}</span>
            <strong>{c.reviewTitle}</strong>
          </div>
          <button onClick={() => setReviewOpen(false)} type="button">{c.closeBtn}</button>
        </div>

        {reviewOpen && (
          <div className="review-content">
            {/* Message toggle — same as desktop panel */}
            <button
              className="panel-msg-toggle"
              type="button"
              onClick={() => setMessagesVisible((v) => !v)}
            >
              {messagesVisible ? (c.hideMessages ?? 'メッセージを隠す') : (c.showMessages ?? 'メッセージを表示')}
            </button>

            {!reviewRound && !sending ? (
              <div className="review-empty">{c.emptyReview}</div>
            ) : (
              <>
                {reviewRound.high_risk && (
                  <div className="risk-badge">{c.crisisMode}</div>
                )}

                {/* Round 1 — 議論 */}
                <div className="panel-flow-card">
                  <div className="panel-round-head">
                    <span className="panel-round-label">{c.round1Title}</span>
                    {(round1AllDone || sending) && (
                      <span className={`panel-rstatus ${round1AllDone ? 'prs-done' : 'prs-generating'}`}>
                        {round1AllDone ? c.roundDone : c.roundGenerating}
                      </span>
                    )}
                  </div>
                  <div className="panel-agent-strip">
                    {activeAgents.map((agent) => (
                      <div className={`panel-strip-agent ${agentClass(agent.character)}`} key={agent.character} title={agent.character}>
                        {CHARACTER_IMGS[agent.character] && (
                          <img src={CHARACTER_IMGS[agent.character]} alt={agent.character} className="panel-agent-av" />
                        )}
                        {agentR1Done(agent.character)
                          ? <span className="panel-strip-check">✓</span>
                          : sending
                            ? <span className="panel-strip-dots"><b /><b /><b /></span>
                            : null}
                      </div>
                    ))}
                  </div>
                  {messagesVisible && round1Candidates.length > 0 && (
                    <div className="panel-msg-list">
                      {round1Candidates.map((candidate) => (
                        <div className={`panel-msg-bubble ${agentClass(candidate.character)}`} key={`dr1-${candidate.character}`}>
                          <div className="panel-msg-head">
                            {CHARACTER_IMGS[candidate.character] && (
                              <img src={CHARACTER_IMGS[candidate.character]} alt={candidate.character} className="panel-agent-av" />
                            )}
                            <strong>{jpName(candidate.character, lang)}</strong>
                          </div>
                          <p>{displayText(candidate.reply)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Round 2 — 振り返り & 議論 */}
                <div className={`panel-flow-card${!round1AllDone ? ' dimmed' : ''}`}>
                  <div className="panel-round-head">
                    <span className="panel-round-label">{c.round2Title}</span>
                    <span className={`panel-rstatus ${finalWinnerReady ? 'prs-done' : round1AllDone && sending ? 'prs-scoring' : 'prs-wait'}`}>
                      {finalWinnerReady ? c.roundDone : round1AllDone && sending ? c.roundScoring : c.roundWaiting}
                    </span>
                  </div>
                  <div className="panel-reflection-list">
                    {activeAgents.map((agent) => {
                      const score = agentScore(agent.character);
                      const pct = score != null ? Math.round((score / Math.max(maxScore, 0.01)) * 100) : 0;
                      const isWinner = agent.character === winnerCharacter;
                      const peerEntry = round2PeerScores.find((ps) => ps.character === agent.character);
                      return (
                        <div className={`panel-reflection-item ${agentClass(agent.character)}${isWinner ? ' win' : ''}`} key={`dr2-${agent.character}`}>
                          <div className="panel-reflection-head">
                            {CHARACTER_IMGS[agent.character] && (
                              <img src={CHARACTER_IMGS[agent.character]} alt={agent.character} className="panel-agent-av" />
                            )}
                            <span className="panel-agent-name">{jpName(agent.character, lang)}</span>
                            <div className="panel-score-bar">
                              <div className="panel-score-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="panel-score-num">{score != null ? formatScore(score) : '—'}</span>
                          </div>
                          {messagesVisible && peerEntry?.scores?.length > 0 && (
                            <div className="panel-peer-list">
                              {peerEntry.scores.map((ps) => (
                                <div className={`panel-peer-item ${agentClass(ps.character)}`} key={`dps-${agent.character}-${ps.character}`}>
                                  <span className="panel-peer-name">{ps.character}</span>
                                  <b className="panel-peer-score-num">{ps.score ?? '—'}</b>
                                  {ps.comment && <p>{ps.comment}</p>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {latestDiscussion.length > 0 && (
                    <>
                      <div className="panel-section-divider">{c.discussionLabel ?? '議論'}</div>
                      {messagesVisible && (
                        <div className="panel-msg-list">
                          {latestDiscussion.map((item, i) => (
                            <div className={`panel-msg-bubble ${agentClass(item.character)}`} key={`dd2-${i}`}>
                              <div className="panel-msg-head">
                                {CHARACTER_IMGS[item.character] && (
                                  <img src={CHARACTER_IMGS[item.character]} alt={item.character} className="panel-agent-av" />
                                )}
                                <strong>{jpName(item.character, lang)}</strong>
                                {item.title && <span className="panel-msg-title">{item.title}</span>}
                              </div>
                              <p>{displayText(item.content)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Winner reply */}
                {finalWinnerReady && (
                  <div className={`panel-winner-card ${agentClass(winnerCharacter)}`}>
                    <div className="panel-winner-title">{c.panelWinnerTitle}</div>
                    <div className="panel-winner-name">
                      {CHARACTER_IMGS[winnerCharacter] && (
                        <img src={CHARACTER_IMGS[winnerCharacter]} alt={winnerCharacter} className="panel-agent-av" />
                      )}
                      <strong>{jpName(winnerCharacter, lang)}</strong>
                      <span className="panel-winner-score">{formatScore(scoreValue(reviewRound.winner))} {c.weightedScore}</span>
                    </div>
                    {messagesVisible && reviewRound.winner.reply && (
                      <p className="panel-winner-reply-text">{displayText(reviewRound.winner.reply)}</p>
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
