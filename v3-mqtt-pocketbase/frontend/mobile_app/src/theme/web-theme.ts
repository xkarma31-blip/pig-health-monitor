/**
 * PigPulse Web Theme System
 * Mirrors mobile theme system with CSS variables for web
 * Designed for farmers and veterinarians with accessibility improvements
 */

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface ThemeColors {
  // Primary colors
  primary: string;
  primaryVariant: string;
  secondary: string;
  secondaryVariant: string;
  
  // Status colors
  success: string;
  warning: string;
  error: string;
  info: string;
  
  // Background colors
  background: string;
  surface: string;
  surfaceVariant: string;
  
  // Text colors
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  
  // Border colors
  border: string;
  divider: string;
  
  // Special colors
  shadow: string;
  live: string;
  offline: string;
  online: string;

  // Thermal gradient colors
  thermal: {
    0: string;
    14: string;
    26: string;
    38: string;
    52: string;
    68: string;
    84: string;
    100: string;
  };
}

export interface ThemeTypography {
  display: string;
  headline: string;
  title: string;
  subtitle: string;
  body: string;
  caption: string;
}

export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export interface ThemeMetrics {
  borderRadius: {
    small: number;
    medium: number;
    large: number;
    xl: number;
  };
  elevation: {
    none: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  spacing: ThemeSpacing;
}

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  metrics: ThemeMetrics;
  isDark: boolean;
  contrast: 'normal' | 'high';
}

// Light theme - optimized for farmers in bright environments
export const lightTheme: Theme = {
  mode: 'light',
  colors: {
    primary: '#2E7D32', // Green - natural, healthy
    primaryVariant: '#1B5E20',
    secondary: '#1976D2', // Blue - professional, reliable
    secondaryVariant: '#1565C0',
    success: '#388E3C',
    warning: '#F57C00',
    error: '#D32F2F',
    info: '#1976D2',
    background: '#FFFFFF',
    surface: '#FAFAFA',
    surfaceVariant: '#F5F5F5',
    textPrimary: '#212121',
    textSecondary: '#757575',
    textDisabled: '#BDBDBD',
    border: '#E0E0E0',
    divider: '#BDBDBD',
    shadow: 'rgba(0, 0, 0, 0.1)',
    live: '#FF5722',
    offline: '#9E9E9E',
    online: '#4CAF50',

    thermal: {
      0: '#fff3c4',
      14: '#ffcf56',
      26: '#fb9a2d',
      38: '#f45b28',
      52: '#c81d5e',
      68: '#6e1e8c',
      84: '#2a1a5e',
      100: '#10102e',
    },
  },
  typography: {
    display: '34px',
    headline: '28px',
    title: '22px',
    subtitle: '16px',
    body: '14px',
    caption: '12px',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  metrics: {
    borderRadius: {
      small: 4,
      medium: 8,
      large: 12,
      xl: 16,
    },
    elevation: {
      none: 0,
      sm: 2,
      md: 4,
      lg: 8,
      xl: 16,
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      xxl: 48,
    },
  },
  isDark: false,
  contrast: 'normal',
};

// Dark theme - optimized for farmers in low-light environments
export const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    primary: '#66BB6A', // Light green - easy to see
    primaryVariant: '#43A047',
    secondary: '#64B5F6', // Light blue - easy to see
    secondaryVariant: '#42A5F5',
    success: '#66BB6A',
    warning: '#FFA726',
    error: '#EF5350',
    info: '#42A5F5',
    background: '#121212',
    surface: '#1E1E1E',
    surfaceVariant: '#2E2E2E',
    textPrimary: '#FFFFFF',
    textSecondary: '#B0B0B0',
    textDisabled: '#757575',
    border: '#424242',
    divider: '#424242',
    shadow: 'rgba(0, 0, 0, 0.3)',
    live: '#FF6B6B',
    offline: '#9E9E9E',
    online: '#4CAF50',

    thermal: {
      0: '#fff3c4',
      14: '#ffcf56',
      26: '#fb9a2d',
      38: '#f45b28',
      52: '#c81d5e',
      68: '#6e1e8c',
      84: '#2a1a5e',
      100: '#10102e',
    },
  },
  typography: {
    display: '34px',
    headline: '28px',
    title: '22px',
    subtitle: '16px',
    body: '14px',
    caption: '12px',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  metrics: {
    borderRadius: {
      small: 4,
      medium: 8,
      large: 12,
      xl: 16,
    },
    elevation: {
      none: 0,
      sm: 2,
      md: 4,
      lg: 8,
      xl: 16,
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      xxl: 48,
    },
  },
  isDark: true,
  contrast: 'high',
};

// High contrast theme - for accessibility
export const highContrastTheme: Theme = {
  mode: 'dark',
  colors: {
    primary: '#00FF00', // Bright green
    primaryVariant: '#00CC00',
    secondary: '#0099FF', // Bright blue
    secondaryVariant: '#0077CC',
    success: '#00FF00',
    warning: '#FFFF00',
    error: '#FF0000',
    info: '#00FFFF',
    background: '#000000',
    surface: '#000000',
    surfaceVariant: '#1A1A1A',
    textPrimary: '#FFFFFF',
    textSecondary: '#FFFFFF',
    textDisabled: '#808080',
    border: '#FFFFFF',
    divider: '#FFFFFF',
    shadow: 'rgba(255, 255, 255, 0.3)',
    live: '#FF0000',
    offline: '#888888',
    online: '#00FF00',

    thermal: {
      0: '#fff3c4',
      14: '#ffcf56',
      26: '#fb9a2d',
      38: '#f45b28',
      52: '#c81d5e',
      68: '#6e1e8c',
      84: '#2a1a5e',
      100: '#10102e',
    },
  },
  typography: {
    display: '36px',
    headline: '32px',
    title: '26px',
    subtitle: '18px',
    body: '16px',
    caption: '14px',
  },
  spacing: {
    xs: 6,
    sm: 12,
    md: 24,
    lg: 36,
    xl: 48,
    xxl: 72,
  },
  metrics: {
    borderRadius: {
      small: 6,
      medium: 12,
      large: 18,
      xl: 24,
    },
    elevation: {
      none: 0,
      sm: 4,
      md: 8,
      lg: 16,
      xl: 24,
    },
    spacing: {
      xs: 6,
      sm: 12,
      md: 24,
      lg: 36,
      xl: 48,
      xxl: 72,
    },
  },
  isDark: true,
  contrast: 'high',
};

export interface ThemeContextType {
  theme: Theme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  isHighContrast: boolean;
  toggleHighContrast: () => void;
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  initialMode?: ThemeMode;
}

// CSS Variable generation utility
export function generateCSSVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  
  // Colors
  Object.entries(theme.colors).forEach(([key, value]) => {
    vars[`--color-${key}`] = value;
  });
  
  // Typography
  Object.entries(theme.typography).forEach(([key, value]) => {
    vars[`--font-${key}`] = value;
  });
  
  // Spacing
  Object.entries(theme.spacing).forEach(([key, value]) => {
    vars[`--spacing-${key}`] = `${value}px`;
  });
  
  // Border radius
  Object.entries(theme.metrics.borderRadius).forEach(([key, value]) => {
    vars[`--radius-${key}`] = `${value}px`;
  });
  
  // Elevation (shadows)
  Object.entries(theme.metrics.elevation).forEach(([key, value]) => {
    vars[`--elevation-${key}`] = `${value}px`;
  });
  
  return vars;
}

// Apply CSS variables to document root
export function applyThemeToDOM(theme: Theme): void {
  if (typeof window === 'undefined') return;
  
  const root = document.documentElement;
  const vars = generateCSSVariables(theme);
  
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  
  // Set theme attribute for CSS selectors
  root.setAttribute('data-theme', theme.mode);
  root.setAttribute('data-contrast', theme.contrast);
}

// Temperature status helpers (shared with mobile)
export const getTemperatureStatus = (temp: number, isSurfaceTemp: boolean = false): 'normal' | 'elevated' | 'high' => {
  const normalMin = 38.7;
  const normalMax = 39.8;
  
  const surfaceNormalMin = 37.7;
  const surfaceNormalMax = 38.8;
  
  const min = isSurfaceTemp ? surfaceNormalMin : normalMin;
  const max = isSurfaceTemp ? surfaceNormalMax : normalMax;
  
  if (temp >= min && temp <= max) {
    return 'normal';
  } else if (temp > max && temp <= max + 1) {
    return 'elevated';
  } else {
    return 'high';
  }
};

export const getTemperatureColor = (temp: number, isSurfaceTemp: boolean = false, theme: Theme): string => {
  const status = getTemperatureStatus(temp, isSurfaceTemp);
  
  switch (status) {
    case 'normal':
      return theme.colors.success;
    case 'elevated':
      return theme.colors.warning;
    case 'high':
      return theme.colors.error;
    default:
      return theme.colors.textPrimary;
  }
};

export const getStatusIcon = (status: 'normal' | 'elevated' | 'high'): string => {
  switch (status) {
    case 'normal':
      return '✓';
    case 'elevated':
      return '⚠';
    case 'high':
      return '✗';
    default:
      return '?';
  }
};

// Preset themes for different user needs
export const FARMER_THEME = {
  ...lightTheme,
  colors: {
    ...lightTheme.colors,
    primary: '#2E7D32',
    secondary: '#1976D2',
    success: '#388E3C',
    warning: '#F57C00',
    error: '#D32F2F',
  },
};

export const VETERINARIAN_THEME = {
  ...lightTheme,
  colors: {
    ...lightTheme.colors,
    primary: '#1565C0',
    secondary: '#7B1FA2',
    success: '#388E3C',
    warning: '#F57C00',
    error: '#D32F2F',
  },
};

export const NIGHT_THEME = {
  ...darkTheme,
  colors: {
    ...darkTheme.colors,
    primary: '#66BB6A',
    secondary: '#64B5F6',
    background: '#0D1117',
    surface: '#161B22',
    surfaceVariant: '#21262D',
    textPrimary: '#C9D1D9',
    textSecondary: '#8B949E',
    border: '#30363D',
    divider: '#30363D',
  },
};