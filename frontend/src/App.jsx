import { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import CounselingChat from './components/CounselingChat';
import LandingPage from './components/LandingPage';
import PasswordGate from './components/PasswordGate';
import { api, onUnauthorized } from './api';
import { createConversationStore, historyFor } from './conversationStore';
import { localizeAgents, localizeDefaults, toRequestAgents } from './personaLanguage';
import { useLang } from './LanguageContext';
import './App.css';

const cloneAgents = (agents = []) => agents.map((agent) => ({ ...agent }));
// Conversations live in this browser only; the backend stores nothing.
const conversationStore = createConversationStore();
const DEFAULT_REVIEW_ROUNDS = 2;
// The app view lives at #app so the browser's Back button returns to the landing page.
const APP_HASH = '#app';
const isAppUrl = () => window.location.hash === APP_HASH;
// Whether the history sidebar is slid shut on wide screens (a per-browser preference).
const SIDEBAR_KEY = 'miracle_head_sidebar_collapsed';
const readSidebarCollapsed = () => {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
};
const saveSidebarCollapsed = (isCollapsed) => {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, isCollapsed ? '1' : '0');
  } catch {
    // Storage blocked: the choice simply lasts until the page reloads.
  }
};

const emptyReviewRound = (roundNumber) => ({
  round_number: roundNumber,
  candidates: [],
  peer_scores: [],
  totals: [],
  discussion: [],
  winner: null,
});

const updateRound = (current, roundNumber, updater) => {
  const existingRounds = current?.rounds || [];
  const index = existingRounds.findIndex((round) => round.round_number === roundNumber);
  const baseRound = index >= 0 ? existingRounds[index] : emptyReviewRound(roundNumber);
  const nextRound = updater(baseRound);
  const nextRounds = index >= 0
    ? existingRounds.map((round, roundIndex) => (roundIndex === index ? nextRound : round))
    : [...existingRounds, nextRound];
  nextRounds.sort((a, b) => a.round_number - b.round_number);
  return {
    ...current,
    rounds: nextRounds,
    candidates: nextRound.candidates || [],
    peer_scores: nextRound.peer_scores || [],
    totals: nextRound.totals || [],
    discussion: nextRound.discussion || [],
    winner: nextRound.winner || current?.winner || null,
  };
};

function App() {
  const { lang } = useLang();
  const [showLanding, setShowLanding] = useState(() => !isAppUrl());
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [model, setModel] = useState('gemini-2.5-flash');
  const [agents, setAgents] = useState([]);
  const [defaultAgents, setDefaultAgents] = useState([]);
  const [reviewRounds, setReviewRounds] = useState(DEFAULT_REVIEW_ROUNDS);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [liveRound, setLiveRound] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readSidebarCollapsed);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const touchStartRef = useRef(null);
  // Stock personas follow the interface language; edited ones stay as written.
  const visibleAgents = localizeAgents(agents, defaultAgents, lang);
  const localizedDefaultAgents = localizeDefaults(defaultAgents, lang);
  const hasCompletePersonas = visibleAgents.length === 5 && visibleAgents.every((agent) => agent.persona?.trim());

  useEffect(() => onUnauthorized(() => setNeedsPassword(true)), []);

  useEffect(() => {
    const onHistoryChange = () => {
      setShowLanding(!isAppUrl());
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', onHistoryChange);
    return () => window.removeEventListener('popstate', onHistoryChange);
  }, []);

  const toggleSidebar = () => {
    const willCollapse = !isSidebarCollapsed;
    saveSidebarCollapsed(willCollapse);
    setIsSidebarCollapsed(willCollapse);
    // The button just pressed disappears, so hand keyboard focus to its counterpart.
    requestAnimationFrame(() => {
      const target = willCollapse ? '.sidebar-open-btn' : '.sidebar-collapse-btn';
      document.querySelector(target)?.focus({ preventScroll: true });
    });
  };

  const enterApp = () => {
    if (!isAppUrl()) window.history.pushState(null, '', APP_HASH);
    setShowLanding(false);
    window.scrollTo(0, 0);
  };

  const goToLanding = () => {
    // A new history entry, so Back takes the visitor into the chat again.
    window.history.pushState(null, '', window.location.pathname + window.location.search);
    setMobileSidebarOpen(false);
    setShowLanding(true);
    window.scrollTo(0, 0);
  };

  const handleUnlock = () => {
    setNeedsPassword(false);
    setError('');
    setLoadAttempt((attempt) => attempt + 1);
  };

  const refreshList = () => setConversations(conversationStore.list());

  useEffect(() => {
    let active = true;
    api.getSettings()
      .then((settings) => {
        if (!active) return;
        if (settings.default_model) setModel(settings.default_model);
        if (settings.agents) {
          setDefaultAgents(cloneAgents(settings.agents));
          setAgents(cloneAgents(settings.agents));
        }
      })
      .catch((err) => console.error('Failed to load settings:', err));
    setConversations(conversationStore.list());
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setCurrentConversation(null);
    setAgents(localizeDefaults(defaultAgents, lang));
    setReviewRounds(DEFAULT_REVIEW_ROUNDS);
    setLiveRound(null);
    setError('');
    setMobileSidebarOpen(false);
  };

  const handleSelectConversation = async (id) => {
    setError('');
    setCurrentConversationId(id);
    try {
      const conversation = conversationStore.get(id);
      setCurrentConversation(conversation);
      setLiveRound(null);
      if (conversation.config?.model) setModel(conversation.config.model);
      if (conversation.config?.agents) setAgents(cloneAgents(conversation.config.agents));
      setReviewRounds(DEFAULT_REVIEW_ROUNDS);
      setMobileSidebarOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to load conversation.');
    }
  };

  const handleDeleteConversation = (id) => {
    try {
      conversationStore.remove(id);
      setConversations((prev) => prev.filter((item) => item.id !== id));
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setCurrentConversation(null);
        setAgents(localizeDefaults(defaultAgents, lang));
        setReviewRounds(DEFAULT_REVIEW_ROUNDS);
        setLiveRound(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to delete conversation.');
    }
  };

  const ensureConversation = () => {
    if (currentConversation) return currentConversation;
    const sessionAgents = visibleAgents.length ? visibleAgents : localizedDefaultAgents;
    const config = {
      model: model.trim() || 'gemini-2.5-flash',
      review_rounds: reviewRounds,
    };
    if (sessionAgents.length === 5 && sessionAgents.every((agent) => agent.persona?.trim())) {
      config.agents = sessionAgents;
    }
    const conversation = conversationStore.create(config);
    setCurrentConversation(conversation);
    setCurrentConversationId(conversation.id);
    refreshList();
    return conversation;
  };

  const handleSendMessage = async (content, lang = 'ja') => {
    setSending(true);
    setError('');
    let activeConversationId = currentConversation?.id || currentConversationId;
    setLiveRound({
      status: 'starting',
      candidates: [],
      peer_scores: [],
      totals: [],
      discussion: [],
      winner: null,
      review_rounds: reviewRounds,
      rounds: [],
    });
    try {
      const selectedModel = model.trim() || 'gemini-2.5-flash';
      const conversation = ensureConversation();
      activeConversationId = conversation.id;
      const history = historyFor(conversation);
      setLiveRound((prev) => ({
        ...prev,
        model: selectedModel,
      }));
      const pendingClient = {
        id: `pending-${Date.now()}`,
        role: 'client',
        content,
        created_at: new Date().toISOString(),
      };
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...(prev?.messages || []), pendingClient],
      }));

      const request = {
        content,
        model: selectedModel,
        lang,
        // The personas as they are now, so edits and a language switch apply to the next message.
        agents: hasCompletePersonas ? toRequestAgents(visibleAgents) : conversation.config?.agents,
        history,
      };
      await api.sendChatStream(request, (event) => {
        const payload = event.payload || {};

        if (event.type === 'client_message') {
          const clientMessage = payload.client_message;
          conversationStore.addClientMessage(conversation.id, clientMessage);
          setCurrentConversation((prev) => {
            const base = prev || conversation;
            const messages = base.messages || [];
            if (messages.some((message) => message.id === clientMessage.id)) return base;
            const hasPending = messages.some((message) => message.id === pendingClient.id);
            return {
              ...base,
              messages: hasPending
                ? messages.map((message) => (message.id === pendingClient.id ? clientMessage : message))
                : [...messages, clientMessage],
            };
          });
        }

        if (event.type === 'round_started') {
          const roundNumber = payload.round_number || 1;
          setLiveRound((prev) => ({
            ...updateRound(prev, roundNumber, (round) => ({
              ...round,
              candidates: [],
              peer_scores: [],
              totals: [],
              discussion: [],
              winner: null,
            })),
            status: 'candidates',
            agents: payload.agents || prev?.agents || [],
            high_risk: payload.high_risk,
            model: payload.model,
            review_rounds: payload.review_rounds || prev?.review_rounds || reviewRounds,
          }));
        }

        if (event.type === 'candidate_ready') {
          const candidate = payload.candidate;
          const roundNumber = payload.round_number || 1;
          setLiveRound((prev) => ({
            ...updateRound(prev, roundNumber, (round) => ({
              ...round,
              candidates: [...(round.candidates || []), candidate],
              discussion: [
                ...(round.discussion || []),
                {
                  type: 'candidate',
                  character: candidate.character,
                  title: roundNumber > 1 ? 'Revised reply' : 'Candidate reply',
                  content: candidate.reply,
                },
              ],
            })),
            status: 'candidates',
          }));
        }

        if (event.type === 'round_complete') {
          const roundNumber = payload.round_number || 1;
          setLiveRound((prev) => ({
            ...updateRound(prev, roundNumber, () => payload.round),
            status: 'round_complete',
          }));
        }

        if (event.type === 'scoring_started') {
          const roundNumber = payload.round_number || DEFAULT_REVIEW_ROUNDS;
          setLiveRound((prev) => ({
            ...updateRound(prev, roundNumber, (round) => ({
              ...round,
              peer_scores: [],
              totals: [],
              winner: null,
            })),
            status: 'scoring',
          }));
        }

        if (event.type === 'score_ready') {
          const score = payload.score;
          const roundNumber = payload.round_number || DEFAULT_REVIEW_ROUNDS;
          setLiveRound((prev) => ({
            ...updateRound(prev, roundNumber, (round) => ({
              ...round,
              peer_scores: [...(round.peer_scores || []), score],
            })),
            status: 'scoring',
          }));
        }

        if (event.type === 'winner_selected') {
          const saved = conversationStore.addReply(
            conversation.id,
            payload.agent_round,
            payload.counselor_message,
            { model: selectedModel, agents: request.agents },
          );
          setLiveRound(payload.agent_round);
          setCurrentConversation(saved);
        }
      });
      setCurrentConversationId(conversation.id);
      refreshList();
    } catch (err) {
      setError(err.errors?.join(' ') || err.message || 'Failed to send message.');
      if (activeConversationId) {
        try {
          setCurrentConversation(conversationStore.get(activeConversationId));
          refreshList();
        } catch {
          // The conversation was never saved; keep what is on screen.
        }
      }
    } finally {
      setSending(false);
    }
  };

  // "What would this agent have said?" for a past round: made on request from
  // that round's own moment (the message it answered and the drafts), then kept.
  const handleRequestAlternate = async (roundId, character) => {
    const conversation = currentConversation;
    const round = conversation?.agent_rounds?.find((item) => item.id === roundId);
    const messages = conversation?.messages || [];
    const clientIndex = messages.findIndex((message) => message.id === round?.client_message_id);
    if (!round || clientIndex < 0) throw new Error('This reply can no longer be found.');
    const drafts = round.rounds?.[0]?.candidates || round.candidates || [];
    const result = await api.alternateReply({
      character,
      content: messages[clientIndex].content,
      model: model.trim() || 'gemini-2.5-flash',
      lang,
      agents: hasCompletePersonas ? toRequestAgents(visibleAgents) : conversation.config?.agents,
      history: historyFor({ messages: messages.slice(0, clientIndex) }),
      candidates: drafts.map(({ character: who, name, reply }) => ({ character: who, name, reply: String(reply ?? '') })),
    });
    const saved = conversationStore.addAlternate(conversation.id, roundId, character, result.reply);
    setCurrentConversation(saved);
    return result.reply;
  };

  const handleTouchStart = (event) => {
    const touch = event.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const handleTouchEnd = (event) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaY) > 80 || Math.abs(deltaX) < 70) return;

    if (mobileSidebarOpen && deltaX < 0) {
      setMobileSidebarOpen(false);
      return;
    }

    if (!mobileSidebarOpen && start.x < 28 && deltaX > 0) {
      setMobileSidebarOpen(true);
    }
  };

  if (showLanding) {
    return <LandingPage onEnter={enterApp} />;
  }

  if (needsPassword) {
    return <PasswordGate onUnlock={handleUnlock} />;
  }

  return (
    <div
      className={`app${mobileSidebarOpen ? ' sidebar-open' : ''}${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button
        className="mobile-history-toggle"
        type="button"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="履歴を開く"
      >
        履歴
      </button>
      <button
        className="mobile-sidebar-backdrop"
        type="button"
        onClick={() => setMobileSidebarOpen(false)}
        aria-label="Close history"
      />
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onGoHome={goToLanding}
        onCollapse={toggleSidebar}
      />
      <main className="main-content">
        <CounselingChat
          conversation={currentConversation}
          model={model}
          agents={visibleAgents}
          defaultAgents={localizedDefaultAgents}
          reviewRounds={reviewRounds}
          onModelChange={setModel}
          onAgentsChange={setAgents}
          onSendMessage={handleSendMessage}
          onGoHome={goToLanding}
          onRequestAlternate={handleRequestAlternate}
          isSidebarCollapsed={isSidebarCollapsed}
          onOpenSidebar={toggleSidebar}
          sending={sending}
          liveRound={liveRound}
          error={error}
        />
      </main>
    </div>
  );
}

export default App;
