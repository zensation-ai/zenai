import axios from 'axios';
import { useParallelAsyncData } from '../hooks/useAsyncData';
import { getTimeBasedGreeting } from '../utils/aiPersonality';
import '../neurodesign.css';
import './AnalyticsDashboard.css';
import { logError } from '../utils/errors';

interface AnalyticsDashboardProps {
  context: string;
  onBack: () => void;
}

// Backend response types matching real endpoints
interface OverviewResponse {
  success: boolean;
  summary: {
    total: number;
    active: number;
    archived: number;
    lastWeek: number;
    lastMonth: number;
  };
  recentActivity: {
    created: number;
    updated: number;
  };
  distribution: {
    byCategory: Record<string, number>;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
  };
  dailyTrend: { date: string; count: number }[];
}

interface TimelineResponse {
  success: boolean;
  byHour: { hour: number; count: number }[];
  byDayOfWeek: { day: string; dayIndex: number; count: number }[];
  insights: string[];
}

interface EngagementResponse {
  success: boolean;
  avgIdeasPerDay: string;
  currentStreak: number;
  processing: {
    totalProcessed: number;
    avgProcessingTime: string;
  };
}

const CONTEXT_LABELS: Record<string, string> = {
  personal: 'Persönlich',
  work: 'Arbeit',
  learning: 'Lernen',
  creative: 'Kreativ',
};

export function AnalyticsDashboard({ context, onBack }: AnalyticsDashboardProps) {
  const greeting = getTimeBasedGreeting();

  const { data, loading, errors } = useParallelAsyncData<[
    OverviewResponse,
    TimelineResponse,
    EngagementResponse
  ]>(
    [
      async (signal) => {
        const res = await axios.get(`/api/${context}/analytics/overview`, { signal });
        return res.data;
      },
      async (signal) => {
        const res = await axios.get(`/api/${context}/analytics/timeline`, { signal });
        return res.data;
      },
      async (signal) => {
        const res = await axios.get(`/api/${context}/analytics/engagement`, { signal });
        return res.data;
      },
    ],
    [context]
  );

  // Extract from overview
  const overview = data[0];
  const summary = overview ? {
    total: overview.summary?.total ?? 0,
    today: overview.recentActivity?.created ?? 0,
    thisWeek: overview.summary?.lastWeek ?? 0,
    thisMonth: overview.summary?.lastMonth ?? 0,
    highPriority: overview.distribution?.byPriority?.high ?? 0,
  } : null;

  // Extract from timeline
  const timeline = data[1];
  const hourlyActivity = timeline?.byHour ?? [];

  // Derive patterns from timeline
  const patterns = timeline ? (() => {
    const sortedHours = [...(timeline.byHour || [])].sort((a, b) => b.count - a.count);
    const sortedDays = [...(timeline.byDayOfWeek || [])].sort((a, b) => b.count - a.count);
    return {
      peakTimes: {
        hours: sortedHours.length > 0
          ? [{ hour: sortedHours[0].hour, label: `${sortedHours[0].hour}:00 Uhr`, count: sortedHours[0].count }]
          : [],
        days: sortedDays.length > 0
          ? [{ day: sortedDays[0].dayIndex, label: sortedDays[0].day, count: sortedDays[0].count }]
          : [],
      },
      insights: timeline.insights ?? [],
    };
  })() : null;

  // Extract from engagement
  const engagement = data[2];
  const streaks = engagement ? {
    current: engagement.currentStreak ?? 0,
    longest: engagement.currentStreak ?? 0,
  } : null;

  // Derive comparison from overview.dailyTrend (14 days → this week vs last week)
  const comparison = overview?.dailyTrend ? (() => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    let thisWeekCount = 0;
    let lastWeekCount = 0;
    let thisWeekDays = 0;
    let lastWeekDays = 0;

    for (const entry of overview.dailyTrend) {
      const date = new Date(entry.date);
      if (date >= oneWeekAgo) {
        thisWeekCount += entry.count;
        thisWeekDays++;
      } else if (date >= twoWeeksAgo) {
        lastWeekCount += entry.count;
        lastWeekDays++;
      }
    }

    const totalChange = lastWeekCount > 0
      ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
      : thisWeekCount > 0 ? 100 : 0;
    const daysChange = lastWeekDays > 0
      ? Math.round(((thisWeekDays - lastWeekDays) / lastWeekDays) * 100)
      : thisWeekDays > 0 ? 100 : 0;

    return {
      current: { total: thisWeekCount, activeDays: thisWeekDays },
      changes: { total: totalChange, activeDays: daysChange },
    };
  })() : null;

  // Derive productivity score from engagement + summary
  const productivityScore = (engagement && summary) ? (() => {
    const avgPerDay = parseFloat(engagement.avgIdeasPerDay || '0');
    const streakDays = engagement.currentStreak ?? 0;

    const activityScore = Math.min(100, Math.round(avgPerDay * 20));
    const streakScore = Math.min(100, streakDays * 10);
    const consistencyScore = summary.thisMonth > 0
      ? Math.min(100, Math.round((summary.thisWeek / Math.max(1, summary.thisMonth)) * 400))
      : 0;
    const overall = Math.round((activityScore + streakScore + consistencyScore) / 3);

    return {
      overall,
      breakdown: {
        activity: { score: activityScore, label: 'Aktivität', description: `${avgPerDay.toFixed(1)} Gedanken/Tag` },
        consistency: { score: consistencyScore, label: 'Konsistenz', description: `${summary.thisWeek} diese Woche` },
        streak: { score: streakScore, label: 'Serie', description: `${streakDays} Tage in Folge` },
      },
    };
  })() : null;

  if (errors.some(e => e !== null)) {
    logError('AnalyticsDashboard:loadAnalytics', new Error(`Failed to load some analytics: ${errors.filter(e => e !== null).length} errors`));
  }

  const getScoreColor = (score: number) => {
    if (score >= 70) return '#22c55e';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return '\u2191';
    if (change < 0) return '\u2193';
    return '\u2192';
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
          <button type="button" className="back-button neuro-hover-lift" onClick={onBack} aria-label="Zurück zur vorherigen Seite">
            &larr; Zurück
          </button>
          <h1>Analytics Dashboard</h1>
        </header>
        <div className="loading-state neuro-loading-contextual">
          <div className="neuro-loading-spinner" />
          <p className="neuro-loading-message">Analysiere deine Produktivität...</p>
          <p className="neuro-loading-submessage">Muster werden erkannt</p>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard neuro-page-enter">
      <header className="header liquid-glass-nav">
        <div className="header-content">
          <button type="button" className="back-button neuro-hover-lift" onClick={onBack} aria-label="Zurück zur vorherigen Seite">
            &larr; Zurück
          </button>
          <div className="header-greeting">
            <h1>{greeting.emoji} Analytics Dashboard</h1>
            <span className="greeting-subtext neuro-subtext-emotional">{greeting.subtext}</span>
          </div>
          <span className="context-badge">{CONTEXT_LABELS[context] || context}</span>
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
              <h3>Produktivitäts-Score</h3>
              <div className="breakdown-items">
                {Object.entries(productivityScore.breakdown).map(([key, item], index) => (
                  <div key={key} className="breakdown-item neuro-stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
                    <div className="breakdown-header">
                      <span className="breakdown-label">{item.label}</span>
                      <span className="breakdown-score" style={{ color: getScoreColor(item.score) }}>
                        {item.score}%
                      </span>
                    </div>
                    <div className="breakdown-bar neuro-progress-indicator">
                      <div
                        className="breakdown-fill"
                        style={{
                          width: `${item.score}%`,
                          backgroundColor: getScoreColor(item.score),
                        }}
                      />
                    </div>
                    <span className="breakdown-desc">{item.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Summary Cards */}
        {summary && (
          <section className="summary-section liquid-glass neuro-stagger-item">
            <h3>Übersicht</h3>
            <div className="summary-cards neuro-flow-list">
              <div className="summary-card neuro-hover-lift">
                <span className="card-icon">&#9728;&#65039;</span>
                <span className="card-value">{summary.today}</span>
                <span className="card-label">Heute</span>
              </div>
              <div className="summary-card neuro-hover-lift">
                <span className="card-icon">&#128197;</span>
                <span className="card-value">{summary.thisWeek}</span>
                <span className="card-label">Diese Woche</span>
              </div>
              <div className="summary-card neuro-hover-lift">
                <span className="card-icon">&#128200;</span>
                <span className="card-value">{summary.thisMonth}</span>
                <span className="card-label">Dieser Monat</span>
              </div>
              <div className="summary-card neuro-hover-lift">
                <span className="card-icon">&#127919;</span>
                <span className="card-value">{summary.total}</span>
                <span className="card-label">Gesamt</span>
              </div>
              <div className="summary-card highlight neuro-hover-lift">
                <span className="card-icon">&#128308;</span>
                <span className="card-value">{summary.highPriority}</span>
                <span className="card-label">Hohe Priorität</span>
              </div>
            </div>
          </section>
        )}

        {/* Streaks */}
        {streaks && (
          <section className="streaks-section neuro-stagger-item">
            <div className="streak-card liquid-glass neuro-hover-lift">
              <span className="streak-icon">{streaks.current > 0 ? '\uD83D\uDD25' : '\uD83D\uDCA4'}</span>
              <span className="streak-value">{streaks.current}</span>
              <span className="streak-label">Aktuelle Serie (Tage)</span>
            </div>
            <div className="streak-card liquid-glass neuro-hover-lift">
              <span className="streak-icon">{engagement ? '\u26A1' : '\uD83C\uDFC6'}</span>
              <span className="streak-value">{engagement ? parseFloat(engagement.avgIdeasPerDay || '0').toFixed(1) : 0}</span>
              <span className="streak-label">Gedanken pro Tag (Schnitt)</span>
            </div>
          </section>
        )}

        {/* Activity Chart */}
        {hourlyActivity.length > 0 && (
          <section className="activity-section liquid-glass neuro-stagger-item">
            <h3>Aktivität nach Uhrzeit</h3>
            <div className="activity-chart">
              {hourlyActivity.map((item, index) => {
                const maxCount = Math.max(...hourlyActivity.map((h) => h.count), 1);
                const height = (item.count / maxCount) * 100;
                return (
                  <div key={item.hour} className="activity-bar-container neuro-stagger-item" style={{ animationDelay: `${index * 20}ms` }}>
                    <div
                      className="activity-bar neuro-hover-lift"
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
        {patterns && (patterns.peakTimes.hours.length > 0 || patterns.insights.length > 0) && (
          <section className="patterns-section liquid-glass neuro-stagger-item">
            <h3>Muster & Insights</h3>
            <div className="patterns-content">
              <div className="peak-times">
                {patterns.peakTimes.hours[0] && (
                  <div className="peak-item neuro-hover-lift neuro-stagger-item">
                    <span className="peak-icon">&#9200;</span>
                    <div className="peak-info">
                      <span className="peak-label">Produktivste Zeit</span>
                      <span className="peak-value">{patterns.peakTimes.hours[0].label}</span>
                    </div>
                  </div>
                )}
                {patterns.peakTimes.days[0] && (
                  <div className="peak-item neuro-hover-lift neuro-stagger-item">
                    <span className="peak-icon">&#128197;</span>
                    <div className="peak-info">
                      <span className="peak-label">Aktivster Tag</span>
                      <span className="peak-value">{patterns.peakTimes.days[0].label}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="insights-list neuro-flow-list">
                {patterns.insights.slice(0, 7).map((insight, index) => (
                  <div key={`insight-${index}-${insight.slice(0, 30)}`} className="insight-item neuro-stagger-item">
                    <span className="insight-icon">&#10024;</span>
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
