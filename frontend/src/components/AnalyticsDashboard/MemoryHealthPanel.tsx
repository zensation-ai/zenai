/**
 * Phase 50: Memory Health Panel
 *
 * Displays health metrics for the HiMeS 7-Layer Memory system:
 * - Health Score gauge (SVG circle)
 * - Memory layer cards with counts and details
 * - Memory distribution bar visualization
 * - Consolidation and decay status
 *
 * Accepts data matching the backend MemoryHealthResult shape.
 */

import React, { type CSSProperties } from 'react';

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
  longTerm: 'var(--primary)',
};

function getScoreColor(score: number): string {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  if (score >= 25) return 'var(--accent-orange)';
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
    <div className="flex flex-col gap-6">
      {/* Top Row: Health Score + Key Metrics */}
      <div className="grid grid-cols-[auto_1fr] gap-6 items-start">
        {/* Health Score Gauge (SVG) */}
        <div className="flex flex-col items-center justify-center min-w-[160px] rounded-xl border border-white/[0.06] bg-white/[0.03] p-6">
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
              className="transition-[stroke-dasharray] duration-[600ms] ease-in-out"
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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
          <MetricCard label="Gesamt" value={String(overall.totalMemories)} />
          <MetricCard
            label="Konsolidierung"
            value={overall.lastConsolidation || 'N/A'}
            sublabel="Letzte Ausführung"
          />
          <MetricCard
            label="Decay"
            value={overall.lastDecay || 'N/A'}
            sublabel="Letzte Ausführung"
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
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
        <h4 className="m-0 mb-3 text-sm font-medium text-white/70">Memory-Verteilung</h4>
        <div className="flex flex-col gap-3">
          {layers.map(layer => (
            <div key={layer.name} className="flex items-center gap-3">
              <div className="w-[80px] text-[0.8rem] text-white/70">
                {layer.name}
              </div>
              <div className="flex-1 h-5 bg-white/[0.06] rounded overflow-hidden">
                <div
                  className="h-full rounded transition-[width] duration-[400ms] ease-in-out w-[var(--bar)] bg-[var(--c)] min-w-[var(--min)]"
                  style={{
                    '--bar': `${(layer.count / maxCount) * 100}%`,
                    '--c': layer.color,
                    '--min': layer.count > 0 ? '4px' : '0',
                  } as CSSProperties}
                />
              </div>
              <div className="w-10 text-right text-[0.85rem] font-semibold text-white/80">
                {layer.count}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Layer Detail Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
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
            { label: 'Durchschn. Stärke', value: longTerm.avgStrength.toFixed(3) },
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
  <div className="bg-white/[0.04] rounded-xl p-3 border border-white/[0.06]">
    <div className="text-[0.7rem] text-white/50 mb-1">
      {label}
    </div>
    <div
      className="text-[1.1rem] font-semibold text-[var(--c)]"
      style={{ '--c': color || 'rgba(255,255,255,0.9)' } as CSSProperties}
    >
      {value}
    </div>
    {sublabel && (
      <div className="text-[0.7rem] text-white/40 mt-[0.1rem]">
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
  <div
    className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 [border-left:3px_solid_var(--c)]"
    style={{ '--c': color } as CSSProperties}
  >
    <h4 className="m-0 mb-3 text-sm font-medium text-[var(--c)]">{title}</h4>
    <div className="flex flex-col gap-[0.4rem]">
      {items.map(item => (
        <div key={item.label} className="flex justify-between items-center">
          <span className="text-[0.8rem] text-white/50">{item.label}</span>
          <span className="text-[0.85rem] font-semibold text-white/90">{item.value}</span>
        </div>
      ))}
    </div>
  </div>
);

// ===========================================
// Styles (removed – migrated to Tailwind)
// ===========================================

export default MemoryHealthPanel;
