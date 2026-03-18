/**
 * React Query hooks for Ideas
 *
 * Replaces manual fetch/useState/useEffect patterns with
 * React Query for automatic caching, deduplication, and
 * background refetching.
 *
 * @module hooks/queries/useIdeas
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { StructuredIdea } from '../../types';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

// ===========================================
// Query Hooks
// ===========================================

/**
 * Fetch active ideas for the current context
 */
export function useIdeasQuery(context: AIContext) {
  return useQuery({
    queryKey: queryKeys.ideas.list(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/ideas?limit=100`, { signal });
      return (response.data?.ideas ?? []) as StructuredIdea[];
    },
    staleTime: 30_000,
    gcTime: 10 * 60_000, // ideas are long-lived, keep cache 10min
  });
}

/**
 * Fetch archived ideas for the current context
 */
export function useArchivedIdeasQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.ideas.archived(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/ideas/archived?limit=100`, { signal });
      const ideas = (response.data?.ideas ?? []) as StructuredIdea[];
      const total = response.data?.pagination?.total ?? ideas.length;
      return { ideas, total };
    },
    enabled,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}

/**
 * Fetch idea stats/summary for the current context
 */
export function useIdeasStatsQuery(context: AIContext) {
  return useQuery({
    queryKey: queryKeys.ideas.stats(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/ideas/stats/summary`, { signal });
      return response.data;
    },
    staleTime: 60_000,
  });
}

/**
 * Fetch a single idea by ID
 */
export function useIdeaDetailQuery(context: AIContext, id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.ideas.detail(context, id) : ['ideas', 'none'],
    queryFn: async ({ signal }) => {
      if (!id) return null;
      const response = await axios.get(`/api/${context}/ideas/${id}`, { signal });
      return (response.data?.idea ?? response.data?.data ?? response.data) as StructuredIdea;
    },
    enabled: !!id,
    staleTime: 15_000,
  });
}

// ===========================================
// Mutation Hooks
// ===========================================

/**
 * Create a new idea with optimistic update
 */
export function useCreateIdeaMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { content: string; title?: string; priority?: string }) => {
      const response = await axios.post(`/api/${context}/ideas`, data);
      return response.data?.idea as StructuredIdea;
    },
    onSuccess: (newIdea) => {
      // Add to cache immediately
      queryClient.setQueryData<StructuredIdea[]>(
        queryKeys.ideas.list(context),
        (old) => old ? [newIdea, ...old] : [newIdea]
      );
      // Invalidate stats (count changed)
      queryClient.invalidateQueries({ queryKey: queryKeys.ideas.stats(context) });
    },
    onError: (error) => {
      logError('useCreateIdeaMutation', error);
    },
  });
}

/**
 * Update an existing idea
 */
export function useUpdateIdeaMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<StructuredIdea>) => {
      const response = await axios.put(`/api/${context}/ideas/${id}`, data);
      return response.data?.idea as StructuredIdea;
    },
    onSuccess: (updatedIdea) => {
      // Update in list cache
      queryClient.setQueryData<StructuredIdea[]>(
        queryKeys.ideas.list(context),
        (old) => old?.map(idea => idea.id === updatedIdea.id ? updatedIdea : idea) ?? []
      );
      // Update detail cache
      queryClient.setQueryData(
        queryKeys.ideas.detail(context, updatedIdea.id),
        updatedIdea
      );
    },
    onError: (error) => {
      logError('useUpdateIdeaMutation', error);
    },
  });
}

/**
 * Archive an idea (optimistic)
 */
export function useArchiveIdeaMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await axios.put(`/api/${context}/ideas/${id}`, { status: 'archived' });
      return id;
    },
    onMutate: async (id) => {
      // Optimistic: remove from active list
      await queryClient.cancelQueries({ queryKey: queryKeys.ideas.list(context) });
      const previous = queryClient.getQueryData<StructuredIdea[]>(queryKeys.ideas.list(context));

      queryClient.setQueryData<StructuredIdea[]>(
        queryKeys.ideas.list(context),
        (old) => old?.filter(idea => idea.id !== id) ?? []
      );

      return { previous };
    },
    onError: (_error, _id, rollback) => {
      // Rollback on error
      if (rollback?.previous) {
        queryClient.setQueryData(queryKeys.ideas.list(context), rollback.previous);
      }
      logError('useArchiveIdeaMutation', _error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ideas.archived(context) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ideas.stats(context) });
    },
  });
}

/**
 * Delete an idea (optimistic)
 */
export function useDeleteIdeaMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`/api/${context}/ideas/${id}`);
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.ideas.list(context) });
      const previous = queryClient.getQueryData<StructuredIdea[]>(queryKeys.ideas.list(context));

      queryClient.setQueryData<StructuredIdea[]>(
        queryKeys.ideas.list(context),
        (old) => old?.filter(idea => idea.id !== id) ?? []
      );

      return { previous };
    },
    onError: (_error, _id, rollback) => {
      if (rollback?.previous) {
        queryClient.setQueryData(queryKeys.ideas.list(context), rollback.previous);
      }
      logError('useDeleteIdeaMutation', _error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ideas.stats(context) });
    },
  });
}

/**
 * Restore an archived idea
 */
export function useRestoreIdeaMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await axios.put(`/api/${context}/ideas/${id}`, { status: 'active' });
      return id;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ideas.list(context) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ideas.archived(context) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ideas.stats(context) });
    },
    onError: (error) => {
      logError('useRestoreIdeaMutation', error);
    },
  });
}

/**
 * Toggle favorite on an idea (optimistic)
 */
export function useToggleFavoriteMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      await axios.put(`/api/${context}/ideas/${id}`, { is_favorite: isFavorite });
      return { id, isFavorite };
    },
    onMutate: async ({ id, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.ideas.list(context) });
      const previous = queryClient.getQueryData<StructuredIdea[]>(queryKeys.ideas.list(context));

      queryClient.setQueryData<StructuredIdea[]>(
        queryKeys.ideas.list(context),
        (old) => old?.map(idea =>
          idea.id === id ? { ...idea, is_favorite: isFavorite } : idea
        ) ?? []
      );

      return { previous };
    },
    onError: (_error, _vars, rollback) => {
      if (rollback?.previous) {
        queryClient.setQueryData(queryKeys.ideas.list(context), rollback.previous);
      }
    },
  });
}
