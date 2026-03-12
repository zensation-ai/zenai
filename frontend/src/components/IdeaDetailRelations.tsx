import type { Relation, Suggestion } from './IdeaDetailTypes';
import { relationLabels } from './IdeaDetailTypes';

interface IdeaDetailRelationsProps {
  relations: Relation[];
  suggestions: Suggestion[];
  loadingRelations: boolean;
  analyzing: boolean;
  onAnalyze: () => void;
  onNavigate?: (ideaId: string) => void;
}

export function IdeaDetailRelations({
  relations,
  suggestions,
  loadingRelations,
  analyzing,
  onAnalyze,
  onNavigate,
}: IdeaDetailRelationsProps) {
  return (
    <>
      <div className="detail-section knowledge-section">
        <div className="section-header">
          <h3>🔗 Verknüpfungen</h3>
          <button
            type="button"
            className="analyze-button neuro-button neuro-focus-ring"
            onClick={onAnalyze}
            disabled={analyzing}
            aria-label="Beziehungen zu anderen Gedanken analysieren"
          >
            {analyzing ? 'Analysiere...' : 'Beziehungen analysieren'}
          </button>
        </div>

        {loadingRelations ? (
          <div className="loading-indicator">Lade Verknüpfungen...</div>
        ) : relations.length > 0 ? (
          <div className="relations-list" role="list" aria-label="Verknuepfte Gedanken">
            {relations.map((rel, i) => (
              <div
                key={i}
                className="relation-item neuro-hover-lift neuro-press-effect"
                onClick={() => onNavigate?.(rel.targetId)}
                role="listitem"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate?.(rel.targetId); } }}
                aria-label={`${relationLabels[rel.relationType] || rel.relationType}: ${rel.target_title || rel.targetId}`}
              >
                <span className="relation-type">{relationLabels[rel.relationType]}</span>
                <span className="relation-target">{rel.target_title || rel.targetId}</span>
                <span className="relation-strength">
                  {Math.round(rel.strength * 100)}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="no-relations">
            Noch keine Verknüpfungen. Klicke "Beziehungen analysieren" um Verbindungen zu finden.
          </p>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="detail-section">
          <h3>💡 Vorgeschlagene Verbindungen</h3>
          <div className="suggestions-list" role="list" aria-label="Vorgeschlagene Verbindungen">
            {suggestions.slice(0, 3).map((sug) => (
              <div
                key={sug.id}
                className="suggestion-item neuro-hover-lift neuro-press-effect"
                onClick={() => onNavigate?.(sug.id)}
                role="listitem"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onNavigate?.(sug.id)}
                aria-label={`${sug.title} - ${Math.round(sug.similarity * 100)}% aehnlich`}
              >
                <span className="suggestion-title">{sug.title}</span>
                <span className="suggestion-similarity">
                  {Math.round(sug.similarity * 100)}% ähnlich
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
