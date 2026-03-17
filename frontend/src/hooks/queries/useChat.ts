/**
 * React Query hooks for Chat sessions and messages
 *
 * @module hooks/queries/useChat
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

// ===========================================
// Types
// ===========================================

export interface ChatSession {
  id: string;
  context: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

// ===========================================
// Query Hooks
// ===========================================

/**
 * Fetch chat sessions for the current context
 */
export function useChatSessionsQuery(context: AIContext, type?: string) {
  return useQuery({
    queryKey: [...queryKeys.chat.sessions(context), type ?? 'all'],
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/chat/sessions`, {
        signal,
        params: { context, limit: 50, ...(type && { type }) },
      });
      return (response.data?.sessions ?? []) as ChatSession[];
    },
    staleTime: 30_000,
  });
}

/**
 * Fetch a single chat session with messages
 */
export function useChatSessionQuery(context: AIContext, sessionId: string | null) {
  return useQuery({
    queryKey: sessionId ? queryKeys.chat.session(context, sessionId) : ['chat', 'none'],
    queryFn: async ({ signal }) => {
      if (!sessionId) return null;
      const response = await axios.get(`/api/chat/sessions/${sessionId}`, { signal });
      return response.data?.session ?? null;
    },
    enabled: !!sessionId,
    staleTime: 15_000,
  });
}

// ===========================================
// Mutation Hooks
// ===========================================

/**
 * Create a new chat session
 */
export function useCreateChatSessionMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data?: { type?: string }) => {
      const response = await axios.post('/api/chat/sessions', {
        context,
        ...data,
      });
      return response.data?.session as ChatSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.sessions(context) });
    },
    onError: (error) => {
      logError('useCreateChatSessionMutation', error);
    },
  });
}

/**
 * Delete a chat session
 */
export function useDeleteChatSessionMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      await axios.delete(`/api/chat/sessions/${sessionId}`);
      return sessionId;
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.sessions(context) });
      // Remove stale individual session cache
      queryClient.removeQueries({ queryKey: queryKeys.chat.session(context, sessionId) });
    },
    onError: (error) => {
      logError('useDeleteChatSessionMutation', error);
    },
  });
}
