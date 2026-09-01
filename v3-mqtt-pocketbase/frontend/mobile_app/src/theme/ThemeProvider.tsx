/**
 * Theme Provider and Context
 * Manages theme state and provides theme to all components
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Theme, ThemeMode, getTheme } from './theme';

interface ThemeContextType {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isDarkMode: boolean;
  isLightMode: boolean;
  isHighContrast: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultMode?: ThemeMode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  defaultMode = 'auto' 
}) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('pigpulse-theme-mode') as ThemeMode) || defaultMode;
    }
    return defaultMode;
  });
  const [isClient] = useState(() => typeof window !== 'undefined');
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const theme = useMemo(() => getTheme(mode), [mode, systemPrefersDark]);

  // Handle client-side rendering and system preference changes
  useEffect(() => {
    // Listen for system preference changes in auto mode
    if (mode === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        setSystemPrefersDark(e.matches);
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [mode]);

  // Update theme when mode changes
  useEffect(() => {
    if (isClient) {
      // Save preference to localStorage
      localStorage.setItem('pigpulse-theme-mode', mode);
      
      // Apply theme to document root
      document.documentElement.setAttribute('data-theme', mode);
      
      // Add/remove high-contrast class
      if (mode === 'dark') {
        document.documentElement.classList.add('high-contrast');
      } else {
        document.documentElement.classList.remove('high-contrast');
      }
    }
  }, [mode, isClient]);

  const value: ThemeContextType = {
    theme,
    mode,
    setMode,
    isDarkMode: mode === 'dark',
    isLightMode: mode === 'light',
    isHighContrast: mode === 'dark',
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};