/**
 * CalendarDayView - Phase 35
 * Single day view with hourly time slots.
 */

import { useMemo } from 'react';
import type { CalendarEvent } from './types';
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS, EVENT_TYPE_ICONS } from './types';

interface Props {
  currentDate: Date;
  events: CalendarEvent[];
  loading: boolean;
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SLOT_HEIGHT = 60;

export function CalendarDayView({ currentDate, events, loading, onEventClick, onDateClick }: Props) {
  const dayEvents = useMemo(() => {
    return events
      .filter(e => new Date(e.start_time).toDateString() === currentDate.toDateString())
      .map(event => {
        const start = new Date(event.start_time);
        const end = event.end_time ? new Date(event.end_time) : new Date(start.getTime() + 60 * 60 * 1000);
        const startMinutes = start.getHours() * 60 + start.getMinutes();
        const endMinutes = end.getHours() * 60 + end.getMinutes();
        const top = (startMinutes / 60) * SLOT_HEIGHT;
        const height = Math.max(((endMinutes - startMinutes) / 60) * SLOT_HEIGHT, 24);
        return { event, top, height };
      });
  }, [events, currentDate]);

  if (loading) {
    return <div className="calendar-loading">Lade Tagesansicht...</div>;
  }

  const dateStr = currentDate.toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="calendar-day">
      <div className="calendar-day__header">
        <div />
        <div className="calendar-day__header-info">
          <strong>{dateStr}</strong>
          <span style={{ marginLeft: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {dayEvents.length} {dayEvents.length === 1 ? 'Termin' : 'Termine'}
          </span>
        </div>
      </div>

      <div className="calendar-day__body">
        {HOURS.map(hour => (
          <div key={`row-${hour}`} style={{ display: 'contents' }}>
            <div className="calendar-day__time-label">
              {hour.toString().padStart(2, '0')}:00
            </div>
            <div
              className="calendar-day__slot"
              onClick={() => {
                const d = new Date(currentDate);
                d.setHours(hour, 0, 0, 0);
                onDateClick(d);
              }}
            >
              {hour === 0 && dayEvents.map(({ event, top, height }) => (
                <div
                  key={event.id}
                  className="calendar-event-block"
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    backgroundColor: event.color || EVENT_TYPE_COLORS[event.event_type] || '#4A90D9',
                  }}
                  onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                >
                  <div className="calendar-event-block__title">
                    {EVENT_TYPE_ICONS[event.event_type]} {event.title}
                    {event.ai_generated && <span className="calendar-event-ai-badge" style={{ marginLeft: 4 }}>KI</span>}
                  </div>
                  <div className="calendar-event-block__time">
                    {new Date(event.start_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    {event.end_time && ` - ${new Date(event.end_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
                    {event.location && ` | ${event.location}`}
                  </div>
                  {event.event_type !== 'appointment' && (
                    <div style={{ fontSize: '0.6rem', opacity: 0.85, marginTop: 1 }}>
                      {EVENT_TYPE_LABELS[event.event_type]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
