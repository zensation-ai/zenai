import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { AIContext } from './ContextSwitcher';
import axios from 'axios';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import {
  AI_PERSONALITY,
  getRandomReward,
  FLOW_STATE_MESSAGES,
  ANTICIPATORY_MESSAGES,
} from '../utils/aiPersonality';
import { useNeuroFeedback } from './NeuroFeedback';
import './InboxTriage.css';

export type TriageAction = 'priority' | 'keep' | 'later' | 'archive';

interface TriageIdea {
  id: string;
  title: string;
  type: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  summary: string;
  nextSteps?: string[];
  keywords?: string[];
  createdAt: string;
  rawTranscript?: string;
}

/** API response idea structure (snake_case from backend) */
interface ApiIdea {
  id: string;
  title: string;
  type?: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high';
  summary?: string;
  nextSteps?: string[];
  next_steps?: string[];
  keywords?: string[];
  createdAt?: string;
  created_at?: string;
  rawTranscript?: string;
  raw_transcript?: string;
}

interface InboxTriageProps {
  context: AIContext;
  apiBase: string;
  onBack: () => void;
  onComplete: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

// Neuro-UX: Klare visuelle Hierarchie für Priorisierung
const PRIORITY_LABELS: Record<string, { label: string; className: string }> = {
  high: { label: 'HOCH', className: 'high' },
  medium: { label: 'MITTEL', className: 'medium' },
  low: { label: 'NIEDRIG', className: 'low' },
};

const TYPE_EMOJIS: Record<string, string> = {
  task: '📋',
  idea: '💡',
  note: '📝',
  question: '❓',
  reminder: '⏰',
  decision: '⚖️',
  goal: '🎯',
};

// Neuro-UX: Binary Choice Mapping für Decision Fatigue Prevention
const ACTION_FEEDBACK: Record<TriageAction, { emoji: string; label: string }> = {
  priority: { emoji: '🔥', label: 'Priorisiert!' },
  keep: { emoji: '✓', label: 'Behalten!' },
  later: { emoji: '⏰', label: 'Später!' },
  archive: { emoji: '📥', label: 'Archiviert!' },
};

// Neuro-UX: Miller's Law - Max 7±2 Items gleichzeitig
const MAX_VISIBLE_ITEMS = 7;
// Neuro-UX: Variable Rewards bei bestimmten Streaks für Dopamin-Optimierung
const STREAK_MILESTONES = [3, 5, 7, 10];

/**
 * InboxTriage - Neuro-UX optimierte Swipe-based Card Interface
 *
 * Neuro-UX Prinzipien implementiert:
 * - Miller's Law: Max 7 Items gleichzeitig sichtbar
 * - Dopamin-Optimierung: Variable Belohnungen bei Aktionen
 * - Flow-State: Smooth Transitions, Focus Indicators
 * - Decision Fatigue Prevention: Binary Choices, empfohlene Aktionen
 * - Progressive Disclosure: Detail-Informationen schrittweise
 * - Reduced Motion: Respektiert prefers-reduced-motion
 */
const InboxTriageComponent: React.FC<InboxTriageProps> = ({
  context,
  apiBase,
  onBack,
  onComplete,
  showToast,
}) => {
  const [ideas, setIdeas] = useState<TriageIdea[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processedIds, setProcessedIds] = useState<string[]>([]);
  const [stats, setStats] = useState({ prioritized: 0, archived: 0, kept: 0, later: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationClass, setAnimationClass] = useState('');
  const [exitStyle, setExitStyle] = useState<React.CSSProperties | null>(null);
  // Neuro-UX: States für Dopamin-Belohnungen und Flow-State
  const [showReward, setShowReward] = useState<{ message: string; emoji: string } | null>(null);
  const [showUndoHint, setShowUndoHint] = useState(false);
  const [lastAction, setLastAction] = useState<{ id: string; action: TriageAction } | null>(null);
  const [expandedDetails, setExpandedDetails] = useState(false);
  // Neuro-UX: Anticipatory Loading Message
  const [loadingMessage, setLoadingMessage] = useState('');

  const cardRef = useRef<HTMLDivElement>(null);
  const swipeResetRef = useRef<() => void>(() => {});
  const { triggerMilestone, triggerStreak } = useNeuroFeedback();

  // Neuro-UX: Check for reduced motion preference
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const currentIdea = ideas[currentIndex];
  const remainingCount = ideas.length - currentIndex;
  const totalProcessed = processedIds.length;

  // Neuro-UX: Berechne empfohlene Aktion basierend auf Priorität
  // Decision Fatigue Prevention: Klare Empfehlung reduziert kognitive Last
  const recommendedAction = useMemo((): TriageAction => {
    if (!currentIdea) return 'keep';
    switch (currentIdea.priority) {
      case 'high':
        return 'priority';
      case 'low':
        return 'archive';
      default:
        return 'keep';
    }
  }, [currentIdea]);

  // Neuro-UX: Antizipatorische Loading-Nachricht rotieren
  useEffect(() => {
    if (isLoading) {
      const messages = ANTICIPATORY_MESSAGES.processing;
      let index = 0;
      setLoadingMessage(messages[0]);

      const interval = setInterval(() => {
        index = (index + 1) % messages.length;
        setLoadingMessage(messages[index]);
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [isLoading]);

  // Fetch ideas for triage using axios (global interceptor handles auth)
  const fetchTriageIdeas = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const excludeParam = processedIds.length > 0 ? '&exclude=' + processedIds.join(',') : '';
      // Neuro-UX: Miller's Law - Limitiere auf MAX_VISIBLE_ITEMS
      // Auth is handled by the global axios interceptor in main.tsx
      const response = await axios.get(
        `${apiBase}/${context}/ideas/triage?limit=${MAX_VISIBLE_ITEMS}${excludeParam}`
      );

      const data = response.data;

      if (data.success && data.ideas) {
        const transformedIdeas: TriageIdea[] = data.ideas.map((idea: ApiIdea) => ({
          id: idea.id,
          title: idea.title,
          type: idea.type || 'note',
          category: idea.category || 'general',
          priority: idea.priority || 'medium',
          summary: idea.summary || '',
          nextSteps: idea.nextSteps || idea.next_steps || [],
          keywords: idea.keywords || [],
          createdAt: idea.createdAt || idea.created_at,
          rawTranscript: idea.rawTranscript || idea.raw_transcript,
        }));

        setIdeas(transformedIdeas);
        setCurrentIndex(0);
      } else {
        setIdeas([]);
      }
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error || 'Fehler beim Laden der Gedanken'
        : 'Ein Fehler ist aufgetreten';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, context, processedIds]);

  // Initial load
  useEffect(() => {
    fetchTriageIdeas();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Neuro-UX: Dopamin-Belohnung anzeigen mit Variable Rewards
  const showDopamineReward = useCallback((action: TriageAction) => {
    const reward = getRandomReward('ideaCreated');
    const actionFeedback = ACTION_FEEDBACK[action];
    
    setShowReward({
      message: reward.message,
      emoji: actionFeedback.emoji,
    });

    // Neuro-UX: Variable Timeout für Belohnungsanzeige (kürzer bei reduced motion)
    const timeout = prefersReducedMotion ? 1000 : 2000;
    setTimeout(() => setShowReward(null), timeout);
  }, [prefersReducedMotion]);

  // Neuro-UX: Streak-Belohnung prüfen für variable Dopamin-Ausschüttung
  const checkStreakReward = useCallback((newTotal: number) => {
    if (STREAK_MILESTONES.includes(newTotal)) {
      const encouragement = FLOW_STATE_MESSAGES.encouragement[
        Math.floor(Math.random() * FLOW_STATE_MESSAGES.encouragement.length)
      ];
      triggerStreak(newTotal);
      showToast(encouragement + ' (' + newTotal + ' erledigt!)', 'success');
    }
  }, [triggerStreak, showToast]);

  // Handle triage action
  const handleTriageAction = useCallback(
    async (action: TriageAction, fromSwipe = false) => {
      if (!currentIdea || isAnimating) return;

      // Neuro-UX: Animation setzen mit success-burst für Dopamin-Feedback
      setIsAnimating(true);
      setExpandedDetails(false); // Progressive Disclosure zurücksetzen

      if (fromSwipe) {
        // Swipe-triggered: animate from current drag position via inline transition
        const exitTransforms: Record<TriageAction, string> = {
          priority: 'translateX(150%) rotate(20deg)',
          later: 'translateX(-150%) rotate(-20deg)',
          archive: 'translateY(-150%)',
          keep: 'scale(1.02)',
        };
        setExitStyle({
          transform: exitTransforms[action],
          opacity: action === 'keep' ? 1 : 0,
          transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
        });
      } else {
        // Button-triggered: use CSS animation from center
        switch (action) {
          case 'priority':
            setAnimationClass('animate-swipe-right neuro-success-burst');
            break;
          case 'later':
            setAnimationClass('animate-swipe-left');
            break;
          case 'archive':
            setAnimationClass('animate-swipe-up');
            break;
          case 'keep':
            setAnimationClass('animate-keep neuro-success-burst');
            break;
        }
      }

      // Neuro-UX: Dopamin-Belohnung triggern
      showDopamineReward(action);

      try {
        // Auth is handled by the global axios interceptor in main.tsx
        await axios.post(
          `${apiBase}/${context}/ideas/${currentIdea.id}/triage`,
          { action }
        );

        // Update stats
        setStats((prev) => ({
          ...prev,
          [action === 'priority' ? 'prioritized' : action]:
            prev[action === 'priority' ? 'prioritized' : (action as keyof typeof prev)] + 1,
        }));

        // Neuro-UX: Undo Pattern - Letzte Aktion speichern statt Bestätigung
        setLastAction({ id: currentIdea.id, action });
        setShowUndoHint(true);
        setTimeout(() => setShowUndoHint(false), 3000);

        // Track processed
        setProcessedIds((prev) => [...prev, currentIdea.id]);

        // Neuro-UX: Streak-Belohnung prüfen
        const newTotal = totalProcessed + 1;
        checkStreakReward(newTotal);

        // Neuro-UX: Reduzierte Animation bei prefers-reduced-motion
        const animationDuration = prefersReducedMotion ? 100 : 300;
        await new Promise((resolve) => setTimeout(resolve, animationDuration));

        // Move to next card
        if (currentIndex < ideas.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          if (ideas.length === MAX_VISIBLE_ITEMS) {
            await fetchTriageIdeas();
          } else {
            // Neuro-UX: Milestone Celebration am Ende
            triggerMilestone(
              newTotal + ' Gedanken sortiert!',
              'Großartige Arbeit beim Aufräumen'
            );
            onComplete();
          }
        }
      } catch (err) {
        showToast('Fehler beim Speichern der Aktion', 'error');
      } finally {
        setIsAnimating(false);
        setAnimationClass('');
        setExitStyle(null);
        swipeResetRef.current();
      }
    },
    [
      currentIdea,
      currentIndex,
      ideas.length,
      isAnimating,
      apiBase,
      context,
      fetchTriageIdeas,
      showToast,
      onComplete,
      totalProcessed,
      checkStreakReward,
      showDopamineReward,
      triggerMilestone,
      prefersReducedMotion,
    ]
  );

  // Swipe handlers - fromSwipe=true preserves drag offset for smooth exit animation
  const handleSwipeRight = useCallback(() => handleTriageAction('priority', true), [handleTriageAction]);
  const handleSwipeLeft = useCallback(() => handleTriageAction('later', true), [handleTriageAction]);
  const handleSwipeUp = useCallback(() => handleTriageAction('archive', true), [handleTriageAction]);

  // Set up swipe gestures (60px threshold matches iOS/Android conventions for mobile)
  const { isDragging, direction, progress, offsetX, offsetY, reset: swipeReset } = useSwipeGesture(cardRef, {
    threshold: 60,
    velocityThreshold: 0.3,
    onSwipeRight: handleSwipeRight,
    onSwipeLeft: handleSwipeLeft,
    onSwipeUp: handleSwipeUp,
    enabled: !isAnimating && !!currentIdea,
  });
  swipeResetRef.current = swipeReset;

  // Calculate card transform based on swipe progress or exit animation
  const cardStyle: React.CSSProperties = isDragging
    ? {
        transform: 'translate(' + offsetX + 'px, ' + offsetY + 'px) rotate(' + (offsetX * 0.05) + 'deg)',
        transition: 'none',
      }
    : exitStyle
      ? { ...exitStyle }
      : {};

  // Determine swipe indicator class
  const getSwipeClass = (): string => {
    if (animationClass) return animationClass;
    if (!isDragging || progress < 0.3) return '';
    return 'swipe-' + direction;
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  // Neuro-UX: Progressive Disclosure Toggle
  const toggleDetails = useCallback(() => {
    setExpandedDetails((prev) => !prev);
  }, []);

  // Render loading state mit Neuro-UX Antizipation
  if (isLoading) {
    return (
      <div className="triage-page neuro-page-enter">
        <header className="triage-header liquid-glass-nav">
          <button className="triage-back-btn neuro-hover-lift" onClick={onBack}>
            ← Zurück
          </button>
          <h1 className="triage-title">Triage</h1>
          <span className="triage-progress">Lädt...</span>
        </header>
        {/* Neuro-UX: Antizipatorisches Loading mit kontextueller Nachricht */}
        <div className="triage-loading neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">{loadingMessage}</p>
          <p className="neuro-loading-submessage">{AI_PERSONALITY.name} sucht deine Gedanken...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="triage-page neuro-page-enter">
        <header className="triage-header liquid-glass-nav">
          <button className="triage-back-btn neuro-hover-lift" onClick={onBack}>
            ← Zurück
          </button>
          <h1 className="triage-title">Triage</h1>
        </header>
        {/* Neuro-UX: Freundliche Fehlermeldung */}
        <div className="triage-error neuro-error-friendly">
          <span className="neuro-error-icon">⚠️</span>
          <div className="neuro-error-content">
            <span className="neuro-error-title">Ups, da ging etwas schief</span>
            <p className="neuro-error-message">{error}</p>
            <span className="neuro-error-suggestion">Keine Sorge, einfach nochmal versuchen!</span>
          </div>
          <button className="triage-retry-btn neuro-button neuro-hover-lift" onClick={fetchTriageIdeas}>
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  // Render empty/completion state mit Neuro-UX Celebration
  if (!currentIdea) {
    return (
      <div className="triage-page neuro-page-enter">
        <header className="triage-header liquid-glass-nav">
          <button className="triage-back-btn neuro-hover-lift" onClick={onBack}>
            ← Zurück
          </button>
          <h1 className="triage-title">Triage</h1>
        </header>
        {/* Neuro-UX: Erfolgs-Celebration mit Dopamin-Burst */}
        <div className="triage-empty neuro-empty-state neuro-success-burst">
          <span className="neuro-empty-icon">✨</span>
          <h2 className="neuro-empty-title neuro-greeting-adaptive">Alles sortiert!</h2>
          <p className="neuro-empty-description neuro-subtext-emotional">
            {totalProcessed > 0
              ? 'Du hast ' + totalProcessed + ' Gedanken sortiert. Großartig!'
              : 'Keine Gedanken zum Sortieren vorhanden.'}
          </p>
          {/* Neuro-UX: Flow State Encouragement */}
          {totalProcessed > 0 && (
            <p className="neuro-empty-encouragement neuro-motivational">
              {FLOW_STATE_MESSAGES.encouragement[
                Math.floor(Math.random() * FLOW_STATE_MESSAGES.encouragement.length)
              ]}
            </p>
          )}
          {/* Neuro-UX: Stats als Cognitive Chunks gruppiert */}
          {totalProcessed > 0 && (
            <div className="triage-stats neuro-flow-list">
              <div className="triage-stat neuro-chunk neuro-stagger-item">
                <span className="stat-value neuro-reward-badge">{stats.prioritized}</span>
                <span className="stat-label">Priorisiert</span>
              </div>
              <div className="triage-stat neuro-chunk neuro-stagger-item">
                <span className="stat-value">{stats.kept}</span>
                <span className="stat-label">Behalten</span>
              </div>
              <div className="triage-stat neuro-chunk neuro-stagger-item">
                <span className="stat-value">{stats.later}</span>
                <span className="stat-label">Später</span>
              </div>
              <div className="triage-stat neuro-chunk neuro-stagger-item">
                <span className="stat-value">{stats.archived}</span>
                <span className="stat-label">Archiviert</span>
              </div>
            </div>
          )}
          <button className="triage-done-btn neuro-button neuro-hover-lift" onClick={onBack}>
            Zurück zur Übersicht
          </button>
        </div>
      </div>
    );
  }

  const priorityInfo = PRIORITY_LABELS[currentIdea.priority] || PRIORITY_LABELS.medium;
  const typeEmoji = TYPE_EMOJIS[currentIdea.type] || '📝';

  return (
    <div className="triage-page neuro-page-enter" data-context={context}>
      <header className="triage-header liquid-glass-nav">
        <button className="triage-back-btn neuro-hover-lift" onClick={onBack}>
          ← Zurück
        </button>
        <h1 className="triage-title">Triage</h1>
        {/* Neuro-UX: Progress als Reward Badge */}
        <span className="triage-progress">
          {currentIndex + 1} von {ideas.length}
          {processedIds.length > 0 && (
            <span className="neuro-reward-badge" style={{ marginLeft: '0.5rem', padding: '2px 8px', fontSize: '0.75rem' }}>
              {processedIds.length} erledigt
            </span>
          )}
        </span>
      </header>

      {/* Neuro-UX: Dopamin-Belohnung Overlay */}
      {showReward && (
        <div className="neuro-variable-reward">
          <span className="reward-emoji">{showReward.emoji}</span>
          <span>{showReward.message}</span>
        </div>
      )}

      {/* Neuro-UX: Undo Hint (Undo-Pattern statt Bestätigung) */}
      {showUndoHint && lastAction && (
        <div className="neuro-next-step" style={{ position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
          <span className="step-icon">↩️</span>
          <span>{ANTICIPATORY_MESSAGES.nextSteps.afterTriage}</span>
        </div>
      )}

      <div className="triage-card-container">
        {/* Swipe hints */}
        <div className="triage-hints" role="group" aria-label="Swipe-Richtungen">
          <span className="triage-hint triage-hint-left" aria-hidden="true">← Später</span>
          <span className="triage-hint triage-hint-right" aria-hidden="true">Priorität →</span>
          <span className="triage-hint triage-hint-bottom" aria-hidden="true">↓ Archivieren</span>
        </div>

        {/* Swipe indicators */}
        <div className={'swipe-indicator right ' + (direction === 'right' && progress > 0.6 ? 'visible' : '')} aria-hidden="true">
          🔥
        </div>
        <div className={'swipe-indicator left ' + (direction === 'left' && progress > 0.6 ? 'visible' : '')} aria-hidden="true">
          ⏰
        </div>
        <div className={'swipe-indicator up ' + (direction === 'up' && progress > 0.6 ? 'visible' : '')} aria-hidden="true">
          📥
        </div>

        {/* Neuro-UX: Card mit Focus Indicator und Liquid Glass */}
        <div
          ref={cardRef}
          className={'triage-card liquid-glass neuro-focus-indicator active ' + (isDragging ? 'dragging ' : '') + getSwipeClass()}
          style={cardStyle}
        >
          {/* Neuro-UX: Cognitive Chunk - Header */}
          <div className="triage-card-header neuro-chunk">
            <span className={'triage-card-priority ' + priorityInfo.className}>
              {priorityInfo.label}
            </span>
            <span className="triage-card-type">
              {typeEmoji} {currentIdea.type}
            </span>
          </div>

          {/* Neuro-UX: Klare visuelle Hierarchie - Titel prominent */}
          <h2 className="triage-card-title neuro-human-fade-in">{currentIdea.title}</h2>

          <p className="triage-card-summary">{currentIdea.summary}</p>

          {/* Neuro-UX: Progressive Disclosure für Details */}
          {currentIdea.nextSteps && currentIdea.nextSteps.length > 0 && (
            <div className={'triage-card-steps neuro-chunk ' + (expandedDetails ? 'neuro-expand-in' : '')}>
              <h4
                onClick={toggleDetails}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                className="neuro-hover-lift"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && toggleDetails()}
              >
                <span>{expandedDetails ? '▼' : '▶'}</span>
                Nächste Schritte ({currentIdea.nextSteps.length}):
              </h4>
              {/* Progressive Disclosure: Zeige nur wenn expanded */}
              {expandedDetails && (
                <ul className="neuro-flow-list">
                  {/* Miller's Law: Max 3 Steps anzeigen */}
                  {currentIdea.nextSteps.slice(0, 3).map((step, index) => (
                    <li key={`next-step-${index}-${step.slice(0, 20)}`} className="neuro-stagger-item">
                      {step}
                    </li>
                  ))}
                  {currentIdea.nextSteps.length > 3 && (
                    <li className="neuro-stagger-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      +{currentIdea.nextSteps.length - 3} weitere...
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          <div className="triage-card-meta">
            <span className="triage-card-tag neuro-hover-lift">{currentIdea.category}</span>
            <span className="triage-card-date">📅 {formatDate(currentIdea.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Neuro-UX: Quick Actions mit empfohlener Aktion hervorgehoben */}
      <div className="triage-quick-actions neuro-flow-list" role="group" aria-label="Schnelle Aktionen">
        <button
          className={'triage-action-btn later neuro-hover-lift neuro-stagger-item ' + (recommendedAction === 'later' ? 'neuro-pulse-interactive' : '')}
          onClick={() => handleTriageAction('later')}
          disabled={isAnimating}
          title="Auf spaeter verschieben"
          aria-label="Gedanke auf spaeter verschieben"
        >
          <span className="action-icon" aria-hidden="true">⏰</span>
          <span className="action-label">Spaeter</span>
        </button>
        <button
          className={'triage-action-btn archive neuro-hover-lift neuro-stagger-item ' + (recommendedAction === 'archive' ? 'neuro-pulse-interactive' : '')}
          onClick={() => handleTriageAction('archive')}
          disabled={isAnimating}
          title="Archivieren"
          aria-label="Gedanke archivieren"
        >
          <span className="action-icon" aria-hidden="true">📥</span>
          <span className="action-label">Archiv</span>
        </button>
        <button
          className={'triage-action-btn keep neuro-hover-lift neuro-stagger-item ' + (recommendedAction === 'keep' ? 'neuro-pulse-interactive' : '')}
          onClick={() => handleTriageAction('keep')}
          disabled={isAnimating}
          title="Behalten wie es ist"
          aria-label="Gedanke behalten"
        >
          <span className="action-icon" aria-hidden="true">✓</span>
          <span className="action-label">Behalten</span>
        </button>
        {/* Neuro-UX: Prioritaet-Button mit besonderer Hervorhebung wenn empfohlen */}
        <button
          className={'triage-action-btn priority neuro-hover-lift neuro-stagger-item ' + (recommendedAction === 'priority' ? 'neuro-button-glow' : '')}
          onClick={() => handleTriageAction('priority')}
          disabled={isAnimating}
          title="Als Prioritaet markieren"
          aria-label="Gedanke als Prioritaet markieren"
          style={{ position: 'relative' }}
        >
          <span className="action-icon" aria-hidden="true">🔥</span>
          <span className="action-label">Prioritaet</span>
          {/* Neuro-UX: Empfehlungs-Badge für Decision Fatigue Prevention */}
          {recommendedAction === 'priority' && (
            <span
              className="neuro-suggested-action"
              style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                fontSize: '0.65rem',
                padding: '2px 6px',
              }}
            >
              Empfohlen
            </span>
          )}
        </button>
      </div>

      {/* Neuro-UX: Remaining Stack Visualization (max 3 für Cognitive Load) */}
      {remainingCount > 1 && (
        <div className="triage-remaining">
          <div className="triage-remaining-stack">
            {/* Miller's Law: Nur max 3 Stack-Karten anzeigen */}
            {[...Array(Math.min(remainingCount - 1, 3))].map((_, i) => (
              <div
                key={i}
                className="triage-remaining-card neuro-stagger-item"
                style={{
                  transform: 'translateY(' + ((i + 1) * 4) + 'px) scale(' + (1 - (i + 1) * 0.02) + ')',
                  opacity: 1 - (i + 1) * 0.2,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const InboxTriage = memo(InboxTriageComponent);
export default InboxTriage;
