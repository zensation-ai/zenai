/**
 * Unit Tests for ThemeContext
 *
 * Tests ThemeProvider, useTheme hook, localStorage persistence,
 * system theme detection, and document class management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../ThemeContext';

// Helper component to expose hook values
function ThemeConsumer() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button data-testid="set-light" onClick={() => setTheme('light')}>Light</button>
      <button data-testid="set-dark" onClick={() => setTheme('dark')}>Dark</button>
      <button data-testid="set-system" onClick={() => setTheme('system')}>System</button>
      <button data-testid="toggle" onClick={toggleTheme}>Toggle</button>
    </div>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('light-mode', 'dark-mode');
    // Default matchMedia mock returns matches: false (light system theme)
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  describe('useTheme hook', () => {
    it('throws when used outside ThemeProvider', () => {
      // Suppress console.error for expected error
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(<ThemeConsumer />)).toThrow('useTheme must be used within a ThemeProvider');
      spy.mockRestore();
    });
  });

  describe('ThemeProvider initialization', () => {
    it('defaults to system theme when no stored preference', () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('theme').textContent).toBe('system');
    });

    it('loads stored theme from localStorage', () => {
      localStorage.setItem('mybrain-theme', 'dark');

      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('theme').textContent).toBe('dark');
      expect(screen.getByTestId('resolved').textContent).toBe('dark');
    });

    it('ignores invalid stored theme value', () => {
      localStorage.setItem('mybrain-theme', 'invalid');

      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('theme').textContent).toBe('system');
    });
  });

  describe('setTheme', () => {
    it('persists theme to localStorage', () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      act(() => {
        screen.getByTestId('set-dark').click();
      });

      expect(localStorage.getItem('mybrain-theme')).toBe('dark');
      expect(screen.getByTestId('theme').textContent).toBe('dark');
      expect(screen.getByTestId('resolved').textContent).toBe('dark');
    });

    it('applies light-mode class to document', () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      act(() => {
        screen.getByTestId('set-light').click();
      });

      expect(document.documentElement.classList.contains('light-mode')).toBe(true);
      expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
    });

    it('applies dark-mode class to document', () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      act(() => {
        screen.getByTestId('set-dark').click();
      });

      expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
      expect(document.documentElement.classList.contains('light-mode')).toBe(false);
    });

    it('removes mode classes for system theme', () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      // Set to dark first
      act(() => {
        screen.getByTestId('set-dark').click();
      });
      expect(document.documentElement.classList.contains('dark-mode')).toBe(true);

      // Switch to system
      act(() => {
        screen.getByTestId('set-system').click();
      });
      expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
      expect(document.documentElement.classList.contains('light-mode')).toBe(false);
    });
  });

  describe('toggleTheme', () => {
    it('toggles from light to dark', () => {
      localStorage.setItem('mybrain-theme', 'light');

      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('resolved').textContent).toBe('light');

      act(() => {
        screen.getByTestId('toggle').click();
      });

      expect(screen.getByTestId('resolved').textContent).toBe('dark');
    });

    it('toggles from dark to light', () => {
      localStorage.setItem('mybrain-theme', 'dark');

      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      act(() => {
        screen.getByTestId('toggle').click();
      });

      expect(screen.getByTestId('resolved').textContent).toBe('light');
    });
  });

  describe('system theme detection', () => {
    it('resolves to dark when system prefers dark', () => {
      vi.mocked(window.matchMedia).mockImplementation((query) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('theme').textContent).toBe('system');
      expect(screen.getByTestId('resolved').textContent).toBe('dark');
    });

    it('resolves to light when system prefers light', () => {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('resolved').textContent).toBe('light');
    });
  });

  describe('renders children', () => {
    it('passes children through', () => {
      render(
        <ThemeProvider>
          <div data-testid="child">Hello</div>
        </ThemeProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });
  });
});
