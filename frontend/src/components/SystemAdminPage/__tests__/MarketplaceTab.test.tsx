/**
 * MarketplaceTab tests — Sprint 1.12 admin moderation queue.
 *
 * Covers queue rendering, approve flow, reject-modal + ≥10-char reason
 * requirement, and the typed error messages surfaced from the API.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MarketplaceTab } from '../MarketplaceTab';

vi.mock('../../SkeletonLoader', () => ({
  SkeletonLoader: () => <div data-testid="skeleton" />,
}));

vi.mock('../../../utils/apiConfig', () => ({
  getApiBaseUrl: () => '',
  getApiFetchHeaders: () => ({}),
}));

const pendingRow = {
  id: 'bp-1',
  name: 'Daily Research',
  description: 'A helpful research agent.',
  icon: '🔍',
  category: 'research',
  tags: ['daily'],
  tools: ['web_search', 'fetch_url'],
  instructions: 'Research things.',
  author: 'user-abc',
  userId: 'user-abc',
  publishedAt: '2026-04-20T10:00:00Z',
  createdAt: '2026-04-19T10:00:00Z',
  moderationReason: null,
};

function jsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'OK',
    json: () => Promise.resolve(data),
  }) as unknown as Promise<Response>;
}

describe('MarketplaceTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the pending queue with approve/reject buttons', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      jsonResponse({ data: [pendingRow] }),
    );
    render(<MarketplaceTab />);
    await waitFor(() => {
      expect(screen.getByTestId('pending-row-bp-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('approve-bp-1')).toBeInTheDocument();
    expect(screen.getByTestId('reject-bp-1')).toBeInTheDocument();
    expect(screen.getByText(/Moderation-Queue \(1\)/)).toBeInTheDocument();
  });

  it('shows empty state when queue is empty', async () => {
    global.fetch = vi.fn().mockImplementation(() => jsonResponse({ data: [] }));
    render(<MarketplaceTab />);
    await waitFor(() => {
      expect(screen.getByText(/Keine offenen Einreichungen/)).toBeInTheDocument();
    });
  });

  it('calls the moderate endpoint with approved decision', async () => {
    const fetchSpy = vi.fn();
    fetchSpy.mockImplementationOnce(() => jsonResponse({ data: [pendingRow] }));
    fetchSpy.mockImplementationOnce(() => jsonResponse({ success: true }));
    fetchSpy.mockImplementationOnce(() => jsonResponse({ data: [] }));
    global.fetch = fetchSpy;

    render(<MarketplaceTab />);
    await waitFor(() => expect(screen.getByTestId('approve-bp-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('approve-bp-1'));

    await waitFor(() => {
      const moderateCall = fetchSpy.mock.calls.find(([url]) =>
        String(url).includes('/moderate'),
      );
      expect(moderateCall).toBeDefined();
      const body = JSON.parse(moderateCall![1].body as string);
      expect(body).toEqual({ decision: 'approved' });
    });
  });

  it('requires ≥10 chars to submit rejection', async () => {
    global.fetch = vi.fn().mockImplementation(() => jsonResponse({ data: [pendingRow] }));
    render(<MarketplaceTab />);
    await waitFor(() => expect(screen.getByTestId('reject-bp-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('reject-bp-1'));
    const submit = screen.getByTestId('reject-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('reject-reason'), { target: { value: 'too short' } });
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('reject-reason'), {
      target: { value: 'violates content policy' },
    });
    expect(submit.disabled).toBe(false);
  });

  it('sends reject reason to moderate endpoint', async () => {
    const fetchSpy = vi.fn();
    fetchSpy.mockImplementationOnce(() => jsonResponse({ data: [pendingRow] }));
    fetchSpy.mockImplementationOnce(() => jsonResponse({ success: true }));
    fetchSpy.mockImplementationOnce(() => jsonResponse({ data: [] }));
    global.fetch = fetchSpy;

    render(<MarketplaceTab />);
    await waitFor(() => expect(screen.getByTestId('reject-bp-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('reject-bp-1'));
    fireEvent.change(screen.getByTestId('reject-reason'), {
      target: { value: 'violates content policy — TOS' },
    });
    fireEvent.click(screen.getByTestId('reject-submit'));

    await waitFor(() => {
      const moderateCall = fetchSpy.mock.calls.find(([url]) =>
        String(url).includes('/moderate'),
      );
      expect(moderateCall).toBeDefined();
      const body = JSON.parse(moderateCall![1].body as string);
      expect(body.decision).toBe('rejected');
      expect(body.reason).toBe('violates content policy — TOS');
    });
  });

  it('renders an error alert when fetch fails', async () => {
    global.fetch = vi.fn().mockImplementation(() =>
      jsonResponse({ error: 'boom' }, { ok: false, status: 500 }),
    );
    render(<MarketplaceTab />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/boom/);
    });
  });
});
