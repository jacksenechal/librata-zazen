import { icon } from '../icons.js';
import { escapeHtml, formatClock, statLine, confirmModal } from './util.js';

export function render(root, ctx) {
  const { store, audio, navigate, goBack, params } = ctx;
  const sessionId = params?.sessionId;
  const session = store.getSession(sessionId) || store.getCurrentSession();
  if (!session) {
    navigate('home');
    return;
  }

  const sectionRows = session.sections.map((section, i) => {
    const bellWord = section.bells.count === 1 ? 'bell' : 'bells';
    return `
      <li class="section-row">
        <div class="section-row-reorder">
          <button type="button" data-action="move-up" data-id="${escapeHtml(section.id)}" aria-label="Move ${escapeHtml(section.name)} up" ${i === 0 ? 'disabled' : ''}>${icon('caret-up', 16)}</button>
          <button type="button" data-action="move-down" data-id="${escapeHtml(section.id)}" aria-label="Move ${escapeHtml(section.name)} down" ${i === session.sections.length - 1 ? 'disabled' : ''}>${icon('caret-down', 16)}</button>
        </div>
        <button type="button" class="section-row-main" data-action="edit-section" data-id="${escapeHtml(section.id)}">
          <span class="section-row-name">${escapeHtml(section.name)}</span>
          <span class="section-row-caption caption">${statLine([formatClock(section.durationSec), `${section.bells.count} ${bellWord}`])}</span>
        </button>
      </li>
    `;
  }).join('');

  const closing = session.closing;
  const closingBellWord = closing.count === 1 ? 'bell' : 'bells';
  const closingSoundName = audio.SOUNDS.find((s) => s.id === closing.soundId)?.name;

  root.innerHTML = `
    <div class="screen-inner session-editor-screen">
      <header class="topbar">
        <button type="button" class="icon-btn" data-action="close" aria-label="Close editor">${icon('caret-down', 22)}</button>
        <span class="topbar-spacer" aria-hidden="true"></span>
      </header>
      <div class="editor-name-block">
        <input type="text" class="editor-name-input" data-field="name" value="${escapeHtml(session.name)}" aria-label="Session name" placeholder="Session name" />
        <input type="text" class="editor-desc-input" data-field="description" value="${escapeHtml(session.description || '')}" aria-label="Description" placeholder="Description" />
      </div>
      <div class="screen-scroll">
        <ul class="section-rows">
          ${sectionRows}
          <li class="section-row closing-row">
            <div class="section-row-reorder" aria-hidden="true"></div>
            <button type="button" class="section-row-main" data-action="edit-closing">
              <span class="section-row-name">Closing</span>
              <span class="section-row-caption caption">${statLine([`${closing.count} ${closingBellWord}`, closingSoundName])}</span>
            </button>
          </li>
        </ul>
        <button type="button" class="ghost-row" data-action="add-section">${icon('plus', 18)} Add section</button>
      </div>
      <footer class="editor-footer">
        <button type="button" class="btn-ghost" data-action="duplicate">Duplicate</button>
        <button type="button" class="btn-ghost" data-action="delete">Delete</button>
      </footer>
    </div>
  `;

  root.querySelector('[data-action="close"]').addEventListener('click', () => goBack());

  const nameInput = root.querySelector('[data-field="name"]');
  nameInput.addEventListener('input', () => {
    store.updateSession(session.id, { name: nameInput.value });
  });
  const descInput = root.querySelector('[data-field="description"]');
  descInput.addEventListener('input', () => {
    store.updateSession(session.id, { description: descInput.value });
  });

  root.querySelectorAll('[data-action="move-up"]').forEach((btn) => {
    btn.addEventListener('click', () => store.moveSection(session.id, btn.dataset.id, -1));
  });
  root.querySelectorAll('[data-action="move-down"]').forEach((btn) => {
    btn.addEventListener('click', () => store.moveSection(session.id, btn.dataset.id, 1));
  });
  root.querySelectorAll('[data-action="edit-section"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate('sectionEditor', { sessionId: session.id, sectionId: btn.dataset.id });
    });
  });
  root.querySelector('[data-action="edit-closing"]').addEventListener('click', () => {
    navigate('sectionEditor', { sessionId: session.id, closing: true });
  });
  root.querySelector('[data-action="add-section"]').addEventListener('click', () => {
    const section = store.addSection(session.id);
    navigate('sectionEditor', { sessionId: session.id, sectionId: section.id });
  });
  root.querySelector('[data-action="duplicate"]').addEventListener('click', () => {
    const copy = store.duplicateSession(session.id);
    navigate('editor', { sessionId: copy.id });
  });
  root.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    const confirmed = await confirmModal({ message: 'Delete this session?' });
    if (confirmed) {
      store.deleteSession(session.id);
      goBack();
    }
  });
}
