/**
 * useSmartSuggestions Hook (Phase 69.1, enhanced Phase 6.1)
 *
 * Fetches smart suggestions via API, supports dismiss/snooze/accept actions.
 * Optionally subscribes to SSE for real-time updates.
 * Passes time-of-day and day-of-week context for time-aware suggestions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import type { AIContext } from '../components/ContextSwitcher';
import { getApiBaseUrl, getApiFetchHeaders } from '../utils/apiConfig';

export interface SmartSuggestion {
  id: string;
  userId: string;
  type: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  priority: number;
  status: string;
  snoozedUntil: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

export type SnoozeDuration = '1h' | '4h' | 'tomorrow';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

export function getDayOfWeek(): string {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
}

export function isMorningBriefingTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 11;
}

interface UseSmartSuggestionsReturn {
  suggestions: SmartSuggestion[];
  loading: boolean;
  timeOfDay: TimeOfDay;
  dismiss: (id: string) => Promise<void>;
  snooze: (id: string, duration: SnoozeDuration) => Promise<void>;
  accept: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useSmartSuggestions(
  context: AIContext,
  options?: { sse?: boolean }
): UseSmartSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Compute once on hook mount -- stable for the session lifetime
  const timeContextRef = useRef({ timeOfDay: getTimeOfDay(), dayOfWeek: getDayOfWeek() });
  const { timeOfDay, dayOfWeek } = timeContextRef.current;

  // Stable fetch function using ref to avoid effect re-triggers
  const contextRef = useRef(context);
  contextRef.current = context;

  const fetchSuggestions = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: '3',
        timeOfDay,
        dayOfWeek,
      });
      const response = await axios.get(`/api/${contextRef.current}/suggestions?${params.toString()}`);
      if (response.data?.success && Array.isArray(response.data.data)) {
        setSuggestions(response.data.data);
      }
    } catch {
      // Silently fail - suggestions are non-critical
    } finally {
      setLoading(false);
    }
  // timeOfDay/dayOfWeek come from a ref and never change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeOfDay, dayOfWeek]);

  // Initial fetch + refetch on context change
  useEffect(() => {
    setLoading(true);
    fetchSuggestions();
  }, [context, fetchSuggestions]);

  // SSE subscription
  useEffect(() => {
    if (!options?.sse) return;

    const baseUrl = getApiBaseUrl();
    const headers = getApiFetchHeaders();
    const apiKey = headers['Authorization']?.replace('Bearer ', '') || '';
    const url = `${baseUrl}/api/${context}/suggestions/stream?api_key=${encodeURIComponent(apiKey)}`;

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'new_suggestion') {
            fetchSuggestions();
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        // EventSource will auto-reconnect
      };
    } catch {
      // SSE not supported or failed - no-op
    }

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [context, options?.sse, fetchSuggestions]);

  /** Optimistically remove a suggestion, then call the API. Re-fetches on failure. */
  const performAction = useCallback(async (id: string, action: string, body?: Record<string, unknown>) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
    try {
      await axios.post(`/api/${context}/suggestions/${id}/${action}`, body);
    } catch {
      fetchSuggestions();
    }
  }, [context, fetchSuggestions]);

  const dismiss = useCallback(
    (id: string) => performAction(id, 'dismiss'),
    [performAction]
  );

  const snooze = useCallback(
    (id: string, duration: SnoozeDuration) => performAction(id, 'snooze', { duration }),
    [performAction]
  );

  const accept = useCallback(
    (id: string) => performAction(id, 'accept'),
    [performAction]
  );

  return {
    suggestions,
    loading,
    timeOfDay,
    dismiss,
    snooze,
    accept,
    refresh: fetchSuggestions,
  };
}
