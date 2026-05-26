import './Sidebar.css';

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            <img src="/llm_debate.jpg" alt="Counseling Dialogue" className="sidebar-brand-img" />
          </div>
          <span className="sidebar-brand-name">Counselor</span>
        </div>
        <button className="new-conversation-btn" onClick={onNewConversation}>
          <span className="new-btn-icon">+</span>
          New Session
        </button>
      </div>

      {conversations.length > 0 && (
        <div className="sidebar-section-label">History</div>
      )}

      <div className="conversation-list">
        {conversations.length === 0 ? (
          <div className="no-conversations">No sessions yet.<br />Start one above.</div>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`conversation-item ${conversation.id === currentConversationId ? 'active' : ''}`}
              onClick={() => onSelectConversation(conversation.id)}
            >
              <div className="conversation-title">
                {conversation.title || 'New counseling session'}
              </div>
              <div className="conversation-meta">
                <span className={`status-dot ${conversation.status}`} />
                {conversation.message_count ?? conversation.turn_count ?? 0} messages
              </div>
              <button
                className="delete-session-btn"
                title="Delete session"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteConversation(conversation.id);
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
