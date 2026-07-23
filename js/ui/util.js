// Shared helpers for the ui/* screen modules. Not part of the module contract —
// kept local to js/ui/ so it composes only with files this agent owns.

/** Escapes text before it is interpolated into an innerHTML template. */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Formats whole seconds as "M:SS" (minutes unpadded, seconds zero-padded). */
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

/** Joins bare stat strings with the Librata middle-dot separator. */
export function statLine(parts) {
  return parts.filter(Boolean).join(' · ');
}

const ROMAN = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** Converts a 1-based index to a roman numeral for tracklist rows. */
export function romanNumeral(n) {
  let num = n;
  let out = '';
  for (const [value, symbol] of ROMAN) {
    while (num >= value) {
      out += symbol;
      num -= value;
    }
  }
  return out;
}

/**
 * Opens a gentle confirm modal (Librata confirmation pattern: "Delete this
 * session? Keep / Delete"). Resolves true on confirm, false on cancel/dismiss.
 */
export function confirmModal({ message, confirmLabel = 'Delete', cancelLabel = 'Keep' }) {
  return new Promise((resolve) => {
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

    const cleanup = (result) => {
      scrim.removeEventListener('click', onScrimClick);
      document.removeEventListener('keydown', onKeydown);
      scrim.remove();
      resolve(result);
    };
    const onScrimClick = (e) => {
      if (e.target === scrim) cleanup(false);
      const btn = e.target.closest('button[data-action]');
      if (btn) cleanup(btn.dataset.action === 'confirm');
    };
    const onKeydown = (e) => {
      if (e.key === 'Escape') cleanup(false);
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
