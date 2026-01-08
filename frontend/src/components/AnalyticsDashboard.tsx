import { useState, useEffect } from 'react';
import axios from 'axios';
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

export function AnalyticsDashboard({ context, onBack }: AnalyticsDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [streaks, setStreaks] = useState<Streaks | null>(null);
  const [productivityScore, setProductivityScore] = useState<ProductivityScore | null>(null);
  const [patterns, setPatterns] = useState<Patterns | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [hourlyActivity, setHourlyActivity] = useState<HourlyActivity[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, [context]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [dashboardRes, scoreRes, patternsRes, comparisonRes] = await Promise.all([
        axios.get(`/api/${context}/analytics/dashboard`),
        axios.get(`/api/${context}/analytics/productivity-score`),
        axios.get(`/api/${context}/analytics/patterns`),
        axios.get(`/api/${context}/analytics/comparison`),
      ]);

      setSummary(dashboardRes.data.data.summary);
      setGoals(dashboardRes.data.data.goals);
      setStreaks(dashboardRes.data.data.streaks);
      setHourlyActivity(dashboardRes.data.data.activity.byHour);
      setProductivityScore(scoreRes.data.data);
      setPatterns(patternsRes.data.data);
      setComparison(comparisonRes.data.data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

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
      <div className="analytics-dashboard">
        <header className="header">
          <button type="button" className="back-button" onClick={onBack}>
            ← Zurück
          </button>
          <h1>Analytics Dashboard</h1>
        </header>
        <div className="loading-state">
          <div className="loading-spinner large" />
          <p>Lade Analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard">
      <header className="header">
        <div className="header-content">
          <button type="button" className="back-button" onClick={onBack}>
            ← Zurück
          </button>
          <h1>Analytics Dashboard</h1>
          <span className="context-badge">{context === 'personal' ? 'Persönlich' : 'Arbeit'}</span>
        </div>
      </header>

      <main className="dashboard-content">
        {/* Productivity Score */}
        {productivityScore && (
          <section className="score-section">
            <div className="score-circle" style={{ borderColor: getScoreColor(productivityScore.overall) }}>
              <span className="score-value" style={{ color: getScoreColor(productivityScore.overall) }}>
                {productivityScore.overall}
              </span>
              <span className="score-label">Score</span>
            </div>
            <div className="score-breakdown">
              <h3>Produktivitäts-Score</h3>
              <div className="breakdown-items">
                {Object.entries(productivityScore.breakdown).map(([key, data]) => (
                  <div key={key} className="breakdown-item">
                    <div className="breakdown-header">
                      <span className="breakdown-label">{data.label}</span>
                      <span className="breakdown-score" style={{ color: getScoreColor(data.score) }}>
                        {data.score}%
                      </span>
                    </div>
                    <div className="breakdown-bar">
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
          <section className="summary-section">
            <h3>Übersicht</h3>
            <div className="summary-cards">
              <div className="summary-card">
                <span className="card-icon">☀️</span>
                <span className="card-value">{summary.today}</span>
                <span className="card-label">Heute</span>
              </div>
              <div className="summary-card">
                <span className="card-icon">📅</span>
                <span className="card-value">{summary.thisWeek}</span>
                <span className="card-label">Diese Woche</span>
              </div>
              <div className="summary-card">
                <span className="card-icon">📊</span>
                <span className="card-value">{summary.thisMonth}</span>
                <span className="card-label">Dieser Monat</span>
              </div>
              <div className="summary-card">
                <span className="card-icon">🎯</span>
                <span className="card-value">{summary.total}</span>
                <span className="card-label">Gesamt</span>
              </div>
              <div className="summary-card highlight">
                <span className="card-icon">🔴</span>
                <span className="card-value">{summary.highPriority}</span>
                <span className="card-label">Hohe Priorität</span>
              </div>
            </div>
          </section>
        )}

        {/* Goals Progress */}
        {goals && (
          <section className="goals-section">
            <h3>Ziele</h3>
            <div className="goals-grid">
              <div className="goal-card">
                <div className="goal-header">
                  <span>Tägliches Ziel</span>
                  <span className="goal-progress">{goals.daily.current}/{goals.daily.target}</span>
                </div>
                <div className="goal-bar">
                  <div
                    className="goal-fill"
                    style={{
                      width: `${Math.min(goals.daily.progress, 100)}%`,
                      backgroundColor: goals.daily.progress >= 100 ? '#22c55e' : '#6366f1',
                    }}
                  />
                </div>
                <span className="goal-percent">{goals.daily.progress}%</span>
              </div>
              <div className="goal-card">
                <div className="goal-header">
                  <span>Wöchentliches Ziel</span>
                  <span className="goal-progress">{goals.weekly.current}/{goals.weekly.target}</span>
                </div>
                <div className="goal-bar">
                  <div
                    className="goal-fill"
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
          <section className="streaks-section">
            <div className="streak-card">
              <span className="streak-icon">🔥</span>
              <span className="streak-value">{streaks.current}</span>
              <span className="streak-label">Aktuelle Serie (Tage)</span>
            </div>
            <div className="streak-card">
              <span className="streak-icon">🏆</span>
              <span className="streak-value">{streaks.longest}</span>
              <span className="streak-label">Längste Serie (Tage)</span>
            </div>
          </section>
        )}

        {/* Activity Chart */}
        {hourlyActivity.length > 0 && (
          <section className="activity-section">
            <h3>Aktivität nach Uhrzeit</h3>
            <div className="activity-chart">
              {hourlyActivity.map((item) => {
                const maxCount = Math.max(...hourlyActivity.map((h) => h.count), 1);
                const height = (item.count / maxCount) * 100;
                return (
                  <div key={item.hour} className="activity-bar-container">
                    <div
                      className="activity-bar"
                      style={{ height: `${height}%` }}
                      title={`${item.hour}:00 - ${item.count} Einträge`}
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
          <section className="patterns-section">
            <h3>Muster & Insights</h3>
            <div className="patterns-content">
              <div className="peak-times">
                {patterns.peakTimes.hours[0] && (
                  <div className="peak-item">
                    <span className="peak-icon">⏰</span>
                    <div className="peak-info">
                      <span className="peak-label">Produktivste Zeit</span>
                      <span className="peak-value">{patterns.peakTimes.hours[0].label}</span>
                    </div>
                  </div>
                )}
                {patterns.peakTimes.days[0] && (
                  <div className="peak-item">
                    <span className="peak-icon">📅</span>
                    <div className="peak-info">
                      <span className="peak-label">Aktivster Tag</span>
                      <span className="peak-value">{patterns.peakTimes.days[0].label}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="insights-list">
                {patterns.insights.map((insight, index) => (
                  <div key={index} className="insight-item">
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
          <section className="comparison-section">
            <h3>Vergleich zur Vorwoche</h3>
            <div className="comparison-cards">
              <div className="comparison-card">
                <span className="comp-label">Gedanken</span>
                <span className="comp-value">{comparison.current.total}</span>
                <span className={`comp-change ${getChangeClass(comparison.changes.total)}`}>
                  {getChangeIcon(comparison.changes.total)} {Math.abs(comparison.changes.total)}%
                </span>
              </div>
              <div className="comparison-card">
                <span className="comp-label">Hohe Priorität</span>
                <span className="comp-value">{comparison.current.highPriority}</span>
                <span className={`comp-change ${getChangeClass(comparison.changes.highPriority)}`}>
                  {getChangeIcon(comparison.changes.highPriority)} {Math.abs(comparison.changes.highPriority)}%
                </span>
              </div>
              <div className="comparison-card">
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
