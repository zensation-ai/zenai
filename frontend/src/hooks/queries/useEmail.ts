/**
 * React Query hooks for Email
 *
 * @module hooks/queries/useEmail
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

// ===========================================
// Types
// ===========================================

export interface Email {
  id: string;
  subject: string | null;
  from_address: string;
  from_name?: string | null;
  to_address: string;
  status: string;
  direction: string;
  category?: string;
  created_at: string;
  received_at?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  is_starred?: boolean;
  has_attachments?: boolean;
  thread_count?: number;
  ai_summary?: string | null;
  ai_category?: string | null;
  ai_priority?: string | null;
  ai_sentiment?: string | null;
}

export interface EmailStats {
  unreadCount: number;
  categories: Record<string, number>;
}

// ===========================================
// Query Hooks
// ===========================================

/**
 * Fetch emails with optional filters (status, direction, category, search)
 */
export function useEmailsQuery(
  context: AIContext,
  filters?: Record<string, unknown>,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.email.list(context, filters),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/emails`, {
        signal,
        params: filters,
      });
      return (response.data?.data ?? response.data?.emails ?? []) as Email[];
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Fetch email stats (unread count, category breakdown)
 */
export function useEmailStatsQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.email.stats(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/emails/stats`, { signal });
      return (response.data?.data ?? response.data) as EmailStats;
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Fetch a single email by ID
 */
export function useEmailDetailQuery(context: AIContext, id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.email.detail(context, id) : ['email', 'none'],
    queryFn: async ({ signal }) => {
      if (!id) return null;
      const response = await axios.get(`/api/${context}/emails/${id}`, { signal });
      return response.data?.data ?? response.data;
    },
    enabled: !!id,
    staleTime: 15_000,
  });
}

/**
 * Fetch email thread
 */
export function useEmailThreadQuery(context: AIContext, id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.email.thread(context, id) : ['email', 'thread', 'none'],
    queryFn: async ({ signal }) => {
      if (!id) return null;
      const response = await axios.get(`/api/${context}/emails/${id}/thread`, { signal });
      return response.data?.data ?? response.data;
    },
    enabled: !!id,
    staleTime: 15_000,
  });
}

// ===========================================
// Mutation Hooks
// ===========================================

/**
 * Send an email
 */
export function useSendEmailMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { to: string; subject: string; body: string }) => {
      const response = await axios.post(`/api/${context}/emails/send`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.email.all(context) });
    },
    onError: (error) => {
      logError('useSendEmailMutation', error);
    },
  });
}

/**
 * Toggle email star
 */
export function useToggleEmailStarMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, starred }: { id: string; starred: boolean }) => {
      await axios.patch(`/api/${context}/emails/${id}/star`, { starred });
      return { id, starred };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.email.all(context) });
    },
    onError: (error) => {
      logError('useToggleEmailStarMutation', error);
    },
  });
}
