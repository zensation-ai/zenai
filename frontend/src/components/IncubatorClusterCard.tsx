import { useState } from 'react';
import type { ThoughtCluster } from './IncubatorTypes';
import { getClusterMood, getMoodClass, getStatusColor, getStatusLabel, getTypeIcon, getDaysSinceUpdate, formatDate } from './IncubatorTypes';

interface IncubatorClusterCardProps {
  cluster: ThoughtCluster;
  index: number;
  variant: 'ready' | 'growing';
  summarizing: string | null;
  consolidating: string | null;
  onSummarize: (id: string) => void;
  onConsolidate: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function IncubatorClusterCard({
  cluster, index, variant, summarizing, consolidating,
  onSummarize, onConsolidate, onDismiss,
}: IncubatorClusterCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const mood = getClusterMood(cluster.updated_at);
  const daysSince = getDaysSinceUpdate(cluster.updated_at);

  if (variant === 'growing') {
    return (
      <article
        key={cluster.id}
        className={`cluster-card growing liquid-glass neuro-hover-lift neuro-focus-indicator ${getMoodClass(mood)}`}
        style={{ '--stagger-index': index } as React.CSSProperties}
      >
        <div className="cluster-header">
          <span className="cluster-status" style={{ background: getStatusColor(cluster.status) }} aria-label={`Status: ${getStatusLabel(cluster.status)}`}>
            {getStatusLabel(cluster.status)}
          </span>
          <span className="thought-count">{cluster.thought_count} Gedanken</span>
        </div>
        <div className="cluster-preview">
          {cluster.thoughts.slice(0, 2).map((thought) => (
            <p key={thought.id} className="preview-thought">
              "{thought.raw_input.length > 60 ? thought.raw_input.substring(0, 60) + '...' : thought.raw_input}"
            </p>
          ))}
        </div>
        <div className="cluster-progress neuro-progress-indicator" role="progressbar" aria-valuenow={Math.round(cluster.maturity_score * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-bar neuro-progress-bar" style={{ width: `${cluster.maturity_score * 100}%` }} />
          <span className="progress-label">{Math.round(cluster.maturity_score * 100)}% Reife</span>
        </div>
      </article>
    );
  }

  return (
    <article
      key={cluster.id}
      className={`cluster-card ready liquid-glass neuro-hover-lift neuro-focus-indicator ${getMoodClass(mood)}`}
      style={{ '--stagger-index': index } as React.CSSProperties}
      aria-labelledby={`cluster-title-${cluster.id}`}
    >
      <div className="cluster-header">
        <span className="cluster-status" style={{ background: getStatusColor(cluster.status) }} aria-label={`Status: ${getStatusLabel(cluster.status)}`}>
          {getStatusLabel(cluster.status)}
        </span>
        <span className="thought-count">{cluster.thought_count} Gedanken</span>
      </div>

      {mood === 'dormant' && (
        <div className="dormant-reminder neuro-suggested-action" role="status">
          <span aria-hidden="true">💡</span> Seit {daysSince} Tagen nicht angesehen
        </div>
      )}

      {cluster.title ? (
        <div className="cluster-content">
          <h3 id={`cluster-title-${cluster.id}`}>
            <span className="type-icon" aria-hidden="true">{getTypeIcon(cluster.suggested_type)}</span>
            {cluster.title}
          </h3>
          <p className="cluster-summary">{cluster.summary}</p>
          <div className="cluster-meta">
            <span className="category-badge">{cluster.suggested_category}</span>
            <span className="maturity">Reife: {Math.round(cluster.maturity_score * 100)}%</span>
          </div>
        </div>
      ) : (
        <div className="cluster-content pending">
          <p>Zusammenfassung wird noch generiert...</p>
          <button className="summarize-button neuro-button" onClick={() => onSummarize(cluster.id)} disabled={summarizing === cluster.id} aria-busy={summarizing === cluster.id}>
            {summarizing === cluster.id ? 'Analysiere...' : 'Zusammenfassen'}
          </button>
        </div>
      )}

      <div className="cluster-thoughts">
        <button className="thoughts-toggle neuro-color-transition" onClick={() => setIsExpanded(!isExpanded)} aria-expanded={isExpanded} aria-controls={`thoughts-list-${cluster.id}`}>
          <h4>
            Enthaltene Gedanken ({cluster.thoughts.length})
            <span className="toggle-icon" aria-hidden="true">{isExpanded ? ' \u25BC' : ' \u25B6'}</span>
          </h4>
        </button>
        <ul id={`thoughts-list-${cluster.id}`} className={`neuro-expandable ${isExpanded ? 'expanded' : ''}`}>
          {cluster.thoughts.slice(0, isExpanded ? undefined : 3).map((thought, thoughtIndex) => (
            <li key={thought.id} className={isExpanded ? 'neuro-stagger-item' : ''} style={{ '--stagger-index': thoughtIndex } as React.CSSProperties}>
              <span className="thought-text">{thought.raw_input}</span>
              <span className="thought-date">{formatDate(thought.created_at)}</span>
            </li>
          ))}
          {!isExpanded && cluster.thoughts.length > 3 && (
            <li className="more">+{cluster.thoughts.length - 3} weitere</li>
          )}
        </ul>
      </div>

      <div className="cluster-actions">
        <button
          className={`consolidate-button neuro-button ${consolidating === cluster.id ? '' : 'neuro-anticipate'}`}
          onClick={() => onConsolidate(cluster.id)}
          disabled={consolidating === cluster.id || !cluster.title}
          data-anticipate="Erstellt eine strukturierte Idee"
          aria-busy={consolidating === cluster.id}
        >
          {consolidating === cluster.id ? (
            <span className="neuro-typing">
              <span className="neuro-typing-dot" aria-hidden="true"></span>
              <span className="neuro-typing-dot" aria-hidden="true"></span>
              <span className="neuro-typing-dot" aria-hidden="true"></span>
            </span>
          ) : 'Zur Idee machen'}
        </button>
        <button className="dismiss-button neuro-hover-lift neuro-anticipate" onClick={() => onDismiss(cluster.id)} data-anticipate="Cluster dauerhaft entfernen" aria-label="Cluster verwerfen">
          Verwerfen
        </button>
      </div>
    </article>
  );
}
