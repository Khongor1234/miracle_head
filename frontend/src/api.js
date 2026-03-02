/**
 * API client for the LLM Debate backend.
 */

const API_BASE = 'http://localhost:8001';

export const api = {
  /**
   * List all debates.
   */
  async listConversations() {
    const response = await fetch(`${API_BASE}/api/debates`);
    if (!response.ok) {
      throw new Error('Failed to list debates');
    }
    return response.json();
  },

  /**
   * Get a specific debate.
   */
  async getConversation(debateId) {
    const response = await fetch(`${API_BASE}/api/debates/${debateId}`);
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
   * Run the configured judge model on a completed debate.
   * @param {string} debateId
   */
  async judgeDebate(debateId) {
    const response = await fetch(`${API_BASE}/api/debates/${debateId}/judge`, {
      method: 'POST',
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || 'Failed to run judge');
    }
    return response.json();
  },

  /**
   * Delete a debate.
   * @param {string} debateId
   */
  async deleteDebate(debateId) {
    const response = await fetch(`${API_BASE}/api/debates/${debateId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete debate');
    }
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
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() || '';

      let tokenCount = 0;
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            onEvent(event.type, event);
            // Yield control periodically during token bursts so the
            // browser can render progressive updates. Yielding every 4
            // tokens (down from 8) gives React more opportunities to
            // paint flushed content between bursts.
            if (event.type === 'token') {
              tokenCount++;
              if (tokenCount >= 4) {
                tokenCount = 0;
                await new Promise((r) => setTimeout(r, 0));
              }
            }
          } catch (e) {
            console.error('Failed to parse SSE event:', e);
          }
        }
      }
    }
  },
};
