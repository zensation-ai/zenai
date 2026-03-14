/**
 * SmartSurface - Proactive suggestion bar (Phase 69.1)
 *
 * Renders below the TopBar, shows max 3 suggestion cards horizontally.
 * Slides in/out with animation. Glassmorphism design.
 */

import type { AIContext } from '../ContextSwitcher';
import { useSmartSuggestions } from '../../hooks/useSmartSuggestions';
import { SuggestionCard } from './SuggestionCard';
import './SmartSurface.css';

interface SmartSurfaceProps {
  context: AIContext;
}

export function SmartSurface({ context }: SmartSurfaceProps) {
  const { suggestions, loading, dismiss, snooze, accept } = useSmartSuggestions(context);

  // Don't render anything while loading or if no suggestions
  if (loading || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="ds-smart-surface" role="complementary" aria-label="Vorschlaege">
      <div className="ds-smart-surface-inner">
        {suggestions.map((s, i) => (
          <div
            key={s.id}
            className="ds-smart-surface-item"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <SuggestionCard
              suggestion={s}
              onDismiss={dismiss}
              onSnooze={snooze}
              onAccept={accept}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
