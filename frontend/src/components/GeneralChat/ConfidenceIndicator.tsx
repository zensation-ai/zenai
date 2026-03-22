/**
 * ConfidenceIndicator - Compact confidence + source count display
 *
 * Phase 135-136: Shows a colored dot, confidence percentage,
 * and optional source count in a single compact line.
 * Designed to sit below AI messages.
 *
 * Levels:
 * - > 0.75: green  "Hohe Sicherheit"
 * - 0.45-0.75: amber  "Mittlere Sicherheit"
 * - < 0.45: red  "Geringe Sicherheit"
 */

import './ConfidenceIndicator.css';

export interface ConfidenceIndicatorProps {
  confidence?: number;
  sources?: number;
}

type Level = 'high' | 'medium' | 'low';

function getLevel(confidence: number): Level {
  if (confidence > 0.75) return 'high';
  if (confidence >= 0.45) return 'medium';
  return 'low';
}

const LEVEL_LABELS: Record<Level, string> = {
  high: 'Hohe Sicherheit',
  medium: 'Mittlere Sicherheit',
  low: 'Geringe Sicherheit',
};

export function ConfidenceIndicator({ confidence, sources }: ConfidenceIndicatorProps) {
  if (confidence == null) return null;

  const level = getLevel(confidence);
  const percent = Math.round(confidence * 100);

  return (
    <span
      className="confidence-indicator"
      role="status"
      aria-label={`${LEVEL_LABELS[level]} (${percent}%)${sources != null ? `, ${sources} Quellen` : ''}`}
    >
      <span className={`confidence-indicator-dot ${level}`} aria-hidden="true" />
      <span className="confidence-indicator-text">
        Konfidenz: {percent}%
      </span>
      {sources != null && sources > 0 && (
        <>
          <span className="confidence-indicator-separator" aria-hidden="true">{'\u{00B7}'}</span>
          <span className="confidence-indicator-sources">
            {sources} {sources === 1 ? 'Quelle' : 'Quellen'}
          </span>
        </>
      )}
    </span>
  );
}
