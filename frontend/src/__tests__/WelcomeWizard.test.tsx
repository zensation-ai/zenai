/**
 * Tests for WelcomeWizard — Sprint 1.6 (SaaS-Launch-Readiness)
 *
 * Covers the mount-condition, Skip → POST /api/auth/onboarding/complete,
 * step navigation, and demo-seed branch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WelcomeWizard } from '../components/onboarding/WelcomeWizard';

const mockGetAccessToken = vi.fn(() => 'test-token');
const mockRefreshUser = vi.fn(async () => null);

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    getAccessToken: mockGetAccessToken,
    refreshUser: mockRefreshUser,
  }),
}));

// Minimal fetch mock — each test sets up its own responses
const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  // Default: every fetch call returns ok+complete timestamp
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { onboarding_completed_at: '2026-04-19T12:00:00Z' } }),
  } as unknown as Response);
});

describe('WelcomeWizard', () => {
  it('renders step 1 with the context picker and the Skip link', () => {
    render(<WelcomeWizard />);

    expect(screen.getByText('Willkommen bei ZenAI')).toBeInTheDocument();
    expect(screen.getByText('Schritt 1 von 4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /onboarding überspringen/i })).toBeInTheDocument();
    // Context options from CONTEXT_LABELS
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Strategy')).toBeInTheDocument();
  });

  it('Skip link POSTs to /api/auth/onboarding/complete and fires onComplete', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();

    render(<WelcomeWizard onComplete={onComplete} />);

    await user.click(screen.getByRole('button', { name: /onboarding überspringen/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const completeCall = fetchMock.mock.calls.find(([url]) =>
      typeof url === 'string' && url.includes('/api/auth/onboarding/complete'),
    );
    expect(completeCall).toBeDefined();
    expect(completeCall![1]?.method).toBe('POST');
    expect((completeCall![1]?.headers as Record<string, string>).Authorization).toBe('Bearer test-token');

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith('2026-04-19T12:00:00Z');
    });
    expect(mockRefreshUser).toHaveBeenCalled();
  });

  it('step 2 "Nein, danke" advances without calling /api/demo/seed', async () => {
    const user = userEvent.setup();
    render(<WelcomeWizard />);

    // step 1 → 2
    await user.click(screen.getByRole('button', { name: /weiter/i }));
    await waitFor(() => expect(screen.getByText('Schritt 2 von 4')).toBeInTheDocument());

    fetchMock.mockClear();
    await user.click(screen.getByRole('button', { name: /^nein,/i }));

    await waitFor(() => expect(screen.getByText('Schritt 3 von 4')).toBeInTheDocument());
    const seedCalls = fetchMock.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/demo/seed'),
    );
    expect(seedCalls).toHaveLength(0);
  });

  it('step 2 "Ja, laden" triggers POST /api/demo/seed with the X-API-Key header', async () => {
    (import.meta.env as Record<string, string>).VITE_API_KEY = 'seed-api-key';
    const user = userEvent.setup();
    render(<WelcomeWizard />);

    await user.click(screen.getByRole('button', { name: /weiter/i }));
    await waitFor(() => expect(screen.getByText('Schritt 2 von 4')).toBeInTheDocument());

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as unknown as Response);

    await user.click(screen.getByRole('button', { name: /^ja, laden/i }));

    await waitFor(() => {
      const seedCall = fetchMock.mock.calls.find(([url]) =>
        typeof url === 'string' && url.includes('/api/demo/seed'),
      );
      expect(seedCall).toBeDefined();
      expect((seedCall![1]?.headers as Record<string, string>)['X-API-Key']).toBe('seed-api-key');
    });
  });

  it('falls back to client time when /api/auth/onboarding/complete returns !ok', async () => {
    const onComplete = vi.fn();
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response);

    const user = userEvent.setup();
    render(<WelcomeWizard onComplete={onComplete} />);

    await user.click(screen.getByRole('button', { name: /onboarding überspringen/i }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
    // Fallback: a non-empty ISO-ish string was passed so the parent unmounts.
    const arg = (onComplete.mock.calls[0]?.[0] ?? '') as string;
    expect(arg).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
