/**
 * ConfidenceBadge - Subtle RAG confidence indicator
 *
 * Displays a colored dot next to the timestamp on assistant messages
 * when rag_confidence metadata is present. Hover shows a tooltip.
 *
 * Levels:
 * - > 0.75: green dot  "Hohe Sicherheit"
 * - 0.45-0.75: amber dot  "Mittlere Sicherheit"
 * - < 0.45: red dot  "Geringe Sicherheit"
 */

import { useState, useRef, type CSSProperties } from 'react';

export interface ConfidenceBadgeProps {
  confidence: number;
}

type ConfidenceLevel = 'high' | 'medium' | 'low';

function getLevel(confidence: number): ConfidenceLevel {
  if (confidence > 0.75) return 'high';
  if (confidence >= 0.45) return 'medium';
  return 'low';
}

const LEVEL_CONFIG: Record<ConfidenceLevel, { color: string; label: string }> = {
  high: { color: '#22c55e', label: 'Hohe Sicherheit' },
  medium: { color: '#f59e0b', label: 'Mittlere Sicherheit' },
  low: { color: '#ef4444', label: 'Geringe Sicherheit' },
};

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const level = getLevel(confidence);
  const config = LEVEL_CONFIG[level];
  const percent = Math.round(confidence * 100);

  return (
    <span
      ref={ref}
      className="confidence-badge inline-flex items-center gap-1 ml-1.5 relative cursor-help align-middle"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
      tabIndex={0}
      role="status"
      aria-label={`${config.label} (${percent}%)`}
    >
      <span
        className="confidence-dot inline-block size-[7px] rounded-full shrink-0"
        aria-hidden="true"
        style={{ backgroundColor: config.color } as CSSProperties}
      />
      {showTooltip && (
        <span
          className="confidence-tooltip absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] leading-[1.3] px-2 py-1 rounded-md bg-[var(--tooltip-bg,rgba(15,23,42,0.92))] text-[var(--tooltip-text,#f1f5f9)] shadow-[0_2px_8px_rgba(0,0,0,0.18)] z-10 pointer-events-none"
          role="tooltip"
        >
          {config.label} ({percent}%)
        </span>
      )}
    </span>
  );
}
