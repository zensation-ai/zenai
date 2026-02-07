/**
 * Unit Tests for ThemeToggle Component
 *
 * Tests theme cycling, labels, icons, and accessibility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '../ThemeToggle';

// Mock ThemeContext
const mockSetTheme = vi.fn();
const mockToggleTheme = vi.fn();

let mockTheme = 'system' as 'system' | 'light' | 'dark';
let mockResolvedTheme = 'light' as 'light' | 'dark';

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: mockTheme,
    resolvedTheme: mockResolvedTheme,
    setTheme: mockSetTheme,
    toggleTheme: mockToggleTheme,
  }),
}));

describe('ThemeToggle Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme = 'system';
    mockResolvedTheme = 'light';
  });

  describe('rendering', () => {
    it('renders a button', () => {
      render(<ThemeToggle />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('button has type="button"', () => {
      render(<ThemeToggle />);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });

    it('applies custom className', () => {
      render(<ThemeToggle className="custom-class" />);
      expect(screen.getByRole('button').className).toContain('custom-class');
    });

    it('has theme-toggle base class', () => {
      render(<ThemeToggle />);
      expect(screen.getByRole('button').className).toContain('theme-toggle');
    });
  });

  describe('theme cycling', () => {
    it('cycles from system to light', () => {
      mockTheme = 'system';
      render(<ThemeToggle />);

      fireEvent.click(screen.getByRole('button'));
      expect(mockSetTheme).toHaveBeenCalledWith('light');
    });

    it('cycles from light to dark', () => {
      mockTheme = 'light';
      render(<ThemeToggle />);

      fireEvent.click(screen.getByRole('button'));
      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });

    it('cycles from dark to system', () => {
      mockTheme = 'dark';
      render(<ThemeToggle />);

      fireEvent.click(screen.getByRole('button'));
      expect(mockSetTheme).toHaveBeenCalledWith('system');
    });
  });

  describe('title / aria-label', () => {
    it('shows "Hell" as next theme when on system', () => {
      mockTheme = 'system';
      render(<ThemeToggle />);
      expect(screen.getByRole('button')).toHaveAttribute('title', 'Theme wechseln zu Hell');
      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Theme wechseln zu Hell');
    });

    it('shows "Dunkel" as next theme when on light', () => {
      mockTheme = 'light';
      render(<ThemeToggle />);
      expect(screen.getByRole('button')).toHaveAttribute('title', 'Theme wechseln zu Dunkel');
    });

    it('shows "System" as next theme when on dark', () => {
      mockTheme = 'dark';
      render(<ThemeToggle />);
      expect(screen.getByRole('button')).toHaveAttribute('title', 'Theme wechseln zu System');
    });
  });

  describe('icon display', () => {
    it('icon is hidden from screen readers', () => {
      render(<ThemeToggle />);
      const icon = screen.getByRole('button').querySelector('.theme-toggle-icon');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('label display', () => {
    it('hides label by default', () => {
      render(<ThemeToggle />);
      expect(screen.queryByText('System')).not.toBeInTheDocument();
      expect(screen.queryByText('Hell')).not.toBeInTheDocument();
      expect(screen.queryByText('Dunkel')).not.toBeInTheDocument();
    });

    it('shows label when showLabel is true', () => {
      mockTheme = 'system';
      render(<ThemeToggle showLabel />);
      expect(screen.getByText('System')).toBeInTheDocument();
    });

    it('shows "Hell" label for light theme', () => {
      mockTheme = 'light';
      mockResolvedTheme = 'light';
      render(<ThemeToggle showLabel />);
      expect(screen.getByText('Hell')).toBeInTheDocument();
    });

    it('shows "Dunkel" label for dark theme', () => {
      mockTheme = 'dark';
      mockResolvedTheme = 'dark';
      render(<ThemeToggle showLabel />);
      expect(screen.getByText('Dunkel')).toBeInTheDocument();
    });
  });
});
