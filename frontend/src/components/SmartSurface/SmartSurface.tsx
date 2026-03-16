/**
 * SmartSurface - Proactive suggestion bar (Phase 69.1, enhanced Phase 6.1)
 *
 * Renders below the TopBar, shows max 3 suggestion cards horizontally.
 * Slides in/out with animation. Glassmorphism design.
 * Injects a Morning Briefing card when time is 6-11 AM.
 */

import { useMemo } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { useSmartSuggestions, isMorningBriefingTime } from '../../hooks/useSmartSuggestions';
import type { SmartSuggestion } from '../../hooks/useSmartSuggestions';
import { SuggestionCard } from './SuggestionCard';
import './SmartSurface.css';

interface SmartSurfaceProps {
  context: AIContext;
}

/**
 * Build a synthetic morning briefing suggestion from existing suggestions metadata.
 */
function buildMorningBriefing(suggestions: SmartSuggestion[]): SmartSuggestion {
  // Count relevant items from existing suggestions to populate the briefing
  let tasksDueToday = 0;
  let unreadEmails = 0;
  let upcomingEvents = 0;

  for (const s of suggestions) {
    if (s.type === 'task_reminder') tasksDueToday++;
    if (s.type === 'email_followup') unreadEmails++;
    if (s.type === 'meeting_prep') upcomingEvents++;
  }

  const dayOfWeek = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][new Date().getDay()];
  const dateStr = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });

  return {
    id: '__morning_briefing__',
    userId: '',
    type: 'morning_briefing',
    title: 'Guten Morgen',
    description: `${dayOfWeek}, ${dateStr} \u2014 Hier ist dein Tagesuberblick.`,
    metadata: {
      greeting: 'Guten Morgen',
      tasksDueToday,
      unreadEmails,
      upcomingEvents,
    },
    priority: 999,
    status: 'active',
    snoozedUntil: null,
    dismissedAt: null,
    createdAt: new Date().toISOString(),
  };
}

export function SmartSurface({ context }: SmartSurfaceProps) {
  const { suggestions, loading, dismiss, snooze, accept } = useSmartSuggestions(context);

  const displaySuggestions = useMemo(() => {
    const showBriefing = isMorningBriefingTime();

    // If it's morning briefing time and there's no existing briefing card from the backend,
    // prepend a synthetic one
    if (showBriefing && !suggestions.some(s => s.type === 'morning_briefing')) {
      const briefing = buildMorningBriefing(suggestions);
      // Show briefing + up to 2 other suggestions (max 3 total)
      return [briefing, ...suggestions.slice(0, 2)];
    }

    return suggestions;
  }, [suggestions]);

  // Don't render anything while loading or if no suggestions
  if (loading || displaySuggestions.length === 0) {
    return null;
  }

  const handleDismiss = (id: string) => {
    // Synthetic briefing cards are just removed from view (no backend call)
    if (id === '__morning_briefing__') return;
    dismiss(id);
  };

  const handleSnooze = (id: string, duration: '1h' | '4h' | 'tomorrow') => {
    if (id === '__morning_briefing__') return;
    snooze(id, duration);
  };

  const handleAccept = (id: string) => {
    if (id === '__morning_briefing__') return;
    accept(id);
  };

  return (
    <div className="ds-smart-surface" role="complementary" aria-label="Vorschlaege">
      <div className="ds-smart-surface-inner">
        {displaySuggestions.map((s, i) => (
          <div
            key={s.id}
            className="ds-smart-surface-item"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <SuggestionCard
              suggestion={s}
              onDismiss={handleDismiss}
              onSnooze={handleSnooze}
              onAccept={handleAccept}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
