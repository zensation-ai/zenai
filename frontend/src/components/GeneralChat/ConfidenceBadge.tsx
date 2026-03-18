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

import { useState, useRef } from 'react';

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
      className="confidence-badge"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
      tabIndex={0}
      role="status"
      aria-label={`${config.label} (${percent}%)`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        marginLeft: '6px',
        position: 'relative',
        cursor: 'help',
        verticalAlign: 'middle',
      }}
    >
      <span
        className="confidence-dot"
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: config.color,
          flexShrink: 0,
        }}
      />
      {showTooltip && (
        <span
          className="confidence-tooltip"
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            fontSize: '11px',
            lineHeight: '1.3',
            padding: '4px 8px',
            borderRadius: '6px',
            background: 'var(--tooltip-bg, rgba(15, 23, 42, 0.92))',
            color: 'var(--tooltip-text, #f1f5f9)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          {config.label} ({percent}%)
        </span>
      )}
    </span>
  );
}
