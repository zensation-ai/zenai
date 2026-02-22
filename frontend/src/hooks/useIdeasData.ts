/**
 * useIdeasData Hook
 *
 * Manages ideas data loading, sync, health checks, and related state.
 * Extracted from App.tsx to reduce component complexity.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import type { StructuredIdea, ApiStatus } from '../types';
import type { AIContext } from '../components/ContextSwitcher';
import { RECENT_CUTOFF_MS, SYNC_INTERVAL_MS } from '../constants';
import { getErrorMessage, logError } from '../utils/errors';
import {
  safeParseResponse,
  HealthResponseSchema,
  IdeasResponseSchema,
} from '../utils/apiSchemas';

interface UseIdeasDataReturn {
  ideas: StructuredIdea[];
  setIdeas: React.Dispatch<React.SetStateAction<StructuredIdea[]>>;
  archivedIdeas: StructuredIdea[];
  setArchivedIdeas: React.Dispatch<React.SetStateAction<StructuredIdea[]>>;
  archivedCount: number;
  setArchivedCount: React.Dispatch<React.SetStateAction<number>>;
  notificationCount: number;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  apiStatus: ApiStatus | null;
  loadIdeas: (signal?: AbortSignal) => Promise<void>;
  loadArchivedIdeas: (signal?: AbortSignal) => Promise<void>;
  lastSubmitTimeRef: React.MutableRefObject<number>;
}

export function useIdeasData(context: AIContext, currentPage: string): UseIdeasDataReturn {
  const [ideas, setIdeas] = useState<StructuredIdea[]>([]);
  const [archivedIdeas, setArchivedIdeas] = useState<StructuredIdea[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const lastSubmitTimeRef = useRef(0);

  const checkHealth = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await axios.get('/api/health', { signal });
      const healthData = safeParseResponse(HealthResponseSchema, response.data, 'checkHealth');

      const databases = healthData.services?.databases;
      const dbConnected = databases
        ? (databases.personal?.status === 'connected' || databases.work?.status === 'connected')
        : healthData.services?.database?.status === 'connected';

      const aiServices = healthData.services?.ai;
      const claudeAvailable = aiServices?.claude?.status === 'healthy' || aiServices?.claude?.available;
      const ollamaConnected = aiServices?.ollama?.status === 'connected';
      const openaiConfigured = aiServices?.openai?.status === 'configured';
      const ollamaModels = aiServices?.ollama?.models ?? [];

      setApiStatus({
        database: !!dbConnected,
        ollama: !!(claudeAvailable || ollamaConnected || openaiConfigured),
        models: ollamaModels,
      });
    } catch (err) {
      if (!signal?.aborted) {
        setApiStatus({ database: false, ollama: false, models: [] });
      }
    }
  }, []);

  const loadIdeas = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/${context}/ideas?limit=100`, { signal });
      const parsed = safeParseResponse(IdeasResponseSchema, response.data, 'loadIdeas');
      const serverIdeas = (parsed.ideas ?? []) as unknown as StructuredIdea[];

      setIdeas(currentIdeas => {
        const serverIdeaIds = new Set(serverIdeas.map(i => i.id));
        const recentCutoff = new Date(Date.now() - RECENT_CUTOFF_MS).toISOString();

        const recentLocalIdeas = currentIdeas.filter(localIdea =>
          !serverIdeaIds.has(localIdea.id) &&
          localIdea.created_at > recentCutoff
        );

        if (recentLocalIdeas.length > 0) {
          return [...recentLocalIdeas, ...serverIdeas];
        }
        return serverIdeas;
      });
      setError(null);
    } catch (err: unknown) {
      if (signal?.aborted) return;
      logError('loadIdeas', err);
      setError(getErrorMessage(err, 'Gedanken konnten nicht geladen werden'));
      setIdeas([]);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [context]);

  const loadArchivedIdeas = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/${context}/ideas/archived?limit=100`, { signal });
      const parsed = safeParseResponse(IdeasResponseSchema, response.data, 'loadArchivedIdeas');
      setArchivedIdeas(parsed.ideas as unknown as StructuredIdea[]);
      setArchivedCount(parsed.pagination?.total ?? 0);
    } catch (err) {
      if (signal?.aborted) return;
      logError('loadArchivedIdeas', err);
      setArchivedIdeas([]);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [context]);

  const loadArchivedCount = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await axios.get(`/api/${context}/ideas/archived?limit=1`, { signal });
      const parsed = safeParseResponse(IdeasResponseSchema, response.data, 'loadArchivedCount');
      setArchivedCount(parsed.pagination?.total ?? 0);
    } catch (err) {
      if (!signal?.aborted) {
        setArchivedCount(0);
      }
    }
  }, [context]);

  const loadNotificationCount = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await axios.get(`/api/${context}/notifications/history?limit=1`, { signal });
      const total = response.data?.total ?? response.data?.notifications?.length ?? 0;
      setNotificationCount(total);
    } catch {
      // Notifications not available - keep count at 0
    }
  }, [context]);

  useEffect(() => {
    setError(null);
    setIdeas([]);
    setArchivedIdeas([]);

    const abortController = new AbortController();
    Promise.all([
      checkHealth(abortController.signal),
      loadIdeas(abortController.signal),
      loadArchivedCount(abortController.signal),
      loadNotificationCount(abortController.signal),
    ]);
    return () => { abortController.abort(); };
  }, [context, checkHealth, loadIdeas, loadArchivedCount, loadNotificationCount]);

  useEffect(() => {
    if (currentPage === 'archive') {
      const abortController = new AbortController();
      loadArchivedIdeas(abortController.signal);
      return () => abortController.abort();
    }
  }, [currentPage, loadArchivedIdeas]);

  useEffect(() => {
    if (currentPage !== 'ideas') return;

    const abortController = new AbortController();
    const syncInterval = setInterval(async () => {
      if (Date.now() - lastSubmitTimeRef.current < RECENT_CUTOFF_MS) return;

      try {
        const res = await axios.get(`/api/${context}/ideas`, { signal: abortController.signal });
        const serverIdeas: StructuredIdea[] = res.data?.ideas ?? [];
        const serverIdeaIds = new Set(serverIdeas.map(i => i.id));

        setIdeas(currentIdeas => {
          const recentCutoff = new Date(Date.now() - RECENT_CUTOFF_MS).toISOString();
          const recentLocalIdeas = currentIdeas.filter(localIdea =>
            !serverIdeaIds.has(localIdea.id) &&
            localIdea.created_at > recentCutoff
          );

          if (recentLocalIdeas.length > 0) {
            return [...recentLocalIdeas, ...serverIdeas];
          }
          return serverIdeas;
        });
      } catch (err) {
        if (err instanceof Error && err.name !== 'CanceledError') {
          console.debug('[Sync] Background sync failed:', err.message);
        }
      }
    }, SYNC_INTERVAL_MS);

    return () => {
      clearInterval(syncInterval);
      abortController.abort();
    };
  }, [currentPage, context]);

  return {
    ideas,
    setIdeas,
    archivedIdeas,
    setArchivedIdeas,
    archivedCount,
    setArchivedCount,
    notificationCount,
    loading,
    setLoading,
    error,
    setError,
    apiStatus,
    loadIdeas,
    loadArchivedIdeas,
    lastSubmitTimeRef,
  };
}
