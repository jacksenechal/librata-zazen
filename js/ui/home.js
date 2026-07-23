import { icon } from '../icons.js';
import { escapeHtml, formatClock, statLine } from './util.js';

// Set just before a swipe-triggered store.setCurrentSession() call, and
// consumed by the very next render() — module-level because a swipe
// triggers a full store-driven rerender (main.js tears this screen down
// and calls render() again) rather than an in-place DOM update, so the
// entrance direction has to survive that round-trip somehow.
let pendingSwipeDir = null;

const SWIPE_THRESHOLD_PX = 40;

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function durationMs(varName, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const ms = parseFloat(raw);
  return Number.isFinite(ms) ? ms : fallback;
}

export function render(root, ctx) {
  const { store, engine, navigate } = ctx;
  const session = store.getCurrentSession();
  const sessions = store.getSessions();
  const saved = store.getSavedPlayback();
  const totalSec = session ? store.sessionDuration(session) : 0;
  const isStaleSavedPosition = !!(saved && session && saved.sessionId === session.id && saved.positionSec >= totalSec);
  const hasResume = !!(saved && session && saved.sessionId === session.id) && !isStaleSavedPosition;

  if (isStaleSavedPosition) {
    // Defer past this synchronous render: store.clearPlayback() notifies
    // subscribers (including main.js's rerenderCurrent), which would
    // otherwise re-enter this same render function while it's still on
    // the stack.
    queueMicrotask(() => store.clearPlayback());
  }
  const sectionCount = session ? session.sections.length : 0;
  const caption = statLine([
    formatClock(totalSec),
    `${sectionCount} section${sectionCount === 1 ? '' : 's'}`,
  ]);

  const swipeDir = pendingSwipeDir;
  pendingSwipeDir = null;

  const currentIndex = session ? sessions.findIndex((s) => s.id === session.id) : -1;
  const dots = sessions.length > 1
    ? `<div class="home-dots" aria-hidden="true">${sessions.map((s, i) => `<span class="home-dot${i === currentIndex ? ' is-current' : ''}"></span>`).join('')}</div>`
    : '';

  root.innerHTML = `
    <div class="screen-inner home-screen">
      <header class="topbar">
        <div class="home-wordmark-block">
          <div class="wordmark wordmark--sm">Librata</div>
          <div class="home-subtitle">Zazen</div>
        </div>
        <div class="topbar-actions">
          <button type="button" class="icon-btn" data-action="settings" aria-label="Settings">${icon('gear-six', 22)}</button>
        </div>
      </header>
      <main class="home-center screen-scroll" data-role="center">
        <svg class="librata-mark-icon" viewBox="0 0 128 128" aria-hidden="true">
          <circle cx="46" cy="42" r="1.6" fill="currentColor"></circle>
          <circle cx="64" cy="32" r="2.0" fill="currentColor"></circle>
          <circle cx="82" cy="42" r="1.6" fill="currentColor"></circle>
          <path d="M 36 86 A 28 28 0 0 1 92 86" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
          <line x1="32" y1="86" x2="96" y2="86" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" opacity="0.55"></line>
        </svg>
        <button type="button" class="home-session-btn" data-action="choose" aria-label="Choose session">${session ? escapeHtml(session.name) : 'No sessions'}</button>
        <p class="caption home-caption">${caption}</p>
        <div class="home-links-row">
          <button type="button" class="home-link" data-action="choose">Sessions</button>
          <span class="home-link-sep" aria-hidden="true">·</span>
          <button type="button" class="home-link" data-action="edit">Edit</button>
        </div>
        ${dots}
      </main>
      <footer class="home-actions">
        ${hasResume ? `
          <button type="button" class="btn-primary" data-action="resume">Resume</button>
          <button type="button" class="btn-ghost" data-action="begin-again">Begin again</button>
        ` : `
          <button type="button" class="btn-primary" data-action="begin">Begin</button>
        `}
      </footer>
    </div>
  `;

  root.querySelector('[data-action="settings"]').addEventListener('click', () => {
    navigate('settings');
  });
  root.querySelectorAll('[data-action="choose"]').forEach((btn) => {
    btn.addEventListener('click', () => navigate('library'));
  });
  root.querySelector('[data-action="edit"]').addEventListener('click', () => {
    if (session) navigate('editor', { sessionId: session.id });
  });

  const beginBtn = root.querySelector('[data-action="begin"]');
  if (beginBtn) {
    beginBtn.addEventListener('click', () => {
      if (!session) return;
      engine.load(session, 0);
      engine.play();
      navigate('player');
    });
  }
  const resumeBtn = root.querySelector('[data-action="resume"]');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
      engine.load(session, saved.positionSec);
      engine.play();
      navigate('player');
    });
  }
  const beginAgainBtn = root.querySelector('[data-action="begin-again"]');
  if (beginAgainBtn) {
    beginAgainBtn.addEventListener('click', () => {
      store.clearPlayback();
      engine.load(session, 0);
      engine.play();
      navigate('player');
    });
  }

  const centerEl = root.querySelector('[data-role="center"]');
  if (swipeDir && !reducedMotion()) {
    const dur = durationMs('--dur-base', 360);
    centerEl.style.transition = 'none';
    centerEl.style.opacity = '0';
    centerEl.style.transform = `translateX(${swipeDir > 0 ? '16px' : '-16px'})`;
    void centerEl.offsetHeight; // force reflow before enabling the transition
    centerEl.style.transition = `opacity ${dur}ms var(--ease-poise), transform ${dur}ms var(--ease-poise)`;
    requestAnimationFrame(() => {
      centerEl.style.opacity = '1';
      centerEl.style.transform = 'translateX(0)';
    });
  }

  if (sessions.length > 1) wireSwipe(centerEl, sessions, session?.id, store);
}

/** Horizontal swipe anywhere on the home center block cycles sessions. */
function wireSwipe(el, sessions, currentId, store) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  let captured = false;

  const onDown = (e) => {
    tracking = true;
    captured = false;
    startX = e.clientX;
    startY = e.clientY;
  };
  const onMove = (e) => {
    if (!tracking || captured) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    // Capture only once the gesture is clearly a horizontal swipe —
    // capturing on pointerdown retargets events away from child
    // buttons and kills their clicks.
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      captured = true;
      try { el.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    }
  };
  const onUp = (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dy) > Math.abs(dx)) return;

    const idx = sessions.findIndex((s) => s.id === currentId);
    const dir = dx < 0 ? 1 : -1; // swipe left -> next session
    const nextIdx = ((idx === -1 ? 0 : idx) + dir + sessions.length) % sessions.length;

    if (reducedMotion()) {
      store.setCurrentSession(sessions[nextIdx].id);
      return;
    }

    const dur = durationMs('--dur-base', 360);
    el.style.transition = `opacity ${dur}ms var(--ease-poise), transform ${dur}ms var(--ease-poise)`;
    el.style.opacity = '0';
    el.style.transform = `translateX(${dir > 0 ? '-16px' : '16px'})`;
    pendingSwipeDir = dir;
    setTimeout(() => store.setCurrentSession(sessions[nextIdx].id), dur);
  };
  const onCancel = () => { tracking = false; };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
}
