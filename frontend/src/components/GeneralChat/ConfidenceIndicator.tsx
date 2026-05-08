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

import { cn } from '@/lib/utils';

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

const DOT_COLORS: Record<Level, string> = {
  high: 'bg-green-500',
  medium: 'bg-amber-500',
  low: 'bg-red-500',
};

export function ConfidenceIndicator({ confidence, sources }: ConfidenceIndicatorProps) {
  if (confidence == null) return null;

  const level = getLevel(confidence);
  const percent = Math.round(confidence * 100);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] text-text-muted py-0.5 leading-snug"
      role="status"
      aria-label={`${LEVEL_LABELS[level]} (${percent}%)${sources != null ? `, ${sources} Quellen` : ''}`}
    >
      <span className={cn('size-1.5 rounded-full shrink-0', DOT_COLORS[level])} aria-hidden="true" />
      <span className="text-text-muted">
        Konfidenz: {percent}%
      </span>
      {sources != null && sources > 0 && (
        <>
          <span className="text-glass-border select-none" aria-hidden="true">{'\u{00B7}'}</span>
          <span className="text-text-muted">
            {sources} {sources === 1 ? 'Quelle' : 'Quellen'}
          </span>
        </>
      )}
    </span>
  );
}
