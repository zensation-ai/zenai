/**
 * InstallConfirmModal tests
 *
 * Sprint 1.11 — covers permission review, confirm-checkbox gating,
 * and submit wiring.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import { InstallConfirmModal } from '../InstallConfirmModal';
import type { BlueprintDetail } from '../types';

vi.mock('axios');
vi.mock('../../../utils/errors', () => ({ logError: vi.fn() }));

const mockedAxios = vi.mocked(axios, true);

const detail: BlueprintDetail = {
  id: 'bp-1',
  name: 'Daily Research',
  description: null,
  icon: '🔍',
  category: 'research',
  tags: [],
  type: 'autonomous',
  triggers: [],
  maxActionsPerDay: 10,
  tokenBudgetDaily: 50000,
  approvalRequired: true,
  tools: ['web_search', 'fetch_url'],
  instructions: '',
  source: 'community',
  rating: null,
  usageCount: 0,
  featured: false,
  histogram: { total: 0, average: null, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
  recentReviews: [],
};

describe('InstallConfirmModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists each requested tool with its permission chip', () => {
    render(
      <InstallConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onInstalled={() => {}}
        detailOverride={detail}
      />,
    );
    expect(screen.getByTestId('perm-tool-web_search')).toBeInTheDocument();
    expect(screen.getByTestId('perm-tool-fetch_url')).toBeInTheDocument();
    expect(screen.getByText(/Tool-Berechtigungen \(2\)/)).toBeInTheDocument();
  });

  it('shows daily limits and approval flag', () => {
    render(
      <InstallConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onInstalled={() => {}}
        detailOverride={detail}
      />,
    );
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('50.000')).toBeInTheDocument();
    expect(screen.getByText('Ja')).toBeInTheDocument();
  });

  it('disables submit until confirm-checkbox is checked', () => {
    render(
      <InstallConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onInstalled={() => {}}
        detailOverride={detail}
      />,
    );
    const submit = screen.getByTestId('install-confirm-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('install-confirm-checkbox'));
    expect(submit.disabled).toBe(false);
  });

  it('calls POST /install and onInstalled with new id on success', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({ data: { data: { id: 'bp-1_abc12345' } } });
    const onInstalled = vi.fn();

    render(
      <InstallConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onInstalled={onInstalled}
        detailOverride={detail}
      />,
    );

    fireEvent.click(screen.getByTestId('install-confirm-checkbox'));
    fireEvent.click(screen.getByTestId('install-confirm-submit'));

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/marketplace/blueprints/install',
        { blueprintId: 'bp-1' },
      );
      expect(onInstalled).toHaveBeenCalledWith('bp-1_abc12345');
    });
  });

  it('shows error on install failure without calling onInstalled', async () => {
    mockedAxios.post = vi.fn().mockRejectedValue(new Error('network'));
    const onInstalled = vi.fn();

    render(
      <InstallConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onInstalled={onInstalled}
        detailOverride={detail}
      />,
    );

    fireEvent.click(screen.getByTestId('install-confirm-checkbox'));
    fireEvent.click(screen.getByTestId('install-confirm-submit'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Installation fehlgeschlagen/);
    });
    expect(onInstalled).not.toHaveBeenCalled();
  });

  it('falls back to blueprintId when response omits new id', async () => {
    mockedAxios.post = vi.fn().mockResolvedValue({ data: { data: {} } });
    const onInstalled = vi.fn();

    render(
      <InstallConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onInstalled={onInstalled}
        detailOverride={detail}
      />,
    );

    fireEvent.click(screen.getByTestId('install-confirm-checkbox'));
    fireEvent.click(screen.getByTestId('install-confirm-submit'));

    await waitFor(() => {
      expect(onInstalled).toHaveBeenCalledWith('bp-1');
    });
  });

  it('shows "Keine externen Tools" when tools list is empty', () => {
    render(
      <InstallConfirmModal
        blueprintId="bp-1"
        onClose={() => {}}
        onInstalled={() => {}}
        detailOverride={{ ...detail, tools: [] }}
      />,
    );
    expect(screen.getByText(/Keine externen Tools angefordert/)).toBeInTheDocument();
  });
});
