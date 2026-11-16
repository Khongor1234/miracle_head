import { useEffect, useRef, useState } from 'react';
import { useLang } from '../LanguageContext';
import { api } from '../api';
import ThinkingIndicator from './ThinkingIndicator';
import CouncilWelcome from './CouncilWelcome';
import TeamPick from './TeamPick';
import ProcessDiagram from './ProcessDiagram';
import PersonaEditor from './PersonaEditor';
import ModelPicker from './ModelPicker';
import ReplyText from './ReplyText';
import LangSwitch from './LangSwitch';
import ReviewSpotlight from './ReviewSpotlight';
import WinnerReason from './WinnerReason';
import LoopVideo from './LoopVideo';
import { AGENT_ORDER, agentAvatar, agentFrame, agentLoop } from '../agentAssets';
import { usePrefersReducedMotion } from '../hooks/useMotion';
import './CounselingChat.css';

const CHARACTER_IMGS = {
  Joy:     '/characters/avatars/joy.webp',
  Sadness: '/characters/avatars/sadness.webp',
  Anger:   '/characters/avatars/anger.webp',
  Fear:    '/characters/avatars/fear.webp',
  Disgust: '/characters/avatars/disgust.webp',
};

const CHARACTER_JP = {
  Joy:     'ヨロコビ',
  Sadness: 'カナシミ',
  Anger:   'イカリ',
  Fear:    'ビビリ',
  Disgust: 'ムカムカ',
};

const jpName = (character, lang) => lang === 'en' ? (character || '') : (CHARACTER_JP[character] || character);

const NETWORK_ERROR_PATTERN = /failed to fetch|networkerror|load failed/i;
const isNetworkError = (message) => NETWORK_ERROR_PATTERN.test(String(message || ''));

const agentClass = (character) => `agent-${String(character || '').toLowerCase()}`;
const scoreValue = (item) => item?.weighted_total ?? item?.average_weighted_total ?? item?.total ?? item?.average_total ?? 0;
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

function CounselorAvatar({ sourceAgent, isReducedMotion }) {
  const [isHovered, setIsHovered] = useState(false);
  if (!CHARACTER_IMGS[sourceAgent]) return <div className="avatar-initials">相</div>;
  // The agent who wrote the reply; its Higgsfield loop plays on hover.
  return (
    <div
      className={`avatar agent-portrait ${agentClass(sourceAgent)}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <LoopVideo
        className="agent-portrait-video"
        src={agentLoop(sourceAgent)}
        poster={agentFrame(sourceAgent)}
        isActive={isHovered}
        isReducedMotion={isReducedMotion}
        label={sourceAgent}
      />
    </div>
  );
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
  onGoHome,
  isSidebarCollapsed,
  onOpenSidebar,
  sending,
  liveRound,
  error,
}) {
  const { lang, t } = useLang();
  const c = t.chat;

  const [draft, setDraft] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [agentPanelTab, setAgentPanelTab] = useState('process');
  const [focusedRoundId, setFocusedRoundId] = useState(null);
  const [ttsPlayingId, setTtsPlayingId] = useState(null);
  const [ttsLoadingId, setTtsLoadingId] = useState(null);
  const isReducedMotion = usePrefersReducedMotion();
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
  // A past reply the visitor opened ("why this reply?"); a reply in progress always wins.
  const focusedRound = focusedRoundId ? rounds.find((round) => round.id === focusedRoundId) : null;
  const reviewRound = (sending && liveRound) || focusedRound || liveRound || latestSavedRound;
  const isViewingPast = Boolean(!sending && focusedRound && focusedRound.id !== latestSavedRound?.id);
  const pastRoundNumber = focusedRound ? rounds.indexOf(focusedRound) + 1 : 0;
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
  const maxScore = finalTotals.length ? Math.max(...finalTotals.map((t) => scoreValue(t))) : 1;
  const winnerCharacter = reviewRound?.winner?.character;
  const winnerAnalysis = displayText(round1Candidates.find((candidate) => candidate.character === winnerCharacter)?.reply ?? '');
  const showRound = (roundId) => {
    setFocusedRoundId(roundId);
    setAgentPanelTab('process');
    openReview();
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const submit = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending || personaError) return;
    setFocusedRoundId(null);
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

  const resetPersona = (character) => {
    const original = defaultAgents.find((agent) => agent.character === character);
    if (original) updatePersona(character, original.persona);
  };

  const personaEditorProps = {
    agents: activeAgents,
    defaultAgents,
    characters: t.characters,
    isLocked: personasLocked,
    hasError: personaError,
    onChange: updatePersona,
    onResetAll: resetPersonas,
    onResetOne: resetPersona,
    labels: {
      locked: c.locked,
      editable: c.editable,
      resetAll: c.resetBtn,
      editedCount: c.personaEditedCount,
      intro: c.personaIntro,
      edited: c.personaEdited,
      empty: c.personaEmpty,
      fieldLabel: c.personaFieldLabel,
      resetOne: c.personaResetOne,
      error: c.personaError,
      roundsLabel: c.reviewRoundsLabel,
      roundsValue: c.reviewRoundsFixed,
    },
  };

  const openPersonas = () => { setPersonaOpen(true); setReviewOpen(false); };
  const openReview  = () => { setReviewOpen(true);  setPersonaOpen(false); };

  return (
    <div className="counseling-shell">
      <section className="chat-pane">

        {/* ── Header ── */}
        <header className="chat-header">
          <button
            className={`sidebar-open-btn${isSidebarCollapsed ? ' is-shown' : ''}`}
            type="button"
            onClick={onOpenSidebar}
            aria-label={t.sidebar.openLabel}
            aria-expanded={!isSidebarCollapsed}
            tabIndex={isSidebarCollapsed ? 0 : -1}
          >
            <span aria-hidden="true">☰</span>
            <span className="sidebar-open-label">{t.sidebar.historyLabel}</span>
          </button>
          <button className="home-btn" type="button" onClick={onGoHome} aria-label={c.homeAria}>
            <span className="home-btn-arrow" aria-hidden="true">←</span>
            <span className="home-btn-label">{c.homeLabel}</span>
          </button>
          <div className="chat-header-title">
            <h1>{c.title}</h1>
            <p className="header-team">
              <span className="header-team-faces" aria-hidden="true">
                {AGENT_ORDER.map((character) => <img key={character} src={agentAvatar(character)} alt="" />)}
              </span>
              <span className={`header-team-dot${sending ? ' is-busy' : ''}`} aria-hidden="true" />
              <span className="header-team-text">{sending ? c.thinking.starting : c.teamOnline}</span>
            </p>
          </div>
          <div className="header-controls">
            <LangSwitch />
            <ModelPicker
              value={model}
              disabled={sending}
              onChange={onModelChange}
              labels={{ label: c.modelLabel, tags: c.modelTags, notes: c.modelNotes }}
            />
          </div>
        </header>

        {/* ── Messages ── */}
        <div className="message-list">
          {messages.length === 0 && (
            <CouncilWelcome
              labels={{ eyebrow: c.councilEyebrow, listening: c.councilListening, greeting: c.counselorGreeting }}
              isListening={draft.trim().length > 0}
              characters={t.characters}
              suggestions={c.suggestions}
              disabled={sending}
              isReducedMotion={isReducedMotion}
              onPickSuggestion={(suggestion) => { setDraft(suggestion); textareaRef.current?.focus(); }}
            />
          )}

          {messages.map((message) => (
            <div
              className={`message-row ${message.role}${isViewingPast && message.source_round_id === focusedRoundId ? ' is-focused' : ''}`}
              key={message.id}
            >
              {message.role === 'client'
                ? <ClientAvatar />
                : <CounselorAvatar sourceAgent={message.source_agent} isReducedMotion={isReducedMotion} />
              }
              <div className={`bubble${message.role === 'counselor' && message.source_agent ? ` ${agentClass(message.source_agent)}` : ''}`}>
                {message.source_agent && message.role === 'counselor' && (
                  <div className={`source-agent ${agentClass(message.source_agent)}`}>
                    {jpName(message.source_agent, lang)} {c.selectedAgent}
                  </div>
                )}
                {message.role === 'counselor'
                  ? <ReplyText text={displayText(message.content)} />
                  : <span className="bubble-text">{displayText(message.content)}</span>}
                {message.role === 'counselor' && (
                  <TeamPick
                    round={rounds.find((round) => round.id === message.source_round_id)}
                    label={c.teamPickLabel}
                    onOpen={() => showRound(message.source_round_id)}
                  />
                )}
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
            <div className="message-row counselor thinking-row">
              <ThinkingIndicator
                labels={c.thinking}
                draftedCharacters={round1Candidates.map((candidate) => candidate.character)}
                agentCount={activeAgents.length || 5}
                hasWinner={Boolean(liveRound?.winner)}
              />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <div className="chat-error" role="alert">{isNetworkError(error) ? c.networkError : error}</div>}

        {/* ── Input ── */}
        <form className={`message-form${draft.trim() ? ' is-ready' : ''}`} onSubmit={submit}>
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

              {isViewingPast && (
                <div className="past-banner" role="status">
                  <span>{c.viewingPast.replace('{n}', pastRoundNumber).replace('{total}', rounds.length)}</span>
                  <button type="button" onClick={() => setFocusedRoundId(null)}>{c.backToLatest}</button>
                </div>
              )}
              {!reviewRound && !sending ? (
                <ProcessDiagram labels={{ ...c.process, hint: c.panelIdleMsg }} />
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
                          </div>
                        );
                      })}
                    </div>

                  </div>

                  <ReviewSpotlight
                    key={isLiveReview ? 'live' : reviewRound?.id ?? 'none'}
                    peerScores={reviewRound?.peer_scores}
                    characters={t.characters}
                    isLive={isLiveReview}
                    labels={c.reviewSpot}
                  />

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
                      <WinnerReason key={reviewRound.id} text={winnerAnalysis} labels={c.winnerWhy} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {agentPanelTab === 'persona' && (
            <PersonaEditor {...personaEditorProps} />
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
            <PersonaEditor {...personaEditorProps} />
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

            {isViewingPast && (
              <div className="past-banner" role="status">
                <span>{c.viewingPast.replace('{n}', pastRoundNumber).replace('{total}', rounds.length)}</span>
                <button type="button" onClick={() => setFocusedRoundId(null)}>{c.backToLatest}</button>
              </div>
            )}
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
                        </div>
                      );
                    })}
                  </div>
                </div>

                <ReviewSpotlight
                  key={isLiveReview ? 'live' : reviewRound?.id ?? 'none'}
                  peerScores={reviewRound?.peer_scores}
                  characters={t.characters}
                  isLive={isLiveReview}
                  labels={c.reviewSpot}
                />

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
                    <WinnerReason key={reviewRound.id} text={winnerAnalysis} labels={c.winnerWhy} />
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
