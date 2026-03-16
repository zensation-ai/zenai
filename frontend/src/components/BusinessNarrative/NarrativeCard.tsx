/**
 * NarrativeCard - Individual narrative section card (Phase 96)
 */

import React from 'react';

interface MetricPoint {
  label: string;
  value: number;
  unit?: string;
  trend: 'up' | 'down' | 'stable';
  changePercent: number;
}

interface AnomalyInfo {
  metric: string;
  severity: 'warning' | 'critical';
  description: string;
}

interface NarrativeSection {
  title: string;
  icon: string;
  narrative: string;
  metrics: MetricPoint[];
  actionItems: string[];
  anomalies: AnomalyInfo[];
}

interface NarrativeCardProps {
  section: NarrativeSection;
}

function formatValue(value: number, unit?: string): string {
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'EUR' || unit === 'USD') return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${unit}`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
}

function trendIcon(trend: 'up' | 'down' | 'stable'): string {
  switch (trend) {
    case 'up': return '\u2191';
    case 'down': return '\u2193';
    case 'stable': return '\u2192';
  }
}

export const NarrativeCard: React.FC<NarrativeCardProps> = ({ section }) => {
  return (
    <div className="bn-card">
      <div className="bn-card-header">
        <span className="bn-card-icon">{section.icon}</span>
        <h4 className="bn-card-title">{section.title}</h4>
        {section.anomalies.length > 0 && (
          <span className={`bn-anomaly-indicator bn-anomaly-indicator--${section.anomalies[0].severity}`}>
            {section.anomalies[0].severity === 'critical' ? '!!' : '!'}
          </span>
        )}
      </div>

      <p className="bn-card-narrative">{section.narrative}</p>

      {section.metrics.length > 0 && (
        <div className="bn-card-metrics">
          {section.metrics.map((m, i) => (
            <div key={i} className="bn-metric">
              <span className="bn-metric-label">{m.label}</span>
              <div className="bn-metric-value-row">
                <span className="bn-metric-value">{formatValue(m.value, m.unit)}</span>
                <span className={`bn-metric-trend bn-metric-trend--${m.trend}`}>
                  {trendIcon(m.trend)}
                  {m.changePercent !== 0 && (
                    <span className="bn-metric-change">
                      {m.changePercent > 0 ? '+' : ''}{m.changePercent}%
                    </span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {section.anomalies.length > 0 && (
        <div className="bn-card-anomalies">
          {section.anomalies.map((a, i) => (
            <div key={i} className={`bn-anomaly-badge bn-anomaly-badge--${a.severity}`}>
              {a.description}
            </div>
          ))}
        </div>
      )}

      {section.actionItems.length > 0 && (
        <div className="bn-card-actions">
          {section.actionItems.map((item, i) => (
            <div key={i} className="bn-action-item">
              <span className="bn-action-bullet">-</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
