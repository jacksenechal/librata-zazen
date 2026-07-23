import { icon } from '../icons.js';

export function render(root, ctx) {
  const { store, audio, navigate } = ctx;
  const settings = store.getSettings();

  root.innerHTML = `
    <div class="screen-inner settings-screen">
      <header class="topbar">
        <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('caret-left', 22)}</button>
        <h1 class="h2">Settings</h1>
        <span class="topbar-spacer" aria-hidden="true"></span>
      </header>

      <section class="settings-block">
        <p class="label">Bell volume</p>
        <input type="range" class="range-slider" min="0" max="1" step="0.01" value="${settings.volume}" aria-label="Bell volume" />
      </section>

      <section class="settings-block settings-row">
        <p>Keep screen awake</p>
        <button type="button" class="toggle" role="switch" aria-checked="${settings.keepAwake}" data-action="toggle-keep-awake" aria-label="Keep screen awake">
          <span class="toggle-knob"></span>
        </button>
      </section>

      <section class="settings-block">
        <p class="label">Theme</p>
        <div class="theme-radio-list" role="radiogroup" aria-label="Theme">
          <button type="button" class="theme-row" role="radio" aria-checked="${settings.theme === 'carta'}" data-theme="carta">
            <span class="radio-dot" aria-hidden="true"></span>
            <span>Carta — paper</span>
          </button>
          <button type="button" class="theme-row" role="radio" aria-checked="${settings.theme === 'dawn'}" data-theme="dawn">
            <span class="radio-dot" aria-hidden="true"></span>
            <span>Dawn — night sky</span>
          </button>
        </div>
      </section>

      <section class="settings-about">
        <div class="wordmark">Librata</div>
        <p class="caption">Zazen · v1.0.0</p>
        <pre class="mono audit-block">License        GNU AGPLv3
Telemetry      0.00%
Connectivity   100% offline</pre>
        <p class="caption">Bell tones synthesized offline. No accounts, no network after install.</p>
      </section>
    </div>
  `;

  root.querySelector('[data-action="back"]').addEventListener('click', () => navigate('home'));

  const slider = root.querySelector('.range-slider');
  slider.addEventListener('input', () => {
    const volume = Number(slider.value);
    store.updateSettings({ volume });
    audio.setVolume(volume);
  });
  // 'change' fires once on release (mouse up, touch end, or committed key step).
  slider.addEventListener('change', () => {
    const soundId = previewSoundId(store, audio);
    if (soundId) audio.previewStrike(soundId);
  });

  const toggle = root.querySelector('[data-action="toggle-keep-awake"]');
  toggle.addEventListener('click', () => {
    store.updateSettings({ keepAwake: !store.getSettings().keepAwake });
  });

  root.querySelectorAll('.theme-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.updateSettings({ theme: btn.dataset.theme });
    });
  });
}

/** The bell heard when releasing the volume slider: the current session's
 * first section's sound, falling back to the house default sound. */
function previewSoundId(store, audio) {
  const session = store.getCurrentSession();
  return session?.sections?.[0]?.bells?.soundId || audio.SOUNDS?.[0]?.id;
}
