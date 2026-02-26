import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import DebateSetup from './components/DebateSetup';
import DebateView from './components/DebateView';
import { api } from './api';
import './App.css';

function App() {
  const [debates, setDebates] = useState([]);
  const [currentDebateId, setCurrentDebateId] = useState(null);
  const [currentDebate, setCurrentDebate] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  // loadingTurn: { speaker, speaker_name, turn_number } | null
  const [loadingTurn, setLoadingTurn] = useState(null);

  // Token streaming buffer: accumulate tokens in a ref and flush to state
  // on a throttled interval so bursts of tokens still render progressively.
  const tokenBuffer = useRef('');
  const tokenTurn = useRef(null);
  const lastFlushTime = useRef(0);
  const flushTimerId = useRef(null);

  const flushTokens = useCallback(() => {
    const text = tokenBuffer.current;
    const turnNum = tokenTurn.current;
    if (text && turnNum !== null) {
      tokenBuffer.current = '';
      lastFlushTime.current = performance.now();
      setCurrentDebate((prev) => {
        if (!prev) return prev;
        const turns = [...(prev.turns || [])];
        const lastIdx = turns.length - 1;
        if (lastIdx >= 0 && (turns[lastIdx].msg_index || turns[lastIdx].turn_number) === turnNum) {
          turns[lastIdx] = {
            ...turns[lastIdx],
            content: turns[lastIdx].content + text,
          };
        }
        return { ...prev, turns };
      });
    }
  }, []);

  const appendToken = useCallback((token) => {
    tokenBuffer.current += token;
    const now = performance.now();
    const elapsed = now - lastFlushTime.current;
    // Flush every ~150ms OR when buffer has accumulated enough content.
    // A longer interval (150ms vs 30ms) is critical because each flush
    // triggers a React re-render, and ReactMarkdown re-parses the entire
    // content string on every render. At 30ms intervals with per-token
    // flushes, ReactMarkdown blocks the main thread so heavily that the
    // browser never paints intermediate states.
    if (elapsed >= 150 || tokenBuffer.current.length >= 200) {
      if (flushTimerId.current) {
        clearTimeout(flushTimerId.current);
        flushTimerId.current = null;
      }
      flushTokens();
    } else if (!flushTimerId.current) {
      // Schedule a flush for when the interval elapses
      flushTimerId.current = setTimeout(() => {
        flushTimerId.current = null;
        flushTokens();
      }, 150 - elapsed);
    }
  }, [flushTokens]);

  const stopTokenFlushing = useCallback(() => {
    if (flushTimerId.current) {
      clearTimeout(flushTimerId.current);
      flushTimerId.current = null;
    }
    // Final flush of any remaining tokens
    flushTokens();
    tokenTurn.current = null;
  }, [flushTokens]);

  useEffect(() => {
    loadDebates();
  }, []);

  // NOTE: Do NOT auto-load debate when currentDebateId changes.
  // handleDebateCreated sets currentDebateId for sidebar highlighting
  // while streaming is active. An auto-load here would race with the
  // SSE stream, replacing the in-progress turns with a stale API fetch
  // and wiping out all streamed content. Instead, loadDebate is called
  // explicitly in handleSelectDebate.

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (flushTimerId.current) clearTimeout(flushTimerId.current);
    };
  }, []);

  const loadDebates = async () => {
    try {
      const list = await api.listConversations();
      setDebates(list);
    } catch (error) {
      console.error('Failed to load debates:', error);
    }
  };

  const loadDebate = async (id) => {
    try {
      const debate = await api.getConversation(id);
      setCurrentDebate(debate);
    } catch (error) {
      console.error('Failed to load debate:', error);
    }
  };

  const handleNewDebate = () => {
    setCurrentDebateId(null);
    setCurrentDebate(null);
    setShowSetup(true);
    setLoadingTurn(null);
  };

  const handleSelectDebate = (id) => {
    setShowSetup(false);
    setLoadingTurn(null);
    setCurrentDebateId(id);
    loadDebate(id);
  };

  const handleDeleteDebate = async (id) => {
    try {
      await api.deleteDebate(id);
      setDebates((prev) => prev.filter((d) => d.id !== id));
      if (currentDebateId === id) {
        setCurrentDebateId(null);
        setCurrentDebate(null);
      }
    } catch (error) {
      console.error('Failed to delete debate:', error);
    }
  };

  const handleDebateCreated = async (debate) => {
    setDebates((prev) => [
      {
        id: debate.id,
        created_at: debate.created_at,
        title: debate.title,
        turn_count: 0,
        status: debate.status,
      },
      ...prev,
    ]);

    setCurrentDebate({ ...debate, turns: [] });
    setCurrentDebateId(debate.id);
    setShowSetup(false);

    await streamDebate(debate.id, debate);
  };

  const streamDebate = async (debateId, initialDebate) => {
    try {
      await api.startDebateStream(debateId, (eventType, event) => {
        switch (eventType) {
          case 'debate_start':
            setCurrentDebate((prev) => ({ ...prev, status: 'in_progress' }));
            break;

          case 'turn_start':
            setLoadingTurn({
              speaker: event.speaker,
              speaker_name: event.speaker_name,
              turn_number: event.turn_number,
              msg_index: event.msg_index,
            });
            // Reset buffer for new turn
            tokenBuffer.current = '';
            tokenTurn.current = event.msg_index || event.turn_number;
            lastFlushTime.current = performance.now();
            // Append an empty turn so it renders progressively
            setCurrentDebate((prev) => ({
              ...prev,
              turns: [
                ...(prev?.turns || []),
                {
                  speaker: event.speaker,
                  speaker_name: event.speaker_name,
                  turn_number: event.turn_number,
                  msg_index: event.msg_index,
                  content: '',
                },
              ],
            }));
            break;

          case 'token':
            appendToken(event.token);
            break;

          case 'turn_complete':
            // Flush any remaining buffered tokens
            stopTokenFlushing();
            setLoadingTurn(null);
            // Merge server turn with streamed content (keep streamed content
            // so the progressive rendering isn't overwritten in one frame)
            setCurrentDebate((prev) => {
              if (!prev) return prev;
              const msgIdx = event.turn.msg_index || event.turn.turn_number;
              const existing = (prev.turns || []).find(
                (t) => (t.msg_index || t.turn_number) === msgIdx
              );
              if (existing) {
                const turns = (prev.turns || []).map((t) =>
                  (t.msg_index || t.turn_number) === msgIdx
                    ? { ...event.turn, content: existing.content || event.turn.content }
                    : t
                );
                return { ...prev, turns };
              }
              return { ...prev, turns: [...(prev.turns || []), event.turn] };
            });
            setDebates((prev) =>
              prev.map((d) =>
                d.id === debateId
                  ? { ...d, turn_count: (d.turn_count || 0) + 1 }
                  : d
              )
            );
            break;

          case 'turn_error':
            console.error('Turn error:', event.message);
            stopTokenFlushing();
            // Remove the empty in-progress turn
            setCurrentDebate((prev) => {
              if (!prev) return prev;
              const msgIdx = event.msg_index || event.turn_number;
              const turns = (prev.turns || []).filter(
                (t) => (t.msg_index || t.turn_number) !== msgIdx
              );
              return { ...prev, turns };
            });
            setLoadingTurn(null);
            break;

          case 'title_complete':
            setCurrentDebate((prev) => ({ ...prev, title: event.title }));
            setDebates((prev) =>
              prev.map((d) =>
                d.id === debateId ? { ...d, title: event.title } : d
              )
            );
            break;

          case 'debate_complete':
            stopTokenFlushing();
            setCurrentDebate((prev) => ({ ...prev, status: 'completed' }));
            setDebates((prev) =>
              prev.map((d) =>
                d.id === debateId ? { ...d, status: 'completed' } : d
              )
            );
            setLoadingTurn(null);
            // Auto-judge if a judge model is configured
            setCurrentDebate((prev) => {
              if (prev?.config?.judge_model) {
                api.judgeDebate(debateId).then((result) => {
                  setCurrentDebate((d) => d ? { ...d, judge_result: result } : d);
                }).catch((err) => {
                  console.error('Auto-judgment failed:', err);
                });
              }
              return prev;
            });
            break;

          case 'error':
            console.error('Debate error:', event.message);
            stopTokenFlushing();
            setCurrentDebate((prev) => ({ ...prev, status: 'error' }));
            setDebates((prev) =>
              prev.map((d) =>
                d.id === debateId ? { ...d, status: 'error' } : d
              )
            );
            setLoadingTurn(null);
            break;

          default:
            console.log('Unknown event:', eventType);
        }
      });
    } catch (error) {
      console.error('Failed to stream debate:', error);
      stopTokenFlushing();
      setLoadingTurn(null);
    }
  };

  const renderMain = () => {
    if (showSetup) {
      return <DebateSetup onDebateCreated={handleDebateCreated} />;
    }
    if (currentDebate) {
      return <DebateView debate={currentDebate} loadingTurn={loadingTurn} />;
    }
    return (
      <div className="empty-state">
        <div className="empty-state-emblem">
          <div className="empty-state-dot empty-state-dot-a" />
          <div className="empty-state-divider" />
          <div className="empty-state-dot empty-state-dot-b" />
        </div>
        <p>Select a debate or start a new one.</p>
      </div>
    );
  };

  return (
    <div className="app">
      <Sidebar
        debates={debates}
        currentDebateId={currentDebateId}
        onSelectDebate={handleSelectDebate}
        onNewDebate={handleNewDebate}
        onDeleteDebate={handleDeleteDebate}
      />
      <main className="main-content">
        {renderMain()}
      </main>
    </div>
  );
}

export default App;
