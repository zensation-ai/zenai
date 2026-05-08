/**
 * Tests for useBillingStatus hook
 *
 * Tests that the hook is wired correctly: correct query key, correct API call,
 * and correct response mapping. Uses mocked useQuery to avoid JSX/Provider setup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';
import axios from 'axios';

// ─────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────

const mockUseQuery = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

vi.mock('axios');

vi.mock('../../lib/query-keys', () => ({
  queryKeys: {
    billing: {
      status: () => ['billing', 'status'],
    },
  },
}));

const mockedAxios = vi.mocked(axios);

// ─────────────────────────────────────────────
// Import under test (after mocks are registered)
// ─────────────────────────────────────────────

const { useBillingStatus } = await import('../../hooks/queries/useBilling');

import type { BillingStatus } from '../../hooks/queries/useBilling';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeQueryResult<T>(overrides: Partial<UseQueryResult<T>>): UseQueryResult<T> {
  return {
    data: undefined,
    isLoading: false,
    isSuccess: false,
    isError: false,
    isPending: false,
    isFetching: false,
    isRefetching: false,
    status: 'pending',
    fetchStatus: 'idle',
    error: null,
    ...overrides,
  } as unknown as UseQueryResult<T>;
}

const freePlan: BillingStatus = {
  plan: 'free',
  status: 'active',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  stripeCustomerId: null,
};

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('useBillingStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the correct query key to useQuery', () => {
    mockUseQuery.mockReturnValue(makeQueryResult<BillingStatus>({}));

    useBillingStatus();

    const opts = mockUseQuery.mock.calls[0][0] as { queryKey: unknown[] };
    expect(opts.queryKey).toEqual(['billing', 'status']);
  });

  it('configures staleTime to 5 minutes', () => {
    mockUseQuery.mockReturnValue(makeQueryResult<BillingStatus>({}));

    useBillingStatus();

    const opts = mockUseQuery.mock.calls[0][0] as { staleTime: number };
    expect(opts.staleTime).toBe(5 * 60 * 1000);
  });

  it('limits retry to 1', () => {
    mockUseQuery.mockReturnValue(makeQueryResult<BillingStatus>({}));

    useBillingStatus();

    const opts = mockUseQuery.mock.calls[0][0] as { retry: number };
    expect(opts.retry).toBe(1);
  });

  it('returns data from useQuery', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult<BillingStatus>({ data: freePlan, isSuccess: true }),
    );

    const result = useBillingStatus();

    expect(result.data).toEqual(freePlan);
    expect(result.isSuccess).toBe(true);
  });

  it('reflects loading state from useQuery', () => {
    mockUseQuery.mockReturnValue(
      makeQueryResult<BillingStatus>({ isLoading: true }),
    );

    const result = useBillingStatus();

    expect(result.isLoading).toBe(true);
    expect(result.data).toBeUndefined();
  });

  it('reflects error state from useQuery', () => {
    const error = new Error('Network Error');
    mockUseQuery.mockReturnValue(
      makeQueryResult<BillingStatus>({ isError: true, error }),
    );

    const result = useBillingStatus();

    expect(result.isError).toBe(true);
    expect(result.error).toBe(error);
  });

  it('queryFn calls the billing status API endpoint', async () => {
    mockUseQuery.mockReturnValue(makeQueryResult<BillingStatus>({}));

    useBillingStatus();

    // Extract and invoke the queryFn directly
    const opts = mockUseQuery.mock.calls[0][0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<BillingStatus>;
    };

    mockedAxios.get.mockResolvedValueOnce({
      data: { success: true, data: freePlan },
    });

    const signal = new AbortController().signal;
    const result = await opts.queryFn({ signal });

    expect(mockedAxios.get).toHaveBeenCalledWith('/api/billing/status', { signal });
    expect(result).toEqual(freePlan);
  });
});
