/**
 * API client for the counseling dialogue backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';

const BASE_HEADERS = {
  'ngrok-skip-browser-warning': '1',
};

async function parseError(response, fallback) {
  const data = await response.json().catch(() => ({}));
  const err = new Error(data.detail || fallback);
  err.errors = data.detail?.errors || [data.detail || fallback];
  return err;
}

export const api = {
  async getSettings() {
    const response = await fetch(`${API_BASE}/api/settings`, { headers: BASE_HEADERS });
    if (!response.ok) throw new Error('Failed to load settings');
    return response.json();
  },

  async listConversations() {
    const response = await fetch(`${API_BASE}/api/conversations`, { headers: BASE_HEADERS });
    if (!response.ok) throw new Error('Failed to list conversations');
    return response.json();
  },

  async createConversation(config = {}) {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw await parseError(response, 'Failed to create conversation');
    return response.json();
  },

  async getConversation(conversationId) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, { headers: BASE_HEADERS });
    if (!response.ok) throw new Error('Failed to get conversation');
    return response.json();
  },

  async deleteConversation(conversationId) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: BASE_HEADERS,
    });
    if (!response.ok) throw new Error('Failed to delete conversation');
  },

  async sendMessage(conversationId, content) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) throw await parseError(response, 'Failed to send message');
    return response.json();
  },

  async sendMessageStream(conversationId, content, onEvent) {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages/stream`, {
      method: 'POST',
      headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) throw await parseError(response, 'Failed to send message');
    if (!response.body) throw new Error('Streaming is not supported by this browser.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = JSON.parse(trimmed);
      onEvent(event);
      if (event.type === 'error') {
        throw new Error(event.payload?.message || 'Counseling round failed.');
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) processLine(line);
      if (done) break;
    }

    if (buffer.trim()) processLine(buffer);
  },
};
