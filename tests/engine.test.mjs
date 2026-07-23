import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../js/engine.js';

// --- localStorage stub for store.js tests ----------------------------

class MemoryStorage {
  #map = new Map();
  getItem(key) {
    return this.#map.has(key) ? this.#map.get(key) : null;
  }
  setItem(key, value) {
    this.#map.set(key, String(value));
  }
  removeItem(key) {
    this.#map.delete(key);
  }
}

/**
 * store.js keeps its loaded document as module-level singleton state, so
 * each test needs its own module instance. Appending a unique query string
 * gives each import a distinct URL, bypassing Node's ESM module cache.
 */
async function freshStore() {
  globalThis.localStorage = new MemoryStorage();
  return import(`../js/store.js?instance=${Math.random()}`);
}

// --- fixtures -------------------------------------------------------------

function bells(count, gapSec, soundId) {
  return { count, gapSec, soundId };
}

function section(id, name, durationSec, bellSpec) {
  return { id, name, durationSec, bells: bellSpec };
}

/** A 3-section, 30-minute session, mirroring the seed "Morning sit" shape. */
function longSession() {
  return {
    id: 'session-long',
    name: 'Test sit',
    description: '',
    sections: [
      section('sec-1', 'Settling', 300, bells(1, 2, 'rin-medium')),
      section('sec-2', 'Breath', 1200, bells(1, 2, 'rin-medium')),
      section('sec-3', 'Return', 300, bells(1, 2, 'rin-medium')),
    ],
    closing: bells(3, 4, 'tibetan-deep'),
  };
}

/** A 3-second, 3-section session (1s each) so boundary tests run fast. */
function shortSession() {
  return {
    id: 'session-short',
    name: 'Quick sit',
    description: '',
    sections: [
      section('s1', 'One', 1, bells(1, 1, 'rin-small')),
      section('s2', 'Two', 1, bells(1, 1, 'rin-medium')),
      section('s3', 'Three', 1, bells(1, 1, 'dharma')),
    ],
    closing: bells(3, 1, 'tibetan-deep'),
  };
}

function fakeAudio() {
  const calls = [];
  return {
    calls,
    ringBells(spec) {
      calls.push({ type: 'ring', spec });
    },
    stopAll() {
      calls.push({ type: 'stop' });
    },
  };
}

/**
 * Enables Node's mock Date + setInterval so the engine's internal tick timer
 * and its injected now() share a single, fully controllable clock — no real
 * wall-clock waits, no drift, and t.mock.timers.tick(ms) both advances time
 * and synchronously fires any due ticks.
 */
function mockClock(t) {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
  return (ms) => t.mock.timers.tick(ms);
}

// --- position math ----------------------------------------------------

test('position math stays accurate over a simulated 90-minute sit', (t) => {
  const advance = mockClock(t);
  const session = { ...longSession(), sections: [section('only', 'Only', 90 * 60, bells(1, 2, 'rin-medium'))], closing: bells(1, 2, 'rin-medium') };
  const engine = createEngine({ now: () => Date.now(), audio: fakeAudio() });
  engine.load(session);
  engine.play();

  advance(3723 * 1000); // 1h02m03s, in one big jump — never accumulated in small steps
  assert.equal(engine.getState().positionSec, 3723);

  advance(1000 * 1000); // continue well past the first jump
  assert.equal(engine.getState().positionSec, 4723);

  engine.destroy();
});

test('pause freezes position exactly and resume continues without drift', (t) => {
  const advance = mockClock(t);
  const engine = createEngine({ now: () => Date.now(), audio: fakeAudio() });
  engine.load(longSession());
  engine.play();

  advance(12345);
  engine.pause();
  assert.equal(engine.getState().positionSec, 12.345);
  assert.equal(engine.getState().playing, false);

  advance(60_000); // time passes while paused — position must not move
  assert.equal(engine.getState().positionSec, 12.345);

  engine.play();
  advance(5000);
  assert.equal(engine.getState().positionSec, 17.345);

  engine.destroy();
});

// --- boundary bells -----------------------------------------------------

test('load() does not ring; play() from 0 rings the first section', (t) => {
  mockClock(t);
  const audio = fakeAudio();
  const engine = createEngine({ now: () => Date.now(), audio });
  const session = shortSession();

  engine.load(session);
  assert.equal(audio.calls.filter((c) => c.type === 'ring').length, 0);

  engine.play();
  const rings = audio.calls.filter((c) => c.type === 'ring');
  assert.equal(rings.length, 1);
  assert.deepEqual(rings[0].spec, session.sections[0].bells);

  engine.destroy();
});

test('bells ring exactly once per boundary during natural play, ending in completion', (t) => {
  const advance = mockClock(t);
  const audio = fakeAudio();
  const sectionChanges = [];
  const engine = createEngine({ now: () => Date.now(), audio });
  const session = shortSession();

  engine.on('sectionchange', (idx) => sectionChanges.push(idx));
  engine.load(session);
  engine.play(); // rings section 0 immediately

  advance(1050); // cross the 1s boundary into section 1
  advance(1000); // cross the 2s boundary into section 2
  advance(1000); // cross the 3s boundary = total: closing bells + completion

  const rings = audio.calls.filter((c) => c.type === 'ring');
  assert.equal(rings.length, 4);
  assert.deepEqual(rings[0].spec, session.sections[0].bells);
  assert.deepEqual(rings[1].spec, session.sections[1].bells);
  assert.deepEqual(rings[2].spec, session.sections[2].bells);
  assert.deepEqual(rings[3].spec, session.closing);

  assert.deepEqual(sectionChanges, [1, 2]);
  const state = engine.getState();
  assert.equal(state.completed, true);
  assert.equal(state.playing, false);
  assert.equal(state.positionSec, 3);

  engine.destroy();
});

test('no ring on seek, skip, or seekToSection', (t) => {
  const advance = mockClock(t);
  const audio = fakeAudio();
  const engine = createEngine({ now: () => Date.now(), audio });
  const session = shortSession();

  engine.load(session);
  engine.play(); // 1 ring (section 0 at position 0)
  assert.equal(audio.calls.filter((c) => c.type === 'ring').length, 1);

  engine.seek(1); // lands exactly on section 1's boundary — must not ring
  assert.equal(audio.calls.filter((c) => c.type === 'ring').length, 1);

  engine.skipForward(); // to section 2's start — must not ring
  assert.equal(audio.calls.filter((c) => c.type === 'ring').length, 1);

  engine.seekToSection(0); // back to the very start — must not re-ring
  assert.equal(audio.calls.filter((c) => c.type === 'ring').length, 1);

  advance(500); // confirm playback continues normally afterward
  assert.equal(engine.getState().playing, true);

  engine.destroy();
});

test('sleeping through several boundaries rings each missed bell exactly once', (t) => {
  const advance = mockClock(t);
  const audio = fakeAudio();
  const engine = createEngine({ now: () => Date.now(), audio });
  const session = shortSession(); // boundaries at 1s, 2s, 3s(total)

  engine.load(session);
  engine.play(); // ring #1: section 0

  advance(20_000); // one big jump straight past every remaining boundary

  const rings = audio.calls.filter((c) => c.type === 'ring');
  assert.equal(rings.length, 4);
  assert.deepEqual(
    rings.map((r) => r.spec),
    [session.sections[0].bells, session.sections[1].bells, session.sections[2].bells, session.closing],
  );
  assert.equal(engine.getState().completed, true);

  engine.destroy();
});

test('completion stops ticking, fires "complete" once, and persists final position', (t) => {
  const advance = mockClock(t);
  const audio = fakeAudio();
  const persisted = [];
  let completeCount = 0;
  const engine = createEngine({
    now: () => Date.now(),
    audio,
    onPersist: (sessionId, positionSec) => persisted.push({ sessionId, positionSec }),
  });
  const session = shortSession();

  engine.on('complete', () => completeCount++);
  engine.load(session);
  engine.play();
  advance(3500); // cross into completion

  assert.equal(completeCount, 1);
  const ringsAtCompletion = audio.calls.filter((c) => c.type === 'ring').length;
  assert.deepEqual(persisted.at(-1), { sessionId: session.id, positionSec: 3 });

  advance(10_000); // further time passing must not re-trigger anything
  assert.equal(completeCount, 1);
  assert.equal(audio.calls.filter((c) => c.type === 'ring').length, ringsAtCompletion);

  engine.destroy();
});

// --- skip semantics -------------------------------------------------------

test('skipBack: >3s into a section returns to its start, else to the previous section', (t) => {
  mockClock(t);
  const engine = createEngine({ now: () => Date.now(), audio: fakeAudio() });
  const session = longSession(); // starts: [0, 300, 1500], total 1800

  engine.load(session, 305); // 5s into section 1 (>3s)
  engine.skipBack();
  assert.equal(engine.getState().positionSec, 300);

  engine.load(session, 302); // 2s into section 1 (<=3s) — goes to previous section
  engine.skipBack();
  assert.equal(engine.getState().positionSec, 0);

  engine.load(session, 1507); // 7s into the last section
  engine.skipBack();
  assert.equal(engine.getState().positionSec, 1500);

  engine.destroy();
});

test('skipForward: advances to the next section, clamps to total on the last', (t) => {
  mockClock(t);
  const engine = createEngine({ now: () => Date.now(), audio: fakeAudio() });
  const session = longSession(); // starts: [0, 300, 1500], total 1800

  engine.load(session, 0);
  engine.skipForward();
  assert.equal(engine.getState().positionSec, 300);

  engine.skipForward();
  assert.equal(engine.getState().positionSec, 1500);

  engine.skipForward(); // already in the last section — clamp to total
  const state = engine.getState();
  assert.equal(state.positionSec, 1800);
  assert.equal(state.completed, false); // seeking to the end is silent, not a natural completion

  engine.destroy();
});

test('seek and seekBy are clamped to [0, total]', (t) => {
  mockClock(t);
  const engine = createEngine({ now: () => Date.now(), audio: fakeAudio() });
  const session = longSession();

  engine.load(session, 0);
  engine.seek(-50);
  assert.equal(engine.getState().positionSec, 0);

  engine.seek(999999);
  assert.equal(engine.getState().positionSec, 1800);

  engine.seek(10);
  engine.seekBy(-30);
  assert.equal(engine.getState().positionSec, 0);

  engine.seek(1790);
  engine.seekBy(30);
  assert.equal(engine.getState().positionSec, 1800);

  engine.destroy();
});

// --- persistence throttle -------------------------------------------------

test('persists roughly every 5s while playing, and immediately on pause', (t) => {
  const advance = mockClock(t);
  const persisted = [];
  const engine = createEngine({
    now: () => Date.now(),
    audio: fakeAudio(),
    onPersist: (sessionId, positionSec) => persisted.push(positionSec),
  });
  engine.load(longSession());
  engine.play();

  advance(4900);
  assert.equal(persisted.length, 0);

  advance(250); // crosses the 5s threshold
  assert.equal(persisted.length, 1);

  engine.pause(); // pause always persists immediately, regardless of throttle
  assert.equal(persisted.length, 2);
  assert.equal(persisted.at(-1), engine.getState().positionSec);

  engine.destroy();
});

// --- store.js -----------------------------------------------------------

test('store: seeds the four PLAN §6 sessions with correct durations', async () => {
  const store = await freshStore();
  const sessions = store.getSessions();
  assert.equal(sessions.length, 4);

  const byName = Object.fromEntries(sessions.map((s) => [s.name, s]));
  assert.equal(store.sessionDuration(byName['Morning sit']), 30 * 60);
  assert.equal(store.sessionDuration(byName['Short sit']), 15 * 60);
  assert.equal(store.sessionDuration(byName['Body and breath']), 45 * 60);
  assert.equal(store.sessionDuration(byName['Open awareness']), 60 * 60);

  assert.equal(store.getCurrentSession().id, sessions[0].id);
  assert.deepEqual(store.sectionStarts(byName['Morning sit']), [0, 300, 1500]);
});

test('store: subscribe fires on mutation and unsubscribe stops it', async () => {
  const store = await freshStore();
  let calls = 0;
  const unsubscribe = store.subscribe(() => calls++);

  store.updateSettings({ volume: 0.5 });
  assert.equal(calls, 1);
  assert.equal(store.getSettings().volume, 0.5);

  unsubscribe();
  store.updateSettings({ volume: 0.9 });
  assert.equal(calls, 1);
});

test('store: session CRUD', async () => {
  const store = await freshStore();

  const created = store.createSession();
  assert.equal(created.name, 'New session');
  assert.equal(created.sections.length, 1);
  assert.equal(created.sections[0].durationSec, 600);
  assert.equal(store.getSessions().length, 5);

  const updated = store.updateSession(created.id, { name: 'Renamed' });
  assert.equal(updated.name, 'Renamed');
  assert.equal(store.getSession(created.id).name, 'Renamed');

  const copy = store.duplicateSession(created.id);
  assert.equal(copy.name, 'Renamed copy');
  assert.notEqual(copy.id, created.id);
  assert.notEqual(copy.sections[0].id, created.sections[0].id);

  store.setCurrentSession(copy.id);
  assert.equal(store.getCurrentSession().id, copy.id);

  assert.equal(store.deleteSession(created.id), true);
  assert.equal(store.getSessions().find((s) => s.id === created.id), undefined);
});

test('store: deleteSession refuses to remove the last session', async () => {
  const store = await freshStore();
  const sessions = store.getSessions();
  for (const s of sessions.slice(1)) store.deleteSession(s.id);
  assert.equal(store.getSessions().length, 1);

  const last = store.getSessions()[0];
  assert.equal(store.deleteSession(last.id), false);
  assert.equal(store.getSessions().length, 1);
});

test('store: section CRUD, including the "only section" guard', async () => {
  const store = await freshStore();
  const session = store.createSession();

  const added = store.addSection(session.id);
  assert.equal(added.name, 'New section');
  assert.equal(added.durationSec, 300);
  assert.equal(store.getSession(session.id).sections.length, 2);

  store.updateSection(session.id, added.id, { name: 'Renamed section', durationSec: 90 });
  const refetched = store.getSession(session.id).sections.find((s) => s.id === added.id);
  assert.equal(refetched.name, 'Renamed section');
  assert.equal(refetched.durationSec, 90);

  assert.equal(store.removeSection(session.id, added.id), true);
  const onlySection = store.getSession(session.id).sections[0];
  assert.equal(store.removeSection(session.id, onlySection.id), false); // refuses: only section left
  assert.equal(store.getSession(session.id).sections.length, 1);
});

test('store: moveSection reorders and clamps at the edges', async () => {
  const store = await freshStore();
  const session = store.createSession();
  const second = store.addSection(session.id);
  const third = store.addSection(session.id);

  const firstId = store.getSession(session.id).sections[0].id;
  assert.equal(store.moveSection(session.id, second.id, -1), true);
  assert.deepEqual(
    store.getSession(session.id).sections.map((s) => s.id),
    [second.id, firstId, third.id],
  );

  assert.equal(store.moveSection(session.id, second.id, -1), false); // already first
});

test('store: playback save/get/clear round-trip', async () => {
  const store = await freshStore();
  assert.equal(store.getSavedPlayback(), null);

  store.savePlayback('session-x', 42);
  const saved = store.getSavedPlayback();
  assert.equal(saved.sessionId, 'session-x');
  assert.equal(saved.positionSec, 42);
  assert.ok(saved.savedAt > 0);

  store.clearPlayback();
  assert.equal(store.getSavedPlayback(), null);
});

test('store: migration hook is a no-op for a doc already at the current schema', async () => {
  globalThis.localStorage = new MemoryStorage();
  const first = await import(`../js/store.js?instance=${Math.random()}`);
  first.updateSettings({ volume: 0.42 }); // force a write so localStorage holds a real doc
  const persistedRaw = globalThis.localStorage.getItem('librata.zazen.v1');
  assert.ok(persistedRaw);

  // Re-load against the same backing storage from a fresh module instance —
  // simulates a page reload, exercising the raw -> migrate(raw) -> doc path.
  const second = await import(`../js/store.js?instance=${Math.random()}`);
  assert.deepEqual(second.getState(), JSON.parse(persistedRaw));
  assert.equal(second.getSettings().volume, 0.42);
});
