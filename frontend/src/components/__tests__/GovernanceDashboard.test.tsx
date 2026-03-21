/**
 * Unit Tests for GovernanceDashboard Component
 *
 * Tests tab navigation, pending actions, history, and policies views.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock apiConfig
vi.mock('../../utils/apiConfig', () => ({
  getApiBaseUrl: () => 'http://localhost:3000',
  getApiFetchHeaders: () => ({ 'Content-Type': 'application/json', 'X-API-Key': 'test' }),
}));

vi.mock('../GovernanceDashboard.css', () => ({}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { GovernanceDashboard } from '../GovernanceDashboard';

const defaultProps = {
  context: 'personal' as const,
};

describe('GovernanceDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: pending actions returns empty, SSE stream returns ok body
    mockFetch.mockImplementation((url: string, opts?: any) => {
      const urlStr = typeof url === 'string' ? url : '';

      if (urlStr.includes('/governance/stream')) {
        // SSE stream - return a never-resolving body
        return Promise.resolve({
          ok: true,
          body: {
            getReader: () => ({
              read: () => new Promise(() => {}), // never resolves
            }),
          },
        });
      }

      if (urlStr.includes('/governance/pending')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        });
      }

      if (urlStr.includes('/governance/history')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        });
      }

      if (urlStr.includes('/governance/audit')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        });
      }

      if (urlStr.includes('/governance/policies')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });
    });
  });

  it('should render the three tab buttons', () => {
    render(<GovernanceDashboard {...defaultProps} />);

    expect(screen.getByText('Ausstehend')).toBeInTheDocument();
    expect(screen.getByText('Verlauf')).toBeInTheDocument();
    expect(screen.getByText('Richtlinien')).toBeInTheDocument();
  });

  it('should have proper ARIA tablist role', () => {
    render(<GovernanceDashboard {...defaultProps} />);

    const tablist = screen.getByRole('tablist', { name: 'Governance-Bereiche' });
    expect(tablist).toBeInTheDocument();
  });

  it('should show pending tab as selected by default', () => {
    render(<GovernanceDashboard {...defaultProps} />);

    const pendingTab = screen.getByText('Ausstehend');
    expect(pendingTab).toHaveAttribute('aria-selected', 'true');
  });

  it('should show empty state when no pending actions', async () => {
    render(<GovernanceDashboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Keine ausstehenden Genehmigungen')).toBeInTheDocument();
    });
  });

  it('should switch to history tab on click', async () => {
    render(<GovernanceDashboard {...defaultProps} />);

    fireEvent.click(screen.getByText('Verlauf'));

    const historyTab = screen.getByText('Verlauf');
    expect(historyTab).toHaveAttribute('aria-selected', 'true');
  });

  it('should switch to policies tab on click', async () => {
    render(<GovernanceDashboard {...defaultProps} />);

    fireEvent.click(screen.getByText('Richtlinien'));

    await waitFor(() => {
      expect(screen.getByText('Governance-Richtlinien')).toBeInTheDocument();
    });
  });

  it('should have tabpanel with aria-label', () => {
    render(<GovernanceDashboard {...defaultProps} />);

    const tabpanel = screen.getByRole('tabpanel');
    expect(tabpanel).toHaveAttribute('aria-label', 'pending');
  });
});
