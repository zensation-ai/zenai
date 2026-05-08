import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import axios from 'axios';
import type { BillingStatus } from '../../hooks/queries/useBilling';
import { useBillingStatus } from '../../hooks/queries/useBilling';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

const mockStatus: BillingStatus = {
  plan: 'free',
  status: 'active',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  stripeCustomerId: null,
};

describe('useBillingStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns billing status on success', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { success: true, data: mockStatus },
    });

    const { result } = renderHook(() => useBillingStatus(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockStatus);
    expect(mockedAxios.get).toHaveBeenCalledWith('/api/billing/status', expect.objectContaining({ signal: expect.anything() }));
  });

  it('returns pro plan data correctly', async () => {
    const proStatus: BillingStatus = {
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: '2026-04-29T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      stripeCustomerId: 'cus_test123',
    };

    mockedAxios.get.mockResolvedValueOnce({
      data: { success: true, data: proStatus },
    });

    const { result } = renderHook(() => useBillingStatus(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.plan).toBe('pro');
    expect(result.current.data?.stripeCustomerId).toBe('cus_test123');
  });

  it('enters error state on API failure', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useBillingStatus(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });

    expect(result.current.data).toBeUndefined();
  });

  it('is in loading state initially', () => {
    mockedAxios.get.mockReturnValueOnce(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useBillingStatus(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('uses the correct query key', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { success: true, data: mockStatus },
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    const { result } = renderHook(() => useBillingStatus(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = client.getQueryData(['billing', 'status']);
    expect(cached).toEqual(mockStatus);
  });
});
