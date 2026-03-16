/**
 * React Query hooks for Tasks & Projects
 *
 * @module hooks/queries/useTasks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

// ===========================================
// Task Query Hooks
// ===========================================

/**
 * Fetch tasks list with optional filters
 */
export function useTasksQuery(context: AIContext, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.tasks.list(context, filters),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/tasks`, { signal, params: filters });
      return response.data?.data ?? response.data?.tasks ?? [];
    },
    staleTime: 30_000,
  });
}

/**
 * Fetch Gantt chart data (tasks + dependencies + projects)
 */
export function useTasksGanttQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tasks.gantt(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/tasks/gantt`, { signal });
      return response.data?.data ?? response.data;
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Fetch a single task by ID
 */
export function useTaskDetailQuery(context: AIContext, id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.tasks.detail(context, id) : ['tasks', 'none'],
    queryFn: async ({ signal }) => {
      if (!id) return null;
      const response = await axios.get(`/api/${context}/tasks/${id}`, { signal });
      return response.data?.data ?? response.data;
    },
    enabled: !!id,
    staleTime: 15_000,
  });
}

// ===========================================
// Task Mutation Hooks
// ===========================================

/**
 * Create a new task
 */
export function useCreateTaskMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await axios.post(`/api/${context}/tasks`, data);
      return response.data?.data ?? response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(context) });
    },
    onError: (error) => {
      logError('useCreateTaskMutation', error);
    },
  });
}

/**
 * Update a task
 */
export function useUpdateTaskMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const response = await axios.put(`/api/${context}/tasks/${id}`, data);
      return response.data?.data ?? response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(context, variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.list(context) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.gantt(context) });
    },
    onError: (error) => {
      logError('useUpdateTaskMutation', error);
    },
  });
}

/**
 * Reorder tasks (Kanban drag-and-drop)
 */
export function useReorderTasksMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { status: string; taskIds: string[] }) => {
      await axios.post(`/api/${context}/tasks/reorder`, data);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.list(context) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.gantt(context) });
    },
    onError: (error) => {
      logError('useReorderTasksMutation', error);
    },
  });
}

/**
 * Delete a task
 */
export function useDeleteTaskMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`/api/${context}/tasks/${id}`);
      return id;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all(context) });
    },
    onError: (error) => {
      logError('useDeleteTaskMutation', error);
    },
  });
}

// ===========================================
// Project Query Hooks
// ===========================================

/**
 * Fetch projects list
 */
export function useProjectsQuery(context: AIContext) {
  return useQuery({
    queryKey: queryKeys.projects.list(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/projects`, { signal });
      return response.data?.data ?? response.data?.projects ?? [];
    },
    staleTime: 60_000,
  });
}

/**
 * Fetch a single project by ID
 */
export function useProjectDetailQuery(context: AIContext, id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.projects.detail(context, id) : ['projects', 'none'],
    queryFn: async ({ signal }) => {
      if (!id) return null;
      const response = await axios.get(`/api/${context}/projects/${id}`, { signal });
      return response.data?.data ?? response.data;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

/**
 * Create a new project
 */
export function useCreateProjectMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await axios.post(`/api/${context}/projects`, data);
      return response.data?.data ?? response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all(context) });
    },
    onError: (error) => {
      logError('useCreateProjectMutation', error);
    },
  });
}

/**
 * Update a project
 */
export function useUpdateProjectMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const response = await axios.put(`/api/${context}/projects/${id}`, data);
      return response.data?.data ?? response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(context, variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(context) });
    },
    onError: (error) => {
      logError('useUpdateProjectMutation', error);
    },
  });
}

/**
 * Delete/archive a project
 */
export function useDeleteProjectMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`/api/${context}/projects/${id}`);
      return id;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all(context) });
    },
    onError: (error) => {
      logError('useDeleteProjectMutation', error);
    },
  });
}
