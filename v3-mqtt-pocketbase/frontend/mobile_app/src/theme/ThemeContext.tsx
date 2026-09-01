/**
 * Theme Provider and Context
 *
 * Single source of truth for theme state. Exposes the Pigpulse design
 * API (colors / spacing / radius / typography / scheme / schemeOverride)
 * plus the legacy surface the rest of the app was built against
 * (theme / themeMode / mode / isDark / contrast / borderRadius / ...).
 */

import React, { createContext, useContext, useState } from 'react';
import { useColorScheme } from 'react-native';
import {
  Theme,
  ThemeColors,
  ThemeMode,
  ThemeTypography,
  SchemeOverride,
  ColorScheme,
  lightTheme,
  darkTheme,
  highContrastTheme,
  radius as baseRadius,
} from './theme';

// ── Context type ───────────────────────────────────────────────────
export interface ThemeContextType extends Theme {
  theme: Theme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  isHighContrast: boolean;
  toggleHighContrast: () => void;
  schemeOverride: SchemeOverride;
  setSchemeOverride: (mode: SchemeOverride) => void;
  radius: typeof baseRadius;
  scheme: ColorScheme;
  textMuted: string;
  shadows: string;
  opacity: number;
  zIndex: number;
  transitions: string;
  breakpoints: { xs: number; sm: number; md: number; lg: number; xl: number };
  mediaQuery: string;
}

// ── Provider ───────────────────────────────────────────────────────
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  initialMode?: ThemeMode;
}

export function ThemeProvider({ children, initialMode = 'auto' }: ThemeProviderProps) {
  const systemScheme = (useColorScheme() ?? 'light') as ColorScheme;
  const initialOverride: SchemeOverride = initialMode === 'auto' ? 'system' : initialMode;
  const [schemeOverride, setSchemeOverride] = useState<SchemeOverride>(initialOverride);
  const [isHighContrast, setIsHighContrast] = useState(false);

  const scheme: ColorScheme = schemeOverride === 'system' ? systemScheme : schemeOverride;
  const theme: Theme = isHighContrast ? highContrastTheme : scheme === 'dark' ? darkTheme : lightTheme;

  const themeMode: ThemeMode = schemeOverride === 'system' ? 'auto' : schemeOverride;

  const setThemeMode = (mode: ThemeMode) => {
    setSchemeOverride(mode === 'auto' ? 'system' : mode);
  };

  const toggleTheme = () => {
    setSchemeOverride((prev) => {
      if (prev === 'system') return systemScheme === 'dark' ? 'light' : 'dark';
      return prev === 'light' ? 'dark' : 'light';
    });
  };

  const toggleHighContrast = () => {
    setIsHighContrast((h) => !h);
  };

  const value: ThemeContextType = {
    ...theme,
    theme,
    themeMode,
    setThemeMode,
    toggleTheme,
    isHighContrast,
    toggleHighContrast,
    schemeOverride,
    setSchemeOverride,
    radius: theme.borderRadius,
    scheme: theme.mode,
    textMuted: theme.colors.textMuted,
    shadows: theme.colors.shadow,
    opacity: 1,
    zIndex: 1000,
    transitions: 'all 0.3s ease',
    breakpoints: { xs: 0, sm: 600, md: 960, lg: 1280, xl: 1920 },
    mediaQuery: '(min-width: 600px)',
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// ── Google Stitch integration for theme consistency ────────────────
export function useGoogleStich() {
  const { theme, setThemeMode } = useTheme();

  const syncWithGoogleStich = (stichTheme: 'light' | 'dark' | 'auto') => {
    setThemeMode(stichTheme as ThemeMode);
  };

  const exportThemeForStich = () => {
    return {
      mode: theme.mode,
      colors: theme.colors,
      typography: theme.typography,
      spacing: theme.spacing,
      borderRadius: theme.borderRadius,
    };
  };

  return {
    syncWithGoogleStich,
    exportThemeForStich,
    currentTheme: theme,
  };
}

// ── Accessibility utilities ────────────────────────────────────────
export function useAccessibility() {
  const { theme, isHighContrast } = useTheme();

  const getLuminance = (color: string): number => {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    return 0.5;
  };

  const getContrastRatio = (color1: string, color2: string): number => {
    const luminance1 = getLuminance(color1);
    const luminance2 = getLuminance(color2);
    const lighter = Math.max(luminance1, luminance2);
    const darker = Math.min(luminance1, luminance2);
    return (lighter + 0.05) / (darker + 0.05);
  };

  const ensureMinimumContrast = (textColor: string, backgroundColor: string): boolean => {
    const contrast = getContrastRatio(textColor, backgroundColor);
    const minimumContrast = isHighContrast ? 7 : 4.5;
    return contrast >= minimumContrast;
  };

  const getAccessibleColor = (textColor: string, backgroundColor: string): string => {
    if (ensureMinimumContrast(textColor, backgroundColor)) {
      return textColor;
    }
    return theme.isDark ? '#FFFFFF' : '#000000';
  };

  return {
    getContrastRatio,
    ensureMinimumContrast,
    getAccessibleColor,
    isHighContrast,
    theme,
  };
}

// ── Theme variant helpers ──────────────────────────────────────────
export function createThemeVariant(
  baseTheme: Theme,
  customColors: Partial<ThemeColors> = {}
): Theme {
  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      ...customColors,
    },
  };
}

export function createThemePreset(
  name: string,
  colors: Partial<ThemeColors>,
  typographyOverrides: Partial<ThemeTypography> = {}
): Theme {
  const baseTheme = name === 'dark' ? darkTheme : lightTheme;
  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      ...colors,
    },
    typography: {
      ...baseTheme.typography,
      ...typographyOverrides,
    },
  };
}

// Preset themes for different user needs
export const FARMER_THEME = createThemePreset('farmer', {
  primary: '#2E7D32',
  secondary: '#1976D2',
  success: '#388E3C',
  warning: '#F57C00',
  error: '#D32F2F',
});

export const VETERINARIAN_THEME = createThemePreset('veterinarian', {
  primary: '#1565C0',
  secondary: '#7B1FA2',
  success: '#388E3C',
  warning: '#F57C00',
  error: '#D32F2F',
});

export const NIGHT_THEME = createThemePreset('night', {
  primary: '#66BB6A',
  secondary: '#64B5F6',
  background: '#0D1117',
  surface: '#161B22',
  surfaceVariant: '#21262D',
  textPrimary: '#C9D1D9',
  textSecondary: '#8B949E',
  border: '#30363D',
  divider: '#30363D',
});