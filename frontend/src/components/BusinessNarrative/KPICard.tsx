/**
 * KPICard - Custom KPI display card with progress ring and sparkline (Phase 96)
 */

import React from 'react';

interface CustomKPI {
  id: string;
  name: string;
  description: string | null;
  formula: { sources: string[]; aggregation: string };
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  trend: 'up' | 'down' | 'stable';
  lastCalculatedAt: string | null;
  createdAt: string;
}

interface KPICardProps {
  kpi: CustomKPI;
  onDelete: (id: string) => void;
}

function trendArrow(trend: 'up' | 'down' | 'stable'): string {
  switch (trend) {
    case 'up': return '\u2191';
    case 'down': return '\u2193';
    case 'stable': return '\u2192';
  }
}

function formatKPIValue(value: number | null, unit: string | null): string {
  if (value === null) return '-';
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'EUR' || unit === 'USD') return `${value.toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${unit}`;
  return value.toLocaleString('de-DE');
}

export const KPICard: React.FC<KPICardProps> = ({ kpi, onDelete }) => {
  const progress = kpi.targetValue && kpi.currentValue
    ? Math.min((kpi.currentValue / kpi.targetValue) * 100, 100)
    : 0;

  // SVG progress ring
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // Generate mock sparkline from current value (7 points)
  const sparklineData = React.useMemo(() => {
    const base = kpi.currentValue ?? 0;
    return Array.from({ length: 7 }, (_, i) => {
      const variance = base * 0.1;
      return base + (Math.sin(i * 1.2) * variance);
    });
  }, [kpi.currentValue]);

  const sparklineMax = Math.max(...sparklineData, 1);
  const sparklinePoints = sparklineData
    .map((v, i) => `${i * 12 + 2},${28 - (v / sparklineMax) * 26}`)
    .join(' ');

  return (
    <div className="bn-kpi-card">
      <div className="bn-kpi-header">
        <div>
          <h4 className="bn-kpi-name">{kpi.name}</h4>
          {kpi.description && <p className="bn-kpi-desc">{kpi.description}</p>}
        </div>
        <button
          className="bn-kpi-delete"
          onClick={() => onDelete(kpi.id)}
          title="KPI loeschen"
          aria-label="KPI loeschen"
        >
          x
        </button>
      </div>

      <div className="bn-kpi-body">
        {kpi.targetValue != null && (
          <div className="bn-kpi-ring">
            <svg viewBox="0 0 80 80" width="80" height="80">
              <circle
                cx="40" cy="40" r={radius}
                fill="none"
                stroke="var(--bn-ring-bg, #e5e7eb)"
                strokeWidth="6"
              />
              <circle
                cx="40" cy="40" r={radius}
                fill="none"
                stroke={progress >= 100 ? 'var(--bn-ring-complete, #22c55e)' : 'var(--bn-ring-progress, #3b82f6)'}
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
              />
              <text x="40" y="44" textAnchor="middle" className="bn-kpi-ring-text">
                {Math.round(progress)}%
              </text>
            </svg>
          </div>
        )}

        <div className="bn-kpi-values">
          <div className="bn-kpi-current">
            <span className="bn-kpi-value">{formatKPIValue(kpi.currentValue, kpi.unit)}</span>
            <span className={`bn-kpi-trend bn-kpi-trend--${kpi.trend}`}>
              {trendArrow(kpi.trend)}
            </span>
          </div>
          {kpi.targetValue != null && (
            <div className="bn-kpi-target">
              Ziel: {formatKPIValue(kpi.targetValue, kpi.unit)}
            </div>
          )}
        </div>
      </div>

      <div className="bn-kpi-sparkline">
        <svg viewBox="0 0 86 30" width="100%" height="30" preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke="var(--bn-sparkline-color, #6366f1)"
            strokeWidth="2"
            points={sparklinePoints}
          />
        </svg>
      </div>

      <div className="bn-kpi-footer">
        <span className="bn-kpi-sources">
          {kpi.formula.sources.join(', ')} ({kpi.formula.aggregation})
        </span>
        {kpi.lastCalculatedAt && (
          <span className="bn-kpi-updated">
            Aktualisiert: {new Date(kpi.lastCalculatedAt).toLocaleDateString('de-DE')}
          </span>
        )}
      </div>
    </div>
  );
};
