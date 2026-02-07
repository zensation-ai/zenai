/**
 * Phase 7.4: Rate Limit Banner Tests
 *
 * Tests for the RateLimitBanner component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RateLimitBanner } from '../RateLimitBanner';

// Mock the useRateLimitFeedback hook
const mockFeedback = {
  rateLimitInfo: null as { limit: number; remaining: number; resetAt: Date; source: string } | null,
  isNearLimit: false,
  isLimited: false,
  retryCountdown: 0,
};

vi.mock('../../hooks/useRateLimitFeedback', () => ({
  useRateLimitFeedback: () => mockFeedback,
}));

describe('RateLimitBanner', () => {
  beforeEach(() => {
    // Reset mock state
    mockFeedback.rateLimitInfo = null;
    mockFeedback.isNearLimit = false;
    mockFeedback.isLimited = false;
    mockFeedback.retryCountdown = 0;
  });

  it('should render nothing when no rate limit concerns', () => {
    const { container } = render(<RateLimitBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('should show warning when near limit', () => {
    mockFeedback.isNearLimit = true;
    mockFeedback.rateLimitInfo = {
      limit: 60,
      remaining: 10,
      resetAt: new Date(),
      source: 'database',
    };

    render(<RateLimitBanner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/10\/60 Anfragen verbleibend/)).toBeInTheDocument();
  });

  it('should show blocked state when rate limited', () => {
    mockFeedback.isLimited = true;
    mockFeedback.isNearLimit = true; // isLimited implies isNearLimit
    mockFeedback.retryCountdown = 30;

    render(<RateLimitBanner />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Anfrage-Limit erreicht/)).toBeInTheDocument();
    expect(screen.getByText('30s')).toBeInTheDocument();
  });

  it('should show blocked state without countdown when retryCountdown is 0', () => {
    mockFeedback.isLimited = true;
    mockFeedback.isNearLimit = true;
    mockFeedback.retryCountdown = 0;

    render(<RateLimitBanner />);

    expect(screen.getByText(/Anfrage-Limit erreicht/)).toBeInTheDocument();
    expect(screen.queryByText(/Erneut/)).not.toBeInTheDocument();
  });

  it('should have correct ARIA attributes for warning', () => {
    mockFeedback.isNearLimit = true;
    mockFeedback.rateLimitInfo = {
      limit: 60,
      remaining: 5,
      resetAt: new Date(),
      source: 'database',
    };

    render(<RateLimitBanner />);

    const banner = screen.getByRole('status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(banner).toHaveClass('rate-limit-warning');
  });

  it('should have correct ARIA attributes for blocked', () => {
    mockFeedback.isLimited = true;
    mockFeedback.isNearLimit = true;
    mockFeedback.retryCountdown = 15;

    render(<RateLimitBanner />);

    const banner = screen.getByRole('alert');
    expect(banner).toHaveAttribute('aria-live', 'assertive');
    expect(banner).toHaveClass('rate-limit-blocked');
  });
});
