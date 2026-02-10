import { AISuggestion } from './types';
import { getSuggestionIcon, getSuggestionLabel, formatDate } from './helpers';

interface SuggestionsTabProps {
  suggestions: AISuggestion[];
  onRespondToSuggestion: (id: string, response: 'accepted' | 'dismissed') => void;
}

export function SuggestionsTab({ suggestions, onRespondToSuggestion }: SuggestionsTabProps) {
  return (
    <div className="suggestions-tab">
      {suggestions.length === 0 ? (
        <div className="empty-state neuro-empty-state">
          <span className="neuro-empty-icon">💡</span>
          <h3 className="neuro-empty-title">Keine aktiven Vorschlage</h3>
          <p className="neuro-empty-description">Die KI analysiert deine Aktivitaten und macht bald Vorschlage.</p>
        </div>
      ) : (
        <div className="suggestions-list neuro-flow-list">
          {suggestions.slice(0, 7).map((suggestion, index) => (
            <div key={suggestion.id} className="suggestion-card liquid-glass neuro-hover-lift neuro-stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
              <div className="suggestion-header">
                <span className="suggestion-type-badge">
                  {getSuggestionIcon(suggestion.suggestion_type)}
                  {getSuggestionLabel(suggestion.suggestion_type)}
                </span>
                <span className={`suggestion-priority priority-${suggestion.priority > 7 ? 'high' : suggestion.priority > 4 ? 'medium' : 'low'}`}>
                  Priorität {suggestion.priority}
                </span>
              </div>
              <h3 className="suggestion-title">{suggestion.title}</h3>
              {suggestion.description && (
                <p className="suggestion-description">{suggestion.description}</p>
              )}
              {suggestion.reasoning && (
                <div className="suggestion-reasoning">
                  <strong>Begründung:</strong> {suggestion.reasoning}
                </div>
              )}
              <div className="suggestion-footer">
                <span className="suggestion-date">{formatDate(suggestion.created_at)}</span>
                <div className="suggestion-actions">
                  <button
                    type="button"
                    className="accept-btn neuro-button"
                    onClick={() => onRespondToSuggestion(suggestion.id, 'accepted')}
                    aria-label="Vorschlag annehmen"
                  >
                    Annehmen
                  </button>
                  <button
                    type="button"
                    className="dismiss-btn neuro-hover-lift"
                    onClick={() => onRespondToSuggestion(suggestion.id, 'dismissed')}
                    aria-label="Vorschlag ablehnen"
                  >
                    Ablehnen
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
