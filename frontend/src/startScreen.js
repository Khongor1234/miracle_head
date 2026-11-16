/**
 * Which screen the app opens on. A visitor in a browser tab sees the landing
 * page first; someone who added Miracle Head to their home screen came to
 * talk, so the home-screen app opens straight on the chat (#app).
 */

export const APP_HASH = '#app';

export function isStandaloneApp(win = globalThis.window) {
  if (!win) return false;
  const standaloneQuery = win.matchMedia?.('(display-mode: standalone)');
  return Boolean(standaloneQuery?.matches || win.navigator?.standalone === true);
}

export function shouldOpenChat({ hash, isStandalone }) {
  return hash === APP_HASH || isStandalone;
}
