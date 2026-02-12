/**
 * Calendar Data Hook - Phase 35
 *
 * Fetches and caches calendar events for a date range.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { CalendarEvent, CreateEventInput } from './types';

interface UseCalendarDataReturn {
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  createEvent: (input: CreateEventInput) => Promise<CalendarEvent | null>;
  deleteEvent: (id: string) => Promise<boolean>;
}

export function useCalendarData(
  context: string,
  start: Date,
  end: Date
): UseCalendarDataReturn {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`/api/${context}/calendar/events`, {
        params: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
      });

      if (res.data.success) {
        setEvents(res.data.data || []);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fehler beim Laden';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [context, start.toISOString(), end.toISOString()]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const createEvent = useCallback(async (input: CreateEventInput): Promise<CalendarEvent | null> => {
    try {
      const res = await axios.post(`/api/${context}/calendar/events`, input);
      if (res.data.success) {
        const newEvent = res.data.data as CalendarEvent;
        setEvents(prev => [...prev, newEvent].sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        ));
        return newEvent;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen');
      return null;
    }
  }, [context]);

  const deleteEvent = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await axios.delete(`/api/${context}/calendar/events/${id}`);
      if (res.data.success) {
        setEvents(prev => prev.filter(e => e.id !== id));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [context]);

  return { events, loading, error, refetch: fetchEvents, createEvent, deleteEvent };
}
