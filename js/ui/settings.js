import { icon } from '../icons.js';

export function render(root, ctx) {
  const { store, audio, goBack } = ctx;
  const settings = store.getSettings();

  root.innerHTML = `
    <div class="screen-inner settings-screen">
      <header class="topbar">
        <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('caret-left', 22)}</button>
        <h1 class="h2">Settings</h1>
        <span class="topbar-spacer" aria-hidden="true"></span>
      </header>

      <div class="screen-scroll settings-body">
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
            <button type="button" class="theme-row" role="radio" aria-checked="${settings.theme === 'auto'}" data-theme-option="auto">
              <span class="radio-dot" aria-hidden="true"></span>
              <span class="theme-row-body">
                <span>Auto — match the system</span>
                <span class="caption">Follows the system; e-ink screens switch to E-ink when the browser reports them.</span>
              </span>
            </button>
            <button type="button" class="theme-row" role="radio" aria-checked="${settings.theme === 'carta'}" data-theme-option="carta">
              <span class="radio-dot" aria-hidden="true"></span>
              <span>Carta — paper</span>
            </button>
            <button type="button" class="theme-row" role="radio" aria-checked="${settings.theme === 'eink'}" data-theme-option="eink">
              <span class="radio-dot" aria-hidden="true"></span>
              <span>E-ink — pure white</span>
            </button>
            <button type="button" class="theme-row" role="radio" aria-checked="${settings.theme === 'dawn'}" data-theme-option="dawn">
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
    </div>
  `;

  root.querySelector('[data-action="back"]').addEventListener('click', () => goBack());

  const slider = root.querySelector('.range-slider');
  // 'input' fires continuously while dragging: only push the live value to
  // the audio engine here. Committing to the store on every 'input' would
  // fire store.subscribe -> main.js's rerenderCurrent() mid-gesture, tearing
  // out and rebuilding this very slider out from under the user's finger
  // (the settings screen isn't exempted from rerender the way the player
  // screen is) — which is what made the control need a second touch to
  // actually register a value.
  slider.addEventListener('input', () => {
    audio.setVolume(Number(slider.value));
  });
  // 'change' fires once on release (mouse up, touch end, or committed key
  // step): commit to the store and preview the strike then.
  slider.addEventListener('change', () => {
    const volume = Number(slider.value);
    store.updateSettings({ volume });
    const soundId = previewSoundId(store, audio);
    if (soundId) audio.previewStrike(soundId);
  });

  const toggle = root.querySelector('[data-action="toggle-keep-awake"]');
  toggle.addEventListener('click', () => {
    store.updateSettings({ keepAwake: !store.getSettings().keepAwake });
  });

  root.querySelectorAll('.theme-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.updateSettings({ theme: btn.dataset.themeOption });
    });
  });
}

/** The bell heard when releasing the volume slider: the current session's
 * first section's sound, falling back to the house default sound. */
function previewSoundId(store, audio) {
  const session = store.getCurrentSession();
  return session?.sections?.[0]?.bells?.soundId || audio.SOUNDS?.[0]?.id;
}
