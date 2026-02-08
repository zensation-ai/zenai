/**
 * ProductivityDashboard - ROI-focused productivity analytics
 *
 * Visualizes concrete value metrics:
 * - Time saved counter (hours this week/month)
 * - Activity heatmap (weekday x hour, SVG)
 * - Knowledge growth (ideas, connections, topics)
 * - Streak tracker
 * - Weekly report card
 *
 * @module components/ProductivityDashboard
 */

import React, { useMemo, memo } from 'react';
import axios from 'axios';
import { AIContext } from './ContextSwitcher';
import { useAsyncData } from '../hooks/useAsyncData';
import { SkeletonLoader } from './SkeletonLoader';
import { logError } from '../utils/errors';
import '../neurodesign.css';
import './ProductivityDashboard.css';

// ===========================================
// Types (mirror backend types)
// ===========================================

interface TimeSavedMetrics {
  weeklyHoursSaved: number;
  monthlyHoursSaved: number;
  breakdown: {
    draftsAccepted: { count: number; hoursSaved: number };
    aiSearches: { count: number; hoursSaved: number };
    autoCategories: { count: number; hoursSaved: number };
    voiceMemos: { count: number; hoursSaved: number };
  };
}

interface ActivityHeatmap {
  grid: number[][];
  peak: { day: number; hour: number; count: number };
  dayLabels: string[];
  totalDataPoints: number;
}

interface KnowledgeGrowth {
  totalIdeas: number;
  totalConnections: number;
  totalTopics: number;
  ideasLast30Days: number;
  connectionsLast30Days: number;
  weeklyGrowthRate: number;
}

interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  activeToday: boolean;
}

interface WeeklyReportCard {
  period: { start: string; end: string };
  ideasCreated: number;
  chatMessages: number;
  topTopics: string[];
  trend: 'improving' | 'stable' | 'declining';
  trendPercentage: number;
  insight: string;
}

interface DashboardData {
  timeSaved: TimeSavedMetrics;
  heatmap: ActivityHeatmap;
  knowledgeGrowth: KnowledgeGrowth;
  streak: StreakInfo;
  weeklyReport: WeeklyReportCard;
}

interface ProductivityDashboardProps {
  context: AIContext;
  onBack: () => void;
}

// ===========================================
// Sub-Components
// ===========================================

const TimeSavedCard: React.FC<{ data: TimeSavedMetrics }> = ({ data }) => {
  const items = [
    { label: 'Entwürfe', count: data.breakdown.draftsAccepted.count, hours: data.breakdown.draftsAccepted.hoursSaved },
    { label: 'AI-Suchen', count: data.breakdown.aiSearches.count, hours: data.breakdown.aiSearches.hoursSaved },
    { label: 'Auto-Kategorien', count: data.breakdown.autoCategories.count, hours: data.breakdown.autoCategories.hoursSaved },
    { label: 'Sprachnotizen', count: data.breakdown.voiceMemos.count, hours: data.breakdown.voiceMemos.hoursSaved },
  ];

  return (
    <div className="prod-card prod-time-saved">
      <div className="prod-card-header">
        <h3 className="prod-card-title">Zeitersparnis</h3>
      </div>
      <div className="prod-time-saved-hero">
        <div className="prod-time-big">
          <span className="prod-time-value">{data.weeklyHoursSaved}</span>
          <span className="prod-time-unit">Std.</span>
        </div>
        <span className="prod-time-label">diese Woche gespart</span>
      </div>
      <div className="prod-time-monthly">
        ~{data.monthlyHoursSaved} Std. diesen Monat
      </div>
      <div className="prod-breakdown">
        {items.map((item) => (
          <div key={item.label} className="prod-breakdown-item">
            <span className="prod-breakdown-label">{item.label}</span>
            <span className="prod-breakdown-count">{item.count}x</span>
            <span className="prod-breakdown-hours">{item.hours}h</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const HeatmapCard: React.FC<{ data: ActivityHeatmap }> = ({ data }) => {
  const { colorForCount } = useMemo(() => {
    let max = 0;
    for (const row of data.grid) {
      for (const val of row) {
        if (val > max) max = val;
      }
    }
    const colorFn = (count: number): string => {
      if (count === 0) return 'var(--heatmap-empty, rgba(255,255,255,0.04))';
      const intensity = max > 0 ? count / max : 0;
      if (intensity < 0.25) return 'var(--heatmap-low, rgba(99, 102, 241, 0.2))';
      if (intensity < 0.5) return 'var(--heatmap-mid, rgba(99, 102, 241, 0.4))';
      if (intensity < 0.75) return 'var(--heatmap-high, rgba(99, 102, 241, 0.65))';
      return 'var(--heatmap-max, rgba(99, 102, 241, 0.9))';
    };
    return { maxCount: max, colorForCount: colorFn };
  }, [data.grid]);

  // Show hours 6-23 (waking hours) for a cleaner view
  const hourStart = 6;
  const hourEnd = 23;
  const cellSize = 16;
  const cellGap = 2;
  const labelWidth = 28;
  const topLabelHeight = 20;

  const svgWidth = labelWidth + (hourEnd - hourStart + 1) * (cellSize + cellGap);
  const svgHeight = topLabelHeight + 7 * (cellSize + cellGap);

  const peakLabel = data.peak.count > 0
    ? `${data.dayLabels[data.peak.day]} ${data.peak.hour}:00 Uhr (${data.peak.count})`
    : 'Noch keine Daten';

  return (
    <div className="prod-card prod-heatmap">
      <div className="prod-card-header">
        <h3 className="prod-card-title">Aktivität</h3>
        <span className="prod-card-subtitle">{data.totalDataPoints} Einträge (90 Tage)</span>
      </div>
      <div className="prod-heatmap-container">
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="prod-heatmap-svg"
          role="img"
          aria-label={`Aktivitäts-Heatmap. Peak: ${peakLabel}`}
        >
          {/* Hour labels */}
          {Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => i + hourStart)
            .filter((h) => h % 3 === 0)
            .map((hour) => (
              <text
                key={`h-${hour}`}
                x={labelWidth + (hour - hourStart) * (cellSize + cellGap) + cellSize / 2}
                y={14}
                textAnchor="middle"
                className="prod-heatmap-label"
              >
                {hour}
              </text>
            ))}
          {/* Day rows */}
          {data.dayLabels.map((dayLabel, dayIdx) => (
            <g key={dayLabel}>
              <text
                x={0}
                y={topLabelHeight + dayIdx * (cellSize + cellGap) + cellSize / 2 + 4}
                className="prod-heatmap-label"
              >
                {dayLabel}
              </text>
              {Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => i + hourStart).map((hour) => (
                <rect
                  key={`${dayIdx}-${hour}`}
                  x={labelWidth + (hour - hourStart) * (cellSize + cellGap)}
                  y={topLabelHeight + dayIdx * (cellSize + cellGap)}
                  width={cellSize}
                  height={cellSize}
                  rx={3}
                  fill={colorForCount(data.grid[dayIdx]?.[hour] ?? 0)}
                >
                  <title>{`${dayLabel} ${hour}:00 - ${data.grid[dayIdx]?.[hour] ?? 0} Einträge`}</title>
                </rect>
              ))}
            </g>
          ))}
        </svg>
      </div>
      {data.peak.count > 0 && (
        <div className="prod-heatmap-peak">
          Produktivste Zeit: {peakLabel}
        </div>
      )}
      {/* Legend */}
      <div className="prod-heatmap-legend">
        <span>Weniger</span>
        <span className="prod-heatmap-legend-cell" style={{ background: 'var(--heatmap-empty, rgba(255,255,255,0.04))' }} />
        <span className="prod-heatmap-legend-cell" style={{ background: 'var(--heatmap-low, rgba(99, 102, 241, 0.2))' }} />
        <span className="prod-heatmap-legend-cell" style={{ background: 'var(--heatmap-mid, rgba(99, 102, 241, 0.4))' }} />
        <span className="prod-heatmap-legend-cell" style={{ background: 'var(--heatmap-high, rgba(99, 102, 241, 0.65))' }} />
        <span className="prod-heatmap-legend-cell" style={{ background: 'var(--heatmap-max, rgba(99, 102, 241, 0.9))' }} />
        <span>Mehr</span>
      </div>
    </div>
  );
};

const KnowledgeGrowthCard: React.FC<{ data: KnowledgeGrowth }> = ({ data }) => {
  const stats = [
    { label: 'Ideen', value: data.totalIdeas, growth: data.ideasLast30Days, unit: 'letzte 30 Tage' },
    { label: 'Verbindungen', value: data.totalConnections, growth: data.connectionsLast30Days, unit: 'letzte 30 Tage' },
    { label: 'Themen', value: data.totalTopics, growth: null, unit: '' },
  ];

  return (
    <div className="prod-card prod-knowledge">
      <div className="prod-card-header">
        <h3 className="prod-card-title">Wissenswachstum</h3>
        <span className="prod-card-subtitle">{data.weeklyGrowthRate}/Woche</span>
      </div>
      <div className="prod-knowledge-stats">
        {stats.map((stat) => (
          <div key={stat.label} className="prod-knowledge-stat">
            <span className="prod-knowledge-value">{stat.value}</span>
            <span className="prod-knowledge-label">{stat.label}</span>
            {stat.growth !== null && stat.growth > 0 && (
              <span className="prod-knowledge-growth">+{stat.growth} {stat.unit}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const StreakCard: React.FC<{ data: StreakInfo }> = ({ data }) => {
  return (
    <div className="prod-card prod-streak">
      <div className="prod-card-header">
        <h3 className="prod-card-title">Streak</h3>
        {data.activeToday && <span className="prod-streak-badge">Heute aktiv</span>}
      </div>
      <div className="prod-streak-display">
        <div className="prod-streak-current">
          <span className="prod-streak-number">{data.currentStreak}</span>
          <span className="prod-streak-label">Tage in Folge</span>
        </div>
        <div className="prod-streak-best">
          <span className="prod-streak-best-label">Rekord</span>
          <span className="prod-streak-best-value">{data.longestStreak} Tage</span>
        </div>
      </div>
      {!data.activeToday && data.currentStreak > 0 && (
        <div className="prod-streak-hint">
          Erstelle heute eine Idee, um deinen Streak fortzusetzen!
        </div>
      )}
    </div>
  );
};

const WeeklyReportCardComponent: React.FC<{ data: WeeklyReportCard }> = ({ data }) => {
  const trendIcon = data.trend === 'improving' ? '\u2191' : data.trend === 'declining' ? '\u2193' : '\u2192';
  const trendClass = `prod-trend-${data.trend}`;

  return (
    <div className="prod-card prod-weekly-report">
      <div className="prod-card-header">
        <h3 className="prod-card-title">Wochenreport</h3>
        <span className="prod-card-subtitle">{data.period.start} - {data.period.end}</span>
      </div>
      <div className="prod-weekly-stats">
        <div className="prod-weekly-stat">
          <span className="prod-weekly-stat-value">{data.ideasCreated}</span>
          <span className="prod-weekly-stat-label">Ideen</span>
        </div>
        <div className="prod-weekly-stat">
          <span className="prod-weekly-stat-value">{data.chatMessages}</span>
          <span className="prod-weekly-stat-label">Chat-Nachrichten</span>
        </div>
        <div className="prod-weekly-stat">
          <span className={`prod-weekly-stat-value ${trendClass}`}>
            {trendIcon} {Math.abs(data.trendPercentage)}%
          </span>
          <span className="prod-weekly-stat-label">vs. letzte Woche</span>
        </div>
      </div>
      {data.topTopics.length > 0 && (
        <div className="prod-weekly-topics">
          <span className="prod-weekly-topics-label">Top-Themen:</span>
          <div className="prod-weekly-topics-list">
            {data.topTopics.map((topic) => (
              <span key={topic} className="prod-weekly-topic-chip">{topic}</span>
            ))}
          </div>
        </div>
      )}
      <div className="prod-weekly-insight">
        {data.insight}
      </div>
    </div>
  );
};

// ===========================================
// Main Component
// ===========================================

const ProductivityDashboardComponent: React.FC<ProductivityDashboardProps> = ({ context }) => {
  const { data, loading, error, refresh } = useAsyncData<{ success: boolean; data: DashboardData }>(
    async (signal) => {
      const res = await axios.get(`/api/${context}/productivity/dashboard`, { signal });
      return res.data;
    },
    [context]
  );

  if (loading) {
    return (
      <div className="prod-dashboard">
        <SkeletonLoader type="card" count={4} />
      </div>
    );
  }

  if (error || !data?.data) {
    logError('ProductivityDashboard', error);
    return (
      <div className="prod-dashboard">
        <div className="prod-error">
          <p>Dashboard konnte nicht geladen werden.</p>
          <button className="prod-retry-btn" onClick={refresh}>Erneut versuchen</button>
        </div>
      </div>
    );
  }

  const dashboard = data.data;

  return (
    <div className="prod-dashboard">
      <div className="prod-grid">
        <TimeSavedCard data={dashboard.timeSaved} />
        <StreakCard data={dashboard.streak} />
        <HeatmapCard data={dashboard.heatmap} />
        <KnowledgeGrowthCard data={dashboard.knowledgeGrowth} />
        <WeeklyReportCardComponent data={dashboard.weeklyReport} />
      </div>
    </div>
  );
};

export const ProductivityDashboard = memo(ProductivityDashboardComponent);
export default ProductivityDashboard;
