import { AI_PERSONALITY } from '../utils/aiPersonality';

interface IncubatorQuickInputProps {
  quickThought: string;
  submitting: boolean;
  suggestedAction?: string;
  onQuickThoughtChange: (value: string) => void;
  onSubmit: () => void;
}

export function IncubatorQuickInput({
  quickThought, submitting, suggestedAction,
  onQuickThoughtChange, onSubmit,
}: IncubatorQuickInputProps) {
  return (
    <section className="quick-input-section">
      <div className="quick-input-card liquid-glass neuro-chunk">
        <h2>Schneller Gedanke</h2>
        <p className="hint neuro-inspirational">
          Keine Struktur noetig – {AI_PERSONALITY.name} kuemmert sich darum!
        </p>
        <div className="quick-input-container">
          <textarea
            className="liquid-glass-input neuro-placeholder-animated"
            placeholder={suggestedAction || 'Was geht dir durch den Kopf...'}
            value={quickThought}
            onChange={(e) => onQuickThoughtChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit();
            }}
            disabled={submitting}
            rows={2}
            aria-label="Gedanke eingeben"
          />
          <button
            className={`submit-thought-button neuro-button ${submitting ? '' : 'neuro-pulse-interactive'}`}
            onClick={onSubmit}
            disabled={submitting || !quickThought.trim()}
            aria-label={submitting ? 'Wird gespeichert...' : 'Gedanke inkubieren'}
          >
            {submitting ? (
              <span className="neuro-typing">
                <span className="neuro-typing-dot" aria-hidden="true"></span>
                <span className="neuro-typing-dot" aria-hidden="true"></span>
                <span className="neuro-typing-dot" aria-hidden="true"></span>
              </span>
            ) : 'Inkubieren'}
          </button>
        </div>
      </div>
    </section>
  );
}
