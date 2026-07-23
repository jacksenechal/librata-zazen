// Playback engine: position math, boundary bell-ringing, skip/seek
// semantics, persistence throttling, wake lock and Media Session. Browser
// APIs (document, navigator.wakeLock, navigator.mediaSession) are
// feature-detected at call time only, so this module imports and runs
// under plain Node for tests.

const TICK_MS = 250; // ~4Hz UI tick
const PERSIST_INTERVAL_SEC = 5;
const SKIP_BACK_THRESHOLD_SEC = 3;
const SEEK_DELTA_SEC = 30;

const EVENTS = ['tick', 'sectionchange', 'playstate', 'complete'];

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function computeSectionStarts(session) {
  let start = 0;
  return session.sections.map((s) => {
    const at = start;
    start += s.durationSec;
    return at;
  });
}

function computeTotal(session) {
  return session.sections.reduce((sum, s) => sum + s.durationSec, 0);
}

/** Index of the section containing pos (last section whose start <= pos). */
function sectionIndexForPos(pos, starts) {
  for (let i = starts.length - 1; i >= 0; i--) {
    if (pos >= starts[i]) return i;
  }
  return 0;
}

export function createEngine({ now = () => Date.now(), audio, onPersist } = {}) {
  const listeners = new Map(EVENTS.map((e) => [e, new Set()]));

  let session = null;
  let starts = [0];
  let total = 0;
  // boundaries: every section start after the first, plus the session end
  // ("closing"), each tagged with what to ring when crossed.
  let boundaries = [];

  let playing = false;
  let completed = false;
  let keepAwake = false;

  // Wall-clock anchor for position while playing: pos = playBasePos +
  // (now() - playStartedAt). While paused, `pos` below is authoritative.
  let playBasePos = 0;
  let playStartedAt = 0;
  let pos = 0;

  // lastPos tracks the position boundaries were last checked against, so a
  // boundary only rings when playback naturally crosses it (lastPos < b <=
  // pos). Seeks/skips move lastPos to the new position without ringing.
  let lastPos = 0;
  let currentSectionIndex = 0;
  let lastPersistAt = 0;

  let tickTimer = null;
  let wakeLockSentinel = null;

  function emit(event, payload) {
    for (const fn of listeners.get(event)) fn(payload);
  }

  function getPosition() {
    if (!playing) return pos;
    return clamp(playBasePos + (now() - playStartedAt) / 1000, 0, total);
  }

  function buildBoundaries() {
    const list = starts.slice(1).map((b, i) => ({ pos: b, sectionIndex: i + 1 }));
    list.push({ pos: total, sectionIndex: -1 }); // -1 = closing/session end
    return list;
  }

  function ringSection(index) {
    audio?.ringBells(session.sections[index].bells);
  }

  function ringClosing() {
    audio?.ringBells(session.closing);
  }

  /** Ring every boundary crossed since `from`, in order; stops at completion. */
  function ringCrossedBoundaries(from, to) {
    for (const b of boundaries) {
      if (from < b.pos && to >= b.pos) {
        if (b.sectionIndex === -1) {
          ringClosing();
          finishSession();
          return;
        }
        ringSection(b.sectionIndex);
      }
    }
  }

  function updateSectionIndex(newPos) {
    const idx = sectionIndexForPos(newPos, starts);
    if (idx !== currentSectionIndex) {
      currentSectionIndex = idx;
      emit('sectionchange', idx);
      updateMediaSessionMetadata();
    }
    updateMediaSessionPositionState(newPos);
  }

  function persist(force) {
    if (!onPersist || !session) return;
    if (force || now() / 1000 - lastPersistAt >= PERSIST_INTERVAL_SEC) {
      onPersist(session.id, pos);
      lastPersistAt = now() / 1000;
    }
  }

  function finishSession() {
    pos = total;
    lastPos = total;
    playing = false;
    completed = true;
    stopTickTimer();
    audio?.stopAll();
    releaseWakeLock();
    updateSectionIndex(pos);
    persist(true);
    emit('playstate');
    emit('complete');
  }

  function tick() {
    if (!playing) return;
    const newPos = getPosition();
    ringCrossedBoundaries(lastPos, newPos);
    if (!completed) {
      lastPos = newPos;
      pos = newPos;
      updateSectionIndex(newPos);
      persist(false);
      emit('tick');
    }
  }

  function startTickTimer() {
    stopTickTimer();
    tickTimer = setInterval(tick, TICK_MS);
  }

  function stopTickTimer() {
    if (tickTimer != null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  // --- wake lock (feature-detected; silently no-op where unsupported) ---

  function acquireWakeLock() {
    if (!keepAwake || !playing) return;
    if (typeof navigator === 'undefined' || !navigator.wakeLock) return;
    navigator.wakeLock
      .request('screen')
      .then((sentinel) => {
        wakeLockSentinel = sentinel;
      })
      .catch(() => {
        // request can be denied (e.g. low battery) — nothing to do
      });
  }

  function releaseWakeLock() {
    if (wakeLockSentinel) {
      wakeLockSentinel.release?.().catch(() => {});
      wakeLockSentinel = null;
    }
  }

  // --- Media Session (feature-detected) ---

  function updateMediaSessionMetadata() {
    if (typeof navigator === 'undefined' || !navigator.mediaSession || !session) return;
    const MetadataCtor = typeof MediaMetadata !== 'undefined' ? MediaMetadata : null;
    if (!MetadataCtor) return;
    try {
      navigator.mediaSession.metadata = new MetadataCtor({
        title: session.sections[currentSectionIndex]?.name ?? session.name,
        artist: 'Librata',
        album: session.name,
      });
    } catch {
      // unsupported metadata shape in this browser — skip silently
    }
  }

  function updateMediaSessionPositionState(atPos) {
    if (typeof navigator === 'undefined' || !navigator.mediaSession?.setPositionState) return;
    try {
      navigator.mediaSession.setPositionState({ duration: total, playbackRate: 1, position: clamp(atPos, 0, total) });
    } catch {
      // duration/position can be rejected as invalid mid-transition — skip
    }
  }

  function setMediaSessionHandlers() {
    if (typeof navigator === 'undefined' || !navigator.mediaSession?.setActionHandler) return;
    const handlers = {
      play: () => play(),
      pause: () => pause(),
      seekbackward: () => seekBy(-SEEK_DELTA_SEC),
      seekforward: () => seekBy(SEEK_DELTA_SEC),
      previoustrack: () => skipBack(),
      nexttrack: () => skipForward(),
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // action unsupported in this browser — skip
      }
    }
  }

  function updateMediaSessionPlaybackState() {
    if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }

  // --- visibilitychange: resync wall-clock position and catch up any
  // boundaries crossed while the tab/tick timer was throttled/suspended ---

  function handleVisibilityChange() {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      if (playing) persist(true);
    } else if (playing) {
      tick(); // catch up immediately rather than waiting for the next tick
      acquireWakeLock();
    }
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  // --- public surface ---

  function load(newSession, positionSec = 0) {
    playing = false;
    completed = false;
    stopTickTimer();
    audio?.stopAll();
    session = newSession;
    starts = computeSectionStarts(session);
    total = computeTotal(session);
    boundaries = buildBoundaries();
    pos = clamp(positionSec, 0, total);
    lastPos = pos;
    currentSectionIndex = sectionIndexForPos(pos, starts);
    updateMediaSessionMetadata();
    updateMediaSessionPositionState(pos);
    setMediaSessionHandlers();
    emit('tick');
  }

  function play() {
    if (!session || playing) return;
    playBasePos = pos;
    playStartedAt = now();
    playing = true;
    completed = false;
    lastPersistAt = now() / 1000;
    if (pos === 0) ringSection(0);
    startTickTimer();
    acquireWakeLock();
    updateMediaSessionPlaybackState();
    emit('playstate');
  }

  function pause() {
    if (!playing) return;
    pos = getPosition();
    lastPos = pos;
    playing = false;
    stopTickTimer();
    audio?.stopAll();
    releaseWakeLock();
    updateMediaSessionPlaybackState();
    updateMediaSessionPositionState(pos);
    persist(true);
    emit('playstate');
  }

  function toggle() {
    playing ? pause() : play();
  }

  function seek(sec) {
    if (!session) return;
    pos = clamp(sec, 0, total);
    if (playing) {
      playBasePos = pos;
      playStartedAt = now();
    }
    lastPos = pos; // silent: no boundary ring on seek
    audio?.stopAll();
    updateSectionIndex(pos);
    emit('tick');
  }

  function seekBy(delta) {
    seek(getPosition() + delta);
  }

  function skipForward() {
    if (!session) return;
    const idx = sectionIndexForPos(getPosition(), starts);
    const target = idx + 1 < starts.length ? starts[idx + 1] : total;
    seek(target);
  }

  function skipBack() {
    if (!session) return;
    const currentPos = getPosition();
    const idx = sectionIndexForPos(currentPos, starts);
    const sectionStart = starts[idx];
    const intoSection = currentPos - sectionStart;
    const target = intoSection > SKIP_BACK_THRESHOLD_SEC ? sectionStart : starts[Math.max(0, idx - 1)];
    seek(target);
  }

  function seekToSection(i) {
    if (!session) return;
    const idx = clamp(i, 0, starts.length - 1);
    seek(starts[idx]);
  }

  function setKeepAwake(value) {
    keepAwake = !!value;
    if (keepAwake && playing) {
      acquireWakeLock();
    } else if (!keepAwake) {
      releaseWakeLock();
    }
  }

  function getState() {
    const currentPos = getPosition();
    const idx = sectionIndexForPos(currentPos, starts);
    const sectionEnd = idx + 1 < starts.length ? starts[idx + 1] : total;
    return {
      session,
      playing,
      completed,
      positionSec: currentPos,
      sectionIndex: idx,
      sectionRemainingSec: clamp(sectionEnd - currentPos, 0, total),
      totalRemainingSec: clamp(total - currentPos, 0, total),
      totalSec: total,
    };
  }

  function on(event, fn) {
    if (!listeners.has(event)) throw new Error(`createEngine.on: unknown event "${event}"`);
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  }

  function destroy() {
    stopTickTimer();
    audio?.stopAll();
    releaseWakeLock();
    if (typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    for (const set of listeners.values()) set.clear();
  }

  return {
    load,
    play,
    pause,
    toggle,
    seek,
    seekBy,
    skipForward,
    skipBack,
    seekToSection,
    setKeepAwake,
    getState,
    on,
    destroy,
  };
}
