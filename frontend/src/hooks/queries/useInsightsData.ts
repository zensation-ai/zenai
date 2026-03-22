/**
 * React Query hooks for Insights Dashboard
 *
 * Provides query hooks for analytics, sleep compute, and AI traces.
 */

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

/**
 * Fetch sleep compute logs
 */
export function useSleepLogsQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.insights.sleepLogs(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get(`/api/${context}/sleep-compute/logs`, { signal });
        return response.data?.data ?? response.data?.logs ?? [];
      } catch (error) {
        logError('useSleepLogsQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Fetch sleep compute stats
 */
export function useSleepStatsQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.insights.sleepStats(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get(`/api/${context}/sleep-compute/stats`, { signal });
        return response.data?.data ?? response.data ?? null;
      } catch (error) {
        logError('useSleepStatsQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Fetch AI traces
 */
export function useAITracesQuery(
  context: AIContext,
  filters?: { limit?: number; model?: string },
  enabled = true
) {
  return useQuery({
    queryKey: queryKeys.insights.aiTraces(context, filters),
    queryFn: async ({ signal }) => {
      try {
        const params = new URLSearchParams();
        if (filters?.limit) params.set('limit', String(filters.limit));
        if (filters?.model) params.set('model', filters.model);
        const response = await axios.get(
          `/api/observability/ai-traces?${params.toString()}`,
          { signal }
        );
        return response.data?.data ?? response.data ?? [];
      } catch (error) {
        logError('useAITracesQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 30_000,
  });
}
