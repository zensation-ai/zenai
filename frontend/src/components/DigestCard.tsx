import { DigestEntry, categoryLabels, formatDigestDate, formatDateRange, getProductivityColor } from './DigestTypes';

interface DigestCardProps {
  digest: DigestEntry;
  variant: 'featured' | 'compact';
  index?: number;
}

export function DigestCard({ digest, variant, index = 0 }: DigestCardProps) {
  if (variant === 'compact') {
    return (
      <div className="digest-card compact liquid-glass neuro-hover-lift neuro-stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
        <div className="digest-card-header">
          <span className={`digest-type ${digest.type}`}>
            {digest.type === 'daily' ? '📅' : '📆'}
          </span>
          <span className="digest-date">
            {digest.type === 'daily'
              ? formatDigestDate(digest.period_start)
              : formatDateRange(digest.period_start, digest.period_end)}
          </span>
          <div className="mini-score" style={{ background: getProductivityColor(digest.stats.productivity_score) }}>
            {digest.stats.productivity_score}
          </div>
        </div>
        <p className="digest-summary-preview">{digest.summary}</p>
        <div className="digest-mini-stats">
          <span>💡 {digest.stats.ideas_created}</span>
          <span>✅ {digest.stats.tasks_completed}</span>
          <span>📅 {digest.stats.meetings_held}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="digest-card featured liquid-glass neuro-stagger-item">
      <div className="digest-card-header">
        <span className={`digest-type ${digest.type}`}>
          {digest.type === 'daily' ? '📅 Tagesdigest' : '📆 Wochendigest'}
        </span>
        <span className="digest-date">
          {digest.type === 'daily'
            ? formatDigestDate(digest.period_start)
            : formatDateRange(digest.period_start, digest.period_end)}
        </span>
      </div>

      <div className="productivity-score-section">
        <div className="score-circle neuro-breathing" style={{ borderColor: getProductivityColor(digest.stats.productivity_score) }}>
          <span className="score-value" style={{ color: getProductivityColor(digest.stats.productivity_score) }}>
            {digest.stats.productivity_score}
          </span>
          <span className="score-label">Produktivität</span>
        </div>
      </div>

      <div className="digest-summary">
        <p>{digest.summary}</p>
      </div>

      <div className="digest-stats neuro-flow-list">
        <div className="digest-stat neuro-hover-lift">
          <span className="digest-stat-icon">💡</span>
          <span className="digest-stat-value">{digest.stats.ideas_created}</span>
          <span className="digest-stat-label">Ideen</span>
        </div>
        <div className="digest-stat neuro-hover-lift">
          <span className="digest-stat-icon">✅</span>
          <span className="digest-stat-value">{digest.stats.tasks_completed}</span>
          <span className="digest-stat-label">Aufgaben</span>
        </div>
        <div className="digest-stat neuro-hover-lift">
          <span className="digest-stat-icon">📅</span>
          <span className="digest-stat-value">{digest.stats.meetings_held}</span>
          <span className="digest-stat-label">Meetings</span>
        </div>
      </div>

      {digest.highlights.length > 0 && (
        <div className="digest-section neuro-stagger-item">
          <h3>✨ Highlights</h3>
          <ul className="highlights-list neuro-flow-list">
            {digest.highlights.slice(0, 7).map((highlight, i) => (
              <li key={i} className="neuro-stagger-item">{highlight}</li>
            ))}
          </ul>
        </div>
      )}

      {digest.stats.top_categories.length > 0 && (
        <div className="digest-section">
          <h3>📂 Top Kategorien</h3>
          <div className="categories-bars">
            {digest.stats.top_categories.map(([cat, count]) => (
              <div key={cat} className="category-bar-row">
                <span className="category-name">{categoryLabels[cat] || cat}</span>
                <div className="category-bar-container">
                  <div
                    className="category-bar-fill"
                    style={{
                      width: `${(count / Math.max(...digest.stats.top_categories.map(([, c]) => c))) * 100}%`
                    }}
                  />
                </div>
                <span className="category-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {digest.recommendations.length > 0 && (
        <div className="digest-section">
          <h3>💡 Empfehlungen</h3>
          <div className="recommendations-list">
            {digest.recommendations.map((rec, i) => (
              <div key={i} className="recommendation-item">{rec}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
