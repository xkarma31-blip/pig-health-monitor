/**
 * PigPulse theme tokens — Pigpulse design system.
 *
 * Neutral canvas (near-white light / true near-black dark) with one
 * consistent brand green carried through the logo, icon chips, buttons,
 * and active states — same hue in both modes, just brighter in dark mode
 * so it stays legible.
 *
 * This module is PURE DATA (no JSX, no React). The React provider lives
 * in ThemeContext.tsx.
 */

// ── Core types ─────────────────────────────────────────────────────
export type ColorScheme = 'light' | 'dark';
export type ThemeMode = 'light' | 'dark' | 'auto';
export type SchemeOverride = ColorScheme | 'system';
export type Status = 'healthy' | 'watch' | 'alert' | 'info' | 'neutral' | 'normal' | 'elevated' | 'high' | 'critical';
export type ContrastLevel = 'normal' | 'high';

// ── Design tokens ──────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 27, fontWeight: '800' as const, letterSpacing: -0.7 },
  h2: { fontSize: 15, fontWeight: '600' as const },
  label: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.3 },
  caption: {
    fontSize: 12.5,
    fontWeight: '600' as const,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
  },
  body: { fontSize: 14, fontWeight: '400' as const },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, lineHeight: 19 },
  stat: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: '700' as const },
  fontSize: {
    caption: 11,
    bodySmall: 13,
    body: 14,
    subhead: 15,
    headline: 17,
    title: 20,
    hero: 28,
  },
};

export const fontFamilies = {
  body: 'Inter, system-ui, sans-serif',
  heading: 'Inter, system-ui, sans-serif',
  mono: 'JetBrainsMono, monospace',
};

// ── Color palettes ─────────────────────────────────────────────────
// Design tokens plus legacy alias keys so the pre-existing app surface
// (web screens, login, ThemeSwitcher, etc.) keeps resolving.

export interface ThemeColors {
  // Design tokens
  bg: string;
  surface: string;
  divider: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  healthy: string;
  healthySoft: string;
  watch: string;
  watchSoft: string;
  alert: string;
  alertSoft: string;
  info: string;
  infoSoft: string;
  // Legacy aliases (mapped to design tokens)
  background: string;
  surfaceVariant: string;
  surfaceAlt: string;
  backgroundVariant: string;
  primary: string;
  secondary: string;
  tertiary: string;
  error: string;
  errorContainer: string;
  success: string;
  successContainer: string;
  warning: string;
  warningContainer: string;
  infoContainer: string;
  textDisabled: string;
  text: string;
  white: string;
  border: string;
  borderVariant: string;
  shadow: string;
  overlay: string;
  facebook: string;
  badgeBg: string;
  badgeText: string;
  buttonPrimaryText: string;
  thermal: string;
}

const lightColors: ThemeColors = {
  // Design tokens
  bg: '#F2F6F1',
  surface: '#FFFFFF',
  divider: '#E3EAE1',
  textPrimary: '#1E2A20',
  textSecondary: '#6B7C6D',
  textMuted: '#9CA89D',
  accent: '#1E8449',
  accentSoft: '#DFF3E4',
  onAccent: '#FFFFFF',
  healthy: '#2E7D4F',
  healthySoft: '#DFF3E4',
  watch: '#A9762E',
  watchSoft: '#F1DFC0',
  alert: '#A14A3C',
  alertSoft: '#F2D9D3',
  info: '#4E6E86',
  infoSoft: '#D9E4EA',
  // Legacy aliases
  background: '#F2F6F1',
  surfaceVariant: '#FFFFFF',
  surfaceAlt: '#F5F8F4',
  backgroundVariant: '#ECF0EB',
  primary: '#1E8449',
  secondary: '#156C3A',
  tertiary: '#2E7D4F',
  error: '#A14A3C',
  errorContainer: '#F2D9D3',
  success: '#2E7D4F',
  successContainer: '#DFF3E4',
  warning: '#A9762E',
  warningContainer: '#F1DFC0',
  infoContainer: '#D9E4EA',
  textDisabled: '#9CA89D',
  text: '#1E2A20',
  white: '#FFFFFF',
  border: '#E3EAE1',
  borderVariant: '#E3EAE1',
  shadow: '#000000',
  overlay: '#000000',
  facebook: '#1877F2',
  badgeBg: '#ECF0EB',
  badgeText: '#3E5743',
  buttonPrimaryText: '#FFFFFF',
  thermal: '#FB9A2D',
};

const darkColors: ThemeColors = {
  // Design tokens
  bg: '#121314',
  surface: '#1D1F21',
  divider: '#2B2D2F',
  textPrimary: '#F2F3F1',
  textSecondary: '#A6A9A6',
  textMuted: '#A3A8A4',
  accent: '#3DDC84',
  accentSoft: '#16321F',
  onAccent: '#0A140E',
  healthy: '#3DDC84',
  healthySoft: '#16321F',
  watch: '#D9A05B',
  watchSoft: '#3D3121',
  alert: '#D06B5A',
  alertSoft: '#3E2721',
  info: '#8FB4C9',
  infoSoft: '#25333A',
  // Legacy aliases
  background: '#121314',
  surfaceVariant: '#1D1F21',
  surfaceAlt: '#282A2C',
  backgroundVariant: '#17191B',
  primary: '#3DDC84',
  secondary: '#34C875',
  tertiary: '#3DDC84',
  error: '#D06B5A',
  errorContainer: '#3E2721',
  success: '#3DDC84',
  successContainer: '#16321F',
  warning: '#D9A05B',
  warningContainer: '#3D3121',
  infoContainer: '#25333A',
  textDisabled: '#8B908C',
  text: '#F2F3F1',
  white: '#FFFFFF',
  border: '#2B2D2F',
  borderVariant: '#2B2D2F',
  shadow: '#000000',
  overlay: '#000000',
  facebook: '#1877F2',
  badgeBg: '#282A2C',
  badgeText: '#A6A9A6',
  buttonPrimaryText: '#0A140E',
  thermal: '#FB9A2D',
};

// ── Status colors ──────────────────────────────────────────────────
export const statusColor = (colors: ThemeColors, status: Status) => {
  switch (status) {
    case 'healthy':
      return { fg: colors.healthy, bg: colors.healthySoft };
    case 'watch':
    case 'elevated':
      return { fg: colors.watch, bg: colors.watchSoft };
    case 'alert':
    case 'high':
    case 'critical':
      return { fg: colors.alert, bg: colors.alertSoft };
    case 'info':
      return { fg: colors.info, bg: colors.infoSoft };
    default:
      return { fg: colors.textMuted, bg: colors.divider };
  }
};

// ── Theme shape ────────────────────────────────────────────────────
export type ThemeTypography = typeof typography;
export type ThemeSpacing = typeof spacing;

export interface ThemeMetrics {
  breakpoints: { xs: number; sm: number; md: number; lg: number; xl: number };
  mediaQuery: string;
}

export interface Theme {
  colors: ThemeColors;
  spacing: typeof spacing;
  borderRadius: typeof radius;
  typography: ThemeTypography;
  mode: ColorScheme;
  isDark: boolean;
  contrast: ContrastLevel;
  fontFamilies: typeof fontFamilies;
  metrics: ThemeMetrics;
}

const baseMetrics: ThemeMetrics = {
  breakpoints: { xs: 0, sm: 600, md: 960, lg: 1280, xl: 1920 },
  mediaQuery: '(min-width: 600px)',
};

// ── Full themes ────────────────────────────────────────────────────
export const lightTheme: Theme = {
  colors: lightColors,
  spacing,
  borderRadius: radius,
  typography,
  mode: 'light',
  isDark: false,
  contrast: 'normal',
  fontFamilies,
  metrics: baseMetrics,
};

export const darkTheme: Theme = {
  colors: darkColors,
  spacing,
  borderRadius: radius,
  typography,
  mode: 'dark',
  isDark: true,
  contrast: 'normal',
  fontFamilies,
  metrics: baseMetrics,
};

export const highContrastTheme: Theme = {
  colors: {
    ...darkColors,
    bg: '#0B0C0B',
    surface: '#17181A',
    divider: '#3A3D3F',
    textPrimary: '#FFFFFF',
    textSecondary: '#D0D3D0',
    textMuted: '#B0B4B1',
    accent: '#4DE59A',
    healthy: '#4DE59A',
    watch: '#FFC46B',
    alert: '#FF8A77',
    info: '#9FC7E8',
    background: '#0B0C0B',
    border: '#3A3D3F',
  },
  spacing,
  borderRadius: radius,
  typography,
  mode: 'dark',
  isDark: true,
  contrast: 'high',
  fontFamilies,
  metrics: baseMetrics,
};

const resolveSystemScheme = (): ColorScheme => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
};

export function getTheme(mode: ThemeMode, contrast: ContrastLevel = 'normal'): Theme {
  const resolved: ColorScheme = mode === 'auto' ? resolveSystemScheme() : mode;
  const base = resolved === 'dark' ? darkTheme : lightTheme;
  return contrast === 'high' ? highContrastTheme : base;
}

// ── Semantic helpers ───────────────────────────────────────────────
export function presetOnSolidBg(theme: Theme, preset: 'primary' | 'onPrimary' | 'accent' | 'onAccent' | 'destructive' | 'onDestructive' | 'surface' | 'onSurface' | 'muted' | 'onMuted') {
  switch (preset) {
    case 'onPrimary':
      return theme.colors.buttonPrimaryText;
    case 'onAccent':
      return theme.colors.onAccent;
    case 'destructive':
      return theme.colors.alert;
    case 'onDestructive':
      return '#FFFFFF';
    case 'onSurface':
      return theme.colors.textPrimary;
    case 'muted':
      return theme.colors.textMuted;
    case 'onMuted':
      return '#FFFFFF';
    case 'primary':
      return theme.colors.accent;
    case 'accent':
      return theme.colors.accent;
    case 'surface':
      return theme.colors.surface;
    default:
      return theme.colors.textPrimary;
  }
}

export function semanticSurface(theme: Theme, semantic: 'primary' | 'accent' | 'destructive' | 'surface' | 'muted' | 'warning') {
  switch (semantic) {
    case 'primary':
      return theme.colors.accentSoft;
    case 'accent':
      return theme.colors.accentSoft;
    case 'destructive':
      return theme.colors.alertSoft;
    case 'warning':
      return theme.colors.watchSoft;
    case 'muted':
      return theme.colors.badgeBg;
    case 'surface':
    default:
      return theme.colors.surface;
  }
}

export function screenContainerStyle(theme: Theme, { padded = true, translucent = false }: { padded?: boolean; translucent?: boolean } = {}) {
  return {
    flex: 1 as const,
    backgroundColor: translucent ? 'transparent' : theme.colors.bg,
    paddingHorizontal: padded ? theme.spacing.lg : 0,
  };
}

export function headingFontFamily(theme: Theme) {
  return theme.fontFamilies.heading;
}

export function bodyFontFamily(theme: Theme) {
  return theme.fontFamilies.body;
}

export function monoFontFamily(theme: Theme) {
  return theme.fontFamilies.mono;
}