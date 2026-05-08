/**
 * React Query hooks for Social Media Agent
 *
 * @module hooks/queries/useSocial
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

// ===========================================
// Types (mirror backend platform-types)
// ===========================================

export type SocialPlatform = 'twitter' | 'linkedin' | 'discord';

export type PostStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'failed';

export interface SocialPost {
  id: string;
  source_type: string;
  source_id: string | null;
  platform: SocialPlatform;
  content: string;
  media_urls: string[];
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  platform_post_id: string | null;
  engagement_metrics: Record<string, number> | null;
  metrics?: Record<string, number | null> | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformStatus {
  platform: SocialPlatform;
  configured: boolean;
  name: string;
}

// ===========================================
// Query Hooks
// ===========================================

export function useSocialPostsQuery(
  context: AIContext,
  filters?: { status?: PostStatus; platform?: SocialPlatform },
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.social.list(context, filters as Record<string, unknown>),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/social/posts`, {
        params: filters,
        signal,
      });
      return (response.data.data ?? []) as SocialPost[];
    },
    enabled,
  });
}

export function useSocialCalendarQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.social.calendar(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/social/calendar`, { signal });
      return (response.data.data ?? []) as SocialPost[];
    },
    enabled,
  });
}

export function usePlatformStatusQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.social.platforms(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/social/platforms`, { signal });
      // Backend returns Record<SocialPlatform, boolean> — normalize to PlatformStatus[]
      const raw = response.data.data ?? {};
      if (Array.isArray(raw)) return raw as PlatformStatus[];
      return Object.entries(raw as Record<string, boolean>).map(([platform, configured]) => ({
        platform: platform as SocialPlatform,
        configured,
        name: platform.charAt(0).toUpperCase() + platform.slice(1),
      })) as PlatformStatus[];
    },
    enabled,
  });
}

// ===========================================
// Mutation Hooks
// ===========================================

export function useApprovePostMutation(context: AIContext) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await axios.post(`/api/${context}/social/posts/${id}/approve`);
      return response.data.data as SocialPost;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.social.all(context) });
    },
    onError: (err) => logError('useApprovePostMutation', err),
  });
}

export function usePublishPostMutation(context: AIContext) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await axios.post(`/api/${context}/social/posts/${id}/publish`);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.social.all(context) });
    },
    onError: (err) => logError('usePublishPostMutation', err),
  });
}

export function useSchedulePostMutation(context: AIContext) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, scheduled_at }: { id: string; scheduled_at: string }) => {
      const response = await axios.post(`/api/${context}/social/posts/${id}/schedule`, {
        scheduled_at,
      });
      return response.data.data as SocialPost;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.social.all(context) });
    },
    onError: (err) => logError('useSchedulePostMutation', err),
  });
}

export function useDeletePostMutation(context: AIContext) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`/api/${context}/social/posts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.social.all(context) });
    },
    onError: (err) => logError('useDeletePostMutation', err),
  });
}
