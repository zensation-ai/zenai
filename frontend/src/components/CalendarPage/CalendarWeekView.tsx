/**
 * CalendarWeekView - Phase 35
 * 7-column week view with hourly time slots.
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
}

const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 48;

export function CalendarWeekView({ currentDate, events, loading, onEventClick, onDateClick }: Props) {
  const weekDays = useMemo(() => {
    const dow = (currentDate.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(currentDate);
    monday.setDate(monday.getDate() - dow);

    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return {
        date: d,
        isToday: d.toDateString() === today.toDateString(),
        dayName: DAY_NAMES[i],
      };
    });
  }, [currentDate]);

  // Map events to day columns with position
  const eventPositions = useMemo(() => {
    const positions: Array<{
      event: CalendarEvent;
      dayIdx: number;
      top: number;
      height: number;
    }> = [];

    for (const event of events) {
      const start = new Date(event.start_time);
      const end = event.end_time ? new Date(event.end_time) : new Date(start.getTime() + 60 * 60 * 1000);
      const dayIdx = weekDays.findIndex(d => d.date.toDateString() === start.toDateString());
      if (dayIdx === -1) continue;

      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const endMinutes = end.getHours() * 60 + end.getMinutes();
      const top = (startMinutes / 60) * HOUR_HEIGHT;
      const height = Math.max(((endMinutes - startMinutes) / 60) * HOUR_HEIGHT, 20);

      positions.push({ event, dayIdx, top, height });
    }

    return positions;
  }, [events, weekDays]);

  if (loading) {
    return <div className="calendar-loading">Lade Wochenansicht...</div>;
  }

  return (
    <div className="calendar-week">
      {/* Header with day names and dates */}
      <div className="calendar-week__header">
        <div className="calendar-week__header-cell calendar-week__header-cell--time" />
        {weekDays.map((day, idx) => (
          <div
            key={idx}
            className={`calendar-week__header-cell ${day.isToday ? 'calendar-week__header-cell--today' : ''}`}
          >
            <div className="calendar-week__day-name">{day.dayName}</div>
            <div className="calendar-week__day-num">{day.date.getDate()}</div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="calendar-week__body">
        {HOURS.map(hour => (
          <div key={`row-${hour}`} style={{ display: 'contents' }}>
            <div className="calendar-week__time-label">
              {hour.toString().padStart(2, '0')}:00
            </div>
            {weekDays.map((day, dayIdx) => (
              <div
                key={`${hour}-${dayIdx}`}
                className="calendar-week__cell"
                onClick={() => {
                  const d = new Date(day.date);
                  d.setHours(hour, 0, 0, 0);
                  onDateClick(d);
                }}
              >
                {/* Render events positioned in this cell */}
                {hour === 0 && eventPositions
                  .filter(p => p.dayIdx === dayIdx)
                  .map(p => (
                    <div
                      key={p.event.id}
                      className="calendar-event-block"
                      style={{
                        top: `${p.top}px`,
                        height: `${p.height}px`,
                        backgroundColor: p.event.color || EVENT_TYPE_COLORS[p.event.event_type] || '#4A90D9',
                      }}
                      onClick={(e) => { e.stopPropagation(); onEventClick(p.event); }}
                      title={p.event.title}
                    >
                      <div className="calendar-event-block__title">{p.event.title}</div>
                      <div className="calendar-event-block__time">
                        {new Date(p.event.start_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                        {p.event.end_time && ` - ${new Date(p.event.end_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
