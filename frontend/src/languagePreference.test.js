import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialLanguage, languageFromBrowser } from './languagePreference.js';

test('a saved choice wins over the browser', () => {
  assert.equal(initialLanguage({ saved: 'en', browserLanguages: ['ja-JP'] }), 'en');
  assert.equal(initialLanguage({ saved: 'ja', browserLanguages: ['en-US'] }), 'ja');
});

test('without a saved choice, Japanese browsers get Japanese and others English', () => {
  assert.equal(initialLanguage({ browserLanguages: ['ja-JP', 'en'] }), 'ja');
  assert.equal(initialLanguage({ browserLanguages: ['en-US'] }), 'en');
  assert.equal(initialLanguage({ browserLanguages: ['mn-MN', 'ja'] }), 'en');
});

test('an unknown saved value is ignored', () => {
  assert.equal(initialLanguage({ saved: 'fr', browserLanguages: ['ja'] }), 'ja');
});

test('no browser language at all falls back to English', () => {
  assert.equal(languageFromBrowser([]), 'en');
  assert.equal(initialLanguage({}), 'en');
});
