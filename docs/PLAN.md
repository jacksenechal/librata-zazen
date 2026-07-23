# Librata Zazen — Implementation Plan

A meditation timer in the Librata family. Replaces the "Zazen Meditation Timer" Android app with a calmer, better-designed PWA that adds full playback control: pause, ±30s seek, and section skip — a music-app paradigm where **a session is an album and its sections are tracks**.

Design system: **Librata**. Theme: **Carta** (paper/e-ink) by default, Dawn available in settings. Both phone and tablet.

---

## 1 · Product principles

- Quality of space. Quiet, subtle, spacious. Nothing extra, nothing noisy, nothing unexpected. The app imparts peace; elegance is the baseline, understated.
- Librata voice (see DS guide §3): sentence case, no exclamation marks, no emoji, em dashes, bare stats with middle dots (`4:17 · 3 sections`), gentle confirmations, diagnoses not apologies.
- Offline-first PWA: no accounts, no tracking, no network after install. Later packaging for Play Store / F-Droid (TWA or Capacitor shell).
- All state in local storage (sessions, settings, playback position). Never lose a user's place — reopening the app mid-session offers Resume.

## 2 · Core model — the music-app paradigm

```
Session (album)
  id, name, description?
  sections: [ Section (track) ]
  closing: Bells            // rung at the very end of the session
Section (track)
  id, name                  // "Settling", "Breath", "Return"
  duration (sec)
  bells: Bells              // rung at the section's START
Bells
  count (1–5), gapSec (1–10), soundId
Settings
  volume (0–1), keepAwake (bool), theme ('carta'|'dawn')
PlaybackState (persisted)
  sessionId, positionSec, playing=false on restore
```

Timeline = concatenated sections. Boundaries = each section start + session end.

### Playback rules
- **Play/pause** — pausing freezes position exactly; timing uses wall-clock timestamps (never accumulate setInterval drift). Must stay accurate over a 60-minute sit; use `Date.now()` deltas + re-sync on `visibilitychange` (the tab/phone will sleep).
- **±30s** — clamped to [0, total].
- **Skip back/forward** — exactly like a music player: skip-forward → start of next section; skip-back → start of current section if >3s into it, else start of previous section.
- **Tap a section row** — seek to that section's start.
- **Bells ring only when playback naturally crosses a boundary.** Seeking/skipping never re-rings past bells (user's explicit choice: land silently, like a music app). Starting a session from 0:00 rings the first section's bells.
- **Session end** — ring closing bells, stop, show a quiet completed state (`Complete — 30:00`, sparkle icon per DS icon table). Clear saved position.
- **Wake lock** — `navigator.wakeLock.request('screen')` while playing (if keepAwake setting on); release on pause; re-acquire on `visibilitychange`.
- **Media Session API** — register play/pause/seekbackward/seekforward/previoustrack/nexttrack handlers + metadata (session name as album, section name as track) so lockscreen/headphone controls work. This is the biggest UX win of the music paradigm on Android.

## 3 · Screens

All screens sit on `var(--gradient-sky)` (Carta = soft paper-grey wash), single centered column, max-width ~560px on tablet, generous whitespace. Type: Cormorant Garamond Light for names/numerals, Manrope 400/500 for UI. Icons: Phosphor **Thin** style (self-hosted inline SVG for offline).

### 3.1 Home
- Top: `LIBRATA` wordmark small (Cormorant Light, 0.32em tracking, flanking dots) with `ZAZEN` subtitle in Manrope small-caps. Top-right: pencil (edit session), gear (settings) — pill icon buttons, 48px targets.
- Center: the Librata mark (sun-arc + three stars, tinted ink on Carta), then the selected session name large in Cormorant (`clamp(34px, 6vw, 48px)`), tap → session list. Below, bare caption: `30:00 · 3 sections`.
- Bottom: `.btn-primary` — `Begin`. If a saved position exists: `Resume` + ghost `Begin again`.

### 3.2 Session list (library)
- Header: back caret · `Sessions` · plus (new session).
- Rows: name (Manrope 500) + optional description caption; right-aligned duration in Cormorant numerals. Current session marked with a small ink dot. Hairline `--paper-edge` separators. Tap selects and returns home.
- No swipe gestures, no FAB. Duplicate/delete live in the editor.

### 3.3 Player (the centerpiece)
- Top: down-caret (return home; playback continues), session name as quiet caption.
- Center block:
  - Section name — Cormorant Light, large (`clamp(32px, 7vw, 44px)`).
  - **Section countdown** — Cormorant numerals, huge (`clamp(64px, 16vw, 96px)`), tabular. The remaining time in the *current section*.
  - Caption: `Section 2 of 3 · 24:10 remaining` (whole-session remaining).
- **Progress bar** — one 2px hairline, full width. Fill = ink (`--fg-pearl`, which is ink on Carta); track = `--ink-faint`/hairline. Section boundaries are 1px ticks or 3px dots on the track. Elapsed / total in micro numerals at the ends. Draggable to scrub (pointer events; large invisible hit area ≥44px tall).
- **Transport** — a single centered 72px circle with a hairline border for play/pause; no other on-screen transport buttons. The progress-bar scrub and tracklist-row taps are the seek mechanisms. Press states: 6% darken, 120ms, no scale (DS motion rules). Lockscreen/headphone controls (seek ±30s, previous/next section) still work via the Media Session handlers registered in the engine.
- **Tracklist** — below, like an album:
  - Row: roman numeral (Cormorant), section name, right-aligned duration.
  - Completed sections at `--ink-quiet`; current row in full ink with a thin per-row progress hairline underneath; future rows normal.
  - Tap row → seek to section start.
- Completed state: replaces center block — sparkle icon, `Complete`, `30:00 · 3 sections`, ghost `Done`.

### 3.4 Session editor
- Session name as a large borderless Cormorant input (hairline underline on focus); description caption input beneath.
- Section rows: name + `5:00 · 1 bell` caption; quiet up/down carets for reorder (or drag on pointer devices); tap → section editor.
- Final pseudo-row: `Closing — 3 bells · Tibetan bowl` (edits the session-end bells; no duration).
- `Add section` ghost row with thin plus.
- Footer ghosts: `Duplicate` · `Delete`. Delete confirms with a gentle modal: `Delete this session?` → `Keep` / `Delete` (DS confirmation pattern).
- Edits apply live (no save/cancel ceremony).

### 3.5 Section editor
- Name input.
- Duration — big Cormorant `5:00` with −/+ steppers (30s increments, min 0:30; hold to repeat).
- Bells — five small circles, filled up to count; tap to set (1–5).
- Gap — `−  2s  +` stepper (1–10s), only shown when count > 1.
- Sound — vertical radio list of the sound set; tapping a row selects **and previews** the strike. No separate play button.
- `Remove section` ghost at bottom (hidden if it's the only section).

### 3.6 Settings
- Bell volume — minimal custom slider (thin track, small circular handle; style the native range's pseudo-elements or hand-roll with pointer events). Releasing previews one strike.
- Keep screen awake — toggle.
- Theme — `Carta — paper` / `Dawn — night sky` radio (sets `data-theme` on `<html>`).
- About — wordmark, version, and the Layer-B monospace audit block (AGPLv3, 0.00% telemetry, 100% offline — DS guide §1). Don't blend registers: poetic copy elsewhere, monospace spec only here.

## 4 · Sounds

Five curated strikes. Preferred: single high-quality CC0 recordings (Freesound juskiddink pack 5069, the_very_Real_Horst pack 12242, BigSoundBank s1109). Fallback/no-download path: a small Web Audio additive synth (inharmonic partials, detuned pairs for beating, exponential decay, filtered-noise attack transient) can generate all five tones offline — useful as a dev placeholder and as a zero-asset fallback.

Set: `Rin bowl, small` · `Rin bowl, medium` · `Dharma bowl` · `Tibetan bowl, deep` · `Gong, low`. If using recordings: trim silence, normalize ~-18 LUFS, gentle fade tail, Opus (webm) + AAC (m4a), <300KB each.

**Playback via Web Audio API** (not `<audio>`): decode once into AudioBuffers at startup; schedule multi-bell sequences sample-accurately (`source.start(ctx.currentTime + i * gapSec)`); master GainNode for the volume setting. Unlock the AudioContext on the first user gesture (Begin button).

Credit recordings (even CC0) in Settings → About.

## 5 · PWA / packaging

- `manifest.webmanifest` — name `Librata Zazen`, `display: standalone`, portrait-primary, theme/background `#EDEDEB` (Carta paper), maskable icons rendered from the DS `librata-app-icon.svg` + an ink-on-paper Carta variant.
- Service worker — precache app shell, fonts, icons, all audio; cache-first, versioned; `skipWaiting` + gentle in-app "refreshed" handling. Zero runtime network calls.
- Self-host fonts (Cormorant Garamond 300/400 + Manrope 400/500/600 WOFF2) and icons (inline SVG per the DS fallback pattern). No CDN at runtime.
- Keep the DOM light and animations minimal (opacity/transform only, `--ease-poise`, 180/360/720ms) — Carta targets e-paper.
- Later: TWA (Bubblewrap) for Play Store; the same codebase under AGPLv3 for F-Droid via a thin wrapper.

## 6 · Seed content

Ship four placeholder sessions (users rename/edit freely):

1. **Morning sit** — 30:00. Settling 5:00 · Breath 20:00 · Return 5:00. One `Rin bowl, medium` per section; closing 3 × `Tibetan bowl, deep`, 4s gap.
2. **Short sit** — 15:00. Settling 3:00 · Breath 12:00.
3. **Body and breath** — 45:00. Arrival 5:00 · Body 15:00 · Breath 20:00 · Dedication 5:00.
4. **Open awareness** — 60:00. Settling 10:00 · Open sitting 45:00 · Return 5:00. Closing on `Gong, low`.

## 7 · Architecture notes (for the implementing agents)

- Single-page app; screens = Home, Library, Player, Editor, SectionEditor, Settings. Any stack works; keep it dependency-light (vanilla or Preact) for the offline/e-paper goals.
- One playback engine module owning: position math, boundary detection (track `lastPos`; ring when `lastPos < boundary ≤ pos` during natural play only), Web Audio scheduling, wake lock, Media Session, persistence throttle (save position every ~5s and on pause/hide).
- Storage: `localStorage` (or IndexedDB) under a versioned key, e.g. `librata.zazen.v1.*`; include a schema-migration hook.
- Accessibility: all controls real `<button>`s with `aria-label`s; countdown as `aria-live="off"` (silent) with a polite announcement only at section changes; respect `prefers-reduced-motion`.
- Testing focus: timing accuracy across sleep/wake, boundary bells (no double-ring, no ring on seek), resume integrity, offline cold start.

## 8 · Design-system compliance checklist

- Load design tokens (css/tokens.css); never hardcode palette values — Carta/Dawn switching must be pure `data-theme`.
- Cormorant Light for display + all numerals (`--font-numeric`, tabular lining nums); Manrope 400/500/600 for UI. Hierarchy by size/tracking, not weight.
- Radii: 14px CTAs, 20px sheets/modals, pills only for circular icon buttons. Hairline borders. Neutral soft shadows on Carta.
- Motion: `--ease-poise` only; nothing scales on hover/press; e-paper-friendly.
- Copy: sentence case, no exclamation marks, no emoji, `·` separators, gentle confirmations.
