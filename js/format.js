// Formatting helpers — pure functions, no DOM/timer/storage access, safe in Node.
// Librata voice: sentence case, bare stats joined with " · ", no exclamation marks.

/**
 * Format a duration in seconds as "m:ss", or "h:mm:ss" once it reaches an hour.
 * Negative/fractional input is clamped to a whole non-negative second count.
 */
export function fmtTime(sec) {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Alias used where the call site is displaying a live countdown/clock rather
// than a static duration — same formatting rules, different semantic intent.
export const fmtClock = fmtTime;

/**
 * Bare-stat caption for a session: "30:00 · 3 sections".
 * Accepts a Session-shaped object ({ sections, closing }); sums section
 * durations directly so this module stays dependency-free (no store import).
 */
export function sessionCaption(session) {
  const totalSec = session.sections.reduce((sum, sec) => sum + sec.durationSec, 0);
  const count = session.sections.length;
  return `${fmtTime(totalSec)} · ${count} ${count === 1 ? 'section' : 'sections'}`;
}

/**
 * Caption for a section row: "5:00 · 1 bell". soundName is optional; when
 * given it's appended, e.g. for a closing-bells pseudo-row.
 */
export function sectionCaption(section, soundName) {
  return `${fmtTime(section.durationSec)} · ${bellsCaption(section.bells, soundName)}`;
}

/** Player screen caption: "Section 2 of 3 · 24:10 remaining". */
export function playerCaption(sectionIndex, totalSections, totalRemainingSec) {
  return `Section ${sectionIndex + 1} of ${totalSections} · ${fmtTime(totalRemainingSec)} remaining`;
}

/** Completed-state caption: "Complete — 30:00". */
export function completeCaption(totalSec) {
  return `Complete — ${fmtTime(totalSec)}`;
}

/**
 * Bells summary: "1 bell", "3 bells · 4s apart", or with soundName appended,
 * "3 bells · 4s apart · Tibetan bowl, deep".
 */
export function bellsCaption(bells, soundName) {
  const { count, gapSec } = bells;
  let caption = `${count} ${count === 1 ? 'bell' : 'bells'}`;
  if (count > 1) caption += ` · ${gapSec}s apart`;
  if (soundName) caption += ` · ${soundName}`;
  return caption;
}

const ROMAN_NUMERALS = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
];

/** Roman numeral for n in 1..20 (the section-list range). */
export function roman(n) {
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    throw new RangeError(`roman(n): n must be an integer in 1..20, got ${n}`);
  }
  return ROMAN_NUMERALS[n - 1];
}
