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
    vi.useFakeTimers();
    clearAllToasts();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('ToastContainer rendering', () => {
    it('renders without crashing', () => {
      render(<ToastContainer />);
      expect(document.querySelector('.toast-container')).toBeInTheDocument();
    });

    it('initially shows no toasts', () => {
      render(<ToastContainer />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
      });

      const toast = screen.getByRole('alert');
      expect(toast).toHaveClass('toast', 'success');
    });

    it('displays an error toast', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('Error message', 'error');
      });

      await waitFor(() => {
        expect(screen.getByText('Error message')).toBeInTheDocument();
      });

      const toast = screen.getByRole('alert');
      expect(toast).toHaveClass('toast', 'error');
    });

    it('displays an info toast', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('Info message', 'info');
      });

      await waitFor(() => {
        expect(screen.getByText('Info message')).toBeInTheDocument();
      });

      const toast = screen.getByRole('alert');
      expect(toast).toHaveClass('toast', 'info');
    });

    it('displays a warning toast', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('Warning message', 'warning');
      });

      await waitFor(() => {
        expect(screen.getByText('Warning message')).toBeInTheDocument();
      });

      const toast = screen.getByRole('alert');
      expect(toast).toHaveClass('toast', 'warning');
    });
  });

  describe('Toast auto-dismiss', () => {
    it('auto-dismisses success toast after default duration', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('Auto dismiss test', 'success');
      });

      await waitFor(() => {
        expect(screen.getByText('Auto dismiss test')).toBeInTheDocument();
      });

      // Fast-forward past the toast duration (default 3000ms + animation)
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      await waitFor(() => {
        expect(screen.queryByText('Auto dismiss test')).not.toBeInTheDocument();
      });
    });

    it('error toasts persist longer', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('Error persist test', 'error');
      });

      await waitFor(() => {
        expect(screen.getByText('Error persist test')).toBeInTheDocument();
      });

      // After 3 seconds, error should still be visible
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(screen.getByText('Error persist test')).toBeInTheDocument();

      // After 5+ seconds, it should be gone
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.queryByText('Error persist test')).not.toBeInTheDocument();
      });
    });
  });

  describe('Toast manual dismiss', () => {
    it('can be manually dismissed by clicking close button', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ToastContainer />);

      act(() => {
        showToast('Manual dismiss test', 'info');
      });

      await waitFor(() => {
        expect(screen.getByText('Manual dismiss test')).toBeInTheDocument();
      });

      const closeButton = screen.getByRole('button', { name: /dismiss|close/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Manual dismiss test')).not.toBeInTheDocument();
      });
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
      });
    });

    it('respects maximum toast limit', async () => {
      render(<ToastContainer />);

      act(() => {
        // Add more than the typical max (usually 5)
        for (let i = 1; i <= 8; i++) {
          showToast(`Toast ${i}`, 'info');
        }
      });

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.length).toBeLessThanOrEqual(5);
      });
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
      });

      act(() => {
        clearAllToasts();
      });

      await waitFor(() => {
        expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
        expect(screen.queryByText('Toast 2')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('toasts have proper ARIA role', async () => {
      render(<ToastContainer />);

      act(() => {
        showToast('Accessible toast', 'info');
      });

      await waitFor(() => {
        const toast = screen.getByRole('alert');
        expect(toast).toBeInTheDocument();
      });
    });

    it('toast container has proper ARIA attributes', () => {
      render(<ToastContainer />);
      const container = document.querySelector('.toast-container');
      expect(container).toHaveAttribute('aria-live', 'polite');
    });
  });
});
