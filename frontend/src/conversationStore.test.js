import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConversationStore, historyFor, MAX_HISTORY_MESSAGES } from './conversationStore.js';

function memoryStorage({ quota = Infinity } = {}) {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      if (value.length > quota) throw new Error('QuotaExceededError');
      data.set(key, value);
    },
  };
}

const clientMessage = (content) => ({ id: `c-${content}`, role: 'client', content, created_at: '2026-11-16T00:00:00.000Z' });

test('creates, lists and reads back a conversation', () => {
  const store = createConversationStore(memoryStorage());

  const created = store.create({ model: 'gemini-2.5-flash' });

  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].id, created.id);
  assert.deepEqual(store.get(created.id).config, { model: 'gemini-2.5-flash' });
});

test('the first client message names the conversation', () => {
  const store = createConversationStore(memoryStorage());
  const { id } = store.create();

  store.addClientMessage(id, clientMessage('I feel   tired at work'));
  store.addClientMessage(id, clientMessage('second message'));

  assert.equal(store.get(id).title, 'I feel tired at work');
  assert.equal(store.list()[0].message_count, 2);
});

test('adding a reply does not mutate the conversation passed in earlier', () => {
  const store = createConversationStore(memoryStorage());
  const { id } = store.create();
  const before = store.addClientMessage(id, clientMessage('hello'));

  const after = store.addReply(id, { id: 'round-1' }, { id: 'r-1', role: 'counselor', content: 'hi' }, { model: 'm' });

  assert.equal(before.messages.length, 1);
  assert.equal(after.messages.length, 2);
  assert.equal(after.agent_rounds.length, 1);
  assert.equal(after.config.model, 'm');
});

test('keeps only the five most recent agent rounds', () => {
  const store = createConversationStore(memoryStorage());
  const { id } = store.create();

  for (let i = 0; i < 8; i += 1) store.addReply(id, { id: `round-${i}` }, { id: `r-${i}`, role: 'counselor', content: 'x' });

  assert.deepEqual(store.get(id).agent_rounds.map((r) => r.id), ['round-3', 'round-4', 'round-5', 'round-6', 'round-7']);
});

test('keeps an alternate reply on its round without touching other rounds', () => {
  const store = createConversationStore(memoryStorage());
  const { id } = store.create();
  store.addReply(id, { id: 'round-a' }, { id: 'r-a', role: 'counselor', content: 'x' });
  store.addReply(id, { id: 'round-b' }, { id: 'r-b', role: 'counselor', content: 'y' });

  store.addAlternate(id, 'round-a', 'Fear', 'fear reply');
  const saved = store.addAlternate(id, 'round-a', 'Joy', 'joy reply');

  assert.deepEqual(saved.agent_rounds[0].alternates, { Fear: 'fear reply', Joy: 'joy reply' });
  assert.equal(saved.agent_rounds[1].alternates, undefined);
});

test('removes a conversation', () => {
  const store = createConversationStore(memoryStorage());
  const { id } = store.create();

  store.remove(id);

  assert.equal(store.list().length, 0);
  assert.throws(() => store.get(id), /not found/);
});

test('drops the oldest conversations when the browser quota is full', () => {
  const storage = memoryStorage({ quota: 700 });
  const store = createConversationStore(storage);
  const ids = Array.from({ length: 6 }, () => store.create().id);

  const kept = store.list().map((item) => item.id);

  assert.ok(kept.length < ids.length);
  assert.equal(kept[0], ids[ids.length - 1]);
});

test('returns an empty list when stored data is corrupt or storage is blocked', () => {
  const storage = memoryStorage();
  storage.setItem('miracle_head_conversations_v1', '{not json');

  assert.deepEqual(createConversationStore(storage).list(), []);
  assert.deepEqual(createConversationStore(null).list(), []);
});

test('history keeps only client and counselor messages, capped to the backend limit', () => {
  const messages = Array.from({ length: MAX_HISTORY_MESSAGES + 5 }, (_, i) => ({
    role: i % 2 ? 'counselor' : 'client', content: `m${i}`, id: String(i),
  }));

  const history = historyFor({ messages: [{ role: 'system', content: 'x' }, ...messages] });

  assert.equal(history.length, MAX_HISTORY_MESSAGES);
  assert.deepEqual(Object.keys(history[0]), ['role', 'content']);
  assert.equal(history.at(-1).content, `m${MAX_HISTORY_MESSAGES + 4}`);
});
