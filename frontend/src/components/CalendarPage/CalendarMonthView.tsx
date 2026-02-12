/**
 * CalendarMonthView - Phase 35
 * CSS Grid-based month view with event pills.
 */

import { useMemo } from 'react';
import type { CalendarEvent } from './types';
import { EVENT_TYPE_COLORS } from './types';

interface Props {
  currentDate: Date;
  events: CalendarEvent[];
  loading: boolean;
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
  onNavigateToDay: (date: Date) => void;
}

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MAX_VISIBLE_EVENTS = 3;

export function CalendarMonthView({ currentDate, events, loading, onEventClick, onDateClick, onNavigateToDay }: Props) {
  const cells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Start from Monday
    let startOffset = (firstDay.getDay() + 6) % 7;
    const cells: Array<{ date: Date; isCurrentMonth: boolean; isToday: boolean }> = [];

    // Previous month fill
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      cells.push({ date: d, isCurrentMonth: false, isToday: false });
    }

    // Current month
    const today = new Date();
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const isToday = date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
      cells.push({ date, isCurrentMonth: true, isToday });
    }

    // Next month fill (complete 6 rows)
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false, isToday: false });
    }

    return cells;
  }, [currentDate]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const dateKey = new Date(event.start_time).toDateString();
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(event);
    }
    return map;
  }, [events]);

  if (loading) {
    return <div className="calendar-loading">Lade Kalender...</div>;
  }

  return (
    <div className="calendar-month">
      <div className="calendar-month__header">
        {DAY_LABELS.map(d => (
          <div key={d} className="calendar-month__day-label">{d}</div>
        ))}
      </div>
      <div className="calendar-month__grid">
        {cells.map((cell, idx) => {
          const dayEvents = eventsByDate.get(cell.date.toDateString()) || [];
          const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
          const extraCount = dayEvents.length - MAX_VISIBLE_EVENTS;

          return (
            <div
              key={idx}
              className={[
                'calendar-month__cell',
                !cell.isCurrentMonth ? 'calendar-month__cell--other-month' : '',
                cell.isToday ? 'calendar-month__cell--today' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onDateClick(new Date(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate(), 9, 0))}
            >
              <div className="calendar-month__cell-date">
                {cell.date.getDate()}
              </div>
              <div className="calendar-month__events">
                {visibleEvents.map(event => (
                  <div
                    key={event.id}
                    className="calendar-event-pill"
                    style={{ backgroundColor: event.color || EVENT_TYPE_COLORS[event.event_type] || '#4A90D9' }}
                    onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                    title={event.title}
                  >
                    {!event.all_day && (
                      <span className="calendar-event-pill__time">
                        {new Date(event.start_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <span>{event.title}</span>
                    {event.ai_generated && <span className="calendar-event-ai-badge">KI</span>}
                  </div>
                ))}
                {extraCount > 0 && (
                  <div
                    className="calendar-month__more"
                    onClick={(e) => { e.stopPropagation(); onNavigateToDay(cell.date); }}
                  >
                    +{extraCount} weitere
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
