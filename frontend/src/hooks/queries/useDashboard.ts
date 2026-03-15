/**
 * React Query hooks for Dashboard data
 *
 * Replaces the 6+ manual fetch calls in Dashboard.tsx with
 * cached, deduplicated queries.
 *
 * @module hooks/queries/useDashboard
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

// ===========================================
// Types
// ===========================================

export interface DashboardStats {
  total: number;
  highPriority: number;
  thisWeek: number;
  todayCount: number;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface RecentIdea {
  id: string;
  title: string;
  type: string;
  preview?: string;
  priority: string;
  created_at: string;
  tags?: string[];
}

export interface ActivityItem {
  id: string;
  activityType: string;
  message: string;
  ideaId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface UpcomingEvent {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time?: string;
  location?: string;
  ai_generated?: boolean;
}

export interface DashboardSummary {
  stats: DashboardStats;
  streak: number;
  trend: TrendPoint[];
  recentIdeas: RecentIdea[];
  activities: ActivityItem[];
  unreadCount: number;
}

export interface AISystemPulse {
  memoryFacts: number;
  procedures: number;
  sleepCycles: number;
  ragQueries: number;
}

// ===========================================
// Query Hooks
// ===========================================

/**
 * Dashboard stats (total, high priority, this week, today)
 */
export function useDashboardStatsQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard.stats(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/ideas/stats/summary`, { signal });
      const data = response.data?.data ?? response.data;
      return {
        total: data?.total ?? 0,
        highPriority: data?.highPriority ?? data?.high_priority ?? 0,
        thisWeek: data?.thisWeek ?? data?.this_week ?? 0,
        todayCount: data?.todayCount ?? data?.today ?? 0,
      } as DashboardStats;
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * 7-day trend data
 */
export function useDashboardTrendQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard.trend(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/ideas/stats/trend`, { signal });
      return (response.data?.data ?? response.data?.trend ?? []) as TrendPoint[];
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Dashboard activity feed
 */
export function useDashboardActivityQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard.activity(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/ai-activity/recent?limit=10`, { signal });
      return (response.data?.data ?? response.data?.activities ?? []) as ActivityItem[];
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Bundled dashboard summary (stats + streak + trend + recent ideas + activity + unread)
 * Uses the optimized backend endpoint that returns all data in one request.
 */
export function useDashboardSummaryQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: ['dashboard', context, 'summary'] as const,
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/analytics/dashboard-summary`, { signal });
      const d = response.data;
      return {
        stats: {
          total: d?.stats?.total ?? 0,
          highPriority: d?.stats?.highPriority ?? 0,
          thisWeek: d?.stats?.thisWeek ?? 0,
          todayCount: d?.stats?.todayCount ?? 0,
        },
        streak: d?.streak ?? 0,
        trend: (d?.trend ?? []) as TrendPoint[],
        recentIdeas: ((d?.recentIdeas ?? []) as RecentIdea[]).slice(0, 5),
        activities: ((d?.activities ?? []) as ActivityItem[]).slice(0, 5),
        unreadCount: d?.unreadCount ?? 0,
      } as DashboardSummary;
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Upcoming calendar events (next 48h)
 */
export function useUpcomingEventsQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: ['calendar', context, 'upcoming'] as const,
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/calendar/upcoming`, {
        signal,
        params: { hours: 48, limit: 4 },
      });
      return (response.data?.data ?? []) as UpcomingEvent[];
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Mark all activity items as read
 */
export function useMarkActivityReadMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await axios.post(`/api/${context}/ai-activity/mark-read`);
    },
    onSuccess: () => {
      // Invalidate both summary and activity queries
      queryClient.invalidateQueries({ queryKey: ['dashboard', context, 'summary'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.activity(context) });
    },
    onError: (error) => {
      logError('useMarkActivityReadMutation', error);
    },
  });
}

/**
 * AI system pulse (memory facts, procedures, sleep cycles, RAG queries)
 */
export function useAIPulseQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: ['ai-pulse', context] as const,
    queryFn: async ({ signal }) => {
      const [thinkingRes, sleepRes, ragRes, procRes] = await Promise.all([
        axios.get(`/api/${context}/thinking/stats`, { signal }).catch(() => ({ data: null })),
        axios.get(`/api/${context}/sleep-compute/stats`, { signal }).catch(() => ({ data: null })),
        axios.get(`/api/${context}/rag/analytics`, { signal }).catch(() => ({ data: null })),
        axios.get(`/api/${context}/memory/procedures`, { signal, params: { limit: 1 } }).catch(() => ({ data: null })),
      ]);
      return {
        memoryFacts: thinkingRes.data?.data?.totalChains || 0,
        procedures: Array.isArray(procRes.data?.data) ? procRes.data.data.length : 0,
        sleepCycles: sleepRes.data?.data?.totalCycles || 0,
        ragQueries: ragRes.data?.data?.totalQueries || 0,
      } as AISystemPulse;
    },
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Health check query
 */
export function useHealthQuery() {
  return useQuery({
    queryKey: queryKeys.health.status(),
    queryFn: async ({ signal }) => {
      const response = await axios.get('/api/health', { signal });
      const data = response.data;

      const databases = data?.services?.databases;
      const dbConnected = databases
        ? (databases.personal?.status === 'connected' || databases.work?.status === 'connected')
        : data?.services?.database?.status === 'connected';

      const aiServices = data?.services?.ai;
      const claudeAvailable = aiServices?.claude?.status === 'healthy' || aiServices?.claude?.available;
      const ollamaConnected = aiServices?.ollama?.status === 'connected';
      const openaiConfigured = aiServices?.openai?.status === 'configured';
      const ollamaModels = aiServices?.ollama?.models ?? [];

      return {
        database: !!dbConnected,
        ollama: !!(claudeAvailable || ollamaConnected || openaiConfigured),
        models: ollamaModels as string[],
      };
    },
    staleTime: 60_000,
    retry: 2,
  });
}
