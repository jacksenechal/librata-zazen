import { icon } from '../icons.js';
import { escapeHtml, formatClock, statLine } from './util.js';

export function render(root, ctx) {
  const { store, engine, navigate } = ctx;
  const session = store.getCurrentSession();
  const saved = store.getSavedPlayback();
  const hasResume = !!(saved && session && saved.sessionId === session.id);

  const totalSec = session ? store.sessionDuration(session) : 0;
  const sectionCount = session ? session.sections.length : 0;
  const caption = statLine([
    formatClock(totalSec),
    `${sectionCount} section${sectionCount === 1 ? '' : 's'}`,
  ]);

  root.innerHTML = `
    <div class="screen-inner home-screen">
      <header class="topbar">
        <div class="home-wordmark-block">
          <div class="wordmark wordmark--sm">Librata</div>
          <div class="home-subtitle">Zazen</div>
        </div>
        <div class="topbar-actions">
          <button type="button" class="icon-btn" data-action="edit" aria-label="Edit session">${icon('pencil', 22)}</button>
          <button type="button" class="icon-btn" data-action="settings" aria-label="Settings">${icon('gear-six', 22)}</button>
        </div>
      </header>
      <main class="home-center">
        <svg class="librata-mark-icon" viewBox="0 0 128 128" aria-hidden="true">
          <circle cx="46" cy="42" r="1.6" fill="currentColor"></circle>
          <circle cx="64" cy="32" r="2.0" fill="currentColor"></circle>
          <circle cx="82" cy="42" r="1.6" fill="currentColor"></circle>
          <path d="M 36 86 A 28 28 0 0 1 92 86" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
          <line x1="32" y1="86" x2="96" y2="86" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" opacity="0.55"></line>
        </svg>
        <button type="button" class="home-session-btn" data-action="choose" aria-label="Choose session">${session ? escapeHtml(session.name) : 'No sessions'}</button>
        <p class="caption home-caption">${caption}</p>
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

  root.querySelector('[data-action="edit"]').addEventListener('click', () => {
    if (session) navigate('editor', { sessionId: session.id });
  });
  root.querySelector('[data-action="settings"]').addEventListener('click', () => {
    navigate('settings');
  });
  root.querySelector('[data-action="choose"]').addEventListener('click', () => {
    navigate('library');
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
}
