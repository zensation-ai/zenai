/**
 * Unit Tests for OfflineIndicator Component
 *
 * Tests offline status display, syncing state, and pending count.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// Mock usePWA hook
let mockIsOnline = true;
let mockPendingSync = 0;

vi.mock('../../hooks/usePWA', () => ({
  usePWA: () => ({
    isOnline: mockIsOnline,
    pendingSync: mockPendingSync,
    isInstallable: false,
    isInstalled: false,
    installApp: vi.fn(),
    swUpdate: false,
    applyUpdate: vi.fn(),
  }),
}));

vi.mock('../OfflineIndicator.css', () => ({}));

import { OfflineIndicator } from '../OfflineIndicator';

describe('OfflineIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    mockPendingSync = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render nothing when online', () => {
    mockIsOnline = true;
    const { container } = render(<OfflineIndicator />);
    expect(container.innerHTML).toBe('');
  });

  it('should show offline message when offline', () => {
    mockIsOnline = false;
    render(<OfflineIndicator />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('should show pending count when offline with pending changes', () => {
    mockIsOnline = false;
    mockPendingSync = 3;
    render(<OfflineIndicator />);
    expect(screen.getByText(/3 Aenderungen warten/)).toBeInTheDocument();
  });

  it('should use singular for single pending change', () => {
    mockIsOnline = false;
    mockPendingSync = 1;
    render(<OfflineIndicator />);
    expect(screen.getByText(/1 Aenderung warten/)).toBeInTheDocument();
  });

  it('should have aria-live attribute for accessibility', () => {
    mockIsOnline = false;
    render(<OfflineIndicator />);
    const indicator = screen.getByRole('status');
    expect(indicator).toHaveAttribute('aria-live', 'polite');
  });
});
