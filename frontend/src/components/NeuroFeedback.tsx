/**
 * NeuroFeedback System
 *
 * Neurowissenschaftlich optimiertes Feedback-System basierend auf:
 * - Dopamin-Belohnungssystem (variable Belohnungen)
 * - Antizipatorisches Design
 * - Flow-State Erhaltung
 * - Cognitive Load Management
 *
 * Quellen:
 * - Knutson (2001): Anticipation activates nucleus accumbens
 * - Nielsen Norman Group: Progressive Disclosure
 * - Apple Human Interface Guidelines 2025
 */

import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from 'react';
import './NeuroFeedback.css';

// ===========================================
// Types
// ===========================================

type FeedbackType = 'success' | 'progress' | 'milestone' | 'streak' | 'insight';

interface FeedbackConfig {
  type: FeedbackType;
  message: string;
  subMessage?: string;
  duration?: number;
  celebration?: boolean;
  sound?: boolean;
}

interface NeuroFeedbackContextType {
  triggerFeedback: (config: FeedbackConfig) => void;
  triggerSuccess: (message: string) => void;
  triggerMilestone: (message: string, subMessage?: string) => void;
  triggerProgress: (step: number, total: number, message?: string) => void;
  triggerStreak: (count: number) => void;
  triggerInsight: (message: string) => void;
}

// ===========================================
// Context
// ===========================================

const NeuroFeedbackContext = createContext<NeuroFeedbackContextType | null>(null);

export const useNeuroFeedback = (): NeuroFeedbackContextType => {
  const context = useContext(NeuroFeedbackContext);
  if (!context) {
    throw new Error('useNeuroFeedback must be used within a NeuroFeedbackProvider');
  }
  return context;
};

// ===========================================
// Dopamin-optimierte Nachrichten
// Variable Belohnungen aktivieren das Belohnungssystem stärker
// ===========================================

const SUCCESS_MESSAGES = [
  { primary: 'Perfekt!', secondary: 'Dein Gedanke wurde gespeichert' },
  { primary: 'Toll gemacht!', secondary: 'Weiter so' },
  { primary: 'Gespeichert!', secondary: 'Ich merke mir das' },
  { primary: 'Super!', secondary: 'Ein weiterer Gedanke sicher verwahrt' },
  { primary: 'Exzellent!', secondary: 'Deine Idee ist jetzt dokumentiert' },
];

const MILESTONE_MESSAGES = [
  { icon: '🎯', title: 'Meilenstein erreicht!' },
  { icon: '🏆', title: 'Großartige Leistung!' },
  { icon: '⭐', title: 'Du bist auf Kurs!' },
  { icon: '🚀', title: 'Beeindruckend!' },
];

const STREAK_MESSAGES = [
  { threshold: 3, message: 'Du bist im Flow!', icon: '🔥' },
  { threshold: 5, message: 'Unaufhaltsam!', icon: '⚡' },
  { threshold: 7, message: 'Beeindruckende Serie!', icon: '🌟' },
  { threshold: 10, message: 'Legendär!', icon: '👑' },
];

const INSIGHT_PREFIXES = [
  '💡 Interessant:',
  '🧠 Erkenntnis:',
  '✨ Bemerkenswert:',
  '🔍 Entdeckung:',
];

// ===========================================
// Helper Functions
// ===========================================

const getRandomItem = <T,>(array: T[]): T => {
  return array[Math.floor(Math.random() * array.length)];
};

const getStreakMessage = (count: number) => {
  const applicable = STREAK_MESSAGES.filter(s => s.threshold <= count);
  return applicable.length > 0 ? applicable[applicable.length - 1] : null;
};

// ===========================================
// Success Celebration Component
// ===========================================

interface CelebrationProps {
  isVisible: boolean;
  type: FeedbackType;
  message: string;
  subMessage?: string;
  onComplete: () => void;
}

const Celebration = ({ isVisible, type, message, subMessage, onComplete }: CelebrationProps) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onComplete, 2500);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  const getIcon = () => {
    switch (type) {
      case 'success': return '✓';
      case 'milestone': return getRandomItem(MILESTONE_MESSAGES).icon;
      case 'streak': return '🔥';
      case 'insight': return '💡';
      case 'progress': return '📊';
      default: return '✓';
    }
  };

  return (
    <div className={`neuro-feedback-celebration ${type} ${isVisible ? 'visible' : ''}`}>
      {/* Dopamin-Burst Hintergrund */}
      <div className="celebration-burst" />

      {/* Confetti für Meilensteine */}
      {(type === 'milestone' || type === 'streak') && (
        <div className="celebration-confetti">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                '--delay': `${i * 0.08}s`,
                '--rotation': `${Math.random() * 360}deg`,
                '--x-drift': `${(Math.random() - 0.5) * 200}px`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* Hauptinhalt */}
      <div className="celebration-content">
        <div className="celebration-icon">
          <span>{getIcon()}</span>
          <div className="icon-ring" />
        </div>
        <h3 className="celebration-message">{message}</h3>
        {subMessage && (
          <p className="celebration-submessage">{subMessage}</p>
        )}
      </div>
    </div>
  );
};

// ===========================================
// Progress Indicator Component
// ===========================================

interface ProgressIndicatorProps {
  isVisible: boolean;
  step: number;
  total: number;
  message?: string;
}

const ProgressIndicator = ({ isVisible, step, total, message }: ProgressIndicatorProps) => {
  if (!isVisible) return null;

  const progress = (step / total) * 100;

  return (
    <div className="neuro-progress-toast">
      <div className="progress-content">
        <span className="progress-message">{message || `Schritt ${step} von ${total}`}</span>
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${progress}%` }}
          />
          <div className="progress-glow" style={{ left: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
};

// ===========================================
// Streak Counter Component
// ===========================================

interface StreakCounterProps {
  count: number;
  isVisible: boolean;
}

const StreakCounter = ({ count, isVisible }: StreakCounterProps) => {
  const streakInfo = getStreakMessage(count);

  if (!isVisible || !streakInfo) return null;

  return (
    <div className="neuro-streak-toast">
      <span className="streak-icon">{streakInfo.icon}</span>
      <div className="streak-content">
        <span className="streak-count">{count}x</span>
        <span className="streak-message">{streakInfo.message}</span>
      </div>
    </div>
  );
};

// ===========================================
// Insight Toast Component
// ===========================================

interface InsightToastProps {
  isVisible: boolean;
  message: string;
  onDismiss: () => void;
}

const InsightToast = ({ isVisible, message, onDismiss }: InsightToastProps) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onDismiss, 5000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onDismiss]);

  if (!isVisible) return null;

  const prefix = getRandomItem(INSIGHT_PREFIXES);

  return (
    <div className="neuro-insight-toast">
      <span className="insight-prefix">{prefix}</span>
      <span className="insight-message">{message}</span>
      <button className="insight-dismiss" onClick={onDismiss} aria-label="Schließen">
        ×
      </button>
    </div>
  );
};

// ===========================================
// Provider Component
// ===========================================

interface NeuroFeedbackProviderProps {
  children: ReactNode;
}

export const NeuroFeedbackProvider = ({ children }: NeuroFeedbackProviderProps) => {
  const [celebration, setCelebration] = useState<{
    visible: boolean;
    type: FeedbackType;
    message: string;
    subMessage?: string;
  }>({ visible: false, type: 'success', message: '' });

  const [progress, setProgress] = useState<{
    visible: boolean;
    step: number;
    total: number;
    message?: string;
  }>({ visible: false, step: 0, total: 0 });

  const [streak, setStreak] = useState<{
    visible: boolean;
    count: number;
  }>({ visible: false, count: 0 });

  const [insight, setInsight] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: '' });

  // Timer refs for cleanup
  const progressTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const streakTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      if (streakTimerRef.current) clearTimeout(streakTimerRef.current);
    };
  }, []);

  // Streak tracking (session-basiert)
  const [actionCount, setActionCount] = useState(0);
  const [lastActionTime, setLastActionTime] = useState<number>(0);

  const updateStreak = useCallback(() => {
    const now = Date.now();
    const timeSinceLastAction = now - lastActionTime;

    // Reset streak nach 60 Sekunden Inaktivität
    if (timeSinceLastAction > 60000) {
      setActionCount(1);
    } else {
      setActionCount(prev => prev + 1);
    }

    setLastActionTime(now);
  }, [lastActionTime]);

  const triggerFeedback = useCallback((config: FeedbackConfig) => {
    const { type, message, subMessage, celebration: showCelebration = true } = config;

    if (showCelebration) {
      setCelebration({
        visible: true,
        type,
        message,
        subMessage,
      });
    }

    // Update streak für erfolgreiche Aktionen
    if (type === 'success' || type === 'milestone') {
      updateStreak();
    }
  }, [updateStreak]);

  const triggerSuccess = useCallback((message?: string) => {
    const randomSuccess = getRandomItem(SUCCESS_MESSAGES);
    triggerFeedback({
      type: 'success',
      message: message || randomSuccess.primary,
      subMessage: message ? undefined : randomSuccess.secondary,
    });
  }, [triggerFeedback]);

  const triggerMilestone = useCallback((message: string, subMessage?: string) => {
    triggerFeedback({
      type: 'milestone',
      message,
      subMessage,
      celebration: true,
    });
  }, [triggerFeedback]);

  const triggerProgress = useCallback((step: number, total: number, message?: string) => {
    setProgress({
      visible: true,
      step,
      total,
      message,
    });

    // Auto-hide nach Abschluss
    if (step >= total) {
      progressTimerRef.current = setTimeout(() => {
        setProgress(prev => ({ ...prev, visible: false }));
      }, 1000);
    }
  }, []);

  const triggerStreak = useCallback((count: number) => {
    const streakInfo = getStreakMessage(count);
    if (streakInfo) {
      setStreak({ visible: true, count });
      streakTimerRef.current = setTimeout(() => {
        setStreak(prev => ({ ...prev, visible: false }));
      }, 3000);
    }
  }, []);

  const triggerInsight = useCallback((message: string) => {
    setInsight({ visible: true, message });
  }, []);

  const handleCelebrationComplete = useCallback(() => {
    setCelebration(prev => ({ ...prev, visible: false }));

    // Prüfe ob Streak-Meldung gezeigt werden soll
    const streakInfo = getStreakMessage(actionCount);
    if (streakInfo && actionCount >= 3) {
      triggerStreak(actionCount);
    }
  }, [actionCount, triggerStreak]);

  const handleInsightDismiss = useCallback(() => {
    setInsight(prev => ({ ...prev, visible: false }));
  }, []);

  const contextValue: NeuroFeedbackContextType = {
    triggerFeedback,
    triggerSuccess,
    triggerMilestone,
    triggerProgress,
    triggerStreak,
    triggerInsight,
  };

  return (
    <NeuroFeedbackContext.Provider value={contextValue}>
      {children}

      {/* Feedback Overlays */}
      <Celebration
        isVisible={celebration.visible}
        type={celebration.type}
        message={celebration.message}
        subMessage={celebration.subMessage}
        onComplete={handleCelebrationComplete}
      />

      <ProgressIndicator
        isVisible={progress.visible}
        step={progress.step}
        total={progress.total}
        message={progress.message}
      />

      <StreakCounter
        count={streak.count}
        isVisible={streak.visible}
      />

      <InsightToast
        isVisible={insight.visible}
        message={insight.message}
        onDismiss={handleInsightDismiss}
      />
    </NeuroFeedbackContext.Provider>
  );
};

// ===========================================
// Utility Hook für einfache Integration
// ===========================================

export const useSuccessFeedback = () => {
  const { triggerSuccess } = useNeuroFeedback();
  return triggerSuccess;
};

export const useMilestoneFeedback = () => {
  const { triggerMilestone } = useNeuroFeedback();
  return triggerMilestone;
};

export const useProgressFeedback = () => {
  const { triggerProgress } = useNeuroFeedback();
  return triggerProgress;
};
