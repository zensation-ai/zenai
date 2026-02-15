import {
  AI_AVATAR,
  AI_PERSONALITY,
  EMPTY_STATE_MESSAGES,
} from '../utils/aiPersonality';

interface LearnedFact {
  id: string;
  category: string;
  fact: string;
  confidence: number;
  source: string;
  created_at: string;
}

interface PersonalizationFactsProps {
  facts: LearnedFact[];
  deletingFact: string | null;
  categoryLabels: Record<string, { label: string; icon: string }>;
  onDeleteFact: (id: string) => void;
  onSwitchToChat: () => void;
}

function getConfidenceColor(confidence: number) {
  if (confidence >= 0.8) return '#22c55e';
  if (confidence >= 0.6) return '#f59e0b';
  return '#9ca3af';
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function PersonalizationFacts({ facts, deletingFact, categoryLabels, onDeleteFact, onSwitchToChat }: PersonalizationFactsProps) {
  if (facts.length === 0) {
    return (
      <div className="facts-container">
        <div className="empty-state neuro-empty-state">
          <div className="empty-avatar neuro-breathing">{AI_AVATAR.curiousEmoji}</div>
          <h3 className="neuro-empty-title">{EMPTY_STATE_MESSAGES.personalization.title}</h3>
          <p className="neuro-empty-description">Chatte mit {AI_PERSONALITY.name}, damit ich dich besser kennenlernen kann.</p>
          <span className="empty-encouragement neuro-motivational">{EMPTY_STATE_MESSAGES.personalization.encouragement}</span>
          <button type="button" className="action-btn neuro-button" onClick={onSwitchToChat}>💬 Zum Chat</button>
        </div>
      </div>
    );
  }

  const factsByCategory = facts.reduce((acc, fact) => {
    const cat = fact.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(fact);
    return acc;
  }, {} as Record<string, LearnedFact[]>);

  return (
    <div className="facts-container">
      {Object.entries(factsByCategory).map(([category, categoryFacts]) => (
        <div key={category} className="facts-category">
          <h3>
            {categoryLabels[category]?.icon || '📌'}{' '}
            {categoryLabels[category]?.label || category}
            <span className="facts-count">{categoryFacts.length}</span>
          </h3>
          <div className="facts-list">
            {categoryFacts.map(fact => (
              <div key={fact.id} className="fact-card">
                <div className="fact-content">
                  <p>{fact.fact}</p>
                  <div className="fact-meta">
                    <span className="confidence-badge" style={{ background: getConfidenceColor(fact.confidence) }}>
                      {Math.round(fact.confidence * 100)}%
                    </span>
                    <span className="fact-date">{formatDate(fact.created_at)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="delete-fact-btn neuro-press-effect"
                  onClick={() => onDeleteFact(fact.id)}
                  disabled={deletingFact === fact.id}
                  title="Fakt löschen"
                >
                  {deletingFact === fact.id ? '...' : '✕'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
