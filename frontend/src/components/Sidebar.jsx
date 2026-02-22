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
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="6.5" width="5" height="1" rx="0.5" fill="white" opacity="0.9"/>
              <rect x="8" y="6.5" width="5" height="1" rx="0.5" fill="white" opacity="0.9"/>
              <circle cx="7" cy="7" r="1.5" fill="white"/>
            </svg>
          </div>
          <span className="sidebar-brand-name">LLM Debate</span>
        </div>
        <button className="new-conversation-btn" onClick={onNewDebate}>
          <span className="new-btn-icon">+</span>
          New Debate
        </button>
      </div>

      {debates.length > 0 && (
        <div className="sidebar-section-label">History</div>
      )}

      <div className="conversation-list">
        {debates.length === 0 ? (
          <div className="no-conversations">No debates yet.<br />Start one above.</div>
        ) : (
          debates.map((debate) => (
            <div
              key={debate.id}
              className={`conversation-item ${debate.id === currentDebateId ? 'active' : ''}`}
              onClick={() => onSelectDebate(debate.id)}
            >
              <div className="conversation-title">
                {debate.title || 'New Debate'}
              </div>
              <div className="conversation-meta">
                <span className={`status-dot ${debate.status}`} />
                {debate.turn_count} turns
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
