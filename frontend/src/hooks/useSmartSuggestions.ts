/**
 * useSmartSuggestions Hook (Phase 69.1)
 *
 * Fetches smart suggestions via API, supports dismiss/snooze/accept actions.
 * Optionally subscribes to SSE for real-time updates.
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

interface UseSmartSuggestionsReturn {
  suggestions: SmartSuggestion[];
  loading: boolean;
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

  const fetchSuggestions = useCallback(async () => {
    try {
      const response = await axios.get(`/api/${context}/suggestions?limit=3`);
      if (response.data?.success && Array.isArray(response.data.data)) {
        setSuggestions(response.data.data);
      }
    } catch {
      // Silently fail - suggestions are non-critical
    } finally {
      setLoading(false);
    }
  }, [context]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchSuggestions();
  }, [fetchSuggestions]);

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

  const dismiss = useCallback(async (id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
    try {
      await axios.post(`/api/${context}/suggestions/${id}/dismiss`);
    } catch {
      // Re-fetch on error to restore state
      fetchSuggestions();
    }
  }, [context, fetchSuggestions]);

  const snooze = useCallback(async (id: string, duration: SnoozeDuration) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
    try {
      await axios.post(`/api/${context}/suggestions/${id}/snooze`, { duration });
    } catch {
      fetchSuggestions();
    }
  }, [context, fetchSuggestions]);

  const accept = useCallback(async (id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
    try {
      await axios.post(`/api/${context}/suggestions/${id}/accept`);
    } catch {
      fetchSuggestions();
    }
  }, [context, fetchSuggestions]);

  return {
    suggestions,
    loading,
    dismiss,
    snooze,
    accept,
    refresh: fetchSuggestions,
  };
}
