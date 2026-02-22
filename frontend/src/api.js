/**
 * API client for the LLM Debate backend.
 */

const API_BASE = 'http://localhost:8001';

export const api = {
  /**
   * List all debates.
   */
  async listConversations() {
    const response = await fetch(`${API_BASE}/api/conversations`);
    if (!response.ok) {
      throw new Error('Failed to list debates');
    }
    return response.json();
  },

  /**
   * Get a specific debate.
   */
  async getConversation(debateId) {
    const response = await fetch(`${API_BASE}/api/conversations/${debateId}`);
    if (!response.ok) {
      throw new Error('Failed to get debate');
    }
    return response.json();
  },

  /**
   * Generate two opposing POVs for a topic.
   * @param {string} topic
   * @param {string} keywords - optional keywords/phrases
   */
  async generatePOVs(topic, keywords = '') {
    const response = await fetch(`${API_BASE}/api/generate-povs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, keywords }),
    });
    if (!response.ok) {
      throw new Error('Failed to generate POVs');
    }
    return response.json();
  },

  /**
   * Create a new debate.
   * @param {object} config - debate config
   * @returns {Promise<object>} debate object, or throws with {errors} on 400
   */
  async createDebate(config) {
    const response = await fetch(`${API_BASE}/api/debates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (response.status === 400) {
      const data = await response.json();
      const err = new Error('Invalid model(s)');
      err.errors = data.detail?.errors || [data.detail];
      throw err;
    }
    if (!response.ok) {
      throw new Error('Failed to create debate');
    }
    return response.json();
  },

  /**
   * Start a debate and stream turns via SSE.
   * @param {string} debateId
   * @param {function} onEvent - callback (eventType, eventData)
   */
  async startDebateStream(debateId, onEvent) {
    const response = await fetch(`${API_BASE}/api/debates/${debateId}/start`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to start debate');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            onEvent(event.type, event);
          } catch (e) {
            console.error('Failed to parse SSE event:', e);
          }
        }
      }
    }
  },
};
