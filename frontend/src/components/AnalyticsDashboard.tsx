import axios from 'axios';
import { useParallelAsyncData } from '../hooks/useAsyncData';
import { getTimeBasedGreeting } from '../utils/aiPersonality';
import '../neurodesign.css';
import './AnalyticsDashboard.css';

interface AnalyticsDashboardProps {
  context: string;
  onBack: () => void;
}

interface Summary {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  highPriority: number;
}

interface Goals {
  daily: { target: number; current: number; progress: number };
  weekly: { target: number; current: number; progress: number };
}

interface Streaks {
  current: number;
  longest: number;
}

interface ProductivityScore {
  overall: number;
  breakdown: {
    output: { score: number; label: string; description: string };
    consistency: { score: number; label: string; description: string };
    variety: { score: number; label: string; description: string };
    quality: { score: number; label: string; description: string };
  };
  trend: string;
}

interface Patterns {
  peakTimes: {
    hours: { hour: number; label: string; count: number }[];
    days: { day: number; label: string; count: number }[];
  };
  insights: string[];
}

interface Comparison {
  current: { total: number; highPriority: number; activeDays: number };
  changes: { total: number; highPriority: number; activeDays: number };
}

interface HourlyActivity {
  hour: number;
  count: number;
}

interface DashboardData {
  summary: Summary;
  goals: Goals;
  streaks: Streaks;
  activity: { byHour: HourlyActivity[] };
}

export function AnalyticsDashboard({ context, onBack }: AnalyticsDashboardProps) {
  const greeting = getTimeBasedGreeting();

  // Use the new parallel async data hook with automatic AbortController
  const { data, loading, errors } = useParallelAsyncData<[
    { data: DashboardData },
    { data: ProductivityScore },
    { data: Patterns },
    { data: Comparison }
  ]>(
    [
      async (signal) => {
        const res = await axios.get(`/api/${context}/analytics/dashboard`, { signal });
        return res.data;
      },
      async (signal) => {
        const res = await axios.get(`/api/${context}/analytics/productivity-score`, { signal });
        return res.data;
      },
      async (signal) => {
        const res = await axios.get(`/api/${context}/analytics/patterns`, { signal });
        return res.data;
      },
      async (signal) => {
        const res = await axios.get(`/api/${context}/analytics/comparison`, { signal });
        return res.data;
      },
    ],
    [context]
  );

  // Extract data from parallel fetch results
  const summary = data[0]?.data?.summary ?? null;
  const goals = data[0]?.data?.goals ?? null;
  const streaks = data[0]?.data?.streaks ?? null;
  const hourlyActivity = data[0]?.data?.activity?.byHour ?? [];
  const productivityScore = data[1]?.data ?? null;
  const patterns = data[2]?.data ?? null;
  const comparison = data[3]?.data ?? null;

  // Log any errors (optional - for debugging)
  if (errors.some(e => e !== null)) {
    console.error('Failed to load some analytics:', errors.filter(e => e !== null));
  }

  const getScoreColor = (score: number) => {
    if (score >= 70) return '#22c55e';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return '↑';
    if (change < 0) return '↓';
    return '→';
  };

  const getChangeClass = (change: number) => {
    if (change > 0) return 'positive';
    if (change < 0) return 'negative';
    return 'neutral';
  };

  if (loading) {
    return (
      <div className="analytics-dashboard neuro-page-enter">
        <header className="header liquid-glass-nav">
          <button type="button" className="back-button neuro-hover-lift" onClick={onBack}>
            ← Zuruck
          </button>
          <h1>Analytics Dashboard</h1>
        </header>
        <div className="loading-state neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Analysiere deine Produktivitat...</p>
          <p className="neuro-loading-submessage">Muster werden erkannt</p>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard neuro-page-enter">
      <header className="header liquid-glass-nav">
        <div className="header-content">
          <button type="button" className="back-button neuro-hover-lift" onClick={onBack}>
            ← Zuruck
          </button>
          <div className="header-greeting">
            <h1>{greeting.emoji} Analytics Dashboard</h1>
            <span className="greeting-subtext neuro-subtext-emotional">{greeting.subtext}</span>
          </div>
          <span className="context-badge">{context === 'personal' ? 'Personlich' : 'Arbeit'}</span>
        </div>
      </header>

      <main className="dashboard-content">
        {/* Productivity Score */}
        {productivityScore && (
          <section className="score-section liquid-glass neuro-stagger-item">
            <div className="score-circle neuro-breathing" style={{ borderColor: getScoreColor(productivityScore.overall) }}>
              <span className="score-value" style={{ color: getScoreColor(productivityScore.overall) }}>
                {productivityScore.overall}
              </span>
              <span className="score-label">Score</span>
            </div>
            <div className="score-breakdown">
              <h3>Produktivitats-Score</h3>
              <div className="breakdown-items">
                {Object.entries(productivityScore.breakdown).map(([key, data], index) => (
                  <div key={key} className="breakdown-item neuro-stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
                    <div className="breakdown-header">
                      <span className="breakdown-label">{data.label}</span>
                      <span className="breakdown-score" style={{ color: getScoreColor(data.score) }}>
                        {data.score}%
                      </span>
                    </div>
                    <div className="breakdown-bar neuro-progress-indicator">
                      <div
                        className="breakdown-fill"
                        style={{
                          width: `${data.score}%`,
                          backgroundColor: getScoreColor(data.score),
                        }}
                      />
                    </div>
                    <span className="breakdown-desc">{data.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Summary Cards */}
        {summary && (
          <section className="summary-section liquid-glass neuro-stagger-item">
            <h3>Ubersicht</h3>
            <div className="summary-cards neuro-flow-list">
              <div className="summary-card neuro-hover-lift">
                <span className="card-icon">☀️</span>
                <span className="card-value">{summary.today}</span>
                <span className="card-label">Heute</span>
              </div>
              <div className="summary-card neuro-hover-lift">
                <span className="card-icon">📅</span>
                <span className="card-value">{summary.thisWeek}</span>
                <span className="card-label">Diese Woche</span>
              </div>
              <div className="summary-card neuro-hover-lift">
                <span className="card-icon">📊</span>
                <span className="card-value">{summary.thisMonth}</span>
                <span className="card-label">Dieser Monat</span>
              </div>
              <div className="summary-card neuro-hover-lift">
                <span className="card-icon">🎯</span>
                <span className="card-value">{summary.total}</span>
                <span className="card-label">Gesamt</span>
              </div>
              <div className="summary-card highlight neuro-hover-lift">
                <span className="card-icon">🔴</span>
                <span className="card-value">{summary.highPriority}</span>
                <span className="card-label">Hohe Prioritat</span>
              </div>
            </div>
          </section>
        )}

        {/* Goals Progress */}
        {goals && (
          <section className="goals-section liquid-glass neuro-stagger-item">
            <h3>Ziele</h3>
            <div className="goals-grid">
              <div className="goal-card neuro-hover-lift">
                <div className="goal-header">
                  <span>Tagliches Ziel</span>
                  <span className="goal-progress">{goals.daily.current}/{goals.daily.target}</span>
                </div>
                <div className="goal-bar neuro-progress-indicator">
                  <div
                    className={`goal-fill ${goals.daily.progress >= 100 ? 'neuro-success-burst' : ''}`}
                    style={{
                      width: `${Math.min(goals.daily.progress, 100)}%`,
                      backgroundColor: goals.daily.progress >= 100 ? '#22c55e' : '#6366f1',
                    }}
                  />
                </div>
                <span className="goal-percent">{goals.daily.progress}%</span>
              </div>
              <div className="goal-card neuro-hover-lift">
                <div className="goal-header">
                  <span>Wochentliches Ziel</span>
                  <span className="goal-progress">{goals.weekly.current}/{goals.weekly.target}</span>
                </div>
                <div className="goal-bar neuro-progress-indicator">
                  <div
                    className={`goal-fill ${goals.weekly.progress >= 100 ? 'neuro-success-burst' : ''}`}
                    style={{
                      width: `${Math.min(goals.weekly.progress, 100)}%`,
                      backgroundColor: goals.weekly.progress >= 100 ? '#22c55e' : '#6366f1',
                    }}
                  />
                </div>
                <span className="goal-percent">{goals.weekly.progress}%</span>
              </div>
            </div>
          </section>
        )}

        {/* Streaks */}
        {streaks && (
          <section className="streaks-section neuro-stagger-item">
            <div className="streak-card liquid-glass neuro-hover-lift">
              <span className="streak-icon">{streaks.current > 0 ? '🔥' : '💤'}</span>
              <span className="streak-value">{streaks.current}</span>
              <span className="streak-label">Aktuelle Serie (Tage)</span>
            </div>
            <div className="streak-card liquid-glass neuro-hover-lift">
              <span className="streak-icon">🏆</span>
              <span className="streak-value">{streaks.longest}</span>
              <span className="streak-label">Langste Serie (Tage)</span>
            </div>
          </section>
        )}

        {/* Activity Chart */}
        {hourlyActivity.length > 0 && (
          <section className="activity-section liquid-glass neuro-stagger-item">
            <h3>Aktivitat nach Uhrzeit</h3>
            <div className="activity-chart">
              {hourlyActivity.map((item, index) => {
                const maxCount = Math.max(...hourlyActivity.map((h) => h.count), 1);
                const height = (item.count / maxCount) * 100;
                return (
                  <div key={item.hour} className="activity-bar-container neuro-stagger-item" style={{ animationDelay: `${index * 20}ms` }}>
                    <div
                      className="activity-bar neuro-hover-lift"
                      style={{ height: `${height}%` }}
                      title={`${item.hour}:00 - ${item.count} Eintrage`}
                    />
                    {item.hour % 6 === 0 && (
                      <span className="activity-label">{item.hour}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Patterns & Insights */}
        {patterns && (
          <section className="patterns-section liquid-glass neuro-stagger-item">
            <h3>Muster & Insights</h3>
            <div className="patterns-content">
              <div className="peak-times">
                {patterns.peakTimes.hours[0] && (
                  <div className="peak-item neuro-hover-lift neuro-stagger-item">
                    <span className="peak-icon">⏰</span>
                    <div className="peak-info">
                      <span className="peak-label">Produktivste Zeit</span>
                      <span className="peak-value">{patterns.peakTimes.hours[0].label}</span>
                    </div>
                  </div>
                )}
                {patterns.peakTimes.days[0] && (
                  <div className="peak-item neuro-hover-lift neuro-stagger-item">
                    <span className="peak-icon">📅</span>
                    <div className="peak-info">
                      <span className="peak-label">Aktivster Tag</span>
                      <span className="peak-value">{patterns.peakTimes.days[0].label}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="insights-list neuro-flow-list">
                {patterns.insights.slice(0, 7).map((insight, index) => (
                  <div key={index} className="insight-item neuro-stagger-item">
                    <span className="insight-icon">✨</span>
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Comparison */}
        {comparison && (
          <section className="comparison-section liquid-glass neuro-stagger-item">
            <h3>Vergleich zur Vorwoche</h3>
            <div className="comparison-cards neuro-flow-list">
              <div className="comparison-card neuro-hover-lift">
                <span className="comp-label">Gedanken</span>
                <span className="comp-value">{comparison.current.total}</span>
                <span className={`comp-change ${getChangeClass(comparison.changes.total)}`}>
                  {getChangeIcon(comparison.changes.total)} {Math.abs(comparison.changes.total)}%
                </span>
              </div>
              <div className="comparison-card neuro-hover-lift">
                <span className="comp-label">Hohe Prioritat</span>
                <span className="comp-value">{comparison.current.highPriority}</span>
                <span className={`comp-change ${getChangeClass(comparison.changes.highPriority)}`}>
                  {getChangeIcon(comparison.changes.highPriority)} {Math.abs(comparison.changes.highPriority)}%
                </span>
              </div>
              <div className="comparison-card neuro-hover-lift">
                <span className="comp-label">Aktive Tage</span>
                <span className="comp-value">{comparison.current.activeDays}</span>
                <span className={`comp-change ${getChangeClass(comparison.changes.activeDays)}`}>
                  {getChangeIcon(comparison.changes.activeDays)} {Math.abs(comparison.changes.activeDays)}%
                </span>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
