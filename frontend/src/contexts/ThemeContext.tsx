/**
 * Theme Context
 *
 * Provides theme switching functionality (light/dark/system).
 * Persists user preference in localStorage.
 *
 * @module contexts/ThemeContext
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { safeLocalStorage } from '../utils/storage';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'zenai-theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = safeLocalStorage('get', STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'dark';
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(
    theme === 'system' ? getSystemTheme() : theme
  );

  // Apply theme to document via data-theme attribute + CSS classes
  useEffect(() => {
    const root = document.documentElement;
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    setResolvedTheme(resolved);

    // Remove both classes first
    root.classList.remove('light-mode', 'dark-mode');

    // Always set data-theme so CSS [data-theme="dark"] selectors work
    // regardless of whether the user chose manually or via system preference.
    root.setAttribute('data-theme', resolved);
    root.classList.add(`${resolved}-mode`);

    // Update meta theme-color for mobile browser chrome
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', resolved === 'dark' ? '#0a1a24' : '#dce5eb');
    }
  }, [theme]);

  // Listen for system theme changes and keep data-theme in sync
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      if (theme === 'system') {
        const resolved = getSystemTheme();
        setResolvedTheme(resolved);
        const root = document.documentElement;
        root.classList.remove('light-mode', 'dark-mode');
        root.setAttribute('data-theme', resolved);
        root.classList.add(`${resolved}-mode`);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    safeLocalStorage('set', STORAGE_KEY, newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
