/**
 * PredictionPanel - Vorhersagen tab for KI-Bewusstsein
 *
 * Phase 141: Prediction accuracy gauges and history timeline
 */

import type { AIContext } from '../ContextSwitcher';
import {
  usePredictionHistory,
  usePredictionAccuracy,
} from '../../hooks/queries/useCognitiveData';

interface PredictionPanelProps {
  context: AIContext;
}

function AccuracyGauges({ context }: { context: AIContext }) {
  const { data, isLoading, isError, refetch } = usePredictionAccuracy(context);

  if (isLoading) {
    return (
      <div className="cognitive-loading" role="status" aria-live="polite">
        Lade Genauigkeitsdaten...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="cognitive-error">
        <div className="cognitive-error-message">Genauigkeitsdaten nicht verfuegbar.</div>
        <button className="cognitive-retry-btn" onClick={() => refetch()} type="button">
          Erneut versuchen
        </button>
      </div>
    );
  }

  const format7d = data.total7d > 0 ? Math.round(data.accuracy7d * 100) : null;
  const format30d = data.total30d > 0 ? Math.round(data.accuracy30d * 100) : null;

  return (
    <div className="accuracy-grid" role="region" aria-label="Vorhersagegenauigkeit">
      <div className="accuracy-card">
        <div className="accuracy-value" style={{ color: getAccuracyColor(format7d) }}>
          {format7d !== null ? `${format7d}%` : '-'}
        </div>
        <div className="accuracy-label">7-Tage Genauigkeit</div>
        <div className="cognitive-gap-description">{data.total7d} Vorhersagen</div>
      </div>
      <div className="accuracy-card">
        <div className="accuracy-value" style={{ color: getAccuracyColor(format30d) }}>
          {format30d !== null ? `${format30d}%` : '-'}
        </div>
        <div className="accuracy-label">30-Tage Genauigkeit</div>
        <div className="cognitive-gap-description">{data.total30d} Vorhersagen</div>
      </div>
    </div>
  );
}

function getAccuracyColor(value: number | null): string {
  if (value === null) return 'var(--text-tertiary, #94a3b8)';
  if (value >= 70) return '#22c55e';
  if (value >= 40) return '#f59e0b';
  return '#ef4444';
}

function PredictionTimeline({ context }: { context: AIContext }) {
  const { data, isLoading, isError, refetch } = usePredictionHistory(context);

  if (isLoading) {
    return (
      <div className="cognitive-loading" role="status" aria-live="polite">
        Lade Vorhersageverlauf...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="cognitive-error">
        <div className="cognitive-error-message">Vorhersageverlauf nicht verfuegbar.</div>
        <button className="cognitive-retry-btn" onClick={() => refetch()} type="button">
          Erneut versuchen
        </button>
      </div>
    );
  }

  const items = data ?? [];

  return (
    <div className="cognitive-list-card" role="region" aria-label="Vorhersageverlauf">
      <div className="cognitive-section-title">Vorhersageverlauf</div>
      {items.length === 0 ? (
        <div className="cognitive-empty">
          <div className="cognitive-empty-icon">{'\u{1F52E}'}</div>
          <div>Noch keine Vorhersagen aufgezeichnet</div>
        </div>
      ) : (
        <div className="cognitive-list-items">
          {items.slice(0, 20).map(entry => {
            const dateStr = new Date(entry.created_at).toLocaleDateString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <div key={entry.id} className="cognitive-gap-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="cognitive-gap-area">
                    {entry.predicted_intent} ({entry.predicted_domain})
                  </span>
                  <span className={`cognitive-prediction-badge ${entry.was_correct ? 'confirmed' : 'refuted'}`}>
                    {entry.was_correct ? '\u{2705} Korrekt' : '\u{274C} Falsch'}
                  </span>
                </div>
                {entry.actual_intent && (
                  <span className="cognitive-gap-description">
                    Tatsaechlich: {entry.actual_intent} ({entry.actual_domain})
                    {!entry.was_correct && ` \u{00B7} Fehler: ${entry.error_magnitude.toFixed(2)}`}
                  </span>
                )}
                <span className="cognitive-gap-description" style={{ fontSize: 11 }}>
                  {dateStr}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PredictionPanel({ context }: PredictionPanelProps) {
  return (
    <div className="cognitive-dashboard" role="region" aria-label="Vorhersagen">
      <AccuracyGauges context={context} />
      <PredictionTimeline context={context} />
    </div>
  );
}
