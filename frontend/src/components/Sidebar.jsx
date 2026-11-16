import { useLang } from '../LanguageContext';
import './Sidebar.css';

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onGoHome,
}) {
  const { t } = useLang();
  const s = t.sidebar;

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button className="sidebar-brand sidebar-home" type="button" onClick={onGoHome} aria-label={t.chat.homeAria}>
          <span className="sidebar-brand-name">Miracle Head</span>
          <span className="sidebar-home-hint" aria-hidden="true">{t.chat.homeLabel}</span>
        </button>
        <button className="new-conversation-btn" onClick={onNewConversation}>
          <span className="new-btn-icon">+</span>
          {s.newBtn}
        </button>
      </div>

      {conversations.length > 0 && (
        <div className="sidebar-section-label">{s.historyLabel}</div>
      )}

      <div className="conversation-list">
        {conversations.length === 0 ? (
          <div className="no-conversations">
            {s.emptyLine1}<br />{s.emptyLine2}
          </div>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`conversation-item ${conversation.id === currentConversationId ? 'active' : ''}`}
              onClick={() => onSelectConversation(conversation.id)}
            >
              <div className="conversation-title">
                {conversation.title || s.defaultTitle}
              </div>
              <div className="conversation-meta">
                <span className={`status-dot ${conversation.status}`} />
                {conversation.message_count ?? conversation.turn_count ?? 0} {s.messages}
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
