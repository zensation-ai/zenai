import { useCallback, useState, type RefObject, type CSSProperties } from 'react';

interface TriageIdea {
  id: string;
  title: string;
  type: string;
  category: string;
  priority: string;
  summary: string;
  nextSteps?: string[];
  keywords?: string[];
  createdAt: string;
  rawTranscript?: string;
}

const PRIORITY_LABELS: Record<string, { label: string; className: string }> = {
  high: { label: 'HOCH', className: 'high' },
  medium: { label: 'MITTEL', className: 'medium' },
  low: { label: 'NIEDRIG', className: 'low' },
};

const TYPE_EMOJIS: Record<string, string> = {
  task: '📋', idea: '💡', note: '📝', question: '❓',
  reminder: '⏰', decision: '⚖️', goal: '🎯',
};

interface TriageCardProps {
  idea: TriageIdea;
  cardRef: RefObject<HTMLDivElement>;
  isDragging: boolean;
  cardStyle: CSSProperties;
  swipeClass: string;
}

export function TriageCard({ idea, cardRef, isDragging, cardStyle, swipeClass }: TriageCardProps) {
  const [expandedDetails, setExpandedDetails] = useState(false);
  const toggleDetails = useCallback(() => setExpandedDetails(prev => !prev), []);

  const priorityInfo = PRIORITY_LABELS[idea.priority] || PRIORITY_LABELS.medium;
  const typeEmoji = TYPE_EMOJIS[idea.type] || '📝';

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div
      ref={cardRef}
      className={'triage-card liquid-glass neuro-focus-indicator active ' + (isDragging ? 'dragging ' : '') + swipeClass}
      style={cardStyle}
    >
      <div className="triage-card-header neuro-chunk">
        <span className={'triage-card-priority ' + priorityInfo.className}>{priorityInfo.label}</span>
        <span className="triage-card-type">{typeEmoji} {idea.type}</span>
      </div>

      <h2 className="triage-card-title neuro-human-fade-in">{idea.title}</h2>
      <p className="triage-card-summary">{idea.summary}</p>

      {idea.nextSteps && idea.nextSteps.length > 0 && (
        <div className={'triage-card-steps neuro-chunk ' + (expandedDetails ? 'neuro-expand-in' : '')}>
          <h4
            onClick={toggleDetails}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            className="neuro-hover-lift"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && toggleDetails()}
          >
            <span>{expandedDetails ? '▼' : '▶'}</span>
            Nächste Schritte ({idea.nextSteps.length}):
          </h4>
          {expandedDetails && (
            <ul className="neuro-flow-list">
              {idea.nextSteps.slice(0, 3).map((step, index) => (
                <li key={`next-step-${index}-${step.slice(0, 20)}`} className="neuro-stagger-item">{step}</li>
              ))}
              {idea.nextSteps.length > 3 && (
                <li className="neuro-stagger-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>+{idea.nextSteps.length - 3} weitere...</li>
              )}
            </ul>
          )}
        </div>
      )}

      <div className="triage-card-meta">
        <span className="triage-card-tag neuro-hover-lift">{idea.category}</span>
        <span className="triage-card-date">📅 {formatDate(idea.createdAt)}</span>
      </div>
    </div>
  );
}
