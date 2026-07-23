# Librata design notes — what implementers must know beyond tokens.css

Condensed from the Librata Design System README. `css/tokens.css` is the source of
truth for all values; never hardcode palette colors, radii, or durations.

## Themes

Default theme for Zazen is **Carta** (paper/e-ink). Dawn is selectable in settings.
Carta is Dawn with only the palette swapped — switching must be pure
`data-theme="carta"` on `<html>`; no structural CSS may differ per theme.
On Carta, `--fg-pearl` resolves to ink (#181818) and the sky gradient to a soft
paper-grey wash, so write all styles against the semantic tokens (`--fg-pearl`,
`--fg-pearl-soft`, `--gradient-sky`, hairlines, shadows) and both themes work.
Carta-only tokens also available: `--ink-soft --ink-quiet --ink-faint --paper-edge
--paper` (give Dawn-safe fallbacks: `var(--ink-quiet, var(--fg-pearl-soft))`).

E-paper cares: opaque sheets/modals on Carta (tokens.css already forces this for
`.menu-sheet`/`.menu-scrim`), animate opacity/transform only, nothing scales on
hover or press (hover = opacity 0.86 @120ms; press = ~6% darken @120ms).

## Voice (all product copy)

- Sentence case everywhere (`New session`, never `New Session`). Exception: the
  `LIBRATA` wordmark and small-caps labels.
- No exclamation marks. No emoji. No "Tap to…" hand-holding.
- Em dash for tonal pauses — `Complete — 30:00`.
- Bare stats with middle dots: `30:00 · 3 sections`. Numerals for data.
- Confirmations gentle: `Delete this session? Keep / Delete`.
- Errors are diagnoses, not apologies: `No sound available.`
- Two registers: poetic simplicity everywhere in-product; the monospace system-audit
  block ONLY in Settings → About. Never blend them.

## Type

- Cormorant Garamond Light (300) for display: session/section names, all numerals
  and countdowns (`--font-numeric`, `font-variant-numeric: lining-nums tabular-nums`).
- Manrope 400/500/600 for UI. Never bold/black. Hierarchy by size + tracking, not weight.
- Wordmark: Cormorant Light caps, `letter-spacing: 0.32em`, flanking dots.

## Shape & depth

- Radii: 14px (`--radius-lg`) CTAs · 20px (`--radius-surface`) sheets/modals ·
  pills (`--radius-pill`) only for circular icon buttons.
- Hairline 1px borders (`--border-hairline-light`); soft token shadows.
- Touch targets ≥48px (`--space-9`).

## Motion

- Only `--ease-poise`; durations 180/360/720ms tokens. No bounce, no spring,
  no scaling. Respect `prefers-reduced-motion`.

## Icons

Phosphor-Thin style, self-hosted inline SVG (js/icons.js), 1px-equivalent stroke
(stroke-width 8 on a 256 viewBox), `stroke="currentColor"`, round caps. 24px
standard, never below 16px. Zazen roles: gear-six settings · pencil edit ·
play/pause · skip-back/skip-forward · arrow-counter/clockwise ±30 · sparkle
complete (only) · caret navigation · plus/minus/x.

## Logo

`assets/logo/librata-mark.svg` (sun-arc + three stars) and `librata-wordmark.svg`
use `currentColor` — render in ink on Carta, pearl on Dawn, via CSS color.
