/**
 * Phase 50: Comparison View
 *
 * Side-by-side comparison of metrics between two time periods.
 * Shows delta indicators for changes.
 */

import React from 'react';

// ===========================================
// Types
// ===========================================

interface PeriodMetrics {
  label: string;
  totalTokens: number;
  totalCost: number;
  requestCount: number;
  avgResponseTime: number;
  healthScore: number;
  totalMemories: number;
}

interface ComparisonViewProps {
  periodA: PeriodMetrics;
  periodB: PeriodMetrics;
}

// ===========================================
// Helpers
// ===========================================

function formatDelta(current: number, previous: number): { text: string; color: string; arrow: string } {
  if (previous === 0 && current === 0) {
    return { text: '0%', color: 'rgba(255,255,255,0.4)', arrow: '' };
  }
  if (previous === 0) {
    return { text: 'Neu', color: '#22c55e', arrow: '' };
  }

  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct * 10) / 10;

  if (rounded === 0) {
    return { text: '0%', color: 'rgba(255,255,255,0.4)', arrow: '' };
  }

  return {
    text: `${Math.abs(rounded)}%`,
    arrow: rounded > 0 ? '\u2191' : '\u2193',
    color: rounded > 0 ? '#22c55e' : '#ef4444',
  };
}

function formatDeltaInverse(current: number, previous: number): { text: string; color: string; arrow: string } {
  // For metrics where lower is better (cost, response time)
  const delta = formatDelta(current, previous);
  if (delta.arrow === '\u2191') {
    return { ...delta, color: '#ef4444' };
  }
  if (delta.arrow === '\u2193') {
    return { ...delta, color: '#22c55e' };
  }
  return delta;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

function formatMs(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

// ===========================================
// Component
// ===========================================

export const ComparisonView: React.FC<ComparisonViewProps> = ({ periodA, periodB }) => {
  const metrics = [
    {
      label: 'Tokens',
      valueA: formatNumber(periodA.totalTokens),
      valueB: formatNumber(periodB.totalTokens),
      delta: formatDelta(periodB.totalTokens, periodA.totalTokens),
    },
    {
      label: 'Kosten',
      valueA: formatCost(periodA.totalCost),
      valueB: formatCost(periodB.totalCost),
      delta: formatDeltaInverse(periodB.totalCost, periodA.totalCost),
    },
    {
      label: 'Anfragen',
      valueA: formatNumber(periodA.requestCount),
      valueB: formatNumber(periodB.requestCount),
      delta: formatDelta(periodB.requestCount, periodA.requestCount),
    },
    {
      label: 'Antwortzeit',
      valueA: formatMs(periodA.avgResponseTime),
      valueB: formatMs(periodB.avgResponseTime),
      delta: formatDeltaInverse(periodB.avgResponseTime, periodA.avgResponseTime),
    },
    {
      label: 'Health Score',
      valueA: String(periodA.healthScore),
      valueB: String(periodB.healthScore),
      delta: formatDelta(periodB.healthScore, periodA.healthScore),
    },
    {
      label: 'Memories',
      valueA: formatNumber(periodA.totalMemories),
      valueB: formatNumber(periodB.totalMemories),
      delta: formatDelta(periodB.totalMemories, periodA.totalMemories),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Period Labels */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 80px',
        gap: '0.5rem',
        padding: '0 0.75rem',
      }}>
        <div style={periodLabelStyle}>{periodA.label}</div>
        <div style={periodLabelStyle}>{periodB.label}</div>
        <div />
        <div style={{ ...periodLabelStyle, textAlign: 'right' }}>Delta</div>
      </div>

      {/* Metric Cards */}
      {metrics.map((metric) => (
        <div
          key={metric.label}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 80px',
            gap: '0.5rem',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '0.75rem',
            padding: '0.75rem',
            border: '1px solid rgba(255,255,255,0.06)',
            alignItems: 'center',
          }}
        >
          {/* Period A value */}
          <div>
            <div style={metricValueStyle}>{metric.valueA}</div>
          </div>

          {/* Period B value */}
          <div>
            <div style={metricValueStyle}>{metric.valueB}</div>
          </div>

          {/* Label */}
          <div style={metricLabelStyle}>{metric.label}</div>

          {/* Delta */}
          <div style={{
            textAlign: 'right',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: metric.delta.color,
          }}>
            {metric.delta.arrow} {metric.delta.text}
          </div>
        </div>
      ))}
    </div>
  );
};

// ===========================================
// Styles
// ===========================================

const periodLabelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'rgba(255,255,255,0.5)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontWeight: 500,
};

const metricValueStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 600,
  color: 'rgba(255,255,255,0.9)',
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'rgba(255,255,255,0.5)',
};

export default ComparisonView;
