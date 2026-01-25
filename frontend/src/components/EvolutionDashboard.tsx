/**
 * Evolution Dashboard
 * Phase 5: Evolution Dashboard & Mobile
 *
 * Visualizes how the AI learns and improves over time.
 * Shows learning timeline, accuracy trends, context depth, and milestones.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { getTimeBasedGreeting, EMPTY_STATE_MESSAGES } from '../utils/aiPersonality';
import '../neurodesign.css';
import './EvolutionDashboard.css';

interface EvolutionDashboardProps {
  context: 'personal' | 'work';
  onBack: () => void;
}

interface Snapshot {
  date: string;
  accuracy_score: number;
  context_depth: number;
  ideas_count: number;
}

interface LearningEvent {
  id: string;
  event_type: string;
  title: string;
  description?: string;
  impact_score: number;
  icon: string;
  color: string;
  created_at: string;
}

interface Milestone {
  id: string;
  milestone_type: string;
  milestone_level: number;
  title: string;
  icon: string;
  threshold_value: number;
  achieved: boolean;
  achieved_at?: string;
  current_value: number;
  progress_percent: number;
}

interface EvolutionData {
  context_depth_score: number;
  ai_accuracy_score: number;
  learning_timeline: LearningEvent[];
  accuracy_change_7d: number;
  accuracy_change_30d: number;
  snapshots_30d: Snapshot[];
  achieved_milestones: Milestone[];
  upcoming_milestones: Milestone[];
  total_milestones_achieved: number;
  total_time_saved_minutes: number;
  total_automations_executed: number;
  total_patterns_learned: number;
  active_days_streak: number;
  total_days_active: number;
}

interface ContextDepthBreakdown {
  name: string;
  score: number;
  max: number;
  description: string;
}

export function EvolutionDashboard({ context, onBack }: EvolutionDashboardProps) {
  const greeting = getTimeBasedGreeting();
  const [data, setData] = useState<EvolutionData | null>(null);
  const [contextDepth, setContextDepth] = useState<ContextDepthBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'accuracy' | 'milestones'>('overview');

  // AbortController ref to prevent memory leaks on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const [dashboardRes, depthRes] = await Promise.all([
        axios.get(`/api/${context}/evolution`, { signal }),
        axios.get(`/api/${context}/evolution/context-depth`, { signal }),
      ]);

      setData(dashboardRes.data.dashboard);
      setContextDepth(depthRes.data.context_depth.breakdown || []);
      setError(null);
    } catch (err: unknown) {
      // Don't update state if request was aborted
      if (axios.isCancel(err)) return;

      const message = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Laden fehlgeschlagen'
        : 'Laden fehlgeschlagen';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [context]);

  useEffect(() => {
    // Abort any previous request
    abortControllerRef.current?.abort();

    // Create new AbortController
    abortControllerRef.current = new AbortController();
    loadData(abortControllerRef.current.signal);

    // Cleanup: abort on unmount or context change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadData]);

  // Manual reload handler (for retry button)
  const handleReload = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    loadData(abortControllerRef.current.signal);
  }, [loadData]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes} Min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  if (loading) {
    return (
      <div className="evolution-dashboard neuro-page-enter">
        <header className="evolution-header liquid-glass-nav">
          <button type="button" className="back-btn neuro-hover-lift" onClick={onBack} aria-label="Zuruck zur vorherigen Seite">← Zuruck</button>
          <h1>KI-Evolution</h1>
        </header>
        <div className="loading-state neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Lade Evolution-Daten...</p>
          <p className="neuro-loading-submessage">KI-Lernfortschritt wird berechnet</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="evolution-dashboard">
        <header className="evolution-header">
          <button type="button" className="back-btn neuro-hover-lift" onClick={onBack} aria-label="Zuruck zur vorherigen Seite">← Zurück</button>
          <h1>KI-Evolution</h1>
        </header>
        <div className="error-banner">
          <span>{error || 'Keine Daten verfügbar'}</span>
          <button type="button" onClick={handleReload} aria-label="Erneut versuchen">Erneut versuchen</button>
        </div>
      </div>
    );
  }

  return (
    <div className="evolution-dashboard neuro-page-enter">
      <header className="evolution-header liquid-glass-nav">
        <button type="button" className="back-btn neuro-hover-lift" onClick={onBack} aria-label="Zuruck zur vorherigen Seite">← Zuruck</button>
        <div className="header-greeting">
          <h1>{greeting.emoji} KI-Evolution</h1>
          <span className="greeting-subtext neuro-subtext-emotional">{greeting.subtext}</span>
        </div>
        <span className="context-badge">{context === 'work' ? '💼 Work' : '🏠 Personal'}</span>
      </header>

      {/* Hero Stats */}
      <div className="hero-stats liquid-glass neuro-stagger-item">
        <div className="hero-stat context-depth neuro-hover-lift">
          <div className="stat-ring neuro-breathing">
            <svg viewBox="0 0 36 36">
              <path
                className="ring-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="ring-progress"
                strokeDasharray={`${data.context_depth_score}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="stat-value">{Math.round(data.context_depth_score)}</span>
          </div>
          <span className="stat-label">Kontext-Tiefe</span>
          <span className="stat-sublabel">Wie gut kennt mich die KI</span>
        </div>

        <div className="hero-stat accuracy neuro-hover-lift">
          <div className="stat-ring neuro-breathing">
            <svg viewBox="0 0 36 36">
              <path
                className="ring-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="ring-progress accuracy"
                strokeDasharray={`${data.ai_accuracy_score}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="stat-value">{Math.round(data.ai_accuracy_score)}%</span>
          </div>
          <span className="stat-label">KI-Genauigkeit</span>
          <span className={`stat-trend ${data.accuracy_change_7d >= 0 ? 'positive' : 'negative'}`}>
            {data.accuracy_change_7d >= 0 ? '↑' : '↓'} {Math.abs(data.accuracy_change_7d)}% (7 Tage)
          </span>
        </div>

        <div className="hero-stat streak neuro-hover-lift">
          <span className="streak-value">{data.active_days_streak}</span>
          <span className="stat-label">Tage Streak</span>
          <span className="stat-sublabel">{data.total_days_active} Tage aktiv</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
          aria-label="Ubersicht anzeigen"
          aria-current={activeTab === 'overview' ? 'page' : undefined}
        >
          Übersicht
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
          aria-label="Timeline anzeigen"
          aria-current={activeTab === 'timeline' ? 'page' : undefined}
        >
          Timeline ({data.learning_timeline.length})
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'accuracy' ? 'active' : ''}`}
          onClick={() => setActiveTab('accuracy')}
          aria-label="Genauigkeit anzeigen"
          aria-current={activeTab === 'accuracy' ? 'page' : undefined}
        >
          Genauigkeit
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'milestones' ? 'active' : ''}`}
          onClick={() => setActiveTab('milestones')}
          aria-label="Meilensteine anzeigen"
          aria-current={activeTab === 'milestones' ? 'page' : undefined}
        >
          Meilensteine ({data.total_milestones_achieved})
        </button>
      </div>

      {/* Content */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-section">
            {/* Context Depth Breakdown */}
            <div className="card context-depth-card liquid-glass neuro-stagger-item">
              <h3>Kontext-Tiefe Aufschlusselung</h3>
              <div className="depth-bars neuro-flow-list">
                {contextDepth.slice(0, 7).map((item, index) => (
                  <div key={item.name} className="depth-bar-item neuro-stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
                    <div className="bar-header">
                      <span className="bar-label">{item.name}</span>
                      <span className="bar-value">{Math.round(item.score)} / {item.max}</span>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${(item.score / item.max) * 100}%` }}
                      />
                    </div>
                    <span className="bar-description">{item.description}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Impact Metrics */}
            <div className="card impact-card liquid-glass neuro-stagger-item">
              <h3>Impact</h3>
              <div className="impact-grid neuro-flow-list">
                <div className="impact-item neuro-hover-lift">
                  <span className="impact-icon">⏱️</span>
                  <span className="impact-value">{formatMinutes(data.total_time_saved_minutes)}</span>
                  <span className="impact-label">Zeit gespart</span>
                </div>
                <div className="impact-item neuro-hover-lift">
                  <span className="impact-icon">⚡</span>
                  <span className="impact-value">{data.total_automations_executed}</span>
                  <span className="impact-label">Automationen</span>
                </div>
                <div className="impact-item neuro-hover-lift">
                  <span className="impact-icon">🧠</span>
                  <span className="impact-value">{data.total_patterns_learned}</span>
                  <span className="impact-label">Muster gelernt</span>
                </div>
                <div className="impact-item neuro-hover-lift">
                  <span className="impact-icon">🏆</span>
                  <span className="impact-value">{data.total_milestones_achieved}</span>
                  <span className="impact-label">Meilensteine</span>
                </div>
              </div>
            </div>

            {/* Upcoming Milestones */}
            {data.upcoming_milestones.length > 0 && (
              <div className="card upcoming-card liquid-glass neuro-stagger-item">
                <h3>Nächste Meilensteine</h3>
                <div className="upcoming-list">
                  {data.upcoming_milestones.slice(0, 3).map((milestone) => (
                    <div key={milestone.id} className="upcoming-item">
                      <span className="milestone-icon">{milestone.icon}</span>
                      <div className="milestone-info">
                        <span className="milestone-title">{milestone.title}</span>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: `${milestone.progress_percent}%` }}
                          />
                        </div>
                        <span className="progress-text">
                          {milestone.current_value} / {milestone.threshold_value} ({Math.round(milestone.progress_percent)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="timeline-section">
            <p className="timeline-intro">
              Wichtige Momente in der Lernreise deiner KI
            </p>

            {data.learning_timeline.length === 0 ? (
              <div className="empty-state neuro-empty-state">
                <span className="neuro-empty-icon">📚</span>
                <h3 className="neuro-empty-title">{EMPTY_STATE_MESSAGES.learning.title}</h3>
                <p className="neuro-empty-description">Nutze die App aktiv und gib Feedback - dann lernt die KI!</p>
                <p className="neuro-empty-encouragement">{EMPTY_STATE_MESSAGES.learning.encouragement}</p>
              </div>
            ) : (
              <div className="timeline neuro-flow-list">
                {data.learning_timeline.slice(0, 7).map((event, index) => (
                  <div key={event.id} className={`timeline-item neuro-stagger-item ${event.color}`} style={{ animationDelay: `${index * 80}ms` }}>
                    <div className="timeline-marker">
                      <span className="event-icon">{event.icon}</span>
                    </div>
                    <div className="timeline-content">
                      <div className="event-header">
                        <span className="event-title">{event.title}</span>
                        <span className="event-date">
                          {formatDate(event.created_at)} • {formatTime(event.created_at)}
                        </span>
                      </div>
                      {event.description && (
                        <p className="event-description">{event.description}</p>
                      )}
                      <div className="event-meta">
                        <span className={`event-type ${event.event_type}`}>
                          {formatEventType(event.event_type)}
                        </span>
                        <span className="impact-badge" title="Impact Score">
                          Impact: {Math.round(event.impact_score * 100)}%
                        </span>
                      </div>
                    </div>
                    {index < data.learning_timeline.length - 1 && (
                      <div className="timeline-connector" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'accuracy' && (
          <div className="accuracy-section">
            <div className="card accuracy-overview liquid-glass neuro-stagger-item">
              <h3>Genauigkeits-Entwicklung</h3>
              <div className="accuracy-stats">
                <div className="accuracy-stat">
                  <span className="big-value">{Math.round(data.ai_accuracy_score)}%</span>
                  <span className="label">Aktuelle Genauigkeit</span>
                </div>
                <div className="accuracy-stat">
                  <span className={`trend-value ${data.accuracy_change_7d >= 0 ? 'positive' : 'negative'}`}>
                    {data.accuracy_change_7d >= 0 ? '+' : ''}{data.accuracy_change_7d}%
                  </span>
                  <span className="label">7-Tage Trend</span>
                </div>
                <div className="accuracy-stat">
                  <span className={`trend-value ${data.accuracy_change_30d >= 0 ? 'positive' : 'negative'}`}>
                    {data.accuracy_change_30d >= 0 ? '+' : ''}{data.accuracy_change_30d}%
                  </span>
                  <span className="label">30-Tage Trend</span>
                </div>
              </div>
            </div>

            {data.snapshots_30d.length > 0 && (
              <div className="card chart-card liquid-glass neuro-stagger-item">
                <h3>Verlauf (30 Tage)</h3>
                <div className="simple-chart">
                  {data.snapshots_30d.map((snapshot, index) => (
                    <div
                      key={snapshot.date}
                      className="chart-bar"
                      style={{ height: `${snapshot.accuracy_score}%` }}
                      title={`${formatDate(snapshot.date)}: ${Math.round(snapshot.accuracy_score)}%`}
                    >
                      {index === data.snapshots_30d.length - 1 && (
                        <span className="bar-label">{Math.round(snapshot.accuracy_score)}%</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="chart-legend">
                  <span>Älteste</span>
                  <span>Heute</span>
                </div>
              </div>
            )}

            <div className="card tips-card liquid-glass neuro-stagger-item">
              <h3>Genauigkeit verbessern</h3>
              <ul className="tips-list">
                <li>
                  <span className="tip-icon">✏️</span>
                  <span>Korrigiere falsche Kategorisierungen - die KI lernt aus jedem Feedback</span>
                </li>
                <li>
                  <span className="tip-icon">📝</span>
                  <span>Fülle dein Business-Profil vollständig aus</span>
                </li>
                <li>
                  <span className="tip-icon">🔄</span>
                  <span>Nutze die App regelmäßig - Muster werden erkannt</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'milestones' && (
          <div className="milestones-section">
            {/* Achieved Milestones */}
            {data.achieved_milestones.length > 0 && (
              <div className="card achieved-card liquid-glass neuro-stagger-item">
                <h3>Erreichte Meilensteine ({data.achieved_milestones.length})</h3>
                <div className="milestones-grid neuro-flow-list">
                  {data.achieved_milestones.slice(0, 7).map((milestone, index) => (
                    <div key={milestone.id} className="milestone-badge achieved neuro-hover-lift neuro-stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
                      <span className="badge-icon">{milestone.icon}</span>
                      <span className="badge-title">{milestone.title}</span>
                      {milestone.achieved_at && (
                        <span className="badge-date">{formatDate(milestone.achieved_at)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* In Progress */}
            {data.upcoming_milestones.length > 0 && (
              <div className="card progress-card liquid-glass neuro-stagger-item">
                <h3>In Arbeit</h3>
                <div className="progress-list">
                  {data.upcoming_milestones.map((milestone) => (
                    <div key={milestone.id} className="progress-item">
                      <span className="progress-icon">{milestone.icon}</span>
                      <div className="progress-details">
                        <span className="progress-title">{milestone.title}</span>
                        <div className="progress-bar-container">
                          <div className="progress-bar">
                            <div
                              className="progress-fill"
                              style={{ width: `${milestone.progress_percent}%` }}
                            />
                          </div>
                          <span className="progress-percent">{Math.round(milestone.progress_percent)}%</span>
                        </div>
                        <span className="progress-values">
                          {milestone.current_value} von {milestone.threshold_value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.achieved_milestones.length === 0 && data.upcoming_milestones.length === 0 && (
              <div className="empty-state neuro-empty-state">
                <span className="neuro-empty-icon">🏆</span>
                <h3 className="neuro-empty-title">Starte deine Meilenstein-Reise!</h3>
                <p className="neuro-empty-description">Erfasse Ideen, gib Feedback und nutze Automationen.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatEventType(type: string): string {
  const labels: Record<string, string> = {
    pattern_learned: 'Muster gelernt',
    preference_updated: 'Präferenz aktualisiert',
    accuracy_improved: 'Genauigkeit verbessert',
    milestone_reached: 'Meilenstein erreicht',
    automation_created: 'Automation erstellt',
    automation_suggested: 'Automation vorgeschlagen',
    cluster_discovered: 'Cluster entdeckt',
    topic_recognized: 'Thema erkannt',
    behavior_adapted: 'Verhalten angepasst',
    profile_enriched: 'Profil erweitert',
    integration_connected: 'Integration verbunden',
    weekly_summary: 'Wochenzusammenfassung',
  };
  return labels[type] || type;
}
