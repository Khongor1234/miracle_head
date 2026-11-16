import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localizeAgents, localizeDefaults, personaFor, toRequestAgents } from './personaLanguage.js';

const defaults = [
  { character: 'Joy', name: 'ヨロコビ', name_en: 'Joy', persona: 'JA joy', persona_en: 'EN joy' },
  { character: 'Fear', name: 'ビビリ', name_en: 'Fear', persona: 'JA fear', persona_en: 'EN fear' },
];

test('picks the English persona only in English, falling back to Japanese', () => {
  assert.equal(personaFor(defaults[0], 'en'), 'EN joy');
  assert.equal(personaFor(defaults[0], 'ja'), 'JA joy');
  assert.equal(personaFor({ persona: 'only JA' }, 'en'), 'only JA');
});

test('localized defaults carry the language of the interface', () => {
  assert.deepEqual(localizeDefaults(defaults, 'en').map((a) => a.persona), ['EN joy', 'EN fear']);
});

test('switching language swaps stock personas but keeps edited ones', () => {
  const agents = [
    { character: 'Joy', persona: 'JA joy' },
    { character: 'Fear', persona: 'My own words for Fear' },
  ];

  const english = localizeAgents(agents, defaults, 'en');
  const backToJapanese = localizeAgents(english, defaults, 'ja');

  assert.deepEqual(english.map((a) => a.persona), ['EN joy', 'My own words for Fear']);
  assert.deepEqual(backToJapanese.map((a) => a.persona), ['JA joy', 'My own words for Fear']);
});

test('does not mutate the agents passed in', () => {
  const agents = [{ character: 'Joy', persona: 'JA joy' }];

  localizeAgents(agents, defaults, 'en');

  assert.equal(agents[0].persona, 'JA joy');
});

test('agents unknown to the defaults are kept as they are', () => {
  assert.deepEqual(localizeAgents([{ character: 'Other', persona: 'x' }], defaults, 'en'), [{ character: 'Other', persona: 'x' }]);
});

test('request agents carry only the fields the backend accepts', () => {
  assert.deepEqual(toRequestAgents(defaults.slice(0, 1)), [{ character: 'Joy', name: 'ヨロコビ', persona: 'JA joy' }]);
});
