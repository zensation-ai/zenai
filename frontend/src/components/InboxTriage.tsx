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
import type { IdeaPriority } from '../types/idea';
import { TriageCard } from './TriageCard';
import { TriageActions } from './TriageActions';
import './InboxTriage.css';

export type TriageAction = 'priority' | 'keep' | 'later' | 'archive';

interface TriageIdea {
  id: string;
  title: string;
  type: string;
  category: string;
  priority: IdeaPriority;
  summary: string;
  nextSteps?: string[];
  keywords?: string[];
  createdAt: string;
  rawTranscript?: string;
}

interface ApiIdea {
  id: string;
  title: string;
  type?: string;
  category?: string;
  priority?: IdeaPriority;
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

const ACTION_FEEDBACK: Record<TriageAction, { emoji: string; label: string }> = {
  priority: { emoji: '🔥', label: 'Priorisiert!' },
  keep: { emoji: '✓', label: 'Behalten!' },
  later: { emoji: '⏰', label: 'Später!' },
  archive: { emoji: '📥', label: 'Archiviert!' },
};

const MAX_VISIBLE_ITEMS = 7;
const STREAK_MILESTONES = [3, 5, 7, 10];

const InboxTriageComponent: React.FC<InboxTriageProps> = ({ context, apiBase, onBack, onComplete, showToast }) => {
  const [ideas, setIdeas] = useState<TriageIdea[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processedIds, setProcessedIds] = useState<string[]>([]);
  const [stats, setStats] = useState({ prioritized: 0, archived: 0, kept: 0, later: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationClass, setAnimationClass] = useState('');
  const [exitStyle, setExitStyle] = useState<React.CSSProperties | null>(null);
  const [showReward, setShowReward] = useState<{ message: string; emoji: string } | null>(null);
  const [showUndoHint, setShowUndoHint] = useState(false);
  const [lastAction, setLastAction] = useState<{ id: string; action: TriageAction } | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');

  const cardRef = useRef<HTMLDivElement>(null);
  const swipeResetRef = useRef<() => void>(() => {});
  const { triggerMilestone, triggerStreak } = useNeuroFeedback();

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const currentIdea = ideas[currentIndex];
  const remainingCount = ideas.length - currentIndex;
  const totalProcessed = processedIds.length;

  const recommendedAction = useMemo((): TriageAction => {
    if (!currentIdea) return 'keep';
    switch (currentIdea.priority) {
      case 'high': return 'priority';
      case 'low': return 'archive';
      default: return 'keep';
    }
  }, [currentIdea]);

  useEffect(() => {
    if (isLoading) {
      const messages = ANTICIPATORY_MESSAGES.processing;
      let index = 0;
      setLoadingMessage(messages[0]);
      const interval = setInterval(() => { index = (index + 1) % messages.length; setLoadingMessage(messages[index]); }, 2000);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  const fetchTriageIdeas = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const excludeParam = processedIds.length > 0 ? '&exclude=' + processedIds.join(',') : '';
      const response = await axios.get(`${apiBase}/${context}/ideas/triage?limit=${MAX_VISIBLE_ITEMS}${excludeParam}`);
      const data = response.data;
      if (data.success && data.ideas) {
        const transformedIdeas: TriageIdea[] = data.ideas.map((idea: ApiIdea) => ({
          id: idea.id, title: idea.title, type: idea.type || 'note', category: idea.category || 'general',
          priority: idea.priority || 'medium', summary: idea.summary || '',
          nextSteps: idea.nextSteps || idea.next_steps || [], keywords: idea.keywords || [],
          createdAt: idea.createdAt || idea.created_at, rawTranscript: idea.rawTranscript || idea.raw_transcript,
        }));
        setIdeas(transformedIdeas);
        setCurrentIndex(0);
      } else {
        setIdeas([]);
      }
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error || 'Fehler beim Laden der Gedanken' : 'Ein Fehler ist aufgetreten';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, context, processedIds]);

  useEffect(() => { fetchTriageIdeas(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showDopamineReward = useCallback((action: TriageAction) => {
    const reward = getRandomReward('ideaCreated');
    const actionFeedback = ACTION_FEEDBACK[action];
    setShowReward({ message: reward.message, emoji: actionFeedback.emoji });
    const timeout = prefersReducedMotion ? 1000 : 2000;
    setTimeout(() => setShowReward(null), timeout);
  }, [prefersReducedMotion]);

  const checkStreakReward = useCallback((newTotal: number) => {
    if (STREAK_MILESTONES.includes(newTotal)) {
      const encouragement = FLOW_STATE_MESSAGES.encouragement[Math.floor(Math.random() * FLOW_STATE_MESSAGES.encouragement.length)];
      triggerStreak(newTotal);
      showToast(encouragement + ' (' + newTotal + ' erledigt!)', 'success');
    }
  }, [triggerStreak, showToast]);

  const handleTriageAction = useCallback(async (action: TriageAction, fromSwipe = false) => {
    if (!currentIdea || isAnimating) return;
    setIsAnimating(true);

    if (fromSwipe) {
      const exitTransforms: Record<TriageAction, string> = {
        priority: 'translateX(150%) rotate(20deg)', later: 'translateX(-150%) rotate(-20deg)',
        archive: 'translateY(-150%)', keep: 'scale(1.02)',
      };
      setExitStyle({ transform: exitTransforms[action], opacity: action === 'keep' ? 1 : 0, transition: 'transform 0.3s ease-out, opacity 0.3s ease-out' });
    } else {
      switch (action) {
        case 'priority': setAnimationClass('animate-swipe-right neuro-success-burst'); break;
        case 'later': setAnimationClass('animate-swipe-left'); break;
        case 'archive': setAnimationClass('animate-swipe-up'); break;
        case 'keep': setAnimationClass('animate-keep neuro-success-burst'); break;
      }
    }

    showDopamineReward(action);

    try {
      await axios.post(`${apiBase}/${context}/ideas/${currentIdea.id}/triage`, { action });
      setStats(prev => ({ ...prev, [action === 'priority' ? 'prioritized' : action]: prev[action === 'priority' ? 'prioritized' : (action as keyof typeof prev)] + 1 }));
      setLastAction({ id: currentIdea.id, action });
      setShowUndoHint(true);
      setTimeout(() => setShowUndoHint(false), 3000);
      setProcessedIds(prev => [...prev, currentIdea.id]);
      const newTotal = totalProcessed + 1;
      checkStreakReward(newTotal);
      const animationDuration = prefersReducedMotion ? 100 : 300;
      await new Promise(resolve => setTimeout(resolve, animationDuration));

      if (currentIndex < ideas.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        if (ideas.length === MAX_VISIBLE_ITEMS) {
          await fetchTriageIdeas();
        } else {
          triggerMilestone(newTotal + ' Gedanken sortiert!', 'Großartige Arbeit beim Aufräumen');
          onComplete();
        }
      }
    } catch {
      showToast('Fehler beim Speichern der Aktion', 'error');
    } finally {
      setIsAnimating(false);
      setAnimationClass('');
      setExitStyle(null);
      swipeResetRef.current();
    }
  }, [currentIdea, currentIndex, ideas.length, isAnimating, apiBase, context, fetchTriageIdeas, showToast, onComplete, totalProcessed, checkStreakReward, showDopamineReward, triggerMilestone, prefersReducedMotion]);

  const handleSwipeRight = useCallback(() => handleTriageAction('priority', true), [handleTriageAction]);
  const handleSwipeLeft = useCallback(() => handleTriageAction('later', true), [handleTriageAction]);
  const handleSwipeUp = useCallback(() => handleTriageAction('archive', true), [handleTriageAction]);

  const { isDragging, direction, progress, offsetX, offsetY, reset: swipeReset } = useSwipeGesture(cardRef, {
    threshold: 60, velocityThreshold: 0.3,
    onSwipeRight: handleSwipeRight, onSwipeLeft: handleSwipeLeft, onSwipeUp: handleSwipeUp,
    enabled: !isAnimating && !!currentIdea,
  });
  swipeResetRef.current = swipeReset;

  const cardStyle: React.CSSProperties = isDragging
    ? { transform: 'translate(' + offsetX + 'px, ' + offsetY + 'px) rotate(' + (offsetX * 0.05) + 'deg)', transition: 'none' }
    : exitStyle ? { ...exitStyle } : {};

  const getSwipeClass = (): string => {
    if (animationClass) return animationClass;
    if (!isDragging || progress < 0.3) return '';
    return 'swipe-' + direction;
  };

  if (isLoading) {
    return (
      <div className="triage-page neuro-page-enter">
        <header className="triage-header liquid-glass-nav">
          <button className="triage-back-btn neuro-hover-lift" onClick={onBack}>← Zurück</button>
          <h1 className="triage-title">Triage</h1>
          <span className="triage-progress">Lädt...</span>
        </header>
        <div className="triage-loading neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">{loadingMessage}</p>
          <p className="neuro-loading-submessage">{AI_PERSONALITY.name} sucht deine Gedanken...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="triage-page neuro-page-enter">
        <header className="triage-header liquid-glass-nav">
          <button className="triage-back-btn neuro-hover-lift" onClick={onBack}>← Zurück</button>
          <h1 className="triage-title">Triage</h1>
        </header>
        <div className="triage-error neuro-error-friendly">
          <span className="neuro-error-icon">⚠️</span>
          <div className="neuro-error-content">
            <span className="neuro-error-title">Ups, da ging etwas schief</span>
            <p className="neuro-error-message">{error}</p>
            <span className="neuro-error-suggestion">Keine Sorge, einfach nochmal versuchen!</span>
          </div>
          <button className="triage-retry-btn neuro-button neuro-hover-lift" onClick={fetchTriageIdeas}>Erneut versuchen</button>
        </div>
      </div>
    );
  }

  if (!currentIdea) {
    return (
      <div className="triage-page neuro-page-enter">
        <header className="triage-header liquid-glass-nav">
          <button className="triage-back-btn neuro-hover-lift" onClick={onBack}>← Zurück</button>
          <h1 className="triage-title">Triage</h1>
        </header>
        <div className="triage-empty neuro-empty-state neuro-success-burst">
          <span className="neuro-empty-icon">✨</span>
          <h2 className="neuro-empty-title neuro-greeting-adaptive">Alles sortiert!</h2>
          <p className="neuro-empty-description neuro-subtext-emotional">
            {totalProcessed > 0 ? 'Du hast ' + totalProcessed + ' Gedanken sortiert. Großartig!' : 'Keine Gedanken zum Sortieren vorhanden.'}
          </p>
          {totalProcessed > 0 && (
            <p className="neuro-empty-encouragement neuro-motivational">
              {FLOW_STATE_MESSAGES.encouragement[Math.floor(Math.random() * FLOW_STATE_MESSAGES.encouragement.length)]}
            </p>
          )}
          {totalProcessed > 0 && (
            <div className="triage-stats neuro-flow-list">
              <div className="triage-stat neuro-chunk neuro-stagger-item"><span className="stat-value neuro-reward-badge">{stats.prioritized}</span><span className="stat-label">Priorisiert</span></div>
              <div className="triage-stat neuro-chunk neuro-stagger-item"><span className="stat-value">{stats.kept}</span><span className="stat-label">Behalten</span></div>
              <div className="triage-stat neuro-chunk neuro-stagger-item"><span className="stat-value">{stats.later}</span><span className="stat-label">Später</span></div>
              <div className="triage-stat neuro-chunk neuro-stagger-item"><span className="stat-value">{stats.archived}</span><span className="stat-label">Archiviert</span></div>
            </div>
          )}
          <button className="triage-done-btn neuro-button neuro-hover-lift" onClick={onBack}>Zurück zur Übersicht</button>
        </div>
      </div>
    );
  }

  return (
    <div className="triage-page neuro-page-enter" data-context={context}>
      <header className="triage-header liquid-glass-nav">
        <button className="triage-back-btn neuro-hover-lift" onClick={onBack}>← Zurück</button>
        <h1 className="triage-title">Triage</h1>
        <span className="triage-progress">
          {currentIndex + 1} von {ideas.length}
          {processedIds.length > 0 && (
            <span className="neuro-reward-badge" style={{ marginLeft: '0.5rem', padding: '2px 8px', fontSize: '0.75rem' }}>{processedIds.length} erledigt</span>
          )}
        </span>
      </header>

      {showReward && (
        <div className="neuro-variable-reward">
          <span className="reward-emoji">{showReward.emoji}</span>
          <span>{showReward.message}</span>
        </div>
      )}

      {showUndoHint && lastAction && (
        <div className="neuro-next-step" style={{ position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', zIndex: 100 }}>
          <span className="step-icon">↩️</span>
          <span>{ANTICIPATORY_MESSAGES.nextSteps.afterTriage}</span>
        </div>
      )}

      <div className="triage-card-container">
        <div className="triage-hints" role="group" aria-label="Swipe-Richtungen">
          <span className="triage-hint triage-hint-left" aria-hidden="true">← Später</span>
          <span className="triage-hint triage-hint-right" aria-hidden="true">Priorität →</span>
          <span className="triage-hint triage-hint-bottom" aria-hidden="true">↓ Archivieren</span>
        </div>

        <div className={'swipe-indicator right ' + (direction === 'right' && progress > 0.6 ? 'visible' : '')} aria-hidden="true">🔥</div>
        <div className={'swipe-indicator left ' + (direction === 'left' && progress > 0.6 ? 'visible' : '')} aria-hidden="true">⏰</div>
        <div className={'swipe-indicator up ' + (direction === 'up' && progress > 0.6 ? 'visible' : '')} aria-hidden="true">📥</div>

        <TriageCard idea={currentIdea} cardRef={cardRef} isDragging={isDragging} cardStyle={cardStyle} swipeClass={getSwipeClass()} />
      </div>

      <TriageActions recommendedAction={recommendedAction} isAnimating={isAnimating} onAction={(action) => handleTriageAction(action)} />

      {remainingCount > 1 && (
        <div className="triage-remaining">
          <div className="triage-remaining-stack">
            {[...Array(Math.min(remainingCount - 1, 3))].map((_, i) => (
              <div key={i} className="triage-remaining-card neuro-stagger-item" style={{ transform: 'translateY(' + ((i + 1) * 4) + 'px) scale(' + (1 - (i + 1) * 0.02) + ')', opacity: 1 - (i + 1) * 0.2 }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const InboxTriage = memo(InboxTriageComponent);
export default InboxTriage;
