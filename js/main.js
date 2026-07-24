// Librata Zazen — boot, router, screen wiring.
import * as store from './store.js';
import * as audio from './audio.js';
import { createEngine } from './engine.js';

import { render as renderHome } from './ui/home.js';
import { render as renderLibrary } from './ui/library.js';
import { render as renderPlayer } from './ui/player.js';
import { render as renderEditor } from './ui/editor.js';
import { render as renderSectionEditor } from './ui/sectionEditor.js';
import { render as renderSettings } from './ui/settings.js';

const screens = {
  home: renderHome,
  library: renderLibrary,
  player: renderPlayer,
  editor: renderEditor,
  sectionEditor: renderSectionEditor,
  settings: renderSettings,
};

const containers = {
  home: document.getElementById('screen-home'),
  library: document.getElementById('screen-library'),
  player: document.getElementById('screen-player'),
  editor: document.getElementById('screen-editor'),
  sectionEditor: document.getElementById('screen-section-editor'),
  settings: document.getElementById('screen-settings'),
};

let current = 'home';
let currentParams = {};
let dispose = null;

// --- History integration -------------------------------------------------
// The nav stack is mirrored 1:1 into browser history: home is the base
// state (installed via replaceState, so it never itself consumes a back
// press), and every forward navigate() does exactly one pushState. Back
// (hardware/gesture, or an in-app caret calling goBack()) is therefore
// always "pop one level" — popstate's event.state tells us directly which
// screen+params to show, so there's no separate stack to keep in sync.
let historySeq = 0;
function historyState(name, params) {
  return { screen: name, params, seq: ++historySeq };
}
history.replaceState({ screen: 'home', params: {}, seq: 0 }, '');

// Fade-transition guard: a popstate that lands mid-transition is queued and
// replayed once the in-flight swap finishes, rather than racing it.
let transitioning = false;
let pendingPopState = null;

function sameParams(a, b) {
  const ak = Object.keys(a || {});
  const bk = Object.keys(b || {});
  if (ak.length !== bk.length) return false;
  return ak.every((k) => a[k] === b[k]);
}

const darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
// Best-effort e-ink hardware signals: a slow-refresh panel or a monochrome
// display. Many e-ink Android browsers (Onyx Boox, Supernote, Boox Palma)
// still report as fast/color, so this under-detects rather than over-
// detects — it's a bonus for the browsers that DO report it honestly, not
// a substitute for the explicit Carta/E-ink radio in Settings.
const slowUpdateQuery = window.matchMedia('(update: slow)');
const monochromeQuery = window.matchMedia('(monochrome)');

/** Resolves the stored theme setting to a concrete theme: 'auto' checks for
 * e-ink hardware signals first (-> eink), then falls back to the OS
 * light/dark preference (light -> carta, dark -> dawn); anything else
 * passes through unchanged. Keep this in sync with index.html's inline
 * pre-paint script, which duplicates this same resolution to avoid a
 * flash of the wrong theme before main.js loads. */
function resolveTheme(theme) {
  if (theme !== 'auto') return theme;
  if (slowUpdateQuery.matches || monochromeQuery.matches) return 'eink';
  return darkSchemeQuery.matches ? 'dawn' : 'carta';
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', resolveTheme(store.getSettings().theme));
  const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--sky-midnight').trim();
  if (themeColor) {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
  }
}

// Follow the system live while the setting is 'auto'.
for (const query of [darkSchemeQuery, slowUpdateQuery, monochromeQuery]) {
  query.addEventListener('change', () => {
    if (store.getSettings().theme === 'auto') applyTheme();
  });
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function durationMs(varName, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const ms = parseFloat(raw);
  return Number.isFinite(ms) ? ms : fallback;
}

function showOnly(name) {
  for (const key of Object.keys(containers)) {
    containers[key].style.display = key === name ? '' : 'none';
  }
}

function mount(name, params) {
  const container = containers[name];
  const result = screens[name](container, { store, engine, audio, navigate, goBack, params });
  dispose = typeof result === 'function' ? result : null;
}

function unmount() {
  if (dispose) {
    try {
      dispose();
    } catch (err) {
      // screen teardown must never block navigation
    }
    dispose = null;
  }
  containers[current].innerHTML = '';
}

/** Performs the actual screen swap (fade + mount/unmount). Never touches
 * history — callers decide whether this is a forward move (navigate, which
 * pushes) or a history-driven move (applyPopState, which doesn't). */
function navigateTo(name, params = {}) {
  if (!screens[name]) return;
  if (name === current) {
    // same screen: just refresh params/content, no fade
    unmount();
    currentParams = params;
    mount(name, params);
    return;
  }

  const dur = reducedMotion() ? 0 : durationMs('--dur-base', 360);
  const outgoing = containers[current];

  const swapIn = () => {
    unmount();
    current = name;
    currentParams = params;
    showOnly(name);
    const incoming = containers[name];
    mount(name, params);
    if (dur) {
      incoming.style.transition = 'none';
      incoming.style.opacity = '0';
      void incoming.offsetHeight; // force reflow before enabling the transition
      incoming.style.transition = `opacity ${dur}ms var(--ease-poise)`;
      requestAnimationFrame(() => {
        incoming.style.opacity = '1';
      });
    } else {
      incoming.style.transition = 'none';
      incoming.style.opacity = '1';
    }
    transitioning = false;
    if (pendingPopState) {
      const next = pendingPopState;
      pendingPopState = null;
      applyPopState(next);
    }
  };

  transitioning = true;
  if (dur) {
    outgoing.style.transition = `opacity ${dur}ms var(--ease-poise)`;
    outgoing.style.opacity = '0';
    setTimeout(swapIn, dur);
  } else {
    swapIn();
  }
}

/** Public forward navigation: used by screens to move deeper (settings,
 * library, editor, sectionEditor, player). Pushes one history entry per
 * call, mirroring the nav stack into browser history 1:1. Navigating to the
 * screen already showing (e.g. a store-driven refresh) is a no-op on
 * history — it's a refresh, not a real move. */
function navigate(name, params = {}) {
  if (!screens[name]) return;
  if (name !== current) {
    history.pushState(historyState(name, params), '');
  }
  navigateTo(name, params);
}

/** Used by in-app back carets / down-carets so the history stack and the
 * on-screen stack never diverge: a back caret consumes the same history
 * entry a hardware/gesture back press would. Falls back to a direct
 * navigate when there's nothing pushed to pop (e.g. a cold load straight
 * into a non-home screen — not reachable today, but guarded regardless). */
function goBack() {
  if (history.state && history.state.seq > 0) {
    history.back();
  } else {
    history.replaceState({ screen: 'home', params: {}, seq: 0 }, '');
    navigateTo('home', {});
  }
}

/** Applies a popstate-resolved state to the screen stack. Shared by the
 * popstate listener and by the queued-during-transition replay. */
function applyPopState(state) {
  if (state.screen === current && sameParams(state.params, currentParams)) {
    // Already showing this screen+params: either a duplicate/double-fired
    // popstate, or the pop landed on the entry underneath a modal that just
    // dismissed itself (confirmModal owns its own popstate listener and
    // closes on this same event) — nothing for the screen stack to do.
    return;
  }
  navigateTo(state.screen, state.params || {});
}

window.addEventListener('popstate', (event) => {
  const state = event.state || { screen: 'home', params: {}, seq: 0 };
  if (transitioning) {
    pendingPopState = state;
    return;
  }
  applyPopState(state);
});

function isTypingInCurrentScreen() {
  const active = document.activeElement;
  if (!active) return false;
  const container = containers[current];
  if (!container.contains(active)) return false;
  return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable;
}

function rerenderCurrent() {
  // The player screen owns its own live updates via engine events; a full
  // rerender here would fight per-tick DOM mutation and any in-progress
  // scrub, so store-driven mutations (e.g. periodic playback persistence)
  // are intentionally not propagated to it. Other screens are cheap to
  // rebuild wholesale, except mid-keystroke: a text input (session/section
  // name) writes to the store on every keystroke, and rebuilding then
  // would wipe focus and cursor position.
  if (current === 'player') return;
  if (isTypingInCurrentScreen()) return;
  unmount();
  mount(current, currentParams);
}

const engine = createEngine({
  audio,
  onPersist: (sessionId, positionSec) => store.savePlayback(sessionId, positionSec),
});
engine.on('complete', () => store.clearPlayback());
engine.setKeepAwake(store.getSettings().keepAwake);

applyTheme();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // offline-first: a failed registration should never block the app
  });
}

// Runs on every pointerdown/keydown, capture phase, for the app's whole
// lifetime (not once): unlockAudio() creates the AudioContext and calls
// resume() synchronously on the first gesture, then is a cheap no-op once
// running. Keeping it live (rather than a one-shot listener) lets it also
// re-resume a context mobile browsers suspend again later (e.g. after the
// tab is backgrounded) — the very next tap recovers sound without a reload.
function ensureAudioRunning() {
  audio.unlockAudio();
  audio.setVolume(store.getSettings().volume);
}
window.addEventListener('pointerdown', ensureAudioRunning, { capture: true });
window.addEventListener('keydown', ensureAudioRunning, { capture: true });

store.subscribe(() => {
  applyTheme();
  audio.setVolume(store.getSettings().volume);
  engine.setKeepAwake(store.getSettings().keepAwake);
  rerenderCurrent();
});

showOnly('home');
mount('home', {});
