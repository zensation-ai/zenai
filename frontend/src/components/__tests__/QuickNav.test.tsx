/**
 * Unit Tests for QuickNav Component
 *
 * Tests quick navigation functionality including:
 * - Tile rendering (KI-Werkstatt, Lernen, Meetings, Sortieren)
 * - Active state highlighting
 * - Page navigation
 * - Keyboard navigation (Arrow keys)
 * - Accessibility
 *
 * Note: QuickNav only shows items NOT in main header navigation.
 * Main nav has: Gedanken, Insights, Archiv, Einstellungen
 * QuickNav shows: KI-Werkstatt, Lernen, Meetings, Sortieren
 *
 * @module tests/components/QuickNav
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickNav } from '../QuickNav';

describe('QuickNav Component', () => {
  const mockOnNavigate = vi.fn();

  const defaultProps = {
    currentPage: 'ideas' as const,
    onNavigate: mockOnNavigate,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders without crashing', () => {
      render(<QuickNav {...defaultProps} />);
      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });

    it('renders all navigation tiles', () => {
      render(<QuickNav {...defaultProps} />);
      const buttons = screen.getAllByRole('button');
      // Should have 4 tiles: KI-Werkstatt, Lernen, Meetings, Sortieren
      expect(buttons).toHaveLength(4);
    });

    it('displays correct labels', () => {
      render(<QuickNav {...defaultProps} />);
      // KI is the shortLabel for KI-Werkstatt
      expect(screen.getByText('KI')).toBeInTheDocument();
      expect(screen.getByText('Lernen')).toBeInTheDocument();
      expect(screen.getByText('Meetings')).toBeInTheDocument();
      expect(screen.getByText('Sortieren')).toBeInTheDocument();
    });

    it('has correct aria-label on nav element', () => {
      render(<QuickNav {...defaultProps} />);
      const nav = screen.getByRole('navigation');
      expect(nav).toHaveAttribute('aria-label', 'Schnellzugriff');
    });
  });

  describe('Active State', () => {
    it('highlights active tile for ai-workshop page', () => {
      render(<QuickNav {...defaultProps} currentPage="ai-workshop" />);
      const workshopButton = screen.getByRole('button', { name: /KI-Werkstatt/i });
      expect(workshopButton).toHaveClass('active');
      expect(workshopButton).toHaveAttribute('aria-current', 'page');
    });

    it('highlights active tile for learning page', () => {
      render(<QuickNav {...defaultProps} currentPage="learning" />);
      const learningButton = screen.getByRole('button', { name: /Lernen/i });
      expect(learningButton).toHaveClass('active');
    });

    it('highlights active tile for meetings page', () => {
      render(<QuickNav {...defaultProps} currentPage="meetings" />);
      const meetingsButton = screen.getByRole('button', { name: /Meetings/i });
      expect(meetingsButton).toHaveClass('active');
    });

    it('highlights active tile for triage page', () => {
      render(<QuickNav {...defaultProps} currentPage="triage" />);
      const triageButton = screen.getByRole('button', { name: /Sortieren/i });
      expect(triageButton).toHaveClass('active');
    });

    it('highlights ai-workshop tile for sub-pages (incubator)', () => {
      render(<QuickNav {...defaultProps} currentPage="incubator" />);
      const workshopButton = screen.getByRole('button', { name: /KI-Werkstatt/i });
      expect(workshopButton).toHaveClass('active');
    });

    it('highlights learning tile for sub-pages (learning-tasks)', () => {
      render(<QuickNav {...defaultProps} currentPage="learning-tasks" />);
      const learningButton = screen.getByRole('button', { name: /Lernen/i });
      expect(learningButton).toHaveClass('active');
    });

    it('has no active tile when on main nav pages', () => {
      render(<QuickNav {...defaultProps} currentPage="ideas" />);
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).not.toHaveClass('active');
      });
    });
  });

  describe('Navigation', () => {
    it('calls onNavigate when tile is clicked', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} />);

      const learningButton = screen.getByRole('button', { name: /Lernen/i });
      await user.click(learningButton);

      expect(mockOnNavigate).toHaveBeenCalledWith('learning');
    });

    it('calls onNavigate with correct page for each tile', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} />);

      const meetingsButton = screen.getByRole('button', { name: /Meetings/i });
      await user.click(meetingsButton);

      expect(mockOnNavigate).toHaveBeenCalledWith('meetings');
    });

    it('navigates to triage on click', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} />);

      const triageButton = screen.getByRole('button', { name: /Sortieren/i });
      await user.click(triageButton);

      expect(mockOnNavigate).toHaveBeenCalledWith('triage');
    });
  });

  describe('Keyboard Navigation', () => {
    it('navigates to next tile with ArrowRight', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} />);

      // First tile (KI-Werkstatt) should have tabIndex 0 when no tile is active
      const workshopButton = screen.getByRole('button', { name: /KI-Werkstatt/i });
      workshopButton.focus();

      await user.keyboard('{ArrowRight}');

      const learningButton = screen.getByRole('button', { name: /Lernen/i });
      expect(document.activeElement).toBe(learningButton);
    });

    it('navigates to previous tile with ArrowLeft', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} currentPage="learning" />);

      const learningButton = screen.getByRole('button', { name: /Lernen/i });
      learningButton.focus();

      await user.keyboard('{ArrowLeft}');

      const workshopButton = screen.getByRole('button', { name: /KI-Werkstatt/i });
      expect(document.activeElement).toBe(workshopButton);
    });

    it('wraps around with ArrowRight on last tile', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} currentPage="triage" />);

      const triageButton = screen.getByRole('button', { name: /Sortieren/i });
      triageButton.focus();

      await user.keyboard('{ArrowRight}');

      const workshopButton = screen.getByRole('button', { name: /KI-Werkstatt/i });
      expect(document.activeElement).toBe(workshopButton);
    });

    it('navigates on Enter key', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} />);

      const learningButton = screen.getByRole('button', { name: /Lernen/i });
      learningButton.focus();

      await user.keyboard('{Enter}');

      expect(mockOnNavigate).toHaveBeenCalledWith('learning');
    });

    it('navigates on Space key', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} />);

      const meetingsButton = screen.getByRole('button', { name: /Meetings/i });
      meetingsButton.focus();

      await user.keyboard(' ');

      expect(mockOnNavigate).toHaveBeenCalledWith('meetings');
    });

    it('navigates to first tile with Home key', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} currentPage="triage" />);

      const triageButton = screen.getByRole('button', { name: /Sortieren/i });
      triageButton.focus();

      await user.keyboard('{Home}');

      const workshopButton = screen.getByRole('button', { name: /KI-Werkstatt/i });
      expect(document.activeElement).toBe(workshopButton);
    });

    it('navigates to last tile with End key', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} />);

      const workshopButton = screen.getByRole('button', { name: /KI-Werkstatt/i });
      workshopButton.focus();

      await user.keyboard('{End}');

      const triageButton = screen.getByRole('button', { name: /Sortieren/i });
      expect(document.activeElement).toBe(triageButton);
    });
  });

  describe('Accessibility', () => {
    it('has proper tab index for keyboard navigation', () => {
      render(<QuickNav {...defaultProps} currentPage="learning" />);

      const learningButton = screen.getByRole('button', { name: /Lernen/i });
      const meetingsButton = screen.getByRole('button', { name: /Meetings/i });

      // Active tile should have tabIndex 0
      expect(learningButton).toHaveAttribute('tabIndex', '0');
      // Other tiles should have tabIndex -1
      expect(meetingsButton).toHaveAttribute('tabIndex', '-1');
    });

    it('first tile has tabIndex 0 when no tile is active', () => {
      render(<QuickNav {...defaultProps} currentPage="ideas" />);

      const workshopButton = screen.getByRole('button', { name: /KI-Werkstatt/i });
      const learningButton = screen.getByRole('button', { name: /Lernen/i });

      // First tile should have tabIndex 0 when no tile is active
      expect(workshopButton).toHaveAttribute('tabIndex', '0');
      expect(learningButton).toHaveAttribute('tabIndex', '-1');
    });

    it('applies neuro-focus-ring class to all tiles', () => {
      render(<QuickNav {...defaultProps} />);
      const buttons = screen.getAllByRole('button');

      buttons.forEach((button) => {
        expect(button).toHaveClass('neuro-focus-ring');
      });
    });

    it('has aria-current on active tile only', () => {
      render(<QuickNav {...defaultProps} currentPage="learning" />);

      const learningButton = screen.getByRole('button', { name: /Lernen/i });
      const meetingsButton = screen.getByRole('button', { name: /Meetings/i });

      expect(learningButton).toHaveAttribute('aria-current', 'page');
      expect(meetingsButton).not.toHaveAttribute('aria-current');
    });
  });

  describe('Color Variants', () => {
    it('applies correct color class to each tile', () => {
      render(<QuickNav {...defaultProps} />);

      const workshopButton = screen.getByRole('button', { name: /KI-Werkstatt/i });
      const learningButton = screen.getByRole('button', { name: /Lernen/i });
      const meetingsButton = screen.getByRole('button', { name: /Meetings/i });
      const triageButton = screen.getByRole('button', { name: /Sortieren/i });

      expect(workshopButton).toHaveClass('color-purple');
      expect(learningButton).toHaveClass('color-green');
      expect(meetingsButton).toHaveClass('color-cyan');
      expect(triageButton).toHaveClass('color-coral');
    });
  });
});
