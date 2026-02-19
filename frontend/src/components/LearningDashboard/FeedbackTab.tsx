import { FeedbackStats, FeedbackInsight } from './types';

interface FeedbackTabProps {
  stats: FeedbackStats;
  insights: FeedbackInsight[];
}

export function FeedbackTab({ stats, insights }: FeedbackTabProps) {
  return (
    <div className="feedback-tab">
      <div className="feedback-stats neuro-flow-list">
        <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
          <div className="stat-value">{stats.total_feedback}</div>
          <div className="stat-label">Gesamt-Feedback</div>
        </div>
        <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
          <div className="stat-value">{(stats.average_rating ?? 0).toFixed(1)}</div>
          <div className="stat-label">Durchschnitt</div>
        </div>
        <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
          <div className="stat-value">{stats.corrections_count}</div>
          <div className="stat-label">Korrekturen</div>
        </div>
        <div className="stat-card liquid-glass neuro-hover-lift neuro-stagger-item">
          <div className="stat-value">{stats.applied_count}</div>
          <div className="stat-label">Angewendet</div>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="section">
          <h2>Verbesserungs-Erkenntnisse</h2>
          <div className="insights-list">
            {insights.map((insight, i) => (
              <div key={i} className="insight-card">
                <div className="insight-pattern">{insight.pattern}</div>
                <div className="insight-frequency">Häufigkeit: {insight.frequency}</div>
                <div className="insight-improvement">{insight.suggested_improvement}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="feedback-info">
        <p>
          Bewerte KI-Antworten direkt in der App, um die KI zu verbessern.
          Korrekturen werden automatisch in den Lernprozess aufgenommen.
        </p>
      </div>
    </div>
  );
}
