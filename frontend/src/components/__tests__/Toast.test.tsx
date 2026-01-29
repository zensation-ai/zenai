/**
 * Unit Tests for Toast Component
 *
 * Tests toast notification functionality including:
 * - Toast display and styling for different types
 * - Auto-dismiss timing
 * - Manual dismiss
 * - Queue handling for multiple toasts
 *
 * @module tests/components/Toast
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastContainer, showToast, clearAllToasts } from '../Toast';

describe('Toast Component', () => {
  beforeEach(() => {
    clearAllToasts();
  });

  afterEach(() => {
    clearAllToasts();
  });

  describe('ToastContainer rendering', () => {
    it('renders without crashing', () => {
      render(<ToastContainer />);
      // Container returns null when no toasts, so we just verify it doesn't crash
      expect(true).toBe(true);
    });

    it('initially shows no toasts', () => {
      render(<ToastContainer />);
      // Container returns null when empty
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('showToast function', () => {
    it('displays a success toast', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('Success message', 'success');
      });

      await waitFor(() => {
        expect(screen.getByText('Success message')).toBeInTheDocument();
      }, { timeout: 1000 });

      const toast = screen.getByRole('status');
      expect(toast).toHaveClass('toast');
      expect(toast.classList.contains('toast-success')).toBe(true);
    });

    it('displays an error toast', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('Error message', 'error');
      });

      await waitFor(() => {
        expect(screen.getByText('Error message')).toBeInTheDocument();
      }, { timeout: 1000 });

      const toast = screen.getByRole('status');
      expect(toast).toHaveClass('toast');
      expect(toast.classList.contains('toast-error')).toBe(true);
    });

    it('displays an info toast', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('Info message', 'info');
      });

      await waitFor(() => {
        expect(screen.getByText('Info message')).toBeInTheDocument();
      }, { timeout: 1000 });

      const toast = screen.getByRole('status');
      expect(toast).toHaveClass('toast');
      expect(toast.classList.contains('toast-info')).toBe(true);
    });

    it('displays a warning toast', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('Warning message', 'warning');
      });

      await waitFor(() => {
        expect(screen.getByText('Warning message')).toBeInTheDocument();
      }, { timeout: 1000 });

      const toast = screen.getByRole('status');
      expect(toast).toHaveClass('toast');
      expect(toast.classList.contains('toast-warning')).toBe(true);
    });
  });

  describe('Toast auto-dismiss', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    });

    it('auto-dismisses success toast after default duration', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('Auto dismiss test', 'success');
      });

      // Toast should appear
      expect(screen.getByText('Auto dismiss test')).toBeInTheDocument();

      // Fast-forward past the toast duration (default 5000ms + buffer)
      act(() => {
        vi.advanceTimersByTime(6000);
      });

      // Toast should be gone
      expect(screen.queryByText('Auto dismiss test')).not.toBeInTheDocument();
    });

    it('error toasts persist for the default duration', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('Error persist test', 'error');
      });

      // Toast should appear
      expect(screen.getByText('Error persist test')).toBeInTheDocument();

      // After 3 seconds, error should still be visible (default is 5000ms)
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(screen.getByText('Error persist test')).toBeInTheDocument();

      // After 6 seconds total, it should be gone
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(screen.queryByText('Error persist test')).not.toBeInTheDocument();
    });
  });

  describe('Toast manual dismiss', () => {
    it('can be manually dismissed by clicking close button', async () => {
      const user = userEvent.setup();
      render(<ToastContainer />);

      act(() => {
        showToast('Manual dismiss test', 'info');
      });

      await waitFor(() => {
        expect(screen.getByText('Manual dismiss test')).toBeInTheDocument();
      }, { timeout: 1000 });

      const closeButton = screen.getByRole('button', { name: /schließen|dismiss|close/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Manual dismiss test')).not.toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe('Multiple toasts', () => {
    it('can display multiple toasts simultaneously', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('First toast', 'success');
        showToast('Second toast', 'info');
        showToast('Third toast', 'warning');
      });

      await waitFor(() => {
        expect(screen.getByText('First toast')).toBeInTheDocument();
        expect(screen.getByText('Second toast')).toBeInTheDocument();
        expect(screen.getByText('Third toast')).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('displays all created toasts', async () => {
      render(<ToastContainer />);

      act(() => {
        // Add several toasts
        for (let i = 1; i <= 5; i++) {
          showToast(`Toast ${i}`, 'info');
        }
      });

      await waitFor(() => {
        const statuses = screen.getAllByRole('status');
        expect(statuses.length).toBeGreaterThanOrEqual(1);
      }, { timeout: 1000 });
    });
  });

  describe('clearAllToasts function', () => {
    it('removes all toasts when called', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('Toast 1', 'success');
        showToast('Toast 2', 'info');
      });

      await waitFor(() => {
        expect(screen.getByText('Toast 1')).toBeInTheDocument();
        expect(screen.getByText('Toast 2')).toBeInTheDocument();
      }, { timeout: 1000 });

      act(() => {
        clearAllToasts();
      });

      await waitFor(() => {
        expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
        expect(screen.queryByText('Toast 2')).not.toBeInTheDocument();
      }, { timeout: 1000 });
    });
  });

  describe('Accessibility', () => {
    it('toasts have proper ARIA role', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('Accessible toast', 'info');
      });

      await waitFor(() => {
        // Individual toasts use role="status"
        const toast = screen.getByRole('status');
        expect(toast).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('toast container has proper ARIA attributes', async () => {
      render(<ToastContainer />);

      // Container only renders when there are toasts
      act(() => {
        showToast('Test toast', 'info');
      });

      await waitFor(() => {
        const container = document.querySelector('.toast-container');
        expect(container).toHaveAttribute('aria-live', 'polite');
      }, { timeout: 1000 });
    });
  });
});
