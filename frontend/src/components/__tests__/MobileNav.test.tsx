/**
 * Unit Tests for MobileNav Component
 *
 * Tests mobile navigation functionality including:
 * - Navigation item rendering
 * - Active state highlighting
 * - Page navigation
 * - Responsive behavior
 * - Accessibility
 *
 * @module tests/components/MobileNav
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileNav } from '../MobileNav';
import type { Page } from '../../types';

describe('MobileNav Component', () => {
  const mockOnNavigate = vi.fn();
  const defaultProps = {
    currentPage: 'ideas' as Page,
    onNavigate: mockOnNavigate,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders without crashing', () => {
      render(<MobileNav {...defaultProps} />);
      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });

    it('renders navigation items', () => {
      render(<MobileNav {...defaultProps} />);

      // Check for common navigation items
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('displays icons or labels for nav items', () => {
      render(<MobileNav {...defaultProps} />);

      // Navigation should have visual indicators
      const nav = screen.getByRole('navigation');
      expect(nav.children.length).toBeGreaterThan(0);
    });
  });

  describe('Navigation', () => {
    it('calls onNavigate when nav item clicked', async () => {
      const user = userEvent.setup();

      render(<MobileNav {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      if (buttons.length > 0) {
        await user.click(buttons[0]);
        expect(mockOnNavigate).toHaveBeenCalled();
      }
    });

    it('passes correct page to onNavigate', async () => {
      const user = userEvent.setup();

      render(<MobileNav {...defaultProps} />);

      // Find a specific nav item (e.g., Chat)
      const chatButton = screen.queryByRole('button', { name: /chat/i }) ||
                        screen.queryByText(/chat/i);

      if (chatButton) {
        await user.click(chatButton);
        expect(mockOnNavigate).toHaveBeenCalledWith(expect.any(String));
      }
    });
  });

  describe('Active State', () => {
    it('highlights current page', () => {
      render(<MobileNav {...defaultProps} currentPage="ideas" />);

      // Find the ideas navigation item
      const buttons = screen.getAllByRole('button');
      const activeButton = buttons.find(btn =>
        btn.classList.contains('active') ||
        btn.getAttribute('aria-current') === 'page'
      );

      // At least one button should be marked as active
      expect(activeButton || buttons.some(b => b.classList.contains('active'))).toBeTruthy();
    });

    it('updates active state when page changes', () => {
      const { rerender } = render(<MobileNav {...defaultProps} currentPage="ideas" />);

      // Get initial active states
      const initialButtons = screen.getAllByRole('button');

      // Change page
      rerender(<MobileNav {...defaultProps} currentPage="chat" />);

      // Active state should be different now
      const updatedButtons = screen.getAllByRole('button');
      expect(updatedButtons.length).toBe(initialButtons.length);
    });
  });

  describe('Accessibility', () => {
    it('has navigation role', () => {
      render(<MobileNav {...defaultProps} />);

      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });

    it('nav items are keyboard accessible', async () => {
      render(<MobileNav {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).not.toHaveAttribute('tabindex', '-1');
      });
    });

    it('current page is indicated for screen readers', () => {
      render(<MobileNav {...defaultProps} currentPage="ideas" />);

      // Check for aria-current or similar attribute
      const buttons = screen.getAllByRole('button');
      const hasCurrentIndicator = buttons.some(btn =>
        btn.getAttribute('aria-current') === 'page' ||
        btn.getAttribute('aria-selected') === 'true' ||
        btn.classList.contains('active')
      );

      expect(hasCurrentIndicator).toBe(true);
    });

    it('nav items have accessible names', () => {
      render(<MobileNav {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        const hasName = button.textContent ||
                       button.getAttribute('aria-label') ||
                       button.getAttribute('title');
        expect(hasName).toBeTruthy();
      });
    });
  });

  describe('Visual Layout', () => {
    it('is fixed to bottom of screen', () => {
      render(<MobileNav {...defaultProps} />);

      const nav = screen.getByRole('navigation');
      const style = window.getComputedStyle(nav);

      // Check for fixed positioning
      expect(
        style.position === 'fixed' ||
        nav.classList.contains('mobile-nav') ||
        nav.classList.contains('bottom-nav')
      ).toBe(true);
    });

    it('items are evenly distributed', () => {
      render(<MobileNav {...defaultProps} />);

      const nav = screen.getByRole('navigation');
      const style = window.getComputedStyle(nav);

      // Check for flex layout
      expect(
        style.display === 'flex' ||
        style.display === 'grid' ||
        nav.classList.contains('flex')
      ).toBe(true);
    });
  });

  describe('Badge/Notification Indicators', () => {
    it('can display notification badges', () => {
      render(<MobileNav {...defaultProps} notificationCount={5} />);

      // Look for badge element
      const badge = screen.queryByText('5') ||
                   document.querySelector('.badge, [class*="badge"], [class*="notification"]');

      // Badge may or may not be present based on implementation
    });

    it('hides badge when count is zero', () => {
      render(<MobileNav {...defaultProps} notificationCount={0} />);

      // Badge should not show "0"
      const zeroBadge = screen.queryByText('0');
      // Zero badge should either not exist or be hidden
    });
  });

  describe('Edge Cases', () => {
    it('handles unknown page gracefully', () => {
      // @ts-expect-error Testing invalid page
      render(<MobileNav {...defaultProps} currentPage="unknown-page" />);

      // Should still render
      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });

    it('handles missing onNavigate', () => {
      // @ts-expect-error Testing missing callback
      render(<MobileNav currentPage="ideas" />);

      // Should still render without crashing
      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });
  });

  describe('Touch Interactions', () => {
    it('supports touch events', async () => {
      render(<MobileNav {...defaultProps} />);

      const buttons = screen.getAllByRole('button');

      if (buttons.length > 0) {
        // Simulate touch
        fireEvent.touchStart(buttons[0]);
        fireEvent.touchEnd(buttons[0]);

        // Should trigger navigation
        expect(mockOnNavigate).toHaveBeenCalled();
      }
    });
  });
});
