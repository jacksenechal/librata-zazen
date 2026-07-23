# Librata Zazen — Architecture contract

Read with `docs/PLAN.md` (the product spec) and `docs/DESIGN-NOTES.md` (voice + visual rules).
This file is the binding contract between modules. Implement exactly these APIs so
independently-built modules integrate without rework.

## Stack

Vanilla ES modules. **No build step, no npm, no dependencies.** The repo is served as-is
(`python -m http.server` for dev). Target: evergreen mobile browsers + e-paper Android browsers.

## File map

```
index.html                 app shell (UI agent)
css/tokens.css             design tokens — DO NOT EDIT (from the Librata DS)
css/app.css                app styles (UI agent)
js/format.js               formatting helpers (core agent)
js/store.js                state + persistence + seed data (core agent)
js/audio.js                bell synthesis + scheduling (core agent)
js/engine.js               playback engine (core agent)
js/icons.js                inline SVG icon set (UI agent)
js/main.js                 boot, router, screen wiring (UI agent)
js/ui/home.js …            one module per screen (UI agent)
sw.js                      service worker (PWA agent)
manifest.webmanifest       (PWA agent)
assets/fonts/**            self-hosted WOFF2 (PWA agent downloads)
assets/logo/*.svg          brand marks (present)
assets/icons/*             PWA launcher icons (PWA agent)
tests/engine.test.mjs      node --test suite (core agent)
```

## Data model (store.js)

Persisted in `localStorage` under key `librata.zazen.v1` as one JSON document:

```js
{
  schema: 1,
  currentSessionId: string,
  sessions: [ Session ],
  settings: { volume: 0.8, keepAwake: true, theme: 'carta' },   // theme: 'carta' | 'dawn'
  playback: null | { sessionId, positionSec, savedAt }           // saved place, playing never persists as true
}

Session  = { id, name, description, sections: [Section], closing: Bells }
Section  = { id, name, durationSec, bells: Bells }
Bells    = { count: 1..5, gapSec: 1..10, soundId }
```

IDs: `crypto.randomUUID()`. Seed the four sessions from PLAN §6 on first run
(soundIds below). Include a `migrate(doc)` hook keyed on `schema`.

### store.js exports

```js
getState()                          // whole doc (read-only by convention)
subscribe(fn)                       // fn() on every mutation; returns unsubscribe
getSessions(); getSession(id); getCurrentSession()
setCurrentSession(id)
createSession()                     // → new Session ("New session", one 10:00 section), appended + returned
updateSession(id, patch)            // shallow merge
duplicateSession(id)                // → copy named "<name> copy", fresh ids
deleteSession(id)                   // keeps ≥1 session; if current deleted, current = first
addSection(sessionId)               // → new Section ("New section", 5:00, 1 bell) appended + returned
updateSection(sessionId, sectionId, patch)
removeSection(sessionId, sectionId) // refuses if it's the only section
moveSection(sessionId, sectionId, dir)   // dir = -1 | +1
getSettings(); updateSettings(patch)
getSavedPlayback(); savePlayback(sessionId, positionSec); clearPlayback()
sessionDuration(session)            // Σ durationSec
sectionStarts(session)              // [0, d0, d0+d1, …]  (length = sections.length)
```

## Sounds (audio.js)

```js
export const SOUNDS = [
  { id: 'rin-small',    name: 'Rin bowl, small' },
  { id: 'rin-medium',   name: 'Rin bowl, medium' },
  { id: 'dharma',       name: 'Dharma bowl' },
  { id: 'tibetan-deep', name: 'Tibetan bowl, deep' },
  { id: 'gong-low',     name: 'Gong, low' },
];
export async function unlockAudio()        // create/resume AudioContext + render buffers; call from a user gesture
export function setVolume(v)               // 0..1, master GainNode
export function previewStrike(soundId)     // one strike now
export function ringBells({count, gapSec, soundId})  // schedules count strikes gapSec apart
export function stopAll()                  // cancel scheduled strikes (on pause/seek/stop)
```

Tones are synthesized (PLAN §4 fallback path): render each sound once into an
AudioBuffer via `OfflineAudioContext` — additive inharmonic partials, detuned pairs
for beating, exponential decay, filtered-noise attack transient. Distinct pitch and
decay per sound (small rin bright/short → gong low/long, ~8–20s tails). All playback
through one master GainNode. Every function is a safe no-op before `unlockAudio()`.

## Engine (engine.js)

```js
createEngine({ now = () => Date.now(), audio, onPersist } = {})   // audio: the audio.js module surface (injectable for tests)
```

Returned surface:

```js
load(session, positionSec = 0)   // stops, loads timeline; does NOT autostart
play()                            // starts; if position === 0, rings section 1's bells
pause()                           // freezes position exactly; stopAll()
toggle()
seek(sec)                         // clamp [0, total]; silent (never rings)
seekBy(delta)                     // ±30 via seek()
skipForward()                     // start of next section (or end → complete? no: clamp to total)
skipBack()                        // >3s into section → its start, else previous section's start
seekToSection(i)                  // silent
getState() // → { session, playing, completed, positionSec, sectionIndex,
           //     sectionRemainingSec, totalRemainingSec, totalSec }
on(event, fn)                     // 'tick' | 'sectionchange' | 'playstate' | 'complete'; returns unsubscribe
destroy()
```

Rules (PLAN §2):
- Wall-clock timing: on play, record `startedAt = now()` + `basePos`; position =
  `basePos + (now() - startedAt)/1000`. UI tick ~4 Hz via `setInterval`, but position
  is always recomputed from wall clock; re-sync + catch-up boundary check on
  `visibilitychange`.
- Boundary bells: boundaries = `sectionStarts[1..]` (section starts) + total (closing).
  Track `lastPos`; on each tick ring every boundary with `lastPos < b ≤ pos` —
  **only during natural play**. Any seek sets `lastPos = pos` without ringing.
  Sleeping through several boundaries rings only bells still due, never double.
- At `pos ≥ total`: ring closing bells, `playing = false`, `completed = true`,
  emit 'complete', clear saved playback.
- Persistence: call `onPersist(sessionId, positionSec)` every ~5 s while playing, on
  pause, and on `visibilitychange`(hidden). (main.js wires this to `savePlayback`.)
- Wake lock while playing iff `settings.keepAwake` (guard `navigator.wakeLock` absence);
  release on pause; re-acquire on visibilitychange. Engine reads the flag via a
  `setKeepAwake(bool)` setter main.js calls.
- Media Session: metadata artist `Librata`, album = session name, title = current
  section name; handlers → play/pause/seekbackward/seekforward/previoustrack/nexttrack.
  Guard absence. Browser-only APIs must not break Node import (feature-detect at call
  time, not module top level).

## UI

- `js/main.js` boots: apply theme from settings to `<html data-theme>`, register SW,
  create engine, render screens, first-gesture `unlockAudio()`.
- Screens: plain modules `export function render(root, ctx)`; `ctx` = `{ store, engine,
  audio, navigate(screen, params) }`. Navigation is in-memory (no URL routing); screen
  transition = opacity fade `--dur-base` `--ease-poise`.
- `js/icons.js`: `export function icon(name, size = 24)` → SVG string, Phosphor-Thin
  style (viewBox 0 0 256 256, stroke currentColor, stroke-width 8, fill none, round
  caps). Names: `pencil gear-six plus minus caret-left caret-down caret-up play pause
  skip-back skip-forward arrow-counter-clockwise arrow-clockwise sparkle x check dot`.

## Testing

`tests/engine.test.mjs` runs with `node --test tests/` — pure-logic tests with fake
`now()` and a recording fake `audio`: position math, boundary ring/no-ring on seek,
skip semantics, sleep catch-up (single ring), completion, persistence throttle.
store.js may also be tested with a localStorage stub.
