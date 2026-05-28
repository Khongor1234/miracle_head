import { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import CounselingChat from './components/CounselingChat';
import LandingPage from './components/LandingPage';
import { api } from './api';
import './App.css';

const cloneAgents = (agents = []) => agents.map((agent) => ({ ...agent }));
const DEFAULT_REVIEW_ROUNDS = 2;

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
  const [showLanding, setShowLanding] = useState(true);
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
  const touchStartRef = useRef(null);

  const refreshList = async () => {
    const list = await api.listConversations();
    setConversations(list);
  };

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
    api.listConversations()
      .then((list) => {
        if (active) setConversations(list);
      })
      .catch((err) => console.error('Failed to load conversations:', err));
    return () => {
      active = false;
    };
  }, []);

  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setCurrentConversation(null);
    setAgents(cloneAgents(defaultAgents));
    setReviewRounds(DEFAULT_REVIEW_ROUNDS);
    setLiveRound(null);
    setError('');
    setMobileSidebarOpen(false);
  };

  const handleSelectConversation = async (id) => {
    setError('');
    setCurrentConversationId(id);
    try {
      const conversation = await api.getConversation(id);
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

  const handleDeleteConversation = async (id) => {
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((item) => item.id !== id));
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setCurrentConversation(null);
        setAgents(cloneAgents(defaultAgents));
        setReviewRounds(DEFAULT_REVIEW_ROUNDS);
        setLiveRound(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to delete conversation.');
    }
  };

  const ensureConversation = async () => {
    if (currentConversation) return currentConversation;
    const sessionAgents = agents.length ? agents : defaultAgents;
    const config = {
      model: model.trim() || 'gemini-2.5-flash',
      review_rounds: reviewRounds,
    };
    if (sessionAgents.length === 5 && sessionAgents.every((agent) => agent.persona?.trim())) {
      config.agents = sessionAgents;
    }
    const conversation = await api.createConversation(config);
    setCurrentConversation(conversation);
    setCurrentConversationId(conversation.id);
    setConversations((prev) => [
      {
        id: conversation.id,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        title: conversation.title,
        message_count: 0,
        status: conversation.status,
      },
      ...prev,
    ]);
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
      const conversation = await ensureConversation();
      activeConversationId = conversation.id;
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

      await api.sendMessageStream(conversation.id, content, selectedModel, (event) => {
        const payload = event.payload || {};

        if (event.type === 'client_message') {
          const clientMessage = payload.client_message;
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
          setLiveRound(payload.agent_round);
          setCurrentConversation(payload.conversation);
          if (payload.conversation?.config?.model) setModel(payload.conversation.config.model);
        }
      }, lang);
      setCurrentConversationId(conversation.id);
      await refreshList();
    } catch (err) {
      setError(err.errors?.join(' ') || err.message || 'Failed to send message.');
      if (activeConversationId) {
        const fresh = await api.getConversation(activeConversationId).catch(() => null);
        if (fresh) setCurrentConversation(fresh);
      }
    } finally {
      setSending(false);
    }
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
    return <LandingPage onEnter={() => setShowLanding(false)} />;
  }

  return (
    <div
      className={`app ${mobileSidebarOpen ? 'sidebar-open' : ''}`}
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
      />
      <main className="main-content">
        <CounselingChat
          conversation={currentConversation}
          model={model}
          agents={agents}
          defaultAgents={defaultAgents}
          reviewRounds={reviewRounds}
          onModelChange={setModel}
          onAgentsChange={setAgents}
          onSendMessage={handleSendMessage}
          sending={sending}
          liveRound={liveRound}
          error={error}
        />
      </main>
    </div>
  );
}

export default App;
