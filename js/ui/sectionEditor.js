import { icon } from '../icons.js';
import { escapeHtml, formatClock, bindHold } from './util.js';

const MIN_DURATION = 30;
const DURATION_STEP = 30;
const MIN_GAP = 1;
const MAX_GAP = 10;

export function render(root, ctx) {
  const { store, audio, navigate, params } = ctx;
  const sessionId = params?.sessionId;
  const isClosing = !!params?.closing;
  const session = store.getSession(sessionId);
  if (!session) {
    navigate('home');
    return;
  }
  const section = isClosing ? null : session.sections.find((s) => s.id === params.sectionId);
  if (!isClosing && !section) {
    navigate('editor', { sessionId: session.id });
    return;
  }
  const bells = isClosing ? session.closing : section.bells;
  const canRemove = !isClosing && session.sections.length > 1;

  const soundRows = audio.SOUNDS.map((sound) => `
    <button type="button" class="sound-row" role="radio" aria-checked="${sound.id === bells.soundId}" data-sound-id="${escapeHtml(sound.id)}">
      <span class="radio-dot" aria-hidden="true"></span>
      <span>${escapeHtml(sound.name)}</span>
    </button>
  `).join('');

  const bellCircles = [1, 2, 3, 4, 5].map((n) => `
    <button type="button" class="bell-circle ${n <= bells.count ? 'is-filled' : ''}" data-count="${n}" aria-label="${n} bell${n === 1 ? '' : 's'}" aria-pressed="${n <= bells.count}"></button>
  `).join('');

  root.innerHTML = `
    <div class="screen-inner section-editor-screen">
      <header class="topbar">
        <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('caret-left', 22)}</button>
        <span class="topbar-spacer" aria-hidden="true"></span>
      </header>
      <div class="screen-scroll section-editor-body">
        ${isClosing ? '<h1 class="h2 text-center">Closing</h1>' : `
          <input type="text" class="editor-name-input text-center" data-field="name" value="${escapeHtml(section.name)}" aria-label="Section name" placeholder="Section name" />
        `}
        ${isClosing ? '' : `
          <div class="duration-stepper">
            <button type="button" class="stepper-btn" data-action="dec-duration" aria-label="Decrease duration" ${section.durationSec <= MIN_DURATION ? 'disabled' : ''}>${icon('minus', 18)}</button>
            <div class="duration-display numeric">${formatClock(section.durationSec)}</div>
            <button type="button" class="stepper-btn" data-action="inc-duration" aria-label="Increase duration">${icon('plus', 18)}</button>
          </div>
        `}
        <div class="field-block">
          <p class="label">Bells</p>
          <div class="bell-circles">${bellCircles}</div>
        </div>
        ${bells.count > 1 ? `
          <div class="gap-stepper">
            <button type="button" class="stepper-btn" data-action="dec-gap" aria-label="Decrease gap" ${bells.gapSec <= MIN_GAP ? 'disabled' : ''}>${icon('minus', 16)}</button>
            <span class="numeric">${bells.gapSec}s</span>
            <button type="button" class="stepper-btn" data-action="inc-gap" aria-label="Increase gap" ${bells.gapSec >= MAX_GAP ? 'disabled' : ''}>${icon('plus', 16)}</button>
          </div>
        ` : ''}
        <div class="field-block">
          <p class="label">Sound</p>
          <div class="sound-list" role="radiogroup" aria-label="Bell sound">${soundRows}</div>
        </div>
        ${canRemove ? '<button type="button" class="ghost-row" data-action="remove">Remove section</button>' : ''}
      </div>
    </div>
  `;

  const patchBells = (patch) => {
    const nextBells = { ...bells, ...patch };
    if (isClosing) {
      store.updateSession(session.id, { closing: nextBells });
    } else {
      store.updateSection(session.id, section.id, { bells: nextBells });
    }
  };

  root.querySelector('[data-action="back"]').addEventListener('click', () => {
    navigate('editor', { sessionId: session.id });
  });

  if (!isClosing) {
    const nameInput = root.querySelector('[data-field="name"]');
    nameInput.addEventListener('input', () => {
      store.updateSection(session.id, section.id, { name: nameInput.value });
    });

    const decDurationBtn = root.querySelector('[data-action="dec-duration"]');
    const incDurationBtn = root.querySelector('[data-action="inc-duration"]');
    bindHold(decDurationBtn, () => {
      const next = Math.max(MIN_DURATION, section.durationSec - DURATION_STEP);
      store.updateSection(session.id, section.id, { durationSec: next });
    });
    bindHold(incDurationBtn, () => {
      store.updateSection(session.id, section.id, { durationSec: section.durationSec + DURATION_STEP });
    });

    const removeBtn = root.querySelector('[data-action="remove"]');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        store.removeSection(session.id, section.id);
        navigate('editor', { sessionId: session.id });
      });
    }
  }

  root.querySelectorAll('.bell-circle').forEach((btn) => {
    btn.addEventListener('click', () => {
      patchBells({ count: Number(btn.dataset.count) });
    });
  });

  const decGapBtn = root.querySelector('[data-action="dec-gap"]');
  const incGapBtn = root.querySelector('[data-action="inc-gap"]');
  if (decGapBtn) {
    decGapBtn.addEventListener('click', () => {
      patchBells({ gapSec: Math.max(MIN_GAP, bells.gapSec - 1) });
    });
  }
  if (incGapBtn) {
    incGapBtn.addEventListener('click', () => {
      patchBells({ gapSec: Math.min(MAX_GAP, bells.gapSec + 1) });
    });
  }

  root.querySelectorAll('.sound-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const soundId = btn.dataset.soundId;
      patchBells({ soundId });
      audio.previewStrike(soundId);
    });
  });
}
