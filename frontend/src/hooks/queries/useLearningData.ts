/**
 * React Query hooks for Learning Dashboard
 *
 * Replaces direct axios calls in LearningDashboard with
 * React Query for automatic caching and deduplication.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';
import type { DashboardData } from '../../components/LearningDashboard/types';

/**
 * Fetch learning dashboard data (overview)
 * Returns the full DashboardData structure from the API.
 */
export function useLearningDashboardQuery(context: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.learning.dashboard(context),
    queryFn: async ({ signal }) => {
      try {
        const response = await axios.get(`/api/${context}/learning/dashboard`, { signal });
        return (response.data?.dashboard ?? null) as DashboardData | null;
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
export function useLearningProfileQuery(context: string, enabled = true) {
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
export function useCreateFocusMutation(context: string) {
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
export function useDeleteFocusMutation(context: string) {
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
export function useUpdateLearningProfileMutation(context: string) {
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
export function useLearningFeedbackMutation(context: string) {
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
