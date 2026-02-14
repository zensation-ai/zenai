/**
 * FeatureHintCard
 *
 * Floating card shown on first visit to a page after onboarding.
 * Slides up from bottom-right with tips and optional shortcut badge.
 */

import type { FeatureHint } from '../constants/featureHints';
import './FeatureHintCard.css';

interface FeatureHintCardProps {
  hint: FeatureHint;
  onDismiss: (id: string) => void;
}

export function FeatureHintCard({ hint, onDismiss }: FeatureHintCardProps) {
  return (
    <div
      className="feature-hint-card"
      role="complementary"
      aria-label={`Hinweis: ${hint.title}`}
    >
      <div className="fhc-header">
        <span className="fhc-icon" aria-hidden="true">{hint.icon}</span>
        <div className="fhc-title-area">
          <h4 className="fhc-title">{hint.title}</h4>
          {hint.shortcut && (
            <kbd className="fhc-shortcut">{hint.shortcut}</kbd>
          )}
        </div>
        <button
          type="button"
          className="fhc-close"
          onClick={() => onDismiss(hint.id)}
          aria-label="Hinweis schließen"
        >
          ×
        </button>
      </div>

      <p className="fhc-description">{hint.description}</p>

      <ol className="fhc-tips">
        {hint.tips.map((tip, i) => (
          <li key={i}>{tip}</li>
        ))}
      </ol>

      <button
        type="button"
        className="fhc-dismiss neuro-press-effect neuro-focus-ring"
        onClick={() => onDismiss(hint.id)}
      >
        Verstanden!
      </button>
    </div>
  );
}
