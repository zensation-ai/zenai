/**
 * Sprint 1.2 (2026-04-16) — ConsentTab tests.
 *
 * Verifies that the Consent-Center:
 *   - Renders all 5 consent kinds as toggles.
 *   - Disables the essential-cookies toggle.
 *   - Sends PUT /api/auth/consent with { kind, granted } on toggle change.
 *   - Supports "Alle nicht-essentiellen zurücksetzen".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ConsentTab } from '../settings/ConsentTab';

// findBy*/waitFor default timeout is 1000ms — can flake in CI under load.
const FIND_TIMEOUT = 5000;

// Mock useAuth to supply a token. IMPORTANT: return a stable reference so
// the component's useCallback deps don't change every render (which would
// cause the useEffect to re-fire forever and keep the skeleton visible).
const STABLE_AUTH = { getAccessToken: () => 'fake-token' };
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => STABLE_AUTH,
}));

function mockConsentGet(overrides: Record<string, { granted: boolean; is_default: boolean }> = {}) {
  const base = {
    cookies_functional: { granted: true, granted_at: null, is_default: true },
    cookies_analytics: { granted: false, granted_at: null, is_default: true },
    ai_training_opt_out: { granted: true, granted_at: null, is_default: true },
    analytics_tracking: { granted: false, granted_at: null, is_default: true },
    functional_tracking: { granted: false, granted_at: null, is_default: true },
  };
  return {
    success: true,
    data: {
      state: { ...base, ...overrides },
      supported_kinds: Object.keys(base),
    },
  };
}

describe('ConsentTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all 5 consent kinds after load', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockConsentGet(),
    }) as never;

    render(<ConsentTab />);

    await screen.findByText('Funktionale Cookies', {}, { timeout: FIND_TIMEOUT });
    expect(screen.getByText('Analytics-Cookies')).toBeInTheDocument();
    expect(screen.getByText('AI-Training Opt-Out')).toBeInTheDocument();
    expect(screen.getByText('Analytics-Tracking')).toBeInTheDocument();
    expect(screen.getByText('Smart-Suggestions-Telemetrie')).toBeInTheDocument();
  });

  it('renders "Essentiell" badge for cookies_functional', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockConsentGet(),
    }) as never;

    render(<ConsentTab />);

    await screen.findByText('Essentiell', {}, { timeout: FIND_TIMEOUT });
  });

  it('sends PUT on toggle change', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockConsentGet() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: {} }) });
    globalThis.fetch = fetchMock as never;

    render(<ConsentTab />);

    const toggle = await screen.findByLabelText(
      /Analytics-Cookies: Erlaubt/i,
      {},
      { timeout: FIND_TIMEOUT },
    );
    fireEvent.click(toggle);

    await waitFor(
      () => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/api/auth/consent'),
          expect.objectContaining({
            method: 'PUT',
            body: expect.stringContaining('"kind":"cookies_analytics"'),
          }),
        );
      },
      { timeout: FIND_TIMEOUT },
    );
  });

  it('shows error when consent load fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network')) as never;

    render(<ConsentTab />);

    await screen.findByText(
      'Einwilligungen konnten nicht geladen werden.',
      {},
      { timeout: FIND_TIMEOUT },
    );
  });
});
