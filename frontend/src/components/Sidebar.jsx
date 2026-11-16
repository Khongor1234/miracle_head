import { useLang } from '../LanguageContext';
import { AGENT_ORDER, agentAvatar } from '../agentAssets';
import './Sidebar.css';

export default function Sidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onGoHome,
  onCollapse,
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
        <button className="sidebar-collapse-btn" type="button" onClick={onCollapse} aria-label={s.collapseLabel} title={s.collapseLabel}>
          <span aria-hidden="true">‹</span>
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
            <span className="no-conversations-faces" aria-hidden="true">
              {AGENT_ORDER.map((character) => <img key={character} src={agentAvatar(character)} alt="" />)}
            </span>
            {s.emptyLine1}<br />{s.emptyLine2}
          </div>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`conversation-item ${conversation.id === currentConversationId ? 'active' : ''}`}
            >
              <button
                type="button"
                className="conversation-open"
                aria-current={conversation.id === currentConversationId ? 'true' : undefined}
                onClick={() => onSelectConversation(conversation.id)}
              >
                <span className="conversation-title">
                  {conversation.title || s.defaultTitle}
                </span>
                <span className="conversation-meta">
                  <span className={`status-dot ${conversation.status}`} />
                  {conversation.message_count ?? conversation.turn_count ?? 0} {s.messages}
                </span>
              </button>
              <button
                type="button"
                className="delete-session-btn"
                title={s.deleteLabel}
                aria-label={s.deleteLabel}
                onClick={() => onDeleteConversation(conversation.id)}
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
