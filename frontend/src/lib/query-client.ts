/**
 * React Query Client Configuration
 *
 * Central QueryClient with sensible defaults for ZenAI.
 * Provides stale-while-revalidate pattern, retry logic,
 * offline-first network mode, and context-aware cache invalidation.
 *
 * Phase 5.3: Added networkMode 'offlineFirst' so cached data is served
 * immediately when offline, and onlineManager listener to refetch stale
 * queries when connectivity is restored.
 */

import { QueryClient, onlineManager } from '@tanstack/react-query';

/**
 * Intelligent retry: up to 3 retries for server errors (5xx),
 * no retry for client errors (400, 401, 403, 404).
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  // Axios-style errors with response
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status !== undefined && status < 500) return false;
  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s — data stays fresh
      gcTime: 5 * 60_000, // 5min garbage collection
      retry: shouldRetry,
      refetchOnWindowFocus: false, // avoid excessive refetches
      networkMode: 'offlineFirst', // serve cache when offline, revalidate when online
    },
    mutations: {
      retry: 0,
      networkMode: 'offlineFirst',
    },
  },
});

// Refetch all stale queries when the browser comes back online
onlineManager.subscribe((isOnline) => {
  if (isOnline) {
    queryClient.invalidateQueries();
  }
});
