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

function applyTheme() {
  document.documentElement.setAttribute('data-theme', store.getSettings().theme);
  const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--sky-midnight').trim();
  if (themeColor) {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
  }
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
  const result = screens[name](container, { store, engine, audio, navigate, params });
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

function navigate(name, params = {}) {
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
  };

  if (dur) {
    outgoing.style.transition = `opacity ${dur}ms var(--ease-poise)`;
    outgoing.style.opacity = '0';
    setTimeout(swapIn, dur);
  } else {
    swapIn();
  }
}

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

let audioUnlocked = false;
async function unlockOnce() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    await audio.unlockAudio();
    audio.setVolume(store.getSettings().volume);
  } catch (err) {
    audioUnlocked = false;
  }
}
window.addEventListener('pointerdown', unlockOnce, { once: true, capture: true });
window.addEventListener('keydown', unlockOnce, { once: true, capture: true });

store.subscribe(() => {
  applyTheme();
  if (audioUnlocked) audio.setVolume(store.getSettings().volume);
  engine.setKeepAwake(store.getSettings().keepAwake);
  rerenderCurrent();
});

showOnly('home');
mount('home', {});
