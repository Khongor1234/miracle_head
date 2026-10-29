/**
 * API client for the counseling dialogue backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';
const PASSWORD_STORAGE_KEY = 'miracle_head_password';
const VISITOR_STORAGE_KEY = 'miracle_head_visitor_id';

const BASE_HEADERS = {
  'ngrok-skip-browser-warning': '1',
};

export class UnauthorizedError extends Error {
  constructor() {
    super('Password required');
    this.name = 'UnauthorizedError';
  }
}

function readStoredPassword() {
  try {
    return localStorage.getItem(PASSWORD_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

let password = readStoredPassword();

function newVisitorId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Random id kept in this browser; the server shows each visitor only their own conversations. */
function loadVisitorId() {
  try {
    const stored = localStorage.getItem(VISITOR_STORAGE_KEY);
    if (stored) return stored;
    const created = newVisitorId();
    localStorage.setItem(VISITOR_STORAGE_KEY, created);
    return created;
  } catch {
    // Private mode: conversations stay visible for this tab only.
    return newVisitorId();
  }
}

const visitorId = loadVisitorId();
const unauthorizedListeners = new Set();

export function setPassword(value) {
  password = value;
  try {
    localStorage.setItem(PASSWORD_STORAGE_KEY, value);
  } catch {
    // Private mode: the password lasts for this tab only.
  }
}

function clearPassword() {
  password = '';
  try {
    localStorage.removeItem(PASSWORD_STORAGE_KEY);
  } catch {
    // Nothing stored to clear.
  }
}

/** Subscribe to "the server rejected our password"; returns an unsubscribe function. */
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

async function request(path, options = {}) {
  const headers = {
    ...BASE_HEADERS,
    'X-Visitor-Id': visitorId,
    ...(password ? { 'X-App-Password': password } : {}),
    ...options.headers,
  };
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 401) {
    clearPassword();
    unauthorizedListeners.forEach((listener) => listener());
    throw new UnauthorizedError();
  }
  return response;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function parseError(response, fallback) {
  const data = await response.json().catch(() => ({}));
  const err = new Error(data.detail || fallback);
  err.errors = data.detail?.errors || [data.detail || fallback];
  return err;
}

export const api = {
  async getSettings() {
    const response = await request('/api/settings');
    if (!response.ok) throw new Error('Failed to load settings');
    return response.json();
  },

  async listConversations() {
    const response = await request('/api/conversations');
    if (!response.ok) throw new Error('Failed to list conversations');
    return response.json();
  },

  async createConversation(config = {}) {
    const response = await request('/api/conversations', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(config),
    });
    if (!response.ok) throw await parseError(response, 'Failed to create conversation');
    return response.json();
  },

  async getConversation(conversationId) {
    const response = await request(`/api/conversations/${conversationId}`);
    if (!response.ok) throw new Error('Failed to get conversation');
    return response.json();
  },

  async deleteConversation(conversationId) {
    const response = await request(`/api/conversations/${conversationId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete conversation');
  },

  async sendMessage(conversationId, content, model, lang = 'ja') {
    const response = await request(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ content, model, lang }),
    });
    if (!response.ok) throw await parseError(response, 'Failed to send message');
    return response.json();
  },

  async tts(text, character) {
    const response = await request('/api/tts', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ text, character }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => response.text());
      console.error('TTS backend error:', response.status, detail);
      throw new Error(typeof detail === 'object' ? JSON.stringify(detail) : detail);
    }
    return response.blob();
  },

  async sendMessageStream(conversationId, content, model, onEvent, lang = 'ja') {
    const response = await request(`/api/conversations/${conversationId}/messages/stream`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ content, model, lang }),
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
