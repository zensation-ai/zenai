import { ProactiveResearch } from './types';
import { formatDate } from './helpers';
import { EMPTY_STATE_MESSAGES } from '../../utils/aiPersonality';

interface ResearchTabProps {
  research: ProactiveResearch[];
  onViewResearch: (id: string) => void;
}

export function ResearchTab({ research, onViewResearch }: ResearchTabProps) {
  return (
    <div className="research-tab">
      {research.length === 0 ? (
        <div className="empty-state neuro-empty-state">
          <span className="neuro-empty-icon">🔍</span>
          <h3 className="neuro-empty-title">{EMPTY_STATE_MESSAGES.search.title}</h3>
          <p className="neuro-empty-description">Erstelle Aufgaben mit Recherche-Hinweisen, und die KI bereitet automatisch Informationen vor.</p>
        </div>
      ) : (
        <div className="research-list neuro-flow-list">
          {research.slice(0, 7).map((item, index) => (
            <div
              key={item.id}
              className="research-card liquid-glass neuro-hover-lift neuro-stagger-item"
              style={{ animationDelay: `${index * 50}ms` }}
              onClick={() => onViewResearch(item.id)}
            >
              <div className="research-status-badge">
                {item.status === 'completed' ? '✓ Bereit' : '⏳ In Arbeit'}
              </div>
              <h3 className="research-title">{item.teaser_title || item.research_query}</h3>
              <div className="research-query-text">Suchanfrage: {item.research_query}</div>
              {item.teaser_text && (
                <div className="research-teaser-full">{item.teaser_text}</div>
              )}
              <div className="research-footer">
                <span className="research-date">{formatDate(item.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
