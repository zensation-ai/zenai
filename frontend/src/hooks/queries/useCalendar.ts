/**
 * React Query hooks for Calendar events
 *
 * @module hooks/queries/useCalendar
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { AIContext } from '../../components/ContextSwitcher';
import { queryKeys } from '../../lib/query-keys';
import { logError } from '../../utils/errors';

// ===========================================
// Types
// ===========================================

export interface CalendarEvent {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time?: string;
  location?: string;
  description?: string;
  ai_generated?: boolean;
}

// ===========================================
// Query Hooks
// ===========================================

/**
 * Fetch calendar events for a date range
 */
export function useCalendarEventsQuery(
  context: AIContext,
  params?: { start?: string; end?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.calendar.events(context, params as Record<string, unknown>),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/calendar/events`, {
        signal,
        params,
      });
      return (response.data?.data ?? response.data?.events ?? []) as CalendarEvent[];
    },
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Fetch upcoming calendar events (next 48h)
 */
export function useUpcomingCalendarEventsQuery(context: AIContext, enabled = true) {
  return useQuery({
    queryKey: queryKeys.calendar.upcoming(context),
    queryFn: async ({ signal }) => {
      const response = await axios.get(`/api/${context}/calendar/upcoming`, {
        signal,
        params: { hours: 48, limit: 10 },
      });
      return (response.data?.data ?? []) as CalendarEvent[];
    },
    enabled,
    staleTime: 60_000,
  });
}

// ===========================================
// Mutation Hooks
// ===========================================

/**
 * Create a new calendar event
 */
export function useCreateCalendarEventMutation(context: AIContext) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<CalendarEvent>) => {
      const response = await axios.post(`/api/${context}/calendar/events`, data);
      return response.data?.data ?? response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all(context) });
    },
    onError: (error) => {
      logError('useCreateCalendarEventMutation', error);
    },
  });
}
