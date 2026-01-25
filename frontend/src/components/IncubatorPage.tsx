/**
 * Thought Incubator Page - Neuro-UX Optimized 2026
 *
 * Displays loose thoughts that are incubating into structured ideas.
 * Shows clusters of related thoughts and allows consolidation.
 *
 * NEURO-UX PATTERNS APPLIED:
 * - Miller's Law (7+/-2 items): Clusters limited per group, staggered animation
 * - Dopamine Rewards: Variable celebration on consolidation
 * - Progressive Disclosure: Expandable thought details
 * - Flow-State: Smooth transitions, .neuro-flow-list animations
 * - Anticipatory Design: Predictive tooltips, loading states
 * - Cognitive Chunking: Visual grouping with .neuro-chunk
 * - Emotional Design: Mood-based visuals, encouraging empty states
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import {
  getTimeBasedGreeting,
  getRandomReward,
  getMotivationalMessage,
  EMPTY_STATE_MESSAGES,
  AI_PERSONALITY,
  DOPAMINE_REWARDS,
} from '../utils/aiPersonality';
import './IncubatorPage.css';
import '../neurodesign.css';

interface LooseThought {
  id: string;
  raw_input: string;
  source: 'text' | 'voice' | 'quick_jot';
  created_at: string;
  similarity_to_cluster?: number;
}

interface ThoughtCluster {
  id: string;
  title?: string;
  summary?: string;
  suggested_type?: string;
  suggested_category?: string;
  thought_count: number;
  maturity_score: number;
  confidence_score: number;
  status: 'growing' | 'ready' | 'presented' | 'consolidated' | 'dismissed';
  thoughts: LooseThought[];
  created_at: string;
  updated_at: string;
}

interface IncubatorStats {
  total_thoughts: number;
  unprocessed_thoughts: number;
  total_clusters: number;
  ready_clusters: number;
  growing_clusters: number;
  consolidated_clusters: number;
}

interface Props {
  onBack: () => void;
  onIdeaCreated?: (ideaId: string) => void;
}

/**
 * NEURO-UX: Miller's Law - Limit visible items per chunk
 * Human working memory handles 7+/-2 items optimally
 */
const MILLER_CHUNK_SIZE = 7;

/**
 * NEURO-UX: Calculate "freshness" mood based on cluster age
 * Older clusters get a different visual treatment to encourage action
 */
function getClusterMood(updatedAt: string): 'fresh' | 'aging' | 'dormant' {
  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceUpdate <= 1) return 'fresh';
  if (daysSinceUpdate <= 7) return 'aging';
  return 'dormant';
}

/**
 * NEURO-UX: Get mood-based styling class
 */
function getMoodClass(mood: 'fresh' | 'aging' | 'dormant'): string {
  switch (mood) {
    case 'fresh':
      return 'cluster-mood-fresh';
    case 'aging':
      return 'cluster-mood-aging';
    case 'dormant':
      return 'cluster-mood-dormant';
  }
}

export function IncubatorPage({ onBack, onIdeaCreated }: Props) {
  const [clusters, setClusters] = useState<ThoughtCluster[]>([]);
  const [stats, setStats] = useState<IncubatorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickThought, setQuickThought] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [summarizing, setSummarizing] = useState<string | null>(null);
  const [consolidating, setConsolidating] = useState<string | null>(null);
  // NEURO-UX: Progressive Disclosure - track expanded clusters
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  // NEURO-UX: Success celebration state
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState<{ emoji: string; message: string } | null>(null);
  // NEURO-UX: Track if user prefers reduced motion
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Refs for cleanup to prevent memory leaks
  const isMountedRef = useRef<boolean>(true);
  const timeoutRef = useRef<number | null>(null);
  const celebrationTimeoutRef = useRef<number | null>(null);

  // NEURO-UX: Check reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // NEURO-UX: Context-aware greeting with time-based personalization
  const greeting = useMemo(() => getTimeBasedGreeting(), []);

  const loadData = useCallback(async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    try {
      const [clustersRes, statsRes] = await Promise.all([
        axios.get('/api/incubator/clusters'),
        axios.get('/api/incubator/stats'),
      ]);
      if (isMountedRef.current) {
        setClusters(clustersRes.data.clusters);
        setStats(statsRes.data);
      }
    } catch (error) {
      console.error('Failed to load incubator data:', error);
      if (isMountedRef.current) {
        showToast('Inkubator konnte nicht geladen werden', 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    loadData();

    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (celebrationTimeoutRef.current) {
        clearTimeout(celebrationTimeoutRef.current);
        celebrationTimeoutRef.current = null;
      }
    };
  }, [loadData]);

  /**
   * NEURO-UX: Trigger dopamine celebration animation
   * Variable rewards increase engagement (slot machine effect)
   */
  const triggerCelebration = useCallback((message: string, emoji: string) => {
    if (prefersReducedMotion) {
      // Reduced motion: just show toast
      showToast(`${emoji} ${message}`, 'success');
      return;
    }

    setCelebrationMessage({ emoji, message });
    setShowCelebration(true);

    celebrationTimeoutRef.current = window.setTimeout(() => {
      if (isMountedRef.current) {
        setShowCelebration(false);
        setCelebrationMessage(null);
      }
    }, 2500);
  }, [prefersReducedMotion]);

  const submitQuickThought = async () => {
    if (!quickThought.trim()) return;

    setSubmitting(true);
    try {
      await axios.post('/api/incubator/thought', {
        text: quickThought,
        source: 'quick_jot',
      });
      if (isMountedRef.current) {
        setQuickThought('');
        // NEURO-UX: Variable reward on thought submission
        const reward = getRandomReward('ideaCreated');
        showToast(`${reward.emoji} ${reward.message}`, 'success');

        // Reload after short delay to allow processing - with cleanup
        timeoutRef.current = window.setTimeout(() => {
          if (isMountedRef.current) {
            loadData();
          }
        }, 500);
      }
    } catch (error) {
      console.error('Failed to submit thought:', error);
      if (isMountedRef.current) {
        showToast('Gedanke konnte nicht gespeichert werden', 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  const generateSummary = async (clusterId: string) => {
    setSummarizing(clusterId);
    try {
      const response = await axios.post(`/api/incubator/clusters/${clusterId}/summarize`);
      // Update cluster in state
      if (isMountedRef.current) {
        setClusters(clusters.map(c =>
          c.id === clusterId
            ? { ...c, title: response.data.title, summary: response.data.summary,
                suggested_type: response.data.suggested_type, suggested_category: response.data.suggested_category }
            : c
        ));
        showToast('Zusammenfassung erstellt', 'success');
      }
    } catch (error) {
      console.error('Failed to generate summary:', error);
      if (isMountedRef.current) {
        showToast('Zusammenfassung fehlgeschlagen', 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setSummarizing(null);
      }
    }
  };

  const consolidateCluster = async (clusterId: string) => {
    setConsolidating(clusterId);
    try {
      const response = await axios.post(`/api/incubator/clusters/${clusterId}/consolidate`);
      // Remove from list and refresh
      if (isMountedRef.current) {
        // NEURO-UX: Dopamine celebration on consolidation
        const milestoneRewards = DOPAMINE_REWARDS.milestoneReached;
        const randomMilestone = milestoneRewards[Math.floor(Math.random() * milestoneRewards.length)];
        triggerCelebration('Idee erfolgreich erstellt!', randomMilestone.emoji);

        loadData();
        if (onIdeaCreated) {
          onIdeaCreated(response.data.ideaId);
        }
      }
    } catch (error) {
      console.error('Failed to consolidate cluster:', error);
      if (isMountedRef.current) {
        showToast('Konsolidierung fehlgeschlagen', 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setConsolidating(null);
      }
    }
  };

  const dismissCluster = async (clusterId: string) => {
    try {
      await axios.post(`/api/incubator/clusters/${clusterId}/dismiss`);
      if (isMountedRef.current) {
        showToast('Cluster verworfen', 'info');
        loadData();
      }
    } catch (error) {
      console.error('Failed to dismiss cluster:', error);
      if (isMountedRef.current) {
        showToast('Verwerfen fehlgeschlagen', 'error');
      }
    }
  };

  /**
   * NEURO-UX: Progressive Disclosure - toggle cluster expansion
   */
  const toggleClusterExpansion = (clusterId: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return '#22c55e';
      case 'growing': return '#f59e0b';
      case 'presented': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready': return 'Bereit';
      case 'growing': return 'Wachsend';
      case 'presented': return 'Angesehen';
      default: return status;
    }
  };

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'idea': return '💡';
      case 'task': return '✅';
      case 'insight': return '🔍';
      case 'problem': return '⚠️';
      case 'question': return '❓';
      default: return '💭';
    }
  };

  /**
   * NEURO-UX: Calculate days since last update for urgency indicator
   */
  const getDaysSinceUpdate = (dateString: string): number => {
    return Math.floor(
      (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24)
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const readyClusters = clusters.filter(c => c.status === 'ready');
  const growingClusters = clusters.filter(c => c.status === 'growing');

  // NEURO-UX: Miller's Law - chunk clusters for cognitive ease
  const chunkedReadyClusters = readyClusters.slice(0, MILLER_CHUNK_SIZE);
  const hasMoreReadyClusters = readyClusters.length > MILLER_CHUNK_SIZE;
  const chunkedGrowingClusters = growingClusters.slice(0, MILLER_CHUNK_SIZE);
  const hasMoreGrowingClusters = growingClusters.length > MILLER_CHUNK_SIZE;

  return (
    <div className="incubator-page neuro-page-enter">
      {/* NEURO-UX: Success Celebration Overlay */}
      {showCelebration && celebrationMessage && (
        <div className="neuro-variable-reward" role="alert" aria-live="polite">
          <span className="reward-emoji">{celebrationMessage.emoji}</span>
          <span>{celebrationMessage.message}</span>
        </div>
      )}

      <header className="incubator-header liquid-glass-dark">
        <button
          className="back-button neuro-hover-lift neuro-anticipate"
          onClick={onBack}
          data-anticipate="Zurueck zur Uebersicht"
          aria-label="Zurueck zur Hauptseite"
        >
          ← Zurueck
        </button>
        <div className="header-title">
          {/* NEURO-UX: Personalized greeting based on time of day */}
          <h1 className="neuro-greeting-adaptive">
            <span className="greeting-emoji" aria-hidden="true">{greeting.emoji}</span>
            {' '}Gedanken-Inkubator
          </h1>
          <span className="subtitle neuro-subtext-emotional">
            {greeting.subtext}
          </span>
        </div>
        <button
          className="refresh-button neuro-hover-lift neuro-anticipate"
          onClick={loadData}
          data-anticipate="Daten aktualisieren"
          aria-label="Inkubator aktualisieren"
        >
          ↻ Aktualisieren
        </button>
      </header>

      {/* NEURO-UX: Quick Input with anticipatory design */}
      <section className="quick-input-section">
        <div className="quick-input-card liquid-glass neuro-chunk">
          <h2>Schneller Gedanke</h2>
          {/* NEURO-UX: Encouraging hint with personality */}
          <p className="hint neuro-inspirational">
            Keine Struktur noetig – {AI_PERSONALITY.name} kuemmert sich darum!
          </p>
          <div className="quick-input-container">
            <textarea
              className="liquid-glass-input neuro-placeholder-animated"
              placeholder={greeting.suggestedAction || 'Was geht dir durch den Kopf...'}
              value={quickThought}
              onChange={(e) => setQuickThought(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) {
                  submitQuickThought();
                }
              }}
              disabled={submitting}
              rows={2}
              aria-label="Gedanke eingeben"
            />
            <button
              className={`submit-thought-button neuro-button ${submitting ? '' : 'neuro-pulse-interactive'}`}
              onClick={submitQuickThought}
              disabled={submitting || !quickThought.trim()}
              aria-label={submitting ? 'Wird gespeichert...' : 'Gedanke inkubieren'}
            >
              {submitting ? (
                <span className="neuro-typing">
                  <span className="neuro-typing-dot" aria-hidden="true"></span>
                  <span className="neuro-typing-dot" aria-hidden="true"></span>
                  <span className="neuro-typing-dot" aria-hidden="true"></span>
                </span>
              ) : (
                'Inkubieren'
              )}
            </button>
          </div>
        </div>
      </section>

      {/* NEURO-UX: Stats with cognitive chunking */}
      {stats && (
        <section className="incubator-stats neuro-flow-list" aria-label="Inkubator-Statistiken">
          <div className="stat-card neuro-chunk neuro-stagger-item">
            <span className="stat-value">{stats.total_thoughts}</span>
            <span className="stat-label">Gedanken</span>
          </div>
          <div className="stat-card neuro-chunk neuro-stagger-item">
            <span className="stat-value">{stats.growing_clusters}</span>
            <span className="stat-label">Wachsend</span>
          </div>
          <div className="stat-card highlight neuro-chunk neuro-stagger-item neuro-heartbeat">
            <span className="stat-value">{stats.ready_clusters}</span>
            <span className="stat-label">Bereit</span>
          </div>
          <div className="stat-card neuro-chunk neuro-stagger-item">
            <span className="stat-value">{stats.consolidated_clusters}</span>
            <span className="stat-label">Konsolidiert</span>
          </div>
        </section>
      )}

      {loading ? (
        /* NEURO-UX: Anticipatory loading with skeleton */
        <div className="loading-state neuro-loading-contextual" aria-live="polite" aria-busy="true">
          <div className="neuro-loading-spinner" aria-hidden="true" />
          <p className="neuro-loading-message">Lade Inkubator...</p>
          <p className="neuro-loading-submessage">Deine Gedanken werden organisiert</p>
          {/* Skeleton preview */}
          <div className="skeleton-preview" style={{ marginTop: '2rem', width: '100%', maxWidth: '400px' }}>
            <div className="neuro-skeleton" style={{ height: '80px', marginBottom: '1rem' }} aria-hidden="true" />
            <div className="neuro-skeleton" style={{ height: '80px', marginBottom: '1rem' }} aria-hidden="true" />
            <div className="neuro-skeleton" style={{ height: '80px' }} aria-hidden="true" />
          </div>
        </div>
      ) : (
        <>
          {/* NEURO-UX: Ready Clusters - Flow list with staggered animation */}
          {chunkedReadyClusters.length > 0 && (
            <section className="clusters-section ready-section neuro-chunk" aria-labelledby="ready-clusters-heading">
              <h2 id="ready-clusters-heading">
                <span className="section-icon" aria-hidden="true">✨</span>
                Bereit zur Konsolidierung
                <span className="badge">{readyClusters.length}</span>
              </h2>
              <div className="clusters-grid neuro-flow-list">
                {chunkedReadyClusters.map((cluster, index) => {
                  const mood = getClusterMood(cluster.updated_at);
                  const daysSince = getDaysSinceUpdate(cluster.updated_at);
                  const isExpanded = expandedClusters.has(cluster.id);

                  return (
                    <article
                      key={cluster.id}
                      className={`cluster-card ready liquid-glass neuro-hover-lift neuro-focus-indicator ${getMoodClass(mood)}`}
                      style={{ '--stagger-index': index } as React.CSSProperties}
                      aria-labelledby={`cluster-title-${cluster.id}`}
                    >
                      <div className="cluster-header">
                        <span
                          className="cluster-status"
                          style={{ background: getStatusColor(cluster.status) }}
                          aria-label={`Status: ${getStatusLabel(cluster.status)}`}
                        >
                          {getStatusLabel(cluster.status)}
                        </span>
                        <span className="thought-count">{cluster.thought_count} Gedanken</span>
                      </div>

                      {/* NEURO-UX: Urgency indicator for dormant clusters */}
                      {mood === 'dormant' && (
                        <div className="dormant-reminder neuro-suggested-action" role="status">
                          <span aria-hidden="true">💡</span>
                          Seit {daysSince} Tagen nicht angesehen
                        </div>
                      )}

                      {cluster.title ? (
                        <div className="cluster-content">
                          <h3 id={`cluster-title-${cluster.id}`}>
                            <span className="type-icon" aria-hidden="true">{getTypeIcon(cluster.suggested_type)}</span>
                            {cluster.title}
                          </h3>
                          <p className="cluster-summary">{cluster.summary}</p>
                          <div className="cluster-meta">
                            <span className="category-badge">{cluster.suggested_category}</span>
                            <span className="maturity">
                              Reife: {Math.round(cluster.maturity_score * 100)}%
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="cluster-content pending">
                          <p>Zusammenfassung wird noch generiert...</p>
                          <button
                            className="summarize-button neuro-button"
                            onClick={() => generateSummary(cluster.id)}
                            disabled={summarizing === cluster.id}
                            aria-busy={summarizing === cluster.id}
                          >
                            {summarizing === cluster.id ? 'Analysiere...' : 'Zusammenfassen'}
                          </button>
                        </div>
                      )}

                      {/* NEURO-UX: Progressive Disclosure for thoughts */}
                      <div className="cluster-thoughts">
                        <button
                          className="thoughts-toggle neuro-color-transition"
                          onClick={() => toggleClusterExpansion(cluster.id)}
                          aria-expanded={isExpanded}
                          aria-controls={`thoughts-list-${cluster.id}`}
                        >
                          <h4>
                            Enthaltene Gedanken ({cluster.thoughts.length})
                            <span className="toggle-icon" aria-hidden="true">
                              {isExpanded ? ' \u25BC' : ' \u25B6'}
                            </span>
                          </h4>
                        </button>
                        <ul
                          id={`thoughts-list-${cluster.id}`}
                          className={`neuro-expandable ${isExpanded ? 'expanded' : ''}`}
                        >
                          {cluster.thoughts.slice(0, isExpanded ? undefined : 3).map((thought, thoughtIndex) => (
                            <li
                              key={thought.id}
                              className={isExpanded ? 'neuro-stagger-item' : ''}
                              style={{ '--stagger-index': thoughtIndex } as React.CSSProperties}
                            >
                              <span className="thought-text">{thought.raw_input}</span>
                              <span className="thought-date">{formatDate(thought.created_at)}</span>
                            </li>
                          ))}
                          {!isExpanded && cluster.thoughts.length > 3 && (
                            <li className="more">+{cluster.thoughts.length - 3} weitere</li>
                          )}
                        </ul>
                      </div>

                      <div className="cluster-actions">
                        <button
                          className={`consolidate-button neuro-button ${consolidating === cluster.id ? '' : 'neuro-anticipate'}`}
                          onClick={() => consolidateCluster(cluster.id)}
                          disabled={consolidating === cluster.id || !cluster.title}
                          data-anticipate="Erstellt eine strukturierte Idee"
                          aria-busy={consolidating === cluster.id}
                        >
                          {consolidating === cluster.id ? (
                            <span className="neuro-typing">
                              <span className="neuro-typing-dot" aria-hidden="true"></span>
                              <span className="neuro-typing-dot" aria-hidden="true"></span>
                              <span className="neuro-typing-dot" aria-hidden="true"></span>
                            </span>
                          ) : (
                            'Zur Idee machen'
                          )}
                        </button>
                        <button
                          className="dismiss-button neuro-hover-lift neuro-anticipate"
                          onClick={() => dismissCluster(cluster.id)}
                          data-anticipate="Cluster dauerhaft entfernen"
                          aria-label="Cluster verwerfen"
                        >
                          Verwerfen
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {/* NEURO-UX: Miller's Law - Show "more" indicator */}
              {hasMoreReadyClusters && (
                <div className="more-clusters-hint neuro-inspirational">
                  <span aria-hidden="true">↓</span> {readyClusters.length - MILLER_CHUNK_SIZE} weitere Cluster verfuegbar
                </div>
              )}
            </section>
          )}

          {/* NEURO-UX: Growing Clusters - Compact view with flow animations */}
          {chunkedGrowingClusters.length > 0 && (
            <section className="clusters-section growing-section neuro-chunk" aria-labelledby="growing-clusters-heading">
              <h2 id="growing-clusters-heading">
                <span className="section-icon" aria-hidden="true">🌱</span>
                Wachsende Themen
                <span className="badge muted">{growingClusters.length}</span>
              </h2>
              <div className="clusters-grid compact neuro-flow-list">
                {chunkedGrowingClusters.map((cluster, index) => {
                  const mood = getClusterMood(cluster.updated_at);

                  return (
                    <article
                      key={cluster.id}
                      className={`cluster-card growing liquid-glass neuro-hover-lift neuro-focus-indicator ${getMoodClass(mood)}`}
                      style={{ '--stagger-index': index } as React.CSSProperties}
                    >
                      <div className="cluster-header">
                        <span
                          className="cluster-status"
                          style={{ background: getStatusColor(cluster.status) }}
                          aria-label={`Status: ${getStatusLabel(cluster.status)}`}
                        >
                          {getStatusLabel(cluster.status)}
                        </span>
                        <span className="thought-count">{cluster.thought_count} Gedanken</span>
                      </div>

                      <div className="cluster-preview">
                        {cluster.thoughts.slice(0, 2).map((thought) => (
                          <p key={thought.id} className="preview-thought">
                            "{thought.raw_input.length > 60
                              ? thought.raw_input.substring(0, 60) + '...'
                              : thought.raw_input}"
                          </p>
                        ))}
                      </div>

                      {/* NEURO-UX: Progress indicator with neuro styling */}
                      <div className="cluster-progress neuro-progress-indicator" role="progressbar" aria-valuenow={Math.round(cluster.maturity_score * 100)} aria-valuemin={0} aria-valuemax={100}>
                        <div
                          className="progress-bar neuro-progress-bar"
                          style={{ width: `${cluster.maturity_score * 100}%` }}
                        />
                        <span className="progress-label">
                          {Math.round(cluster.maturity_score * 100)}% Reife
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
              {/* NEURO-UX: Miller's Law - Show "more" indicator */}
              {hasMoreGrowingClusters && (
                <div className="more-clusters-hint neuro-inspirational">
                  <span aria-hidden="true">↓</span> {growingClusters.length - MILLER_CHUNK_SIZE} weitere Cluster wachsen
                </div>
              )}
            </section>
          )}

          {/* NEURO-UX: Emotional Empty State with personality */}
          {clusters.length === 0 && (
            <div className="empty-state neuro-empty-state neuro-human-fade-in" role="status">
              <span className="empty-icon neuro-empty-icon neuro-breathing" aria-hidden="true">🧠</span>
              <h3 className="neuro-empty-title">{EMPTY_STATE_MESSAGES.ideas.title}</h3>
              <p className="neuro-empty-description">
                Gib oben einen schnellen Gedanken ein. {AI_PERSONALITY.name} findet automatisch
                Muster und gruppiert aehnliche Gedanken zu Themen.
              </p>
              {/* NEURO-UX: Motivational message for encouragement */}
              <p className="neuro-empty-encouragement neuro-inspirational">
                {getMotivationalMessage('firstTime')}
              </p>
            </div>
          )}
        </>
      )}

      {/* NEURO-UX: Inline styles for mood-based cluster styling */}
      <style>{`
        /* Mood-based cluster styling - Neuro-UX Emotional Design */
        .cluster-mood-fresh {
          border-left: 3px solid var(--neuro-success, #10b981);
        }
        .cluster-mood-aging {
          border-left: 3px solid var(--neuro-anticipation, #8b5cf6);
        }
        .cluster-mood-dormant {
          border-left: 3px solid var(--neuro-reward, #ff6b35);
        }

        .dormant-reminder {
          margin: 0.5rem 0 1rem;
          font-size: 0.8rem;
        }

        .thoughts-toggle {
          background: none;
          border: none;
          width: 100%;
          text-align: left;
          cursor: pointer;
          padding: 0;
          color: inherit;
        }

        .thoughts-toggle h4 {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 0 0 0.5rem;
          font-size: 0.85rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .toggle-icon {
          font-size: 0.7rem;
          opacity: 0.7;
          transition: transform var(--neuro-timing-quick, 150ms) ease;
        }

        .thoughts-toggle[aria-expanded="true"] .toggle-icon {
          transform: rotate(0deg);
        }

        .more-clusters-hint {
          text-align: center;
          margin-top: 1.5rem;
          padding: 0.75rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
        }

        .greeting-emoji {
          font-size: 1.2em;
        }

        /* Ensure stagger animation respects index */
        [style*="--stagger-index"] {
          animation-delay: calc(var(--stagger-index, 0) * 60ms);
        }

        /* Reduced motion: instant transitions */
        @media (prefers-reduced-motion: reduce) {
          .cluster-card,
          .stat-card,
          .neuro-stagger-item {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }

          .neuro-breathing,
          .neuro-heartbeat,
          .neuro-pulse-interactive {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
