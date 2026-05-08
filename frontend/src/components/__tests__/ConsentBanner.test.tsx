/**
 * Sprint 1.10 — ConsentBanner tests
 *
 * Verifies:
 *   - Renders all 4 togglable kinds + 1 immutable essential banner.
 *   - Default values match the documented privacy-first defaults
 *     (ai_training_opt_out=true, rest false).
 *   - Submit calls POST /api/auth/consent/banner-complete with all 4 togglables
 *     and invokes refreshUser().
 *   - Displays server error without closing the modal.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConsentBanner } from '../auth/ConsentBanner';

const mockRefreshUser = vi.fn().mockResolvedValue(null);
const STABLE_AUTH = {
  getAccessToken: () => 'test-token',
  refreshUser: mockRefreshUser,
};
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => STABLE_AUTH,
}));

describe('ConsentBanner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockRefreshUser.mockClear();
  });

  it('renders all toggles + immutable essential banner', () => {
    render(<ConsentBanner />);

    expect(screen.getByText('Funktionale Cookies')).toBeInTheDocument();
    expect(screen.getByText('Immer aktiv')).toBeInTheDocument();

    expect(screen.getByLabelText('Analytics-Cookies')).toBeInTheDocument();
    expect(screen.getByLabelText('AI-Training Opt-Out')).toBeInTheDocument();
    expect(screen.getByLabelText('Analytics-Tracking')).toBeInTheDocument();
    expect(screen.getByLabelText('Smart-Suggestions-Telemetrie')).toBeInTheDocument();
  });

  it('uses privacy-first defaults (opt-out on, rest off)', () => {
    render(<ConsentBanner />);

    expect(screen.getByLabelText('AI-Training Opt-Out')).toBeChecked();
    expect(screen.getByLabelText('Analytics-Cookies')).not.toBeChecked();
    expect(screen.getByLabelText('Analytics-Tracking')).not.toBeChecked();
    expect(screen.getByLabelText('Smart-Suggestions-Telemetrie')).not.toBeChecked();
  });

  it('submits all 4 choices and calls refreshUser', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { consent_banner_shown_at: 'now' } }),
    });
    globalThis.fetch = fetchMock as never;
    const onComplete = vi.fn();

    render(<ConsentBanner onComplete={onComplete} />);

    fireEvent.click(screen.getByLabelText('Analytics-Cookies'));
    fireEvent.click(screen.getByRole('button', { name: /Auswahl speichern/i }));

    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [[url, init]] = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(url).toMatch(/\/api\/auth\/consent\/banner-complete$/);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      cookies_analytics: true,
      ai_training_opt_out: true,
      analytics_tracking: false,
      functional_tracking: false,
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('shows server error without closing the banner', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server exploded' }),
    }) as never;
    const onComplete = vi.fn();

    render(<ConsentBanner onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /Auswahl speichern/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server exploded');
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(mockRefreshUser).not.toHaveBeenCalled();
  });

  it('disables the submit button while submitting', async () => {
    let resolveFetch!: (v: unknown) => void;
    globalThis.fetch = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    ) as never;

    render(<ConsentBanner />);

    const button = screen.getByRole('button', { name: /Auswahl speichern/i });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());

    resolveFetch({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    });
  });
});
