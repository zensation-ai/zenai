/**
 * Calendar AI Hook - Phase 40
 *
 * Provides AI-powered calendar intelligence:
 * - Daily briefing
 * - Smart scheduling suggestions
 * - Conflict detection
 */

import { useState, useCallback } from 'react';
import axios from 'axios';
import type { AIContext } from '../ContextSwitcher';

// ============================================================
// Types
// ============================================================

export interface DailyBriefing {
  date: string;
  summary: string;
  event_count: number;
  busy_hours: number;
  free_slots: FreeSlot[];
  events: BriefingEvent[];
  tips: string[];
  focus_recommendation?: string;
}

interface FreeSlot {
  start: string;
  end: string;
  duration_minutes: number;
}

interface BriefingEvent {
  id: string;
  title: string;
  start_time: string;
  end_time?: string;
  event_type: string;
  preparation?: string;
}

export interface SmartSuggestion {
  start_time: string;
  end_time: string;
  score: number;
  reason: string;
}

export interface ConflictInfo {
  type: 'overlap' | 'back_to_back' | 'travel_conflict' | 'overbooked_day';
  severity: 'warning' | 'error';
  events: Array<{ id: string; title: string; start_time: string; end_time?: string }>;
  message: string;
  suggestion?: string;
}

// ============================================================
// Hook
// ============================================================

export function useCalendarAI(context: AIContext) {
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);

  const fetchBriefing = useCallback(async (date?: string) => {
    setBriefingLoading(true);
    try {
      const res = await axios.get(`/api/${context}/calendar/ai/briefing`, {
        params: date ? { date } : undefined,
      });
      if (res.data.success) {
        setBriefing(res.data.data);
      }
    } catch {
      // Briefing generation can fail silently
    } finally {
      setBriefingLoading(false);
    }
  }, [context]);

  const fetchSuggestions = useCallback(async (params: {
    title: string;
    duration_minutes: number;
    preferred_time?: 'morning' | 'afternoon' | 'evening';
    earliest_date?: string;
    latest_date?: string;
  }) => {
    setSuggestionsLoading(true);
    try {
      const res = await axios.post(`/api/${context}/calendar/ai/suggest`, params);
      if (res.data.success) {
        setSuggestions(res.data.data || []);
        return res.data.data as SmartSuggestion[];
      }
    } catch {
      // fail silently
    } finally {
      setSuggestionsLoading(false);
    }
    return [];
  }, [context]);

  const fetchConflicts = useCallback(async (start?: string, end?: string) => {
    setConflictsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (start) params.start = start;
      if (end) params.end = end;

      const res = await axios.get(`/api/${context}/calendar/ai/conflicts`, { params });
      if (res.data.success) {
        setConflicts(res.data.data || []);
      }
    } catch {
      // fail silently
    } finally {
      setConflictsLoading(false);
    }
  }, [context]);

  const checkConflicts = useCallback(async (startTime: string, endTime: string, excludeEventId?: string) => {
    try {
      const res = await axios.post(`/api/${context}/calendar/ai/check-conflicts`, {
        start_time: startTime,
        end_time: endTime,
        exclude_event_id: excludeEventId,
      });
      return res.data.data as ConflictInfo[] || [];
    } catch {
      return [];
    }
  }, [context]);

  return {
    briefing,
    briefingLoading,
    fetchBriefing,
    suggestions,
    suggestionsLoading,
    fetchSuggestions,
    conflicts,
    conflictsLoading,
    fetchConflicts,
    checkConflicts,
  };
}
