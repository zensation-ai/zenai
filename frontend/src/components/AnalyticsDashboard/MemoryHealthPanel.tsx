/**
 * Phase 50: Memory Health Panel
 *
 * Displays health metrics for the HiMeS 4-Layer Memory system:
 * - Health Score gauge (SVG circle)
 * - Memory layer cards with counts and details
 * - Memory distribution bar visualization
 * - Consolidation and decay status
 *
 * Accepts data matching the backend MemoryHealthResult shape.
 */

import React from 'react';

// ===========================================
// Types (mirrors backend MemoryHealthResult)
// ===========================================

export interface MemoryHealthData {
  working: { count: number; activeCount: number; avgAge: number };
  episodic: { count: number; recentCount: number; avgImportance: number };
  shortTerm: { count: number; expiringCount: number; avgRelevance: number };
  longTerm: { count: number; avgStrength: number; consolidatedCount: number };
  overall: {
    totalMemories: number;
    healthScore: number;
    lastConsolidation: string | null;
    lastDecay: string | null;
  };
}

interface MemoryHealthPanelProps {
  data: MemoryHealthData | null;
  loading: boolean;
  error: string | null;
}

// ===========================================
// Constants
// ===========================================

const LAYER_COLORS: Record<string, string> = {
  working: '#a855f7',
  shortTerm: '#3b82f6',
  episodic: '#22c55e',
  longTerm: '#ff6b35',
};

function getScoreColor(score: number): string {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  if (score >= 25) return '#f97316';
  return '#ef4444';
}

function getScoreLabel(score: number): string {
  if (score >= 75) return 'Gesund';
  if (score >= 50) return 'Akzeptabel';
  if (score >= 25) return 'Niedrig';
  return 'Kritisch';
}

// ===========================================
// Component
// ===========================================

export const MemoryHealthPanel: React.FC<MemoryHealthPanelProps> = ({
  data,
  loading,
  error,
}) => {
  if (loading) {
    return (
      <div className="av2-tab-loader">
        <div className="av2-spinner" />
        <p>Lade Memory-Health-Daten...</p>
      </div>
    );
  }

  if (error) {
    return <div className="av2-error" role="alert">{error}</div>;
  }

  if (!data) {
    return <p className="av2-empty">Keine Memory-Daten vorhanden.</p>;
  }

  const { working, episodic, shortTerm, longTerm, overall } = data;

  // SVG health score circle
  const circumference = 2 * Math.PI * 42;
  const filled = (overall.healthScore / 100) * circumference;
  const scoreColor = getScoreColor(overall.healthScore);

  // Distribution bar data
  const layers = [
    { name: 'Working', count: working.count, color: LAYER_COLORS.working },
    { name: 'Short-Term', count: shortTerm.count, color: LAYER_COLORS.shortTerm },
    { name: 'Episodic', count: episodic.count, color: LAYER_COLORS.episodic },
    { name: 'Long-Term', count: longTerm.count, color: LAYER_COLORS.longTerm },
  ];
  const maxCount = Math.max(...layers.map(l => l.count), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Row: Health Score + Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Health Score Gauge (SVG) */}
        <div style={{
          ...sectionStyle,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '160px',
          padding: '1.5rem',
        }}>
          <svg width="120" height="120" viewBox="0 0 100 100">
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="8"
            />
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke={scoreColor}
              strokeWidth="8"
              strokeDasharray={`${filled} ${circumference}`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
            <text x="50" y="46" textAnchor="middle" fontSize="22" fontWeight="bold" fill={scoreColor}>
              {overall.healthScore}
            </text>
            <text x="50" y="62" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.5)">
              {getScoreLabel(overall.healthScore)}
            </text>
          </svg>
        </div>

        {/* Key Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
          <MetricCard label="Gesamt" value={String(overall.totalMemories)} />
          <MetricCard
            label="Konsolidierung"
            value={overall.lastConsolidation || 'N/A'}
            sublabel="Letzte Ausfuehrung"
          />
          <MetricCard
            label="Decay"
            value={overall.lastDecay || 'N/A'}
            sublabel="Letzte Ausfuehrung"
          />
          <MetricCard
            label="Long-Term konsolidiert"
            value={String(longTerm.consolidatedCount)}
            sublabel={`von ${longTerm.count} gesamt`}
            color={longTerm.consolidatedCount > 0 ? '#22c55e' : undefined}
          />
        </div>
      </div>

      {/* Memory Distribution (CSS bars) */}
      <div style={sectionStyle}>
        <h4 style={headingStyle}>Memory-Verteilung</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {layers.map(layer => (
            <div key={layer.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '80px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
                {layer.name}
              </div>
              <div style={{ flex: 1, height: '20px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${(layer.count / maxCount) * 100}%`,
                  height: '100%',
                  background: layer.color,
                  borderRadius: '4px',
                  transition: 'width 0.4s ease',
                  minWidth: layer.count > 0 ? '4px' : '0',
                }} />
              </div>
              <div style={{ width: '40px', textAlign: 'right', fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                {layer.count}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Layer Detail Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
        <LayerDetailCard
          title="Working Memory"
          color={LAYER_COLORS.working}
          items={[
            { label: 'Gesamt', value: String(working.count) },
            { label: 'Aktiv', value: String(working.activeCount) },
            { label: 'Durchschn. Alter', value: `${working.avgAge.toFixed(1)}h` },
          ]}
        />
        <LayerDetailCard
          title="Episodic Memory"
          color={LAYER_COLORS.episodic}
          items={[
            { label: 'Gesamt', value: String(episodic.count) },
            { label: 'Letzte 7 Tage', value: String(episodic.recentCount) },
            { label: 'Durchschn. Wichtigkeit', value: episodic.avgImportance.toFixed(3) },
          ]}
        />
        <LayerDetailCard
          title="Short-Term Memory"
          color={LAYER_COLORS.shortTerm}
          items={[
            { label: 'Gesamt', value: String(shortTerm.count) },
            { label: 'Ablaufend', value: String(shortTerm.expiringCount) },
            { label: 'Durchschn. Relevanz', value: shortTerm.avgRelevance.toFixed(3) },
          ]}
        />
        <LayerDetailCard
          title="Long-Term Memory"
          color={LAYER_COLORS.longTerm}
          items={[
            { label: 'Gesamt', value: String(longTerm.count) },
            { label: 'Konsolidiert', value: String(longTerm.consolidatedCount) },
            { label: 'Durchschn. Staerke', value: longTerm.avgStrength.toFixed(3) },
          ]}
        />
      </div>
    </div>
  );
};

// ===========================================
// Sub-Components
// ===========================================

const MetricCard: React.FC<{
  label: string;
  value: string;
  sublabel?: string;
  color?: string;
}> = ({ label, value, sublabel, color }) => (
  <div style={{
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '0.75rem',
    padding: '0.75rem',
    border: '1px solid rgba(255,255,255,0.06)',
  }}>
    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem' }}>
      {label}
    </div>
    <div style={{ fontSize: '1.1rem', fontWeight: 600, color: color || 'rgba(255,255,255,0.9)' }}>
      {value}
    </div>
    {sublabel && (
      <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.1rem' }}>
        {sublabel}
      </div>
    )}
  </div>
);

const LayerDetailCard: React.FC<{
  title: string;
  color: string;
  items: Array<{ label: string; value: string }>;
}> = ({ title, color, items }) => (
  <div style={{
    ...sectionStyle,
    borderLeft: `3px solid ${color}`,
  }}>
    <h4 style={{ ...headingStyle, color }}>{title}</h4>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {items.map(item => (
        <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>{item.label}</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{item.value}</span>
        </div>
      ))}
    </div>
  </div>
);

// ===========================================
// Styles
// ===========================================

const sectionStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  borderRadius: '0.75rem',
  padding: '1rem',
  border: '1px solid rgba(255,255,255,0.06)',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 0.75rem 0',
  fontSize: '0.875rem',
  fontWeight: 500,
  color: 'rgba(255,255,255,0.7)',
};

export default MemoryHealthPanel;
