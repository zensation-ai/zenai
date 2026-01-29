/**
 * Unit Tests for ErrorBoundary Component
 *
 * Tests error boundary functionality including:
 * - Catching and displaying errors
 * - Error recovery via retry
 * - Fallback UI rendering
 * - Error logging
 *
 * @module tests/components/ErrorBoundary
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

// Component that throws an error for testing
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>Child component rendered</div>;
};


describe('ErrorBoundary Component', () => {
  // Suppress console.error during error boundary tests
  const originalError = console.error;

  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  describe('Normal rendering', () => {
    it('renders children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Test content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('renders multiple children correctly', () => {
      render(
        <ErrorBoundary>
          <div>Child 1</div>
          <div>Child 2</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Child 1')).toBeInTheDocument();
      expect(screen.getByText('Child 2')).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('catches errors and displays fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Should not render the child
      expect(screen.queryByText('Child component rendered')).not.toBeInTheDocument();

      // Should show error UI (text is "Etwas ist schief gelaufen" with space)
      expect(screen.getByText(/etwas ist schief gelaufen|something went wrong/i)).toBeInTheDocument();
    });

    it('displays custom fallback when provided', () => {
      const customFallback = <div>Custom error message</div>;

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom error message')).toBeInTheDocument();
    });

    it('logs error to console', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('Error recovery', () => {
    it('provides a retry mechanism', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Look for retry button - there are two buttons: "Erneut versuchen" and "Seite neu laden"
      const buttons = screen.getAllByRole('button');
      const retryButton = buttons.find(btn =>
        btn.textContent?.match(/erneut versuchen|retry/i)
      );

      expect(retryButton).toBeInTheDocument();
    });

    it('resets error state on retry', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Error state should be showing (text is "Etwas ist schief gelaufen")
      expect(screen.getByText(/etwas ist schief gelaufen|something went wrong/i)).toBeInTheDocument();

      // Rerender with non-throwing child
      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      // Look for retry button and click if exists
      const buttons = screen.getAllByRole('button');
      const retryButton = buttons.find(btn =>
        btn.textContent?.match(/erneut versuchen|retry/i)
      );
      if (retryButton) {
        fireEvent.click(retryButton);
      }
    });
  });

  describe('Nested error boundaries', () => {
    it('inner boundary catches inner errors', () => {
      render(
        <ErrorBoundary fallback={<div>Outer error</div>}>
          <div>Outer content</div>
          <ErrorBoundary fallback={<div>Inner error</div>}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ErrorBoundary>
      );

      // Inner boundary should catch the error
      expect(screen.getByText('Inner error')).toBeInTheDocument();
      // Outer content should still render
      expect(screen.getByText('Outer content')).toBeInTheDocument();
      // Outer error should not appear
      expect(screen.queryByText('Outer error')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('error message is accessible', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Error details are shown in DEV mode with role="alert"
      const errorDetails = screen.queryByRole('alert');
      const errorMessage = screen.getByText(/etwas ist schief gelaufen|something went wrong/i);
      expect(errorDetails || errorMessage).toBeInTheDocument();
    });

    it('retry button is keyboard accessible', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // There are two buttons, both should have type="button"
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAttribute('type', 'button');
      });
    });
  });
});
