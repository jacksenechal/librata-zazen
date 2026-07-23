import { icon } from '../icons.js';
import { escapeHtml, formatClock } from './util.js';

export function render(root, ctx) {
  const { store, navigate } = ctx;
  const sessions = store.getSessions();
  const currentId = store.getCurrentSession()?.id;

  const rows = sessions.map((session) => {
    const duration = formatClock(store.sessionDuration(session));
    return `
      <li>
        <button type="button" class="session-row" data-id="${escapeHtml(session.id)}">
          ${session.id === currentId ? `<span class="session-row-current-dot">${icon('dot', 10)}</span>` : ''}
          <span class="session-row-main">
            <span class="session-row-name">${escapeHtml(session.name)}</span>
            ${session.description ? `<span class="session-row-desc caption">${escapeHtml(session.description)}</span>` : ''}
          </span>
          <span class="session-row-duration numeric">${duration}</span>
        </button>
      </li>
    `;
  }).join('');

  root.innerHTML = `
    <div class="screen-inner library-screen">
      <header class="topbar">
        <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('caret-left', 22)}</button>
        <h1 class="h2">Sessions</h1>
        <button type="button" class="icon-btn" data-action="new" aria-label="New session">${icon('plus', 22)}</button>
      </header>
      ${sessions.length ? `<ul class="session-list">${rows}</ul>` : '<p class="library-empty">No sessions yet.</p>'}
    </div>
  `;

  root.querySelector('[data-action="back"]').addEventListener('click', () => navigate('home'));
  root.querySelector('[data-action="new"]').addEventListener('click', () => {
    const session = store.createSession();
    navigate('editor', { sessionId: session.id });
  });
  root.querySelectorAll('.session-row').forEach((rowEl) => {
    rowEl.addEventListener('click', () => {
      store.setCurrentSession(rowEl.dataset.id);
      navigate('home');
    });
  });
}
