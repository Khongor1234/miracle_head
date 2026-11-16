import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStandaloneApp, shouldOpenChat } from './startScreen.js';

const fakeWindow = ({ displayStandalone = false, iosStandalone } = {}) => ({
  matchMedia: (query) => ({ matches: query === '(display-mode: standalone)' && displayStandalone }),
  navigator: iosStandalone === undefined ? {} : { standalone: iosStandalone },
});

test('a browser tab opens on the landing page', () => {
  assert.equal(shouldOpenChat({ hash: '', isStandalone: false }), false);
});

test('a #app link opens the chat', () => {
  assert.equal(shouldOpenChat({ hash: '#app', isStandalone: false }), true);
});

test('the home-screen app opens the chat even without #app', () => {
  assert.equal(shouldOpenChat({ hash: '', isStandalone: true }), true);
});

test('detects the home-screen app on Android/desktop and on iPhone', () => {
  assert.equal(isStandaloneApp(fakeWindow({ displayStandalone: true })), true);
  assert.equal(isStandaloneApp(fakeWindow({ iosStandalone: true })), true);
  assert.equal(isStandaloneApp(fakeWindow()), false);
  assert.equal(isStandaloneApp(undefined), false);
});
