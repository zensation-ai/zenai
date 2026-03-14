/**
 * SleepInsights - KI-Nacht Tab
 *
 * Phase 69.2: Sleep Compute Insights Dashboard
 * Shows sleep cycle timeline, discovery cards, contradiction alerts,
 * and stats from background memory processing.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { AIContext } from '../ContextSwitcher';
import './SleepInsights.css';

interface SleepCycle {
  id: string;
  cycle_type: string;
  processed_items: number;
  insights_generated: number;
  contradictions_resolved: number;
  memory_updates: number;
  duration_ms: number;
  created_at: string;
}

interface Discovery {
  id: string;
  type: string;
  description: string;
  confidence: number;
  created_at: string;
}

interface Contradiction {
  id: string;
  content: string;
  confidence: number;
  decay_class: string;
  updated_at: string;
}

interface SleepSummary {
  cycle_count: string;
  total_consolidations: string;
  total_discoveries: string;
  total_optimizations: string;
  total_contradictions: string;
  avg_duration_ms: string;
}

interface SleepData {
  summary: SleepSummary;
  cycles: SleepCycle[];
  discoveries: Discovery[];
  contradictions: Contradiction[];
}

interface SleepInsightsProps {
  context: AIContext;
}

export function SleepInsights({ context }: SleepInsightsProps) {
  const [data, setData] = useState<SleepData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissedContradictions, setDismissedContradictions] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/${context}/sleep-compute/discoveries`);
      if (res.data.success) {
        setData(res.data.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Daten');
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDismissContradiction = (id: string) => {
    setDismissedContradictions(prev => new Set(prev).add(id));
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (dateStr: string): string => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'vor wenigen Minuten';
    if (hours < 24) return `vor ${hours}h`;
    const days = Math.floor(hours / 24);
    return `vor ${days}d`;
  };

  if (loading) {
    return (
      <div className="sleep-insights">
        <div className="sleep-insights-loading">
          <div className="sleep-insights-spinner" />
          <span>Lade Nacht-Erkenntnisse...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sleep-insights">
        <div className="sleep-insights-error">
          <span>Fehler: {error}</span>
          <button type="button" onClick={fetchData} className="sleep-insights-retry">
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, cycles, discoveries, contradictions } = data;
  const activeContradictions = contradictions.filter(c => !dismissedContradictions.has(c.id));

  return (
    <div className="sleep-insights">
      {/* Stats Overview */}
      <div className="sleep-stats-grid">
        <div className="sleep-stat-card">
          <div className="sleep-stat-value">{parseInt(summary.cycle_count || '0', 10)}</div>
          <div className="sleep-stat-label">Zyklen (7 Tage)</div>
        </div>
        <div className="sleep-stat-card">
          <div className="sleep-stat-value">{parseInt(summary.total_consolidations || '0', 10)}</div>
          <div className="sleep-stat-label">Episoden konsolidiert</div>
        </div>
        <div className="sleep-stat-card">
          <div className="sleep-stat-value">{parseInt(summary.total_discoveries || '0', 10)}</div>
          <div className="sleep-stat-label">Neue Erkenntnisse</div>
        </div>
        <div className="sleep-stat-card">
          <div className="sleep-stat-value">{parseInt(summary.total_optimizations || '0', 10)}</div>
          <div className="sleep-stat-label">Optimierungen</div>
        </div>
        <div className="sleep-stat-card">
          <div className="sleep-stat-value">{parseInt(summary.total_contradictions || '0', 10)}</div>
          <div className="sleep-stat-label">Konflikte geloest</div>
        </div>
        <div className="sleep-stat-card">
          <div className="sleep-stat-value">{formatDuration(parseInt(summary.avg_duration_ms || '0', 10))}</div>
          <div className="sleep-stat-label">Avg. Dauer</div>
        </div>
      </div>

      {/* Contradiction Alerts */}
      {activeContradictions.length > 0 && (
        <div className="sleep-section">
          <h3 className="sleep-section-title">Offene Konflikte</h3>
          <div className="sleep-contradictions">
            {activeContradictions.map(c => (
              <div key={c.id} className="sleep-contradiction-card">
                <div className="sleep-contradiction-content">
                  <span className="sleep-contradiction-icon" aria-hidden="true">!</span>
                  <div className="sleep-contradiction-text">
                    <p>{c.content}</p>
                    <span className="sleep-contradiction-meta">
                      Konfidenz: {(c.confidence * 100).toFixed(0)}% | {formatRelativeTime(c.updated_at)}
                    </span>
                  </div>
                </div>
                <div className="sleep-contradiction-actions">
                  <button
                    type="button"
                    className="sleep-btn sleep-btn-secondary"
                    onClick={() => handleDismissContradiction(c.id)}
                  >
                    Ignorieren
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discoveries */}
      {discoveries.length > 0 && (
        <div className="sleep-section">
          <h3 className="sleep-section-title">Entdeckungen</h3>
          <div className="sleep-discoveries">
            {discoveries.map(d => (
              <div key={d.id} className="sleep-discovery-card">
                <div className="sleep-discovery-header">
                  <span className={`sleep-discovery-type sleep-type-${d.type}`}>{d.type}</span>
                  <span className="sleep-discovery-confidence">
                    {(d.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="sleep-discovery-text">{d.description}</p>
                <span className="sleep-discovery-date">{formatRelativeTime(d.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="sleep-section">
        <h3 className="sleep-section-title">Zyklus-Timeline</h3>
        {cycles.length === 0 ? (
          <div className="sleep-empty">
            <span>Noch keine Schlaf-Zyklen aufgezeichnet.</span>
            <span className="sleep-empty-sub">
              Die KI verarbeitet Erinnerungen automatisch im Hintergrund.
            </span>
          </div>
        ) : (
          <div className="sleep-timeline">
            {cycles.map((cycle, idx) => (
              <div key={cycle.id} className="sleep-timeline-item">
                <div className="sleep-timeline-dot-wrapper">
                  <div className={`sleep-timeline-dot ${idx === 0 ? 'latest' : ''}`} />
                  {idx < cycles.length - 1 && <div className="sleep-timeline-line" />}
                </div>
                <div className="sleep-timeline-content">
                  <div className="sleep-timeline-header">
                    <span className="sleep-timeline-date">{formatDate(cycle.created_at)}</span>
                    <span className="sleep-timeline-duration">{formatDuration(cycle.duration_ms)}</span>
                  </div>
                  <div className="sleep-timeline-metrics">
                    <span title="Verarbeitete Episoden">{cycle.processed_items} verarbeitet</span>
                    <span title="Neue Erkenntnisse">{cycle.insights_generated} Erkenntnisse</span>
                    <span title="Konflikte geloest">{cycle.contradictions_resolved} Konflikte</span>
                    <span title="Memory Updates">{cycle.memory_updates} Updates</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SleepInsights;
