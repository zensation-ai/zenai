/**
 * React Query hooks for My AI page
 *
 * Provides query hooks for memory transparency,
 * procedural memory, and AI profile data.
 */

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

/**
 * Fetch AI memory/knowledge (learned facts)
 */
export function useAIMemoryQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.myAI.memory(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get(`/api/${context}/memory/facts`, { signal });
        return response.data?.data ?? response.data?.facts ?? [];
      } catch (error) {
        logError('useAIMemoryQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Fetch procedural memories
 */
export function useProceduresQuery(
  context: AIContext,
  filters?: { limit?: number; outcome?: string },
  enabled = true
) {
  return useQuery({
    queryKey: queryKeys.myAI.procedures(context, filters),
    queryFn: async ({ signal }) => {
      try {
        const params = new URLSearchParams();
        if (filters?.limit) params.set('limit', String(filters.limit));
        if (filters?.outcome) params.set('outcome', filters.outcome);
        const response = await axios.get(
          `/api/${context}/memory/procedures?${params.toString()}`,
          { signal }
        );
        return response.data?.data ?? response.data?.procedures ?? [];
      } catch (error) {
        logError('useProceduresQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Fetch AI profile/personalization data
 */
export function useAIProfileQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.myAI.profile(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get(`/api/${context}/profile`, { signal });
        return response.data?.data ?? response.data?.profile ?? null;
      } catch (error) {
        logError('useAIProfileQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}
