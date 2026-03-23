/**
 * useCockpitSessions - Chat session management for the cockpit UI
 *
 * Manages a list of chat sessions with create, switch, close, and
 * prev/next navigation. State is persisted to localStorage.
 *
 * @module hooks/useCockpitSessions
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import type { AIContext } from '../components/ContextSwitcher';

// =============================================
// Constants
// =============================================

export const STORAGE_KEY = 'zenai-cockpit-sessions';
export const MAX_VISIBLE = 8;

// =============================================
// Types
// =============================================

export interface CockpitSession {
  id: string;
  title: string;
  createdAt?: string;
}

interface PersistedState {
  sessions: CockpitSession[];
  activeSessionId: string | null;
}

export interface UseCockpitSessionsReturn {
  sessions: CockpitSession[];
  visibleSessions: CockpitSession[];
  activeSessionId: string | null;
  createSession: () => Promise<string>;
  switchSession: (id: string) => void;
  switchToPrev: () => void;
  switchToNext: () => void;
  closeSession: (id: string) => void;
}

// =============================================
// Helpers
// =============================================

function loadPersistedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
      return parsed as PersistedState;
    }
    return null;
  } catch {
    return null;
  }
}

function persistState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

// =============================================
// Hook
// =============================================

export function useCockpitSessions(context: AIContext): UseCockpitSessionsReturn {
  const initial = useRef(loadPersistedState());
  const [sessions, setSessions] = useState<CockpitSession[]>(initial.current?.sessions ?? []);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(initial.current?.activeSessionId ?? null);
  const autoCreatedRef = useRef(false);

  // ------------------------------------------
  // Persist on every state change
  // ------------------------------------------
  useEffect(() => {
    persistState({ sessions, activeSessionId });
  }, [sessions, activeSessionId]);

  // ------------------------------------------
  // Create session (API call with local fallback)
  // ------------------------------------------
  const createSession = useCallback(async (): Promise<string> => {
    let session: CockpitSession;

    try {
      const res = await axios.post(`/api/${context}/chat/sessions`, { type: 'general' });
      const data = res.data?.data ?? res.data;
      session = {
        id: data.id,
        title: data.title ?? 'Neuer Chat',
        createdAt: data.createdAt ?? new Date().toISOString(),
      };
    } catch {
      // Generate a valid UUID v4 for local sessions so GeneralChat doesn't reject it
      const uuid = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      session = {
        id: uuid,
        title: 'Neuer Chat',
        createdAt: new Date().toISOString(),
      };
    }

    setSessions(prev => [...prev, session]);
    setActiveSessionId(session.id);
    return session.id;
  }, [context]);

  // ------------------------------------------
  // Auto-create on first launch
  // ------------------------------------------
  useEffect(() => {
    if (sessions.length === 0 && !autoCreatedRef.current) {
      autoCreatedRef.current = true;
      void createSession();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------
  // Switch session
  // ------------------------------------------
  const switchSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  // ------------------------------------------
  // Navigate prev/next with wrap-around
  // ------------------------------------------
  const switchToPrev = useCallback(() => {
    setSessions(currentSessions => {
      if (currentSessions.length <= 1) return currentSessions;
      setActiveSessionId(prev => {
        const idx = currentSessions.findIndex(s => s.id === prev);
        const newIdx = idx <= 0 ? currentSessions.length - 1 : idx - 1;
        return currentSessions[newIdx].id;
      });
      return currentSessions;
    });
  }, []);

  const switchToNext = useCallback(() => {
    setSessions(currentSessions => {
      if (currentSessions.length <= 1) return currentSessions;
      setActiveSessionId(prev => {
        const idx = currentSessions.findIndex(s => s.id === prev);
        const newIdx = idx >= currentSessions.length - 1 ? 0 : idx + 1;
        return currentSessions[newIdx].id;
      });
      return currentSessions;
    });
  }, []);

  // ------------------------------------------
  // Close session
  // ------------------------------------------
  const closeSession = useCallback((id: string) => {
    setSessions(prev => {
      // Prevent closing the last session
      if (prev.length <= 1) return prev;

      const idx = prev.findIndex(s => s.id === id);
      if (idx === -1) return prev;

      const next = prev.filter(s => s.id !== id);

      // If we closed the active session, pick a new one
      setActiveSessionId(currentActive => {
        if (currentActive !== id) return currentActive;
        // Prefer the session at the same index (i.e. the next one), or fall back to previous
        const newIdx = Math.min(idx, next.length - 1);
        return next[newIdx].id;
      });

      return next;
    });
  }, []);

  // ------------------------------------------
  // Visible sessions (last MAX_VISIBLE)
  // ------------------------------------------
  const visibleSessions = useMemo(() => {
    if (sessions.length <= MAX_VISIBLE) return sessions;
    return sessions.slice(-MAX_VISIBLE);
  }, [sessions]);

  return {
    sessions,
    visibleSessions,
    activeSessionId,
    createSession,
    switchSession,
    switchToPrev,
    switchToNext,
    closeSession,
  };
}
