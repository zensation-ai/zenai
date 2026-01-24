import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { AI_PERSONALITY } from '../utils/aiPersonality';
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

interface InboxTriageProps {
  context: 'personal' | 'work';
  apiBase: string;
  onBack: () => void;
  onComplete: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

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

/**
 * InboxTriage - Swipe-based card interface for prioritizing thoughts
 *
 * Swipe Actions:
 * - Right: Mark as priority (high)
 * - Left: Review later (low priority)
 * - Up: Archive
 * - Buttons: Keep (no change), or use button alternatives
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

  const cardRef = useRef<HTMLDivElement>(null);

  const currentIdea = ideas[currentIndex];
  const remainingCount = ideas.length - currentIndex;
  const totalProcessed = processedIds.length;

  // Fetch ideas for triage
  const fetchTriageIdeas = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const excludeParam = processedIds.length > 0 ? `&exclude=${processedIds.join(',')}` : '';
      const response = await fetch(
        `${apiBase}/${context}/ideas/triage?limit=20${excludeParam}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': import.meta.env.VITE_API_KEY || 'dev-key',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Fehler beim Laden der Gedanken');
      }

      const data = await response.json();

      if (data.success && data.ideas) {
        // Transform API response to match our interface
        const transformedIdeas: TriageIdea[] = data.ideas.map((idea: any) => ({
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
      setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten');
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, context, processedIds]);

  // Initial load
  useEffect(() => {
    fetchTriageIdeas();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Handle triage action
  const handleTriageAction = useCallback(
    async (action: TriageAction) => {
      if (!currentIdea || isAnimating) return;

      // Set animation
      setIsAnimating(true);
      switch (action) {
        case 'priority':
          setAnimationClass('animate-swipe-right');
          break;
        case 'later':
          setAnimationClass('animate-swipe-left');
          break;
        case 'archive':
          setAnimationClass('animate-swipe-up');
          break;
        case 'keep':
          setAnimationClass('animate-keep');
          break;
      }

      // Send API request
      try {
        const response = await fetch(
          `${apiBase}/${context}/ideas/${currentIdea.id}/triage`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': import.meta.env.VITE_API_KEY || 'dev-key',
            },
            body: JSON.stringify({ action }),
          }
        );

        if (!response.ok) {
          throw new Error('Fehler beim Speichern');
        }

        // Update stats
        setStats((prev) => ({
          ...prev,
          [action === 'priority' ? 'prioritized' : action]: prev[action === 'priority' ? 'prioritized' : action as keyof typeof prev] + 1,
        }));

        // Track processed
        setProcessedIds((prev) => [...prev, currentIdea.id]);

        // Wait for animation
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Move to next card
        if (currentIndex < ideas.length - 1) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          // Check if we need to load more
          if (ideas.length === 20) {
            // Might be more, fetch again
            await fetchTriageIdeas();
          } else {
            // All done!
            showToast(`${totalProcessed + 1} Gedanken sortiert!`, 'success');
            onComplete();
          }
        }
      } catch (err) {
        showToast('Fehler beim Speichern der Aktion', 'error');
      } finally {
        setIsAnimating(false);
        setAnimationClass('');
      }
    },
    [currentIdea, currentIndex, ideas.length, isAnimating, apiBase, context, fetchTriageIdeas, showToast, onComplete, totalProcessed]
  );

  // Swipe handlers
  const handleSwipeRight = useCallback(() => handleTriageAction('priority'), [handleTriageAction]);
  const handleSwipeLeft = useCallback(() => handleTriageAction('later'), [handleTriageAction]);
  const handleSwipeUp = useCallback(() => handleTriageAction('archive'), [handleTriageAction]);

  // Set up swipe gestures
  const { isDragging, direction, progress, offsetX, offsetY } = useSwipeGesture(cardRef, {
    threshold: 100,
    onSwipeRight: handleSwipeRight,
    onSwipeLeft: handleSwipeLeft,
    onSwipeUp: handleSwipeUp,
    enabled: !isAnimating && !!currentIdea,
  });

  // Calculate card transform based on swipe progress
  const cardStyle: React.CSSProperties = isDragging
    ? {
        transform: `translate(${offsetX}px, ${offsetY}px) rotate(${offsetX * 0.05}deg)`,
        transition: 'none',
      }
    : {};

  // Determine swipe indicator class
  const getSwipeClass = (): string => {
    if (animationClass) return animationClass;
    if (!isDragging || progress < 0.3) return '';
    return `swipe-${direction}`;
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

  // Render loading state
  if (isLoading) {
    return (
      <div className="triage-page">
        <header className="triage-header">
          <button className="triage-back-btn" onClick={onBack}>
            ← Zurück
          </button>
          <h1 className="triage-title">Triage</h1>
          <span className="triage-progress">Lädt...</span>
        </header>
        <div className="triage-loading">
          <div className="triage-loading-spinner" />
          <p>{AI_PERSONALITY.name} sucht deine Gedanken...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="triage-page">
        <header className="triage-header">
          <button className="triage-back-btn" onClick={onBack}>
            ← Zurück
          </button>
          <h1 className="triage-title">Triage</h1>
        </header>
        <div className="triage-error">
          <span className="triage-error-icon">⚠️</span>
          <p>{error}</p>
          <button className="triage-retry-btn" onClick={fetchTriageIdeas}>
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  // Render empty state
  if (!currentIdea) {
    return (
      <div className="triage-page">
        <header className="triage-header">
          <button className="triage-back-btn" onClick={onBack}>
            ← Zurück
          </button>
          <h1 className="triage-title">Triage</h1>
        </header>
        <div className="triage-empty">
          <span className="triage-empty-icon">✨</span>
          <h2 className="triage-empty-title">Alles sortiert!</h2>
          <p className="triage-empty-message">
            {totalProcessed > 0
              ? `Du hast ${totalProcessed} Gedanken sortiert. Großartig!`
              : 'Keine Gedanken zum Sortieren vorhanden.'}
          </p>
          {totalProcessed > 0 && (
            <div className="triage-stats">
              <div className="triage-stat">
                <span className="stat-value">{stats.prioritized}</span>
                <span className="stat-label">Priorisiert</span>
              </div>
              <div className="triage-stat">
                <span className="stat-value">{stats.kept}</span>
                <span className="stat-label">Behalten</span>
              </div>
              <div className="triage-stat">
                <span className="stat-value">{stats.later}</span>
                <span className="stat-label">Später</span>
              </div>
              <div className="triage-stat">
                <span className="stat-value">{stats.archived}</span>
                <span className="stat-label">Archiviert</span>
              </div>
            </div>
          )}
          <button className="triage-done-btn" onClick={onBack}>
            Zurück zur Übersicht
          </button>
        </div>
      </div>
    );
  }

  const priorityInfo = PRIORITY_LABELS[currentIdea.priority] || PRIORITY_LABELS.medium;
  const typeEmoji = TYPE_EMOJIS[currentIdea.type] || '📝';

  return (
    <div className="triage-page" data-context={context}>
      <header className="triage-header">
        <button className="triage-back-btn" onClick={onBack}>
          ← Zurück
        </button>
        <h1 className="triage-title">Triage</h1>
        <span className="triage-progress">
          {currentIndex + 1} von {ideas.length}
          {processedIds.length > 0 && ` (${processedIds.length} sortiert)`}
        </span>
      </header>

      <div className="triage-card-container">
        {/* Swipe hints */}
        <div className="triage-hints">
          <span className="triage-hint triage-hint-left">
            ← Später
          </span>
          <span className="triage-hint triage-hint-right">
            Priorität →
          </span>
          <span className="triage-hint triage-hint-bottom">
            ↓ Archivieren
          </span>
        </div>

        {/* Swipe indicators */}
        <div className={`swipe-indicator right ${direction === 'right' && progress > 0.5 ? 'visible' : ''}`}>
          🔥
        </div>
        <div className={`swipe-indicator left ${direction === 'left' && progress > 0.5 ? 'visible' : ''}`}>
          ⏰
        </div>
        <div className={`swipe-indicator up ${direction === 'up' && progress > 0.5 ? 'visible' : ''}`}>
          📥
        </div>

        {/* Card */}
        <div
          ref={cardRef}
          className={`triage-card ${isDragging ? 'dragging' : ''} ${getSwipeClass()}`}
          style={cardStyle}
        >
          <div className="triage-card-header">
            <span className={`triage-card-priority ${priorityInfo.className}`}>
              {priorityInfo.label}
            </span>
            <span className="triage-card-type">
              {typeEmoji} {currentIdea.type}
            </span>
          </div>

          <h2 className="triage-card-title">{currentIdea.title}</h2>

          <p className="triage-card-summary">{currentIdea.summary}</p>

          {currentIdea.nextSteps && currentIdea.nextSteps.length > 0 && (
            <div className="triage-card-steps">
              <h4>Nächste Schritte:</h4>
              <ul>
                {currentIdea.nextSteps.slice(0, 3).map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="triage-card-meta">
            <span className="triage-card-tag">{currentIdea.category}</span>
            <span className="triage-card-date">
              📅 {formatDate(currentIdea.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Action buttons (desktop) */}
      <div className="triage-quick-actions">
        <button
          className="triage-action-btn later"
          onClick={() => handleTriageAction('later')}
          disabled={isAnimating}
          title="Auf später verschieben"
        >
          <span className="action-icon">⏰</span>
          <span className="action-label">Später</span>
        </button>
        <button
          className="triage-action-btn archive"
          onClick={() => handleTriageAction('archive')}
          disabled={isAnimating}
          title="Archivieren"
        >
          <span className="action-icon">📥</span>
          <span className="action-label">Archiv</span>
        </button>
        <button
          className="triage-action-btn keep"
          onClick={() => handleTriageAction('keep')}
          disabled={isAnimating}
          title="Behalten wie es ist"
        >
          <span className="action-icon">✓</span>
          <span className="action-label">Behalten</span>
        </button>
        <button
          className="triage-action-btn priority"
          onClick={() => handleTriageAction('priority')}
          disabled={isAnimating}
          title="Als Priorität markieren"
        >
          <span className="action-icon">🔥</span>
          <span className="action-label">Priorität</span>
        </button>
      </div>

      {/* Remaining count indicator */}
      {remainingCount > 1 && (
        <div className="triage-remaining">
          <div className="triage-remaining-stack">
            {[...Array(Math.min(remainingCount - 1, 3))].map((_, i) => (
              <div
                key={i}
                className="triage-remaining-card"
                style={{
                  transform: `translateY(${(i + 1) * 4}px) scale(${1 - (i + 1) * 0.02})`,
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
