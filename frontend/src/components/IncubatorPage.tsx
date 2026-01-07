/**
 * Thought Incubator Page
 *
 * Displays loose thoughts that are incubating into structured ideas.
 * Shows clusters of related thoughts and allows consolidation.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './IncubatorPage.css';

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

export function IncubatorPage({ onBack, onIdeaCreated }: Props) {
  const [clusters, setClusters] = useState<ThoughtCluster[]>([]);
  const [stats, setStats] = useState<IncubatorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickThought, setQuickThought] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [summarizing, setSummarizing] = useState<string | null>(null);
  const [consolidating, setConsolidating] = useState<string | null>(null);

  // Refs for cleanup to prevent memory leaks
  const isMountedRef = useRef<boolean>(true);
  const timeoutRef = useRef<number | null>(null);

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
    };
  }, [loadData]);

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
        // Reload after short delay to allow processing - with cleanup
        timeoutRef.current = window.setTimeout(() => {
          if (isMountedRef.current) {
            loadData();
          }
        }, 500);
      }
    } catch (error) {
      console.error('Failed to submit thought:', error);
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
      setClusters(clusters.map(c =>
        c.id === clusterId
          ? { ...c, title: response.data.title, summary: response.data.summary,
              suggested_type: response.data.suggested_type, suggested_category: response.data.suggested_category }
          : c
      ));
    } catch (error) {
      console.error('Failed to generate summary:', error);
    } finally {
      setSummarizing(null);
    }
  };

  const consolidateCluster = async (clusterId: string) => {
    setConsolidating(clusterId);
    try {
      const response = await axios.post(`/api/incubator/clusters/${clusterId}/consolidate`);
      // Remove from list and refresh
      loadData();
      if (onIdeaCreated) {
        onIdeaCreated(response.data.ideaId);
      }
    } catch (error) {
      console.error('Failed to consolidate cluster:', error);
    } finally {
      setConsolidating(null);
    }
  };

  const dismissCluster = async (clusterId: string) => {
    try {
      await axios.post(`/api/incubator/clusters/${clusterId}/dismiss`);
      loadData();
    } catch (error) {
      console.error('Failed to dismiss cluster:', error);
    }
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

  return (
    <div className="incubator-page">
      <header className="incubator-header">
        <button className="back-button" onClick={onBack}>
          &larr; Zurück
        </button>
        <div className="header-title">
          <h1>Gedanken-Inkubator</h1>
          <span className="subtitle">Lose Gedanken, die zu Ideen reifen</span>
        </div>
        <button className="refresh-button" onClick={loadData}>
          ↻ Aktualisieren
        </button>
      </header>

      {/* Quick Input */}
      <section className="quick-input-section">
        <div className="quick-input-card">
          <h2>Schneller Gedanke</h2>
          <p className="hint">Keine Struktur nötig - einfach reinbrabbeln!</p>
          <div className="quick-input-container">
            <textarea
              placeholder="Was geht dir durch den Kopf..."
              value={quickThought}
              onChange={(e) => setQuickThought(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) {
                  submitQuickThought();
                }
              }}
              disabled={submitting}
              rows={2}
            />
            <button
              className="submit-thought-button"
              onClick={submitQuickThought}
              disabled={submitting || !quickThought.trim()}
            >
              {submitting ? '...' : 'Inkubieren'}
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      {stats && (
        <section className="incubator-stats">
          <div className="stat-card">
            <span className="stat-value">{stats.total_thoughts}</span>
            <span className="stat-label">Gedanken</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.growing_clusters}</span>
            <span className="stat-label">Wachsend</span>
          </div>
          <div className="stat-card highlight">
            <span className="stat-value">{stats.ready_clusters}</span>
            <span className="stat-label">Bereit</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.consolidated_clusters}</span>
            <span className="stat-label">Konsolidiert</span>
          </div>
        </section>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner large" />
          <p>Lade Inkubator...</p>
        </div>
      ) : (
        <>
          {/* Ready Clusters */}
          {readyClusters.length > 0 && (
            <section className="clusters-section ready-section">
              <h2>
                <span className="section-icon">✨</span>
                Bereit zur Konsolidierung
                <span className="badge">{readyClusters.length}</span>
              </h2>
              <div className="clusters-grid">
                {readyClusters.map((cluster) => (
                  <div key={cluster.id} className="cluster-card ready">
                    <div className="cluster-header">
                      <span className="cluster-status" style={{ background: getStatusColor(cluster.status) }}>
                        {getStatusLabel(cluster.status)}
                      </span>
                      <span className="thought-count">{cluster.thought_count} Gedanken</span>
                    </div>

                    {cluster.title ? (
                      <div className="cluster-content">
                        <h3>
                          <span className="type-icon">{getTypeIcon(cluster.suggested_type)}</span>
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
                          className="summarize-button"
                          onClick={() => generateSummary(cluster.id)}
                          disabled={summarizing === cluster.id}
                        >
                          {summarizing === cluster.id ? 'Analysiere...' : 'Zusammenfassen'}
                        </button>
                      </div>
                    )}

                    <div className="cluster-thoughts">
                      <h4>Enthaltene Gedanken:</h4>
                      <ul>
                        {cluster.thoughts.slice(0, 3).map((thought) => (
                          <li key={thought.id}>
                            <span className="thought-text">{thought.raw_input}</span>
                            <span className="thought-date">{formatDate(thought.created_at)}</span>
                          </li>
                        ))}
                        {cluster.thoughts.length > 3 && (
                          <li className="more">+{cluster.thoughts.length - 3} weitere</li>
                        )}
                      </ul>
                    </div>

                    <div className="cluster-actions">
                      <button
                        className="consolidate-button"
                        onClick={() => consolidateCluster(cluster.id)}
                        disabled={consolidating === cluster.id || !cluster.title}
                      >
                        {consolidating === cluster.id ? 'Konsolidiere...' : 'Zur Idee machen'}
                      </button>
                      <button
                        className="dismiss-button"
                        onClick={() => dismissCluster(cluster.id)}
                      >
                        Verwerfen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Growing Clusters */}
          {growingClusters.length > 0 && (
            <section className="clusters-section growing-section">
              <h2>
                <span className="section-icon">🌱</span>
                Wachsende Themen
                <span className="badge muted">{growingClusters.length}</span>
              </h2>
              <div className="clusters-grid compact">
                {growingClusters.map((cluster) => (
                  <div key={cluster.id} className="cluster-card growing">
                    <div className="cluster-header">
                      <span className="cluster-status" style={{ background: getStatusColor(cluster.status) }}>
                        {getStatusLabel(cluster.status)}
                      </span>
                      <span className="thought-count">{cluster.thought_count} Gedanken</span>
                    </div>

                    <div className="cluster-preview">
                      {cluster.thoughts.slice(0, 2).map((thought) => (
                        <p key={thought.id} className="preview-thought">
                          "{thought.raw_input.substring(0, 60)}..."
                        </p>
                      ))}
                    </div>

                    <div className="cluster-progress">
                      <div
                        className="progress-bar"
                        style={{ width: `${cluster.maturity_score * 100}%` }}
                      />
                      <span className="progress-label">
                        {Math.round(cluster.maturity_score * 100)}% Reife
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {clusters.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">🧠</span>
              <h3>Der Inkubator ist leer</h3>
              <p>
                Gib oben einen schnellen Gedanken ein. Das System findet automatisch
                Muster und gruppiert ähnliche Gedanken zu Themen.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
