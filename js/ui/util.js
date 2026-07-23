// Shared helpers for the ui/* screen modules. Not part of the module contract —
// kept local to js/ui/ so it composes only with files this agent owns.
//
// Formatting (clock strings, roman numerals) lives in js/format.js — the
// single formatting module per docs/ARCHITECTURE.md. Re-exported here under
// their historical ui/util.js names so call sites across js/ui/* don't need
// to change.

import { fmtTime as formatClock, roman as romanNumeral } from '../format.js';

export { formatClock, romanNumeral };

/** Escapes text before it is interpolated into an innerHTML template. */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Joins bare stat strings with the Librata middle-dot separator. */
export function statLine(parts) {
  return parts.filter(Boolean).join(' · ');
}

/**
 * Opens a gentle confirm modal (Librata confirmation pattern: "Delete this
 * session? Keep / Delete"). Resolves true on confirm, false on cancel/dismiss.
 */
export function confirmModal({ message, confirmLabel = 'Delete', cancelLabel = 'Keep' }) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const scrim = document.createElement('div');
    scrim.className = 'menu-scrim';
    scrim.innerHTML = `
      <div class="menu-sheet modal-confirm" role="alertdialog" aria-modal="true" aria-label="${escapeHtml(message)}">
        <p class="modal-confirm-message">${escapeHtml(message)}</p>
        <div class="modal-confirm-actions">
          <button type="button" class="btn-ghost" data-action="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="btn-secondary" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(scrim);

    // Push a history entry so the hardware/gesture back button closes the
    // modal (as "Keep") instead of leaving the screen underneath it. We
    // reuse the current history state verbatim — the entry exists only to
    // give back something to consume, not to represent a different screen.
    history.pushState(history.state, '');
    let poppedViaHistory = false;
    const onPopState = () => {
      poppedViaHistory = true;
      cleanup(false);
    };
    window.addEventListener('popstate', onPopState);

    const cleanup = (result) => {
      scrim.removeEventListener('click', onScrimClick);
      document.removeEventListener('keydown', onKeydown);
      window.removeEventListener('popstate', onPopState);
      scrim.remove();
      if (!poppedViaHistory) {
        // Closed via an in-app action (Keep/Delete/Escape/scrim click), not
        // via back — consume the history entry pushed on open so it never
        // lingers as a dead forward-navigable step.
        history.back();
      }
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
      resolve(result);
    };
    const onScrimClick = (e) => {
      if (e.target === scrim) cleanup(false);
      const btn = e.target.closest('button[data-action]');
      if (btn) cleanup(btn.dataset.action === 'confirm');
    };
    const onKeydown = (e) => {
      if (e.key === 'Escape') {
        cleanup(false);
        return;
      }
      if (e.key === 'Tab') {
        const focusables = Array.from(scrim.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!scrim.contains(document.activeElement)) {
          // Focus escaped the dialog (shouldn't normally happen, but guards
          // against it) — pull it back in.
          e.preventDefault();
          first.focus();
        }
      }
    };
    scrim.addEventListener('click', onScrimClick);
    document.addEventListener('keydown', onKeydown);
    scrim.querySelector('[data-action="confirm"]').focus();
  });
}

/**
 * Wires press-and-hold repeat behaviour onto a stepper button. Release
 * listeners are bound to `window` (not `el`): a hold-triggered store
 * mutation can cause the current screen to rerender mid-press, detaching
 * `el` before the browser dispatches its pointerup — if that pointerup
 * were only wired to `el`, `stop()` would never run and the repeat
 * interval would fire forever.
 */
export function bindHold(el, fn, { delay = 420, interval = 110 } = {}) {
  let timeoutId = null;
  let intervalId = null;
  const stop = () => {
    clearTimeout(timeoutId);
    clearInterval(intervalId);
    timeoutId = null;
    intervalId = null;
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };
  const start = (e) => {
    e.preventDefault();
    fn();
    timeoutId = setTimeout(() => {
      intervalId = setInterval(fn, interval);
    }, delay);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };
  el.addEventListener('pointerdown', start);
}
