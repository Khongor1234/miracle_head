import { useState, useEffect } from 'react';
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

  useEffect(() => {
    loadDebates();
  }, []);

  useEffect(() => {
    if (currentDebateId) {
      loadDebate(currentDebateId);
    }
  }, [currentDebateId]);

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
  };

  const handleDebateCreated = async (debate) => {
    // Add to sidebar immediately
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

    // Stream the debate
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
            });
            break;

          case 'turn_complete':
            setLoadingTurn(null);
            setCurrentDebate((prev) => ({
              ...prev,
              turns: [...(prev?.turns || []), event.turn],
            }));
            // Update sidebar turn count
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
            setCurrentDebate((prev) => ({ ...prev, status: 'completed' }));
            setDebates((prev) =>
              prev.map((d) =>
                d.id === debateId ? { ...d, status: 'completed' } : d
              )
            );
            setLoadingTurn(null);
            break;

          case 'error':
            console.error('Debate error:', event.message);
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
        <p>Select a debate from the sidebar or start a new one.</p>
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
      />
      {renderMain()}
    </div>
  );
}

export default App;
