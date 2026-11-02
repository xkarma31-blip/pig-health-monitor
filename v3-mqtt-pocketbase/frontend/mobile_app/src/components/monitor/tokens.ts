/**
 * Monitor stage tokens.
 *
 * The live-video / live-sensor stage uses the same palette as the Pi's
 * technician console (`backend/thermal-pi/static/admin/console.css`):
 * deep navy ground `#1a1a2e`, cyan/teal live accent `#35e0d0`.
 *
 * This is deliberately NOT a theme flip. The app's green brand identity stays
 * in `src/theme/theme.ts`; these tokens are scoped to the monitor surfaces so
 * the phone and the Pi console read as one system where video is displayed.
 *
 * Low-vision floor: never render body text below FONT_FLOOR (16px) on these
 * surfaces. See SOUL.md accessibility rules.
 */

export const stage = {
  /** Panel ground — the #1a1a2e from the T5 brief and the Pi console. */
  ground: '#1a1a2e',
  /** Video letterbox / deepest ground. */
  deep: '#0d0d1a',
  /** Hairline + control borders. */
  edge: '#3a3a5c',
  /** Primary ink on navy. */
  ink: '#eaf6ff',
  /** Secondary ink — still ≥ 7:1 on ground. */
  inkDim: '#a9c4dd',
  /** LIVE accent (cyan/teal). */
  live: '#35e0d0',
  /** Tinted live background. */
  liveSoft: 'rgba(53,224,208,0.14)',
  /** Data is arriving but late. */
  stale: '#ffb23f',
  /** Confirmed down. */
  offline: '#ff5d6c',
  /** Unknown / not configured. */
  idle: '#5a6180',
} as const;

/** Minimum body font size on monitor surfaces (low-vision requirement). */
export const FONT_FLOOR = 16;

/** Standard monitor text ramp — nothing below FONT_FLOOR. */
export const monitorText = {
  h1: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6 },
  h2: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '500' as const, lineHeight: 23 },
  label: { fontSize: 16, fontWeight: '700' as const, letterSpacing: 0.2 },
  micro: { fontSize: 16, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  metric: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.8 },
} as const;
