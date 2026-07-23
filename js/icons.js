// Librata Zazen — inline icon set, Phosphor-Thin style.
// viewBox 0 0 256 256, stroke currentColor, stroke-width 8, fill none, round caps/joins.

const PATHS = {
  pencil: `<path d="M92 208H48v-44L172.7 39.3a8 8 0 0 1 11.3 0l24.7 24.7a8 8 0 0 1 0 11.3Z"/><line x1="152" y1="60" x2="196" y2="104"/>`,
  'gear-six': `<circle cx="128" cy="128" r="40"/><path d="M128 24v32M128 200v32M24 128h32M200 128h32M56.6 56.6l22.6 22.6M176.8 176.8l22.6 22.6M56.6 199.4l22.6-22.6M176.8 79.2l22.6-22.6"/>`,
  plus: `<line x1="128" y1="48" x2="128" y2="208"/><line x1="48" y1="128" x2="208" y2="128"/>`,
  minus: `<line x1="48" y1="128" x2="208" y2="128"/>`,
  'caret-left': `<polyline points="160,48 96,128 160,208"/>`,
  'caret-down': `<polyline points="48,96 128,160 208,96"/>`,
  'caret-up': `<polyline points="48,160 128,96 208,160"/>`,
  play: `<path d="M72 44v168l144-84Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/>`,
  pause: `<rect x="64" y="48" width="40" height="160" rx="6" fill="currentColor" stroke="none"/><rect x="152" y="48" width="40" height="160" rx="6" fill="currentColor" stroke="none"/>`,
  'skip-back': `<polygon points="200,48 200,208 88,128" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/><line x1="56" y1="48" x2="56" y2="208"/>`,
  'skip-forward': `<polygon points="56,48 56,208 168,128" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/><line x1="200" y1="48" x2="200" y2="208"/>`,
  'arrow-counter-clockwise': `<path d="M48 128a80 80 0 1 0 23.4-56.6"/><polyline points="48,56 48,96 88,96"/>`,
  'arrow-clockwise': `<path d="M208 128a80 80 0 1 1-23.4-56.6"/><polyline points="208,56 208,96 168,96"/>`,
  sparkle: `<path d="M128 32c6 40 20 54 60 60c-40 6-54 20-60 60c-6-40-20-54-60-60c40-6 54-20 60-60Z" stroke-linejoin="round"/><circle cx="196" cy="176" r="8" fill="currentColor" stroke="none"/><circle cx="60" cy="72" r="6" fill="currentColor" stroke="none"/>`,
  x: `<line x1="64" y1="64" x2="192" y2="192"/><line x1="192" y1="64" x2="64" y2="192"/>`,
  check: `<polyline points="48,136 104,192 208,72"/>`,
  dot: `<circle cx="128" cy="128" r="16" fill="currentColor" stroke="none"/>`,
};

/**
 * Returns an inline SVG string for a Phosphor-Thin style icon.
 * @param {string} name - one of the icon names in PATHS
 * @param {number} size - width/height in px, default 24
 */
export function icon(name, size = 24) {
  const inner = PATHS[name];
  if (!inner) return '';
  return `<svg viewBox="0 0 256 256" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
