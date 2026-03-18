/**
 * React Query hooks for Learning Dashboard
 *
 * Replaces direct axios calls in LearningDashboard with
 * React Query for automatic caching and deduplication.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

export interface LearningDashboardData {
  focusTopics?: Array<{
    id: string;
    name: string;
    description: string;
    keywords: string[];
    progress: number;
    lastActive: string;
  }>;
  suggestions?: Array<{
    id: string;
    title: string;
    description: string;
    type: string;
    relevance: number;
  }>;
  research?: Array<{
    id: string;
    topic: string;
    summary: string;
    createdAt: string;
  }>;
  stats?: {
    totalFocusTopics: number;
    activeSuggestions: number;
    researchCount: number;
  };
}

/**
 * Fetch learning dashboard data (overview)
 */
export function useLearningDashboardQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.learning.dashboard(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get(`/api/${context}/learning/dashboard`, { signal });
        return (response.data?.dashboard ?? null) as LearningDashboardData | null;
      } catch (error) {
        logError('useLearningDashboardQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Fetch learning profile
 */
export function useLearningProfileQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.learning.profile(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get(`/api/${context}/learning/profile`, { signal });
        return response.data?.profile ?? null;
      } catch (error) {
        logError('useLearningProfileQuery', error);
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Create a new focus topic
 */
export function useCreateFocusMutation(context: AIContext) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description: string; keywords: string }) => {
      const response = await axios.post(`/api/${context}/learning/focus`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.learning.dashboard(context) });
    },
    onError: (error) => {
      logError('useCreateFocusMutation', error);
    },
  });
}

/**
 * Delete a focus topic
 */
export function useDeleteFocusMutation(context: AIContext) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (focusId: string) => {
      const response = await axios.delete(`/api/${context}/learning/focus/${focusId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.learning.dashboard(context) });
    },
    onError: (error) => {
      logError('useDeleteFocusMutation', error);
    },
  });
}

/**
 * Update learning profile
 */
export function useUpdateLearningProfileMutation(context: AIContext) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await axios.put(`/api/${context}/learning/profile`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.learning.profile(context) });
    },
    onError: (error) => {
      logError('useUpdateLearningProfileMutation', error);
    },
  });
}

/**
 * Submit feedback on a suggestion
 */
export function useLearningFeedbackMutation(context: AIContext) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { suggestionId: string; rating: number; comment?: string }) => {
      const response = await axios.post(`/api/${context}/learning/feedback`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.learning.dashboard(context) });
    },
    onError: (error) => {
      logError('useLearningFeedbackMutation', error);
    },
  });
}
