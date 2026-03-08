/**
 * Screen Memory Data Hook - Phase 5
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { ScreenCapture, ScreenMemoryFilters, ScreenMemoryStats } from './types';

interface UseScreenMemoryDataProps {
  context: string;
}

export function useScreenMemoryData({ context }: UseScreenMemoryDataProps) {
  const [captures, setCaptures] = useState<ScreenCapture[]>([]);
  const [stats, setStats] = useState<ScreenMemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalCaptures, setTotalCaptures] = useState(0);

  // Fetch captures
  const fetchCaptures = useCallback(async (filters?: ScreenMemoryFilters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters?.search) params.set('search', filters.search);
      if (filters?.app_name) params.set('app_name', filters.app_name);
      if (filters?.date_from) params.set('date_from', filters.date_from);
      if (filters?.date_to) params.set('date_to', filters.date_to);
      if (filters?.limit) params.set('limit', String(filters.limit));
      if (filters?.offset) params.set('offset', String(filters.offset));

      const res = await axios.get(`/api/${context}/screen-memory?${params.toString()}`);
      setCaptures(res.data?.data?.captures ?? []);
      setTotalCaptures(res.data?.data?.total ?? 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [context]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`/api/${context}/screen-memory/stats`);
      setStats(res.data?.data ?? null);
    } catch {
      // silent
    }
  }, [context]);

  // Delete capture
  const deleteCapture = useCallback(async (id: string) => {
    try {
      await axios.delete(`/api/${context}/screen-memory/${id}`);
      setCaptures(prev => prev.filter(c => c.id !== id));
      setTotalCaptures(prev => prev - 1);
    } catch {
      // silent
    }
  }, [context]);

  // Cleanup old captures
  const cleanup = useCallback(async (retentionDays: number) => {
    try {
      const res = await axios.post(`/api/${context}/screen-memory/cleanup`, { retention_days: retentionDays });
      const deleted = res.data?.data?.deleted_count ?? 0;
      if (deleted > 0) {
        fetchCaptures();
        fetchStats();
      }
      return deleted;
    } catch {
      return 0;
    }
  }, [context, fetchCaptures, fetchStats]);

  // Initial load
  useEffect(() => {
    fetchCaptures({ limit: 50 });
    fetchStats();
  }, [fetchCaptures, fetchStats]);

  return {
    captures,
    stats,
    loading,
    totalCaptures,
    fetchCaptures,
    fetchStats,
    deleteCapture,
    cleanup,
  };
}
