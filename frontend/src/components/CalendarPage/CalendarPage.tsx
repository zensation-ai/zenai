/**
 * CalendarPage - Phase 35
 *
 * AI-powered calendar with month/week/day views.
 * Integrates with voice memo intent detection for auto-created events.
 */

import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import type { CalendarView, CalendarEvent, CreateEventInput } from './types';
import { useCalendarData } from './useCalendarData';
import { CalendarEventForm } from './CalendarEventForm';
import { SkeletonLoader } from '../SkeletonLoader';
import './CalendarPage.css';

const CalendarMonthView = lazy(() => import('./CalendarMonthView').then(m => ({ default: m.CalendarMonthView })));
const CalendarWeekView = lazy(() => import('./CalendarWeekView').then(m => ({ default: m.CalendarWeekView })));
const CalendarDayView = lazy(() => import('./CalendarDayView').then(m => ({ default: m.CalendarDayView })));

interface CalendarPageProps {
  context?: string;
  embedded?: boolean;
}

export function CalendarPage({ context = 'personal', embedded = false }: CalendarPageProps) {
  const [view, setView] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showEventForm, setShowEventForm] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [prefilledStart, setPrefilledStart] = useState<Date | null>(null);

  // Calculate date range for data fetching
  const { rangeStart, rangeEnd } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const day = currentDate.getDate();
    const dow = currentDate.getDay();

    switch (view) {
      case 'month': {
        const start = new Date(year, month, 1);
        start.setDate(start.getDate() - start.getDay()); // Start from Sunday/Monday
        const end = new Date(year, month + 1, 0);
        end.setDate(end.getDate() + (6 - end.getDay())); // End at Saturday/Sunday
        end.setHours(23, 59, 59, 999);
        return { rangeStart: start, rangeEnd: end };
      }
      case 'week': {
        const start = new Date(year, month, day - ((dow + 6) % 7)); // Monday
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { rangeStart: start, rangeEnd: end };
      }
      case 'day': {
        const start = new Date(year, month, day, 0, 0, 0);
        const end = new Date(year, month, day, 23, 59, 59, 999);
        return { rangeStart: start, rangeEnd: end };
      }
    }
  }, [view, currentDate]);

  const { events, loading, error, refetch, createEvent, deleteEvent } = useCalendarData(
    context,
    rangeStart,
    rangeEnd
  );

  // Navigation
  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  const goPrev = useCallback(() => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (view === 'month') d.setMonth(d.getMonth() - 1);
      else if (view === 'week') d.setDate(d.getDate() - 7);
      else d.setDate(d.getDate() - 1);
      return d;
    });
  }, [view]);

  const goNext = useCallback(() => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (view === 'month') d.setMonth(d.getMonth() + 1);
      else if (view === 'week') d.setDate(d.getDate() + 7);
      else d.setDate(d.getDate() + 1);
      return d;
    });
  }, [view]);

  // Event handling
  const handleEventClick = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    setShowEventForm(true);
  }, []);

  const handleDateClick = useCallback((date: Date) => {
    setPrefilledStart(date);
    setSelectedEvent(null);
    setShowEventForm(true);
  }, []);

  const handleCreateEvent = useCallback(async (input: CreateEventInput) => {
    const result = await createEvent(input);
    if (result) {
      setShowEventForm(false);
      setSelectedEvent(null);
      setPrefilledStart(null);
    }
    return result;
  }, [createEvent]);

  const handleDeleteEvent = useCallback(async (id: string) => {
    const success = await deleteEvent(id);
    if (success) {
      setShowEventForm(false);
      setSelectedEvent(null);
    }
    return success;
  }, [deleteEvent]);

  const handleCloseForm = useCallback(() => {
    setShowEventForm(false);
    setSelectedEvent(null);
    setPrefilledStart(null);
  }, []);

  // Title
  const title = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions = {};
    if (view === 'month') {
      opts.month = 'long';
      opts.year = 'numeric';
    } else if (view === 'week') {
      const weekStart = new Date(rangeStart);
      const weekEnd = new Date(rangeEnd);
      const startStr = weekStart.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
      const endStr = weekEnd.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${startStr} - ${endStr}`;
    } else {
      opts.weekday = 'long';
      opts.day = 'numeric';
      opts.month = 'long';
      opts.year = 'numeric';
    }
    return currentDate.toLocaleDateString('de-DE', opts);
  }, [view, currentDate, rangeStart, rangeEnd]);

  return (
    <div className={`calendar-page ${embedded ? 'calendar-page--embedded' : ''}`}>
      {!embedded && (
        <div className="calendar-page__header">
          <h1>Kalender</h1>
          <p className="calendar-page__subtitle">Termine, Deadlines & Erinnerungen</p>
        </div>
      )}

      {/* Toolbar */}
      <div className="calendar-toolbar">
        <div className="calendar-toolbar__nav">
          <button className="calendar-btn calendar-btn--icon" onClick={goPrev} title="Zurueck">
            &#8249;
          </button>
          <button className="calendar-btn calendar-btn--today" onClick={goToday}>
            Heute
          </button>
          <button className="calendar-btn calendar-btn--icon" onClick={goNext} title="Vor">
            &#8250;
          </button>
          <h2 className="calendar-toolbar__title">{title}</h2>
        </div>

        <div className="calendar-toolbar__actions">
          <div className="calendar-view-switcher">
            {(['month', 'week', 'day'] as CalendarView[]).map(v => (
              <button
                key={v}
                className={`calendar-view-btn ${view === v ? 'calendar-view-btn--active' : ''}`}
                onClick={() => setView(v)}
              >
                {v === 'month' ? 'Monat' : v === 'week' ? 'Woche' : 'Tag'}
              </button>
            ))}
          </div>
          <button
            className="calendar-btn calendar-btn--primary"
            onClick={() => { setSelectedEvent(null); setPrefilledStart(null); setShowEventForm(true); }}
          >
            + Neuer Termin
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="calendar-error">
          <span>{error}</span>
          <button onClick={refetch}>Erneut laden</button>
        </div>
      )}

      {/* Calendar View */}
      <div className="calendar-content">
        <Suspense fallback={<SkeletonLoader />}>
          {view === 'month' && (
            <CalendarMonthView
              currentDate={currentDate}
              events={events}
              loading={loading}
              onEventClick={handleEventClick}
              onDateClick={handleDateClick}
              onNavigateToDay={(date) => { setCurrentDate(date); setView('day'); }}
            />
          )}
          {view === 'week' && (
            <CalendarWeekView
              currentDate={currentDate}
              events={events}
              loading={loading}
              onEventClick={handleEventClick}
              onDateClick={handleDateClick}
            />
          )}
          {view === 'day' && (
            <CalendarDayView
              currentDate={currentDate}
              events={events}
              loading={loading}
              onEventClick={handleEventClick}
              onDateClick={handleDateClick}
            />
          )}
        </Suspense>
      </div>

      {/* Event Form Modal */}
      {showEventForm && (
        <CalendarEventForm
          event={selectedEvent}
          prefilledStart={prefilledStart}
          onSave={handleCreateEvent}
          onDelete={selectedEvent ? () => handleDeleteEvent(selectedEvent.id) : undefined}
          onClose={handleCloseForm}
        />
      )}
    </div>
  );
}

export default CalendarPage;
