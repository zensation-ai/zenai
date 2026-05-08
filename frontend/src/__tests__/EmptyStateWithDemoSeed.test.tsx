/**
 * Tests for EmptyStateWithDemoSeed — Sprint 1.6 (SaaS-Launch-Readiness)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyStateWithDemoSeed } from '../components/shared/EmptyStateWithDemoSeed';

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  (import.meta.env as Record<string, string>).VITE_API_KEY = 'seed-api-key';
});

describe('EmptyStateWithDemoSeed', () => {
  it('renders title, description and the demo-seed CTA by default', () => {
    render(
      <EmptyStateWithDemoSeed
        title="Keine Ideen"
        description="Lade Demo-Daten, um loszulegen."
      />,
    );

    expect(screen.getByText('Keine Ideen')).toBeInTheDocument();
    expect(screen.getByText('Lade Demo-Daten, um loszulegen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /demo-daten laden/i })).toBeInTheDocument();
  });

  it('renders the primary create CTA when createLabel + onCreate are provided', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();

    render(
      <EmptyStateWithDemoSeed
        title="Keine Ideen"
        createLabel="Idee erstellen"
        onCreate={onCreate}
      />,
    );

    const createBtn = screen.getByRole('button', { name: 'Idee erstellen' });
    await user.click(createBtn);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('hides the create CTA when createLabel is null', () => {
    render(
      <EmptyStateWithDemoSeed
        title="Keine E-Mails"
        createLabel={null}
        onCreate={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /erstellen/i })).not.toBeInTheDocument();
    // demo-seed CTA is still there
    expect(screen.getByRole('button', { name: /demo-daten laden/i })).toBeInTheDocument();
  });

  it('hides the demo-seed CTA when hideDemoSeed is true', () => {
    render(
      <EmptyStateWithDemoSeed
        title="Keine Ideen"
        hideDemoSeed
        createLabel="Neu"
        onCreate={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /demo-daten laden/i })).not.toBeInTheDocument();
  });

  it('POSTs to /api/demo/seed with X-API-Key when clicking "Demo-Daten laden"', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) } as unknown as Response);
    // Replace window.location so the component's reload() after seed doesn't crash jsdom.
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: vi.fn() },
    });

    const user = userEvent.setup();
    render(<EmptyStateWithDemoSeed title="Leer" />);

    await user.click(screen.getByRole('button', { name: /demo-daten laden/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toContain('/api/demo/seed');
    expect(call?.[1]?.method).toBe('POST');
    expect((call?.[1]?.headers as Record<string, string>)['X-API-Key']).toBe('seed-api-key');

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('shows an error hint when VITE_API_KEY is missing', async () => {
    (import.meta.env as Record<string, string>).VITE_API_KEY = '';
    const user = userEvent.setup();
    render(<EmptyStateWithDemoSeed title="Leer" />);

    await user.click(screen.getByRole('button', { name: /demo-daten laden/i }));

    await waitFor(() => {
      expect(screen.getByText(/VITE_API_KEY prüfen/i)).toBeInTheDocument();
    });
    // No network request was made
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
