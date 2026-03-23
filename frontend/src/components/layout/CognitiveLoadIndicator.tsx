/**
 * CognitiveLoadIndicator - Ambient Cognitive Load Widget
 *
 * Phase 88: Small TopBar widget showing the user's current
 * interruptibility level as a colored dot with tooltip.
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { AIContext } from '../ContextSwitcher';
import './CognitiveLoadIndicator.css';

interface InterruptibilityData {
  score: number;
  level: 'dnd' | 'low' | 'normal' | 'available';
  reason: string;
}

interface CognitiveLoadIndicatorProps {
  context: AIContext;
}

const LEVEL_COLORS: Record<string, string> = {
  available: 'var(--color-success, #22c55e)',
  normal: 'var(--color-warning, #eab308)',
  low: 'var(--color-orange, #f97316)',
  dnd: 'var(--color-error, #ef4444)',
};

const LEVEL_LABELS: Record<string, string> = {
  available: 'Verfuegbar',
  normal: 'Normal',
  low: 'Beschaeftigt',
  dnd: 'Nicht stoeren',
};

export function CognitiveLoadIndicator({ context }: CognitiveLoadIndicatorProps) {
  const [data, setData] = useState<InterruptibilityData | null>(null);
  const [focusActive, setFocusActive] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const [interruptRes, focusRes] = await Promise.allSettled([
        axios.get(`/api/${context}/interruptibility`),
        axios.get(`/api/${context}/focus/status`),
      ]);

      if (interruptRes.status === 'fulfilled' && interruptRes.value.data.success) {
        setData(interruptRes.value.data.data);
      }
      if (focusRes.status === 'fulfilled' && focusRes.value.data.success) {
        setFocusActive(focusRes.value.data.data.active ?? false);
      }
    } catch {
      // Silently fail
    }
  }, [context]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (!data) return null;

  const color = LEVEL_COLORS[data.level] ?? LEVEL_COLORS.normal;
  const label = LEVEL_LABELS[data.level] ?? 'Unbekannt';

  return (
    <div className="cognitive-load-indicator" title={`${label}: ${data.reason}`}>
      {focusActive ? (
        <span className="cognitive-load-focus-icon" aria-label="Focus Mode aktiv">
          {'\u{1F3AF}'}
        </span>
      ) : (
        <span
          className={`cognitive-load-dot cognitive-load-dot--${data.level}`}
          style={{ backgroundColor: color }}
          aria-label={`Kognitive Last: ${label}`}
        />
      )}
      <span className="cognitive-load-tooltip">
        <strong>{label}</strong>
        <br />
        <span className="cognitive-load-tooltip-detail">{data.reason}</span>
        {focusActive && (
          <>
            <br />
            <span className="cognitive-load-tooltip-focus">Focus Mode aktiv</span>
          </>
        )}
      </span>
    </div>
  );
}
