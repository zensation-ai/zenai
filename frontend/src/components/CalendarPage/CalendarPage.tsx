/**
 * CalendarPage - Phase 40
 *
 * AI-powered calendar with month/week/day views.
 * Features: iCloud sync, KI-Briefing, Smart Scheduling, Conflict Detection.
 */

import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import type { CalendarView, CalendarEvent, CreateEventInput } from './types';
import { useCalendarData } from './useCalendarData';
import { useCalendarAI } from './useCalendarAI';
import { useCalendarAccounts } from './useCalendarAccounts';
import { CalendarEventForm } from './CalendarEventForm';
import { CalendarBriefing } from './CalendarBriefing';
import { CalendarAccountsPanel } from './CalendarAccountsPanel';
import { SkeletonLoader } from '../SkeletonLoader';
import { RisingBubbles } from '../RisingBubbles';
import type { AIContext } from '../ContextSwitcher';
import './CalendarPage.css';

const CalendarMonthView = lazy(() => import('./CalendarMonthView').then(m => ({ default: m.CalendarMonthView })));
const CalendarWeekView = lazy(() => import('./CalendarWeekView').then(m => ({ default: m.CalendarWeekView })));
const CalendarDayView = lazy(() => import('./CalendarDayView').then(m => ({ default: m.CalendarDayView })));

interface CalendarPageProps {
  context?: AIContext;
  embedded?: boolean;
}

export function CalendarPage({ context = 'personal', embedded = false }: CalendarPageProps) {
  const [view, setView] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showEventForm, setShowEventForm] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [prefilledStart, setPrefilledStart] = useState<Date | null>(null);
  const [showAccountsPanel, setShowAccountsPanel] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);

  // Calculate date range for data fetching
  const { rangeStart, rangeEnd } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const day = currentDate.getDate();
    const dow = currentDate.getDay();

    switch (view) {
      case 'month': {
        const start = new Date(year, month, 1);
        start.setDate(start.getDate() - start.getDay());
        const end = new Date(year, month + 1, 0);
        end.setDate(end.getDate() + (6 - end.getDay()));
        end.setHours(23, 59, 59, 999);
        return { rangeStart: start, rangeEnd: end };
      }
      case 'week': {
        const start = new Date(year, month, day - ((dow + 6) % 7));
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

  const { events, loading, error, refetch, createEvent, updateEvent, deleteEvent } = useCalendarData(
    context, rangeStart, rangeEnd
  );

  // AI features
  const {
    briefing, briefingLoading, fetchBriefing,
    conflicts, conflictsLoading, fetchConflicts,
  } = useCalendarAI(context);

  // Calendar accounts (iCloud sync)
  const {
    accounts, loading: accountsLoading, error: accountsError,
    createAccount, deleteAccount, syncAccount, updateAccount,
  } = useCalendarAccounts(context);

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

  const handleSaveEvent = useCallback(async (input: CreateEventInput) => {
    if (selectedEvent) {
      const result = await updateEvent(selectedEvent.id, input);
      if (result) {
        setShowEventForm(false);
        setSelectedEvent(null);
        setPrefilledStart(null);
      }
      return result;
    }
    return handleCreateEvent(input);
  }, [selectedEvent, updateEvent, handleCreateEvent]);

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

  const hasConnectedAccounts = accounts.length > 0;
  const isToday = currentDate.toDateString() === new Date().toDateString();

  return (
    <div className={`calendar-page ${embedded ? 'calendar-page--embedded' : ''}`}>
      <RisingBubbles variant="subtle" />
      {!embedded && (
        <div className="calendar-page__header">
          <div className="calendar-page__header-row">
            <div>
              <h1>Kalender</h1>
              <p className="calendar-page__subtitle">
                Termine, Deadlines & Erinnerungen
                {hasConnectedAccounts && (
                  <span className="calendar-page__sync-badge">
                    <span className="calendar-page__sync-dot" />
                    iCloud verbunden
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="calendar-toolbar">
        <div className="calendar-toolbar__nav">
          <button className="calendar-btn calendar-btn--icon" onClick={goPrev} title="Zurück" aria-label="Zurück">
            &#8249;
          </button>
          <button className={`calendar-btn calendar-btn--today ${isToday ? 'calendar-btn--today-active' : ''}`} onClick={goToday}>
            Heute
          </button>
          <button className="calendar-btn calendar-btn--icon" onClick={goNext} title="Vor" aria-label="Vor">
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

          <div className="calendar-toolbar__separator" />

          <button
            className={`calendar-toolbar-btn ${showBriefing ? 'calendar-toolbar-btn--active' : ''}`}
            onClick={() => setShowBriefing(prev => !prev)}
            title="KI-Briefing anzeigen/verstecken"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1.5l1.5 3 3.5.5-2.5 2.5.5 3.5L7 9.5l-3 1.5.5-3.5L2 5l3.5-.5L7 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
            </svg>
            <span>KI</span>
          </button>

          <button
            className={`calendar-toolbar-btn ${hasConnectedAccounts ? 'calendar-toolbar-btn--connected' : ''}`}
            onClick={() => setShowAccountsPanel(true)}
            title={hasConnectedAccounts ? 'Kalender-Verbindungen verwalten' : 'Kalender verbinden'}
          >
            {hasConnectedAccounts ? (
              <>
                <span className="calendar-toolbar-btn__dot" />
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1.75 7C1.75 4.1 4.1 1.75 7 1.75c1.7 0 3.2.82 4.15 2.08M12.25 7c0 2.9-2.35 5.25-5.25 5.25-1.7 0-3.2-.82-4.15-2.08" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                  <path d="M10.5 1.75v2.33h-2.33M3.5 12.25V9.92h2.33" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Sync</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1.75v10.5M1.75 7h10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <span>Verbinden</span>
              </>
            )}
          </button>

          <button
            className="calendar-btn calendar-btn--primary"
            onClick={() => { setSelectedEvent(null); setPrefilledStart(null); setShowEventForm(true); }}
          >
            + Termin
          </button>
        </div>
      </div>

      {/* AI Briefing Panel */}
      {showBriefing && (
        <CalendarBriefing
          briefing={briefing}
          briefingLoading={briefingLoading}
          conflicts={conflicts}
          conflictsLoading={conflictsLoading}
          onFetchBriefing={fetchBriefing}
          onFetchConflicts={fetchConflicts}
          onClose={() => setShowBriefing(false)}
          currentDate={currentDate}
        />
      )}

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
          onSave={handleSaveEvent}
          onDelete={selectedEvent ? () => handleDeleteEvent(selectedEvent.id) : undefined}
          onClose={handleCloseForm}
          context={context}
        />
      )}

      {/* Calendar Accounts Panel (iCloud connection) */}
      {showAccountsPanel && (
        <CalendarAccountsPanel
          accounts={accounts}
          loading={accountsLoading}
          error={accountsError}
          onCreateAccount={createAccount}
          onDeleteAccount={deleteAccount}
          onSyncAccount={syncAccount}
          onUpdateAccount={updateAccount}
          onClose={() => { setShowAccountsPanel(false); refetch(); }}
        />
      )}
    </div>
  );
}

export default CalendarPage;
