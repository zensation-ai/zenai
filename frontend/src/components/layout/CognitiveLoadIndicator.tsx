/**
 * CognitiveLoadIndicator - Ambient Cognitive Load Widget
 *
 * Phase 88: Small TopBar widget showing the user's current
 * interruptibility level as a colored dot with tooltip.
 */

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import axios from 'axios';
import { cn } from '@/lib/utils';
import type { AIContext } from '../ContextSwitcher';

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

const LEVEL_GLOWS: Record<string, string> = {
  available: '0 0 4px rgba(34, 197, 94, 0.5)',
  normal: '0 0 4px rgba(234, 179, 8, 0.5)',
  low: '0 0 4px rgba(249, 115, 22, 0.5)',
  dnd: '0 0 4px rgba(239, 68, 68, 0.5)',
};

const LEVEL_LABELS: Record<string, string> = {
  available: 'Verfügbar',
  normal: 'Normal',
  low: 'Beschäftigt',
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
  const glow = LEVEL_GLOWS[data.level] ?? LEVEL_GLOWS.normal;
  const label = LEVEL_LABELS[data.level] ?? 'Unbekannt';

  return (
    <div className="relative inline-flex items-center justify-center cursor-default p-1 group" title={`${label}: ${data.reason}`}>
      {focusActive ? (
        <span className="text-sm leading-none animate-cognitive-pulse-focus" aria-label="Focus Mode aktiv">
          {'\u{1F3AF}'}
        </span>
      ) : (
        <span
          className={cn(
            'inline-block size-2 rounded-full transition-[background-color,box-shadow] duration-600 bg-[var(--bg)] [box-shadow:var(--glow)]',
            data.level === 'dnd' && 'animate-cognitive-pulse-dnd',
          )}
          style={{ '--bg': color, '--glow': glow } as CSSProperties}
          aria-label={`Kognitive Last: ${label}`}
        />
      )}
      <span className="hidden group-hover:block absolute top-[calc(100%+8px)] right-0 z-[200] min-w-45 px-3 py-2 rounded-lg text-xs leading-relaxed text-text bg-surface border border-border shadow-md pointer-events-none whitespace-normal">
        <strong>{label}</strong>
        <br />
        <span className="text-text-secondary text-[11px]">{data.reason}</span>
        {focusActive && (
          <>
            <br />
            <span className="text-primary font-semibold text-[11px]">Focus Mode aktiv</span>
          </>
        )}
      </span>
    </div>
  );
}
