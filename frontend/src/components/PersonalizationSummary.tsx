import { AI_AVATAR, AI_PERSONALITY } from '../utils/aiPersonality';

interface UserSummary {
  summary: string;
  key_traits: string[];
  interests: string[];
  communication_style: string;
  generated_at: string;
}

interface PersonalizationSummaryProps {
  summary: UserSummary | null;
  onSwitchToChat: () => void;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function PersonalizationSummary({ summary, onSwitchToChat }: PersonalizationSummaryProps) {
  if (!summary) {
    return (
      <div className="summary-container">
        <div className="empty-state neuro-empty-state">
          <div className="empty-avatar neuro-breathing">{AI_AVATAR.curiousEmoji}</div>
          <h3 className="neuro-empty-title">Noch keine Zusammenfassung</h3>
          <p className="neuro-empty-description">Erzähl {AI_PERSONALITY.name} mehr über dich, damit ich eine Zusammenfassung erstellen kann.</p>
          <span className="empty-encouragement neuro-motivational">Je mehr wir plaudern, desto besser verstehe ich dich!</span>
          <button type="button" className="action-btn neuro-button" onClick={onSwitchToChat}>💬 Zum Chat</button>
        </div>
      </div>
    );
  }

  return (
    <div className="summary-container">
      <div className="summary-card liquid-glass neuro-human-fade-in">
        <div className="summary-header">
          <h3>📋 Dein Profil-Summary</h3>
          <span className="summary-date">Erstellt: {formatDate(summary.generated_at)}</span>
        </div>

        <div className="summary-content">
          <p className="summary-text">{summary.summary}</p>
        </div>

        {summary.key_traits.length > 0 && (
          <div className="summary-section neuro-stagger-item">
            <h4>🎭 Wesentliche Eigenschaften</h4>
            <div className="trait-tags">
              {summary.key_traits.map((trait, i) => (<span key={i} className="trait-tag neuro-reward-badge">{trait}</span>))}
            </div>
          </div>
        )}

        {summary.interests.length > 0 && (
          <div className="summary-section neuro-stagger-item">
            <h4>❤️ Interessen</h4>
            <div className="interest-tags">
              {summary.interests.map((interest, i) => (<span key={i} className="interest-tag neuro-reward-badge">{interest}</span>))}
            </div>
          </div>
        )}

        {summary.communication_style && (
          <div className="summary-section neuro-stagger-item">
            <h4>💬 Kommunikationsstil</h4>
            <p className="communication-style">{summary.communication_style}</p>
          </div>
        )}
      </div>
    </div>
  );
}
