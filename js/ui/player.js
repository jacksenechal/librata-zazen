import { icon } from '../icons.js';
import { escapeHtml, formatClock, statLine, romanNumeral } from './util.js';

export function render(root, ctx) {
  const { store, engine, navigate, goBack } = ctx;
  const unsubscribers = [];
  let dragging = false;
  let lastPlaying = null;
  let lastSectionIndex = null;

  const initial = engine.getState();
  if (!initial || !initial.session) {
    navigate('home');
    return () => {};
  }

  function paint() {
    const state = engine.getState();
    if (state.completed) {
      paintCompleted(state);
    } else {
      paintLive(state);
    }
  }

  function paintCompleted(state) {
    const session = state.session;
    const sectionCount = session.sections.length;
    root.innerHTML = `
      <div class="screen-inner player-screen">
        <header class="topbar">
          <button type="button" class="icon-btn" data-action="close" aria-label="Return home">${icon('caret-down', 22)}</button>
          <p class="caption player-session-caption">${escapeHtml(session.name)}</p>
          <span class="topbar-spacer" aria-hidden="true"></span>
        </header>
        <main class="player-completed">
          <span class="player-completed-icon">${icon('sparkle', 40)}</span>
          <h1 class="h2">Complete</h1>
          <p class="caption">${statLine([formatClock(state.totalSec), `${sectionCount} section${sectionCount === 1 ? '' : 's'}`])}</p>
          <button type="button" class="btn-ghost" data-action="done">Done</button>
        </main>
      </div>
    `;
    root.querySelector('[data-action="close"]').addEventListener('click', () => goBack());
    root.querySelector('[data-action="done"]').addEventListener('click', () => goBack());
  }

  // Live-mode node refs, populated by paintLive(); mutated by updateTick().
  let nodes = null;

  function paintLive(state) {
    const session = state.session;
    const sectionStarts = store.sectionStarts(session);
    const total = state.totalSec;

    const dots = sectionStarts.slice(1).map((b) => {
      const pct = total > 0 ? (b / total) * 100 : 0;
      return `<div class="player-progress-dot" style="left:${pct}%"></div>`;
    }).join('');

    const trackRows = session.sections.map((section, i) => `
      <li>
        <button type="button" class="track-row" data-index="${i}" aria-label="Seek to ${escapeHtml(section.name)}">
          <span class="track-numeral numeric">${romanNumeral(i + 1)}</span>
          <span class="track-name">${escapeHtml(section.name)}</span>
          <span class="track-duration numeric">${formatClock(section.durationSec)}</span>
          <div class="track-row-progress"><div class="track-row-progress-fill"></div></div>
        </button>
      </li>
    `).join('');

    root.innerHTML = `
      <div class="screen-inner player-screen">
        <header class="topbar">
          <button type="button" class="icon-btn" data-action="close" aria-label="Return home">${icon('caret-down', 22)}</button>
          <p class="caption player-session-caption">${escapeHtml(session.name)}</p>
          <span class="topbar-spacer" aria-hidden="true"></span>
        </header>
        <p class="sr-only" data-role="announce" aria-live="polite"></p>
        <main class="player-center">
          <h1 class="player-section-name" data-role="section-name"></h1>
          <div class="player-countdown numeric" data-role="countdown" aria-live="off"></div>
          <p class="caption" data-role="caption"></p>
        </main>
        <div class="player-progress" data-role="progress" role="slider" tabindex="0"
             aria-label="Playback position" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="0">
          <div class="player-progress-track" data-role="track">
            <div class="player-progress-fill" data-role="fill"></div>
            ${dots}
          </div>
          <div class="player-progress-labels">
            <span class="numeric" data-role="elapsed">0:00</span>
            <span class="numeric" data-role="total">${formatClock(total)}</span>
          </div>
        </div>
        <div class="player-transport">
          <button type="button" class="transport-playpause" data-action="toggle" data-role="playpause" aria-label="Play">${icon('play', 28)}</button>
        </div>
        <div class="player-tracklist-scroll" data-role="tracklist-scroll">
          <ol class="tracklist">${trackRows}</ol>
        </div>
      </div>
    `;

    nodes = {
      announce: root.querySelector('[data-role="announce"]'),
      sectionName: root.querySelector('[data-role="section-name"]'),
      countdown: root.querySelector('[data-role="countdown"]'),
      caption: root.querySelector('[data-role="caption"]'),
      progress: root.querySelector('[data-role="progress"]'),
      track: root.querySelector('[data-role="track"]'),
      fill: root.querySelector('[data-role="fill"]'),
      elapsed: root.querySelector('[data-role="elapsed"]'),
      playpause: root.querySelector('[data-role="playpause"]'),
      trackRows: Array.from(root.querySelectorAll('.track-row')),
      tracklistScroll: root.querySelector('[data-role="tracklist-scroll"]'),
    };
    lastPlaying = null;
    lastSectionIndex = null;

    root.querySelector('[data-action="close"]').addEventListener('click', () => goBack());
    root.querySelector('[data-action="toggle"]').addEventListener('click', () => engine.toggle());
    nodes.trackRows.forEach((rowEl) => {
      rowEl.addEventListener('click', () => engine.seekToSection(Number(rowEl.dataset.index)));
    });

    wireScrub(nodes.progress, nodes.track, total);
    updateTracklistEdge();
    window.addEventListener('resize', updateTracklistEdge);
    updateTick(engine.getState());
  }

  /** A quiet hairline on the tracklist's top edge only when it actually has
   * more content than fits — an overflow affordance, not a permanent divider. */
  function updateTracklistEdge() {
    const el = nodes?.tracklistScroll;
    if (!el) return;
    el.classList.toggle('screen-scroll--edge', el.scrollHeight > el.clientHeight + 1);
  }

  function wireScrub(progressEl, trackEl, total) {
    const posFromEvent = (evt) => {
      const rect = trackEl.getBoundingClientRect();
      const ratio = rect.width > 0 ? (evt.clientX - rect.left) / rect.width : 0;
      return Math.min(total, Math.max(0, ratio * total));
    };
    const onMove = (evt) => {
      if (!dragging) return;
      const pos = posFromEvent(evt);
      engine.seek(pos);
      updateTick(engine.getState());
    };
    const onDown = (evt) => {
      dragging = true;
      progressEl.setPointerCapture?.(evt.pointerId);
      onMove(evt);
    };
    const onUp = () => { dragging = false; };
    progressEl.addEventListener('pointerdown', onDown);
    progressEl.addEventListener('pointermove', onMove);
    progressEl.addEventListener('pointerup', onUp);
    progressEl.addEventListener('pointercancel', onUp);
  }

  function updateTick(state) {
    if (!nodes || state.completed) return;
    const session = state.session;
    const section = session.sections[state.sectionIndex];

    nodes.sectionName.textContent = section.name;
    nodes.countdown.textContent = formatClock(state.sectionRemainingSec);
    nodes.caption.textContent = statLine([
      `Section ${state.sectionIndex + 1} of ${session.sections.length}`,
      `${formatClock(state.totalRemainingSec)} remaining`,
    ]);

    const elapsed = state.totalSec - state.totalRemainingSec;
    const pct = state.totalSec > 0 ? (elapsed / state.totalSec) * 100 : 0;
    nodes.fill.style.width = `${pct}%`;
    nodes.elapsed.textContent = formatClock(elapsed);
    nodes.progress.setAttribute('aria-valuenow', String(Math.round(elapsed)));

    if (state.playing !== lastPlaying) {
      nodes.playpause.innerHTML = icon(state.playing ? 'pause' : 'play', 28);
      nodes.playpause.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
      lastPlaying = state.playing;
    }

    const sectionStarts = store.sectionStarts(session);
    nodes.trackRows.forEach((rowEl, i) => {
      const status = i < state.sectionIndex ? 'is-done' : i === state.sectionIndex ? 'is-current' : 'is-upcoming';
      rowEl.classList.toggle('is-done', status === 'is-done');
      rowEl.classList.toggle('is-current', status === 'is-current');
      rowEl.classList.toggle('is-upcoming', status === 'is-upcoming');
      // Every row's fill derives from the current position on every update
      // (not just the current row's): a row that was "current" a moment
      // ago and is now behind or ahead of the playhead (e.g. after a seek)
      // must not keep the fractional width it last had.
      let rowPct;
      if (status === 'is-done') {
        rowPct = 100;
      } else if (status === 'is-current') {
        const secDuration = session.sections[i].durationSec;
        const into = state.positionSec - sectionStarts[i];
        rowPct = secDuration > 0 ? Math.min(100, Math.max(0, (into / secDuration) * 100)) : 0;
      } else {
        rowPct = 0;
      }
      const fillEl = rowEl.querySelector('.track-row-progress-fill');
      if (fillEl) fillEl.style.width = `${rowPct}%`;
    });

    if (state.sectionIndex !== lastSectionIndex) {
      if (lastSectionIndex !== null) {
        nodes.announce.textContent = `Section ${state.sectionIndex + 1} of ${session.sections.length}: ${section.name}`;
      }
      lastSectionIndex = state.sectionIndex;
    }
  }

  paint();

  unsubscribers.push(engine.on('tick', (s) => updateTick(s || engine.getState())));
  unsubscribers.push(engine.on('playstate', () => updateTick(engine.getState())));
  unsubscribers.push(engine.on('sectionchange', () => updateTick(engine.getState())));
  unsubscribers.push(engine.on('complete', () => paint()));

  return () => {
    window.removeEventListener('resize', updateTracklistEdge);
    unsubscribers.forEach((unsub) => {
      if (typeof unsub === 'function') unsub();
    });
  };
}
