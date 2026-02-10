/**
 * useHumanizedFeedback Hook
 *
 * Vereint das NeuroFeedback-System mit den humanisierten Nachrichten.
 * Bietet eine einheitliche API für emotionales, kontextbezogenes Feedback.
 *
 * Features:
 * - Automatische Progress-Tracking Integration
 * - Kontextabhängige Erfolgs-Nachrichten
 * - Session-basiertes Lob und Ermutigung
 * - Keyboard-Shortcut Tracking für Tooltips
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { useNeuroFeedback } from '../components/NeuroFeedback';
import {
  getProgressPraise,
  getActionFeedback,
  getSessionEncouragement,
  getLoadingMessage,
  getAIStatusMessage,
  type UserProgress,
  type LoadingContext,
} from '../utils/humanizedMessages';

// ============================================
// TYPES
// ============================================

export interface SessionStats {
  actionsCompleted: number;
  sessionStartTime: number;
  ideasCreated: number;
  ideasArchived: number;
  searchesPerformed: number;
  lastActionType?: string;
}

export interface HumanizedFeedbackConfig {
  /** Zeigt zusätzliches Lob basierend auf Progress */
  showProgressPraise?: boolean;
  /** Zeigt Session-basierte Ermutigung */
  showSessionEncouragement?: boolean;
  /** Callback wenn Meilenstein erreicht */
  onMilestoneReached?: (milestone: string) => void;
}

// ============================================
// SESSION STORAGE KEYS
// ============================================

const STORAGE_KEYS = {
  SESSION_STATS: 'humanized_session_stats',
  USER_PROGRESS: 'humanized_user_progress',
  LAST_ACTIVE_DATE: 'humanized_last_active_date',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const getStoredProgress = (): UserProgress => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.USER_PROGRESS);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Fallback
  }
  return {
    ideasToday: 0,
    ideasThisWeek: 0,
    totalIdeas: 0,
    streakDays: 0,
    archivedToday: 0,
    connectionsFound: 0,
    lastActiveDate: new Date().toISOString().split('T')[0],
  };
};

const saveProgress = (progress: UserProgress) => {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_PROGRESS, JSON.stringify(progress));
  } catch {
    // Storage full or unavailable
  }
};

/**
 * Calculate streak days based on previous state
 * Takes currentStreak as parameter to avoid race conditions with storage
 */
const calculateStreakDays = (lastActiveDate: string, currentStreak: number, today: string): number => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  if (lastActiveDate === today) {
    // Same day - maintain current streak
    return currentStreak;
  } else if (lastActiveDate === yesterday) {
    // Consecutive day - increment streak
    return currentStreak + 1;
  }
  // Streak broken - reset to 1
  return 1;
};

// ============================================
// MAIN HOOK
// ============================================

export function useHumanizedFeedback(config: HumanizedFeedbackConfig = {}) {
  const {
    showProgressPraise = true,
    showSessionEncouragement = true,
    onMilestoneReached,
  } = config;

  // NeuroFeedback Integration
  const neuroFeedback = useNeuroFeedback();

  // State
  const [progress, setProgress] = useState<UserProgress>(getStoredProgress);
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    actionsCompleted: 0,
    sessionStartTime: Date.now(),
    ideasCreated: 0,
    ideasArchived: 0,
    searchesPerformed: 0,
  });

  // Refs
  const lastPraiseRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ============================================
  // PROGRESS TRACKING
  // ============================================

  const updateProgress = useCallback((updates: Partial<UserProgress>) => {
    setProgress(prev => {
      const today = new Date().toISOString().split('T')[0];
      const isNewDay = prev.lastActiveDate !== today;

      // Calculate streak atomically using values from prev state (not storage)
      // This prevents race conditions when multiple updates happen quickly
      const newStreakDays = calculateStreakDays(prev.lastActiveDate, prev.streakDays, today);

      const newProgress: UserProgress = {
        ...prev,
        ...updates,
        lastActiveDate: today,
        // Reset daily counters on new day, otherwise accumulate
        ideasToday: isNewDay ? (updates.ideasToday ?? 0) : (prev.ideasToday + (updates.ideasToday ?? 0)),
        archivedToday: isNewDay ? (updates.archivedToday ?? 0) : (prev.archivedToday + (updates.archivedToday ?? 0)),
        streakDays: newStreakDays,
      };

      saveProgress(newProgress);
      return newProgress;
    });
  }, []);

  // ============================================
  // SESSION TRACKING
  // ============================================

  const trackAction = useCallback((actionType: string) => {
    setSessionStats(prev => ({
      ...prev,
      actionsCompleted: prev.actionsCompleted + 1,
      lastActionType: actionType,
      ideasCreated: actionType === 'create_idea' ? prev.ideasCreated + 1 : prev.ideasCreated,
      ideasArchived: actionType === 'archive' ? prev.ideasArchived + 1 : prev.ideasArchived,
      searchesPerformed: actionType === 'search' ? prev.searchesPerformed + 1 : prev.searchesPerformed,
    }));
  }, []);

  // ============================================
  // FEEDBACK METHODS
  // ============================================

  /**
   * Trigger Erfolgs-Feedback mit humanisierter Nachricht
   */
  const triggerActionSuccess = useCallback((
    action: 'archive' | 'save' | 'delete' | 'publish' | 'connect' | 'share' | 'learn' | 'voice' | 'search',
    context?: { count?: number; name?: string }
  ) => {
    const feedback = getActionFeedback(action, context);
    trackAction(action);

    // Trigger NeuroFeedback
    neuroFeedback.triggerSuccess(feedback.message);

    // Update Progress basierend auf Aktion
    if (action === 'archive') {
      updateProgress({ archivedToday: 1 });
    } else if (action === 'save' || action === 'voice') {
      updateProgress({ ideasToday: 1, totalIdeas: 1 });
    } else if (action === 'connect') {
      updateProgress({ connectionsFound: 1 });
    }

    // Prüfe auf Progress-basiertes Lob
    if (showProgressPraise) {
      const praise = getProgressPraise(progress);
      if (praise && praise !== lastPraiseRef.current) {
        lastPraiseRef.current = praise;
        // MEMORY FIX: Check mounted state before triggering after timeout
        setTimeout(() => {
          if (isMountedRef.current) {
            neuroFeedback.triggerInsight(praise);
          }
        }, 2800);
      }
    }

    return feedback;
  }, [neuroFeedback, progress, showProgressPraise, trackAction, updateProgress]);

  /**
   * Trigger Meilenstein mit Confetti
   */
  const triggerMilestone = useCallback((
    milestone: string,
    description?: string
  ) => {
    neuroFeedback.triggerMilestone(milestone, description);
    onMilestoneReached?.(milestone);
  }, [neuroFeedback, onMilestoneReached]);

  /**
   * Trigger Insight/Erkenntnis
   */
  const triggerInsight = useCallback((message: string) => {
    neuroFeedback.triggerInsight(message);
  }, [neuroFeedback]);

  /**
   * Get kontextuellen Loading-Status
   */
  const getLoadingStatus = useCallback((context: LoadingContext) => {
    return getLoadingMessage(context);
  }, []);

  /**
   * Get AI Status mit humanisierter Nachricht
   */
  const getAIStatus = useCallback((
    status: 'idle' | 'listening' | 'thinking' | 'processing' | 'success' | 'error' | 'offline'
  ) => {
    return getAIStatusMessage(status);
  }, []);

  // ============================================
  // SESSION ENCOURAGEMENT
  // ============================================

  useEffect(() => {
    if (!showSessionEncouragement) return;

    const checkEncouragement = () => {
      const sessionMinutes = Math.floor((Date.now() - sessionStats.sessionStartTime) / 60000);
      const encouragement = getSessionEncouragement(sessionMinutes, sessionStats.actionsCompleted);

      if (encouragement && encouragement !== lastPraiseRef.current) {
        lastPraiseRef.current = encouragement;
        neuroFeedback.triggerInsight(encouragement);
      }
    };

    // Check alle 5 Minuten
    const interval = setInterval(checkEncouragement, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [neuroFeedback, sessionStats, showSessionEncouragement]);

  // ============================================
  // MILESTONE CHECKS
  // ============================================

  useEffect(() => {
    // Prüfe auf Meilensteine
    const { totalIdeas, streakDays, connectionsFound } = progress;

    const checkMilestone = (count: number, thresholds: number[], type: string) => {
      for (const threshold of thresholds) {
        if (count === threshold) {
          const messages: Record<string, Record<number, string>> = {
            ideas: {
              10: '10 Gedanken gesammelt! Du bist auf dem richtigen Weg.',
              50: 'Wow, 50 Gedanken! Dein digitales Gehirn wächst.',
              100: 'Unglaublich! 100 Gedanken - du bist ein Ideen-Profi!',
              500: 'Legendär! 500 Gedanken in deinem Brain.',
            },
            streak: {
              7: 'Eine ganze Woche dabei! Starke Routine.',
              30: '30 Tage! Du hast echte Ausdauer.',
            },
            connections: {
              10: '10 Verbindungen entdeckt! Dein Wissen vernetzt sich.',
              50: '50 Verbindungen! Du siehst die größeren Zusammenhänge.',
            },
          };

          const message = messages[type]?.[threshold];
          if (message) {
            triggerMilestone(message);
          }
        }
      }
    };

    checkMilestone(totalIdeas, [10, 50, 100, 500], 'ideas');
    checkMilestone(streakDays, [7, 30], 'streak');
    checkMilestone(connectionsFound, [10, 50], 'connections');
  }, [progress, triggerMilestone]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // Feedback Methods
    triggerActionSuccess,
    triggerMilestone,
    triggerInsight,

    // Status Helpers
    getLoadingStatus,
    getAIStatus,

    // Direct NeuroFeedback Access
    triggerProgress: neuroFeedback.triggerProgress,
    triggerStreak: neuroFeedback.triggerStreak,

    // State
    progress,
    sessionStats,
    updateProgress,
    trackAction,
  };
}

// Re-export keyboard shortcut utilities from dedicated module
export { useKeyboardShortcut, formatShortcut } from './useKeyboardShortcut';

export default useHumanizedFeedback;
