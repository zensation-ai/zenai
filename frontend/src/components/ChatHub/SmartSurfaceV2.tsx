/**
 * SmartSurfaceV2 — Proactive, time-aware suggestion cards (Phase 104)
 *
 * Evolution of SmartSurface (Phase 69). Key differences:
 * - Glass L1 cards with spring entry animation
 * - Max 3 cards, empty = completely hidden (no "all caught up")
 * - Staggered animation: 0ms, 100ms, 200ms
 * - Horizontal scroll on mobile
 * - aria-live for screen readers
 */

import { useMemo } from 'react';
import type { AIContext } from '../ContextSwitcher';
import { useSmartSuggestions, isMorningBriefingTime } from '../../hooks/useSmartSuggestions';
import type { SmartSuggestion } from '../../hooks/useSmartSuggestions';
import { X, ChevronRight } from 'lucide-react';
import './SmartSurfaceV2.css';

const MAX_CARDS = 3;
const STAGGER_MS = 100;

interface SmartSurfaceV2Props {
  context: AIContext;
}

/** Map suggestion types to compact icon + color pairs */
function getCardMeta(type: string): { emoji: string; accentVar: string } {
  switch (type) {
    case 'morning_briefing': return { emoji: '\u2600\uFE0F', accentVar: 'var(--color-warning)' };
    case 'task_reminder': return { emoji: '\u2705', accentVar: 'var(--color-success)' };
    case 'email_followup': return { emoji: '\u2709\uFE0F', accentVar: 'var(--color-accent-2)' };
    case 'meeting_prep': return { emoji: '\uD83D\uDCC5', accentVar: 'var(--color-accent)' };
    case 'contradiction': return { emoji: '\u26A0\uFE0F', accentVar: 'var(--color-danger)' };
    case 'learning_suggestion': return { emoji: '\uD83D\uDCDA', accentVar: 'var(--ctx-learning)' };
    case 'pattern_detected': return { emoji: '\uD83D\uDD0D', accentVar: 'var(--color-accent)' };
    default: return { emoji: '\uD83D\uDCA1', accentVar: 'var(--color-accent)' };
  }
}

/** Build a synthetic morning briefing card */
function buildMorningBriefing(suggestions: SmartSuggestion[]): SmartSuggestion {
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
    description: `${dayOfWeek}, ${dateStr} \u2014 ${tasksDueToday} Aufgaben, ${unreadEmails} E-Mails, ${upcomingEvents} Termine`,
    metadata: { tasksDueToday, unreadEmails, upcomingEvents },
    priority: 999,
    status: 'active',
    snoozedUntil: null,
    dismissedAt: null,
    createdAt: new Date().toISOString(),
  };
}

export function SmartSurfaceV2({ context }: SmartSurfaceV2Props) {
  const { suggestions, loading, dismiss, accept } = useSmartSuggestions(context);

  const cards = useMemo(() => {
    const showBriefing = isMorningBriefingTime();
    let result = [...suggestions];

    if (showBriefing && !result.some(s => s.type === 'morning_briefing')) {
      result = [buildMorningBriefing(suggestions), ...result];
    }

    return result.slice(0, MAX_CARDS);
  }, [suggestions]);

  // Empty = hidden. No skeleton, no placeholder. Calm technology.
  if (loading || cards.length === 0) {
    return null;
  }

  const handleDismiss = (id: string) => {
    if (id === '__morning_briefing__') return;
    dismiss(id);
  };

  const handleAccept = (id: string) => {
    if (id === '__morning_briefing__') return;
    accept(id);
  };

  return (
    <section
      className="smart-surface-v2"
      role="region"
      aria-live="polite"
      aria-label="Proaktive Vorschlaege"
    >
      <div className="smart-surface-v2__track">
        {cards.map((card, i) => {
          const { emoji, accentVar } = getCardMeta(card.type);
          return (
            <article
              key={card.id}
              className="smart-surface-v2__card"
              style={{
                animationDelay: `${i * STAGGER_MS}ms`,
                '--card-accent': accentVar,
              } as React.CSSProperties}
            >
              <div className="smart-surface-v2__card-icon">{emoji}</div>
              <div className="smart-surface-v2__card-body">
                <h3 className="smart-surface-v2__card-title">{card.title}</h3>
                {card.description && (
                  <p className="smart-surface-v2__card-desc">{card.description}</p>
                )}
              </div>
              <div className="smart-surface-v2__card-actions">
                <button
                  className="smart-surface-v2__action smart-surface-v2__action--accept"
                  onClick={() => handleAccept(card.id)}
                  aria-label="Aktion ausfuehren"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  className="smart-surface-v2__action smart-surface-v2__action--dismiss"
                  onClick={() => handleDismiss(card.id)}
                  aria-label="Verwerfen"
                >
                  <X size={14} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
