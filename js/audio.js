// Bell synthesis + scheduling. All browser Web Audio API access is
// feature-detected inside function bodies (never at module top level) so
// this module imports cleanly under Node for tests.

export const SOUNDS = [
  { id: 'rin-small', name: 'Rin bowl, small' },
  { id: 'rin-medium', name: 'Rin bowl, medium' },
  { id: 'dharma', name: 'Dharma bowl' },
  { id: 'tibetan-deep', name: 'Tibetan bowl, deep' },
  { id: 'gong-low', name: 'Gong, low' },
];

// Synthesis recipe per sound: fundamental pitch, overall decay length, and
// how loud/quick the filtered-noise strike transient is. Partial ratios and
// per-partial decay/detune are shared (see PARTIALS below) — real bowls
// differ mainly in fundamental and decay time, not partial structure.
const RECIPES = {
  'rin-small': { fundamental: 1400, decaySec: 6, noiseFreq: 5200, noiseGain: 0.22 },
  'rin-medium': { fundamental: 700, decaySec: 9, noiseFreq: 3400, noiseGain: 0.2 },
  dharma: { fundamental: 300, decaySec: 12, noiseFreq: 1800, noiseGain: 0.18 },
  'tibetan-deep': { fundamental: 150, decaySec: 16, noiseFreq: 900, noiseGain: 0.16 },
  'gong-low': { fundamental: 85, decaySec: 20, noiseFreq: 500, noiseGain: 0.14 },
};

// Stretched, inharmonic partial ratios (bowls/bells don't ring at clean
// integer harmonics) with per-partial relative gain, decay multiplier
// (higher partials die out faster) and a detune spread in cents — each
// partial is rendered as a pair of oscillators detuned +/- half that spread,
// which beat slowly against each other for a living, non-beepy tone.
const PARTIALS = [
  { ratio: 1, gain: 1.0, decayMul: 1.0, detuneCents: 4 },
  { ratio: 2.76, gain: 0.5, decayMul: 0.75, detuneCents: 6 },
  { ratio: 5.4, gain: 0.26, decayMul: 0.55, detuneCents: 9 },
  { ratio: 8.93, gain: 0.13, decayMul: 0.4, detuneCents: 12 },
];

const SAMPLE_RATE = 44100;
const MIN_GAIN = 0.0001; // exponential ramps can't target 0

let audioCtx = null;
let masterGain = null;
let buffers = null; // Map<soundId, AudioBuffer>, populated once renderAllBuffers() resolves
let buffersReady = null; // Promise that resolves once `buffers` is populated
let currentVolume = 0.8;
let scheduled = []; // { sources: AudioBufferSourceNode[] } still pending/playing, for stopAll()
let stopToken = 0; // bumped by stopAll() to cancel strikes still queued behind whenReady()

/**
 * Render one sound's bell tone into an AudioBuffer via OfflineAudioContext:
 * additive inharmonic partials (detuned pairs for slow beating, exponential
 * decay) plus a short filtered-noise strike transient.
 */
async function renderBuffer(soundId) {
  const recipe = RECIPES[soundId];
  const duration = recipe.decaySec + 1.0; // pad for the longest partial's tail
  const length = Math.ceil(duration * SAMPLE_RATE);
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OfflineCtx(1, length, SAMPLE_RATE);

  const voice = ctx.createGain();
  voice.gain.value = 1;
  voice.connect(ctx.destination);

  for (const partial of PARTIALS) {
    const freq = recipe.fundamental * partial.ratio;
    const partialDecay = Math.max(0.3, recipe.decaySec * partial.decayMul);
    const partialGain = ctx.createGain();
    partialGain.connect(voice);
    partialGain.gain.setValueAtTime(partial.gain, 0);
    partialGain.gain.exponentialRampToValueAtTime(MIN_GAIN, partialDecay);

    for (const sign of [-1, 1]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = sign * (partial.detuneCents / 2);
      osc.connect(partialGain);
      osc.start(0);
      osc.stop(partialDecay + 0.05);
    }
  }

  // Filtered-noise strike transient: a burst of noise shaped by a bandpass
  // filter near the strike's characteristic frequency, decaying fast.
  const noiseDur = 0.06;
  const noiseBuffer = ctx.createBuffer(1, Math.ceil(noiseDur * SAMPLE_RATE), SAMPLE_RATE);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = recipe.noiseFreq;
  noiseFilter.Q.value = 1.2;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(recipe.noiseGain, 0);
  noiseGain.gain.exponentialRampToValueAtTime(MIN_GAIN, noiseDur);

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(voice);
  noiseSource.start(0);

  return ctx.startRendering();
}

async function renderAllBuffers() {
  const rendered = new Map();
  for (const sound of SOUNDS) {
    rendered.set(sound.id, await renderBuffer(sound.id));
  }
  buffers = rendered;
}

/**
 * Create the AudioContext and call resume() synchronously — no `await`
 * before either call — so both happen inside the live user-gesture call
 * stack that triggered this. Mobile autoplay policy revokes audio
 * permission the instant control yields back to the event loop, so
 * anything slower (like rendering the ~20s gong buffer) must happen after,
 * not before, resume().
 *
 * Idempotent and cheap to call repeatedly: call it from every pointerdown/
 * keydown (see main.js), not just the first, so the context also recovers
 * from mobile browsers re-suspending it (e.g. after backgrounding).
 */
export function unlockAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  if (!audioCtx) {
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = currentVolume;
    masterGain.connect(audioCtx.destination);
    buffersReady = renderAllBuffers();
  }
  if (audioCtx.state !== 'running') {
    audioCtx.resume().catch(() => {
      // Rejects if this call didn't land inside a user gesture — the next
      // gesture's call retries.
    });
  }
}

/** Resolves once buffers are rendered AND the context is running, or false
 * if a stopAll() (or a fresh unlock replacing this context) supersedes the
 * wait before then. Never rejects. */
function whenReady() {
  if (!audioCtx || !buffersReady) return Promise.resolve(false);
  const ctx = audioCtx;
  const token = stopToken;
  const running = ctx.state === 'running'
    ? Promise.resolve()
    : new Promise((resolve) => {
      const onChange = () => {
        if (ctx.state === 'running') {
          ctx.removeEventListener('statechange', onChange);
          resolve();
        }
      };
      ctx.addEventListener('statechange', onChange);
    });
  return Promise.all([buffersReady, running]).then(() => audioCtx === ctx && stopToken === token);
}

/** Set master volume 0..1; safe no-op (just remembers the value) before unlock. */
export function setVolume(v) {
  currentVolume = Math.min(1, Math.max(0, v));
  if (masterGain) masterGain.gain.value = currentVolume;
}

function playStrike(soundId, when) {
  const buffer = buffers.get(soundId);
  if (!buffer) return null;
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(masterGain);
  source.start(when);
  return source;
}

/**
 * Play one strike of soundId. Safe no-op before unlockAudio(). If buffers
 * are still rendering or the context is still suspended, the strike is
 * queued and plays as soon as both are ready, rather than being silently
 * dropped — unless stopAll() is called first, which cancels the wait.
 */
export function previewStrike(soundId) {
  if (!audioCtx) return;
  whenReady().then((ready) => {
    if (!ready) return;
    const source = playStrike(soundId, audioCtx.currentTime);
    if (source) scheduled.push({ sources: [source] });
  });
}

/**
 * Schedule count strikes of soundId, gapSec apart, sample-accurately
 * starting now. Safe no-op before unlockAudio(). Queued (see
 * previewStrike) rather than dropped if not yet ready.
 */
export function ringBells({ count, gapSec, soundId }) {
  if (!audioCtx) return;
  whenReady().then((ready) => {
    if (!ready) return;
    const startAt = audioCtx.currentTime;
    const sources = [];
    for (let i = 0; i < count; i++) {
      const source = playStrike(soundId, startAt + i * gapSec);
      if (source) sources.push(source);
    }
    if (sources.length) scheduled.push({ sources });
  });
}

/** Cancel all pending/sounding scheduled strikes (on pause/seek/stop), and
 * any previewStrike/ringBells calls still queued behind whenReady(). */
export function stopAll() {
  stopToken++;
  for (const entry of scheduled) {
    for (const source of entry.sources) {
      try {
        source.stop();
      } catch {
        // already stopped/finished — nothing to do
      }
    }
  }
  scheduled = [];
}
