/**
 * Conversations kept in the visitor's own browser (localStorage), so the
 * backend needs no database. Every update returns a new object; nothing is
 * mutated in place.
 */

const STORAGE_KEY = 'miracle_head_conversations_v1';
const DEFAULT_TITLE = 'New session';
const MAX_TITLE_LENGTH = 40;
const MAX_CONVERSATIONS = 30;
// The panel only shows the latest round; older ones are kept for a while only.
const MAX_ROUNDS_PER_CONVERSATION = 5;
// What the backend accepts as context for the next reply.
export const MAX_HISTORY_MESSAGES = 40;

const nowIso = () => new Date().toISOString();

const newId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // Blocked storage (private mode, disabled cookies).
  }
}

function readAll(storage) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === 'string') : [];
  } catch {
    return [];
  }
}

function writeAll(storage, conversations) {
  if (!storage) return;
  let remaining = conversations.slice(0, MAX_CONVERSATIONS);
  // When the browser quota is full, drop the oldest conversations and retry.
  for (;;) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(remaining));
      return;
    } catch (err) {
      if (remaining.length <= 1) {
        console.error('Could not save the conversation in this browser:', err);
        return;
      }
      remaining = remaining.slice(0, -1);
    }
  }
}

const summarise = (conversation) => ({
  id: conversation.id,
  created_at: conversation.created_at,
  updated_at: conversation.updated_at,
  title: conversation.title,
  message_count: conversation.messages.length,
  status: conversation.status,
});

const titleFrom = (content) => {
  const text = String(content || '').trim().replace(/\s+/g, ' ');
  return text.slice(0, MAX_TITLE_LENGTH) || DEFAULT_TITLE;
};

export function createConversationStore(storage = defaultStorage()) {
  // Saves `updater(conversation)` as the newest entry and returns it.
  const update = (id, updater) => {
    const all = readAll(storage);
    const current = all.find((item) => item.id === id);
    if (!current) throw new Error('Conversation not found.');
    const next = { ...updater(current), updated_at: nowIso() };
    writeAll(storage, [next, ...all.filter((item) => item.id !== id)]);
    return next;
  };

  return {
    list() {
      return readAll(storage)
        .slice()
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .map(summarise);
    },

    get(id) {
      const conversation = readAll(storage).find((item) => item.id === id);
      if (!conversation) throw new Error('Conversation not found.');
      return conversation;
    },

    create(config = {}) {
      const now = nowIso();
      const conversation = {
        id: newId(),
        created_at: now,
        updated_at: now,
        title: DEFAULT_TITLE,
        config,
        messages: [],
        agent_rounds: [],
        status: 'active',
      };
      writeAll(storage, [conversation, ...readAll(storage)]);
      return conversation;
    },

    remove(id) {
      writeAll(storage, readAll(storage).filter((item) => item.id !== id));
    },

    addClientMessage(id, message) {
      return update(id, (conversation) => ({
        ...conversation,
        title: conversation.title === DEFAULT_TITLE ? titleFrom(message.content) : conversation.title,
        messages: [...conversation.messages, message],
      }));
    },

    addReply(id, agentRound, counselorMessage, config = {}) {
      return update(id, (conversation) => ({
        ...conversation,
        config: { ...conversation.config, ...config },
        messages: [...conversation.messages, counselorMessage],
        agent_rounds: [...conversation.agent_rounds, agentRound].slice(-MAX_ROUNDS_PER_CONVERSATION),
      }));
    },
  };
}

/** The visible dialogue the backend needs as context, oldest first. */
export function historyFor(conversation) {
  return (conversation?.messages || [])
    .filter((message) => message.role === 'client' || message.role === 'counselor')
    .map((message) => ({ role: message.role, content: String(message.content || '') }))
    .slice(-MAX_HISTORY_MESSAGES);
}
