/**
 * CognitiveDashboard - KI-Bewusstsein Tab
 *
 * Phase 135-136: Cognitive Architecture Visualization
 * Shows calibration, strengths, predictions, curiosity metrics,
 * progress bars for confidence/coherence/coverage,
 * knowledge gaps, and hypothesis tracking.
 */

import type { AIContext } from '../ContextSwitcher';
import {
  useCognitiveOverview,
  type CognitiveOverview,
  type KnowledgeGap,
  type PredictionEntry,
} from '../../hooks/queries/useCognitive';
import './CognitiveDashboard.css';

interface CognitiveDashboardProps {
  context: AIContext;
}

const TREND_LABELS: Record<string, string> = {
  improving: 'Steigend',
  stable: 'Stabil',
  declining: 'Fallend',
};

const SEVERITY_LABELS: Record<string, string> = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Offen',
  confirmed: 'Bestaetigt',
  refuted: 'Widerlegt',
};

function getProgressLevel(value: number): 'high' | 'medium' | 'low' {
  if (value >= 0.7) return 'high';
  if (value >= 0.4) return 'medium';
  return 'low';
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function MetricCards({ data }: { data: CognitiveOverview }) {
  const cards = [
    {
      icon: '\u{1F3AF}',
      label: 'Kalibrierung',
      value: formatPercent(data.calibration.score),
      trend: data.calibration.trend,
      sub: `${data.calibration.sample_size} Stichproben`,
    },
    {
      icon: '\u{1F4AA}',
      label: 'Staerken',
      value: String(data.strengths.length),
      sub: data.strengths.length > 0
        ? `Top: ${data.strengths[0]?.domain ?? '-'}`
        : 'Noch keine erkannt',
    },
    {
      icon: '\u{1F52E}',
      label: 'Vorhersagen',
      value: String(data.predictions.length),
      sub: `${data.predictions.filter(p => p.status === 'confirmed').length} bestaetigt`,
    },
    {
      icon: '\u{2728}',
      label: 'Neugier',
      value: String(data.curiosity.length),
      sub: data.curiosity.length > 0
        ? `Top: ${data.curiosity[0]?.topic ?? '-'}`
        : 'Noch keine Themen',
    },
  ];

  return (
    <div className="cognitive-metrics-grid">
      {cards.map(card => (
        <div key={card.label} className="cognitive-metric-card">
          <div className="cognitive-metric-header">
            <span className="cognitive-metric-icon" aria-hidden="true">{card.icon}</span>
            {card.trend && (
              <span className={`cognitive-metric-trend ${card.trend}`}>
                {TREND_LABELS[card.trend] ?? card.trend}
              </span>
            )}
          </div>
          <span className="cognitive-metric-value">{card.value}</span>
          <span className="cognitive-metric-label">{card.label}</span>
          <span className="cognitive-metric-sub">{card.sub}</span>
        </div>
      ))}
    </div>
  );
}

function ProgressBars({ data }: { data: CognitiveOverview }) {
  const bars = [
    { label: 'Konfidenz', value: data.confidence_score },
    { label: 'Kohaerenz', value: data.coherence_score },
    { label: 'Abdeckung', value: data.coverage_score },
  ];

  return (
    <div className="cognitive-progress-section">
      <div className="cognitive-section-title">Kognitive Metriken</div>
      <div className="cognitive-progress-list">
        {bars.map(bar => {
          const level = getProgressLevel(bar.value);
          return (
            <div key={bar.label} className="cognitive-progress-item">
              <div className="cognitive-progress-header">
                <span className="cognitive-progress-label">{bar.label}</span>
                <span className="cognitive-progress-value">{formatPercent(bar.value)}</span>
              </div>
              <div className="cognitive-progress-bar" role="progressbar" aria-valuenow={Math.round(bar.value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={bar.label}>
                <div
                  className={`cognitive-progress-fill ${level}`}
                  style={{ width: formatPercent(bar.value) }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KnowledgeGapsList({ gaps }: { gaps: KnowledgeGap[] }) {
  return (
    <div className="cognitive-list-card">
      <div className="cognitive-section-title">Wissensluecken</div>
      {gaps.length === 0 ? (
        <div className="cognitive-empty">
          <div className="cognitive-empty-icon">{'\u{2705}'}</div>
          <div>Keine Wissensluecken erkannt</div>
        </div>
      ) : (
        <div className="cognitive-list-items">
          {gaps.map((gap, i) => (
            <div key={`${gap.area}-${i}`} className="cognitive-gap-item">
              <span
                className={`cognitive-gap-severity ${gap.severity}`}
                title={SEVERITY_LABELS[gap.severity] ?? gap.severity}
              />
              <div className="cognitive-gap-content">
                <span className="cognitive-gap-area">{gap.area}</span>
                <span className="cognitive-gap-description">{gap.description}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PredictionsList({ predictions }: { predictions: PredictionEntry[] }) {
  return (
    <div className="cognitive-list-card">
      <div className="cognitive-section-title">Hypothesen</div>
      {predictions.length === 0 ? (
        <div className="cognitive-empty">
          <div className="cognitive-empty-icon">{'\u{1F52E}'}</div>
          <div>Noch keine Vorhersagen aufgezeichnet</div>
        </div>
      ) : (
        <div className="cognitive-list-items">
          {predictions.slice(0, 8).map(pred => (
            <div key={pred.id} className="cognitive-prediction-item">
              <span className="cognitive-prediction-text" title={pred.prediction}>
                {pred.prediction}
              </span>
              <span className={`cognitive-prediction-badge ${pred.status}`}>
                {STATUS_LABELS[pred.status] ?? pred.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CognitiveDashboard({ context }: CognitiveDashboardProps) {
  const { data, isLoading, isError, refetch } = useCognitiveOverview(context);

  if (isLoading) {
    return (
      <div className="cognitive-loading" role="status" aria-live="polite">
        <span aria-hidden="true">{'\u{1F9E0}'}</span>
        Lade kognitive Daten...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="cognitive-error">
        <div className="cognitive-error-message">
          Kognitive Daten konnten nicht geladen werden.
        </div>
        <button className="cognitive-retry-btn" onClick={() => refetch()} type="button">
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="cognitive-dashboard" role="main" aria-label="KI-Bewusstsein Dashboard">
      <MetricCards data={data} />
      <ProgressBars data={data} />
      <div className="cognitive-lists-grid">
        <KnowledgeGapsList gaps={data.knowledge_gaps} />
        <PredictionsList predictions={data.predictions} />
      </div>
    </div>
  );
}
