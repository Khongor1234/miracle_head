import './Sidebar.css';

export default function Sidebar({
  debates,
  currentDebateId,
  onSelectDebate,
  onNewDebate,
  onDeleteDebate,
}) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            <img src="/llm_debate.jpg" alt="LLM Debate" className="sidebar-brand-img" />
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
                {debate.turn_count} messages
              </div>
              <button
                className="delete-debate-btn"
                title="Delete debate"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteDebate(debate.id);
                }}
              >
                &#x2715;
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
