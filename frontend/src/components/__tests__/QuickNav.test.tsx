/**
 * Unit Tests for QuickNav Component
 *
 * Tests quick navigation functionality including:
 * - Tile rendering
 * - Active state highlighting
 * - Page navigation
 * - Keyboard navigation (Arrow keys)
 * - Badge display
 * - Accessibility
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
    archivedCount: 0,
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
      // Should have 7 tiles: Gedanken, Insights, KI-Werkstatt, Archiv, Lernen, Meetings, Einstellungen
      expect(buttons).toHaveLength(7);
    });

    it('displays correct labels', () => {
      render(<QuickNav {...defaultProps} />);
      expect(screen.getByText('Gedanken')).toBeInTheDocument();
      expect(screen.getByText('Insights')).toBeInTheDocument();
      expect(screen.getByText('Archiv')).toBeInTheDocument();
      expect(screen.getByText('Lernen')).toBeInTheDocument();
      expect(screen.getByText('Meetings')).toBeInTheDocument();
    });

    it('has correct aria-label on nav element', () => {
      render(<QuickNav {...defaultProps} />);
      const nav = screen.getByRole('navigation');
      expect(nav).toHaveAttribute('aria-label', 'Schnellzugriff');
    });
  });

  describe('Active State', () => {
    it('highlights active tile for ideas page', () => {
      render(<QuickNav {...defaultProps} currentPage="ideas" />);
      const ideaButton = screen.getByRole('button', { name: /Gedanken/i });
      expect(ideaButton).toHaveClass('active');
      expect(ideaButton).toHaveAttribute('aria-current', 'page');
    });

    it('highlights active tile for insights page', () => {
      render(<QuickNav {...defaultProps} currentPage="insights" />);
      const insightsButton = screen.getByRole('button', { name: /Insights/i });
      expect(insightsButton).toHaveClass('active');
    });

    it('highlights insights tile for sub-pages (analytics)', () => {
      render(<QuickNav {...defaultProps} currentPage="analytics" />);
      const insightsButton = screen.getByRole('button', { name: /Insights/i });
      expect(insightsButton).toHaveClass('active');
    });

    it('highlights ai-workshop tile for sub-pages (incubator)', () => {
      render(<QuickNav {...defaultProps} currentPage="incubator" />);
      const workshopButton = screen.getByRole('button', { name: /KI/i });
      expect(workshopButton).toHaveClass('active');
    });

    it('highlights settings tile for sub-pages (profile)', () => {
      render(<QuickNav {...defaultProps} currentPage="profile" />);
      const settingsButton = screen.getByRole('button', { name: /Einstellungen|Mehr/i });
      expect(settingsButton).toHaveClass('active');
    });
  });

  describe('Navigation', () => {
    it('calls onNavigate when tile is clicked', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} />);

      const insightsButton = screen.getByRole('button', { name: /Insights/i });
      await user.click(insightsButton);

      expect(mockOnNavigate).toHaveBeenCalledWith('insights');
    });

    it('calls onNavigate with correct page for each tile', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} />);

      const archiveButton = screen.getByRole('button', { name: /Archiv/i });
      await user.click(archiveButton);

      expect(mockOnNavigate).toHaveBeenCalledWith('archive');
    });
  });

  describe('Keyboard Navigation', () => {
    it('navigates to next tile with ArrowRight', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} />);

      const ideaButton = screen.getByRole('button', { name: /Gedanken/i });
      ideaButton.focus();

      await user.keyboard('{ArrowRight}');

      const insightsButton = screen.getByRole('button', { name: /Insights/i });
      expect(document.activeElement).toBe(insightsButton);
    });

    it('navigates to previous tile with ArrowLeft', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} currentPage="insights" />);

      const insightsButton = screen.getByRole('button', { name: /Insights/i });
      insightsButton.focus();

      await user.keyboard('{ArrowLeft}');

      const ideaButton = screen.getByRole('button', { name: /Gedanken/i });
      expect(document.activeElement).toBe(ideaButton);
    });

    it('wraps around with ArrowRight on last tile', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} currentPage="settings" />);

      const settingsButton = screen.getByRole('button', { name: /Einstellungen|Mehr/i });
      settingsButton.focus();

      await user.keyboard('{ArrowRight}');

      const ideaButton = screen.getByRole('button', { name: /Gedanken/i });
      expect(document.activeElement).toBe(ideaButton);
    });

    it('navigates on Enter key', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} />);

      const insightsButton = screen.getByRole('button', { name: /Insights/i });
      insightsButton.focus();

      await user.keyboard('{Enter}');

      expect(mockOnNavigate).toHaveBeenCalledWith('insights');
    });

    it('navigates on Space key', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} />);

      const archiveButton = screen.getByRole('button', { name: /Archiv/i });
      archiveButton.focus();

      await user.keyboard(' ');

      expect(mockOnNavigate).toHaveBeenCalledWith('archive');
    });

    it('navigates to first tile with Home key', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} currentPage="archive" />);

      const archiveButton = screen.getByRole('button', { name: /Archiv/i });
      archiveButton.focus();

      await user.keyboard('{Home}');

      const ideaButton = screen.getByRole('button', { name: /Gedanken/i });
      expect(document.activeElement).toBe(ideaButton);
    });

    it('navigates to last tile with End key', async () => {
      const user = userEvent.setup();
      render(<QuickNav {...defaultProps} />);

      const ideaButton = screen.getByRole('button', { name: /Gedanken/i });
      ideaButton.focus();

      await user.keyboard('{End}');

      const settingsButton = screen.getByRole('button', { name: /Einstellungen|Mehr/i });
      expect(document.activeElement).toBe(settingsButton);
    });
  });

  describe('Badge Display', () => {
    it('does not show badge when archivedCount is 0', () => {
      render(<QuickNav {...defaultProps} archivedCount={0} />);
      const badge = screen.queryByText('0');
      expect(badge).not.toBeInTheDocument();
    });

    it('shows badge when archivedCount is greater than 0', () => {
      render(<QuickNav {...defaultProps} archivedCount={5} />);
      const badge = screen.getByText('5');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('quick-nav-badge');
    });

    it('shows 99+ when archivedCount exceeds 99', () => {
      render(<QuickNav {...defaultProps} archivedCount={150} />);
      const badge = screen.getByText('99+');
      expect(badge).toBeInTheDocument();
    });

    it('includes archive count in aria-label', () => {
      render(<QuickNav {...defaultProps} archivedCount={5} />);
      const archiveButton = screen.getByRole('button', { name: /Archiv.*5 archiviert/i });
      expect(archiveButton).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper tab index for keyboard navigation', () => {
      render(<QuickNav {...defaultProps} currentPage="ideas" />);

      const ideaButton = screen.getByRole('button', { name: /Gedanken/i });
      const insightsButton = screen.getByRole('button', { name: /Insights/i });

      // Active tile should have tabIndex 0
      expect(ideaButton).toHaveAttribute('tabIndex', '0');
      // Other tiles should have tabIndex -1
      expect(insightsButton).toHaveAttribute('tabIndex', '-1');
    });

    it('applies neuro-focus-ring class to all tiles', () => {
      render(<QuickNav {...defaultProps} />);
      const buttons = screen.getAllByRole('button');

      buttons.forEach((button) => {
        expect(button).toHaveClass('neuro-focus-ring');
      });
    });

    it('has aria-current on active tile only', () => {
      render(<QuickNav {...defaultProps} currentPage="insights" />);

      const insightsButton = screen.getByRole('button', { name: /Insights/i });
      const ideaButton = screen.getByRole('button', { name: /Gedanken/i });

      expect(insightsButton).toHaveAttribute('aria-current', 'page');
      expect(ideaButton).not.toHaveAttribute('aria-current');
    });
  });

  describe('Color Variants', () => {
    it('applies correct color class to each tile', () => {
      render(<QuickNav {...defaultProps} />);

      const ideaButton = screen.getByRole('button', { name: /Gedanken/i });
      const insightsButton = screen.getByRole('button', { name: /Insights/i });
      const archiveButton = screen.getByRole('button', { name: /Archiv/i });

      expect(ideaButton).toHaveClass('color-primary');
      expect(insightsButton).toHaveClass('color-blue');
      expect(archiveButton).toHaveClass('color-gray');
    });
  });
});
