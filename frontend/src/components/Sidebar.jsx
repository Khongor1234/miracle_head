import './Sidebar.css';

export default function Sidebar({
  debates,
  currentDebateId,
  onSelectDebate,
  onNewDebate,
}) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>LLM Debate</h1>
        <button className="new-conversation-btn" onClick={onNewDebate}>
          + New Debate
        </button>
      </div>

      <div className="conversation-list">
        {debates.length === 0 ? (
          <div className="no-conversations">No debates yet</div>
        ) : (
          debates.map((debate) => (
            <div
              key={debate.id}
              className={`conversation-item ${
                debate.id === currentDebateId ? 'active' : ''
              }`}
              onClick={() => onSelectDebate(debate.id)}
            >
              <div className="conversation-title">
                {debate.title || 'New Debate'}
              </div>
              <div className="conversation-meta">
                {debate.turn_count} turns &middot; {debate.status}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
