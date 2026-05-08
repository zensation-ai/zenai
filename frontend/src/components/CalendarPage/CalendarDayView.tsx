/**
 * CalendarDayView - Phase 35
 * Single day view with hourly time slots.
 */

import { useMemo, type CSSProperties } from 'react';
import { Calendar } from 'lucide-react';
import type { CalendarEvent } from './types';
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS, EVENT_TYPE_ICONS } from './types';
import { DashboardSkeleton } from '../skeletons/PageSkeletons';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

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
    return <DashboardSkeleton />;
  }

  if (dayEvents.length === 0) {
    return (
      <EmptyState
        icon={<Calendar size={40} strokeWidth={1.5} />}
        title="Keine Termine heute"
        description="Erstelle einen neuen Termin für diesen Tag."
        action={
          <Button variant="default" size="sm" onClick={() => onDateClick(currentDate)}>
            Termin erstellen
          </Button>
        }
      />
    );
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
          <span className="ml-3 text-[var(--text-secondary)] text-sm">
            {dayEvents.length} {dayEvents.length === 1 ? 'Termin' : 'Termine'}
          </span>
        </div>
      </div>

      <div className="calendar-day__body">
        {HOURS.map(hour => (
          <div key={`row-${hour}`} className="contents">
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
                  className="calendar-event-block bg-[var(--bg)] top-[var(--et)] h-[var(--eh)]"
                  style={{
                    '--et': `${top}px`,
                    '--eh': `${height}px`,
                    '--bg': event.color || EVENT_TYPE_COLORS[event.event_type] || '#4A90D9',
                  } as CSSProperties}
                  onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                >
                  <div className="calendar-event-block__title">
                    {EVENT_TYPE_ICONS[event.event_type]} {event.title}
                    {event.ai_generated && <span className="calendar-event-ai-badge ml-1">KI</span>}
                  </div>
                  <div className="calendar-event-block__time">
                    {new Date(event.start_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    {event.end_time && ` - ${new Date(event.end_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
                    {event.location && ` | ${event.location}`}
                  </div>
                  {event.event_type !== 'appointment' && (
                    <div className="text-[0.6rem] opacity-85 mt-px">
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
