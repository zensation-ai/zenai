/**
 * React Query Client Configuration
 *
 * Central QueryClient with sensible defaults for ZenAI.
 * Provides stale-while-revalidate pattern, retry logic,
 * and context-aware cache invalidation.
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30s — data stays fresh
      gcTime: 5 * 60_000, // 5min garbage collection
      retry: 1,
      refetchOnWindowFocus: false, // avoid excessive refetches
    },
    mutations: {
      retry: 0,
    },
  },
});
