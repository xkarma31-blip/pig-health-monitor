import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { Theme, ThemeMode, getTheme } from './theme';

interface WebThemeContextType {
  theme: Theme;
  mode: ThemeMode;
  contrast: 'normal' | 'high';
  setMode: (mode: ThemeMode) => void;
  setContrast: (contrast: 'normal' | 'high') => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const WebThemeContext = createContext<WebThemeContextType | null>(null);

export const useWebTheme = (): WebThemeContextType => {
  const context = useContext(WebThemeContext);
  if (!context) {
    throw new Error('useWebTheme must be used within a WebThemeProvider');
  }
  return context;
};

interface WebThemeProviderProps {
  children: ReactNode;
  initialMode?: ThemeMode;
  initialContrast?: 'normal' | 'high';
}

export const WebThemeProvider: React.FC<WebThemeProviderProps> = ({
  children,
  initialMode = 'auto',
  initialContrast = 'normal',
}) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof localStorage === 'undefined') return initialMode;
    return (localStorage.getItem('pigpulse-theme-mode') as ThemeMode) || initialMode;
  });
  const [contrast, setContrast] = useState<'normal' | 'high'>(() => {
    if (typeof localStorage === 'undefined') return initialContrast;
    return (localStorage.getItem('pigpulse-theme-contrast') as 'normal' | 'high') || initialContrast;
  });
  const [systemColorScheme, setSystemColorScheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const theme = useMemo(() => getTheme(mode, contrast), [mode, contrast, systemColorScheme]);

  // Listen to system color scheme changes
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemColorScheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Update theme when mode or contrast changes
  useEffect(() => {
    const newTheme = getTheme(mode, contrast);

    // Apply CSS variables to document for web
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      Object.entries(newTheme.colors).forEach(([key, value]) => {
        root.style.setProperty(`--color-${key}`, value);
      });
      Object.entries(newTheme.spacing).forEach(([key, value]) => {
        root.style.setProperty(`--spacing-${key}`, `${value}px`);
      });
      Object.entries(newTheme.borderRadius).forEach(([key, value]) => {
        root.style.setProperty(`--radius-${key}`, `${value}px`);
      });
      Object.entries(newTheme.typography.fontSize).forEach(([key, value]) => {
        root.style.setProperty(`--font-size-${key}`, `${value}px`);
      });

      // Apply theme mode class
      root.classList.remove('theme-light', 'theme-dark', 'theme-high-contrast');
      root.classList.add(newTheme.isDark ? 'theme-dark' : 'theme-light');
      if (newTheme.contrast === 'high') {
        root.classList.add('theme-high-contrast');
      }
    }
  }, [mode, contrast]);

  // Persist to localStorage (web only)
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('pigpulse-theme-mode', mode);
    localStorage.setItem('pigpulse-theme-contrast', contrast);
  }, [mode, contrast]);

  const toggleTheme = useCallback(() => {
    setMode(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  const value: WebThemeContextType = {
    theme,
    mode,
    contrast,
    setMode,
    setContrast,
    toggleTheme,
    isDark: theme.isDark,
  };

  return (
    <WebThemeContext.Provider value={value}>
      {children}
    </WebThemeContext.Provider>
  );
};