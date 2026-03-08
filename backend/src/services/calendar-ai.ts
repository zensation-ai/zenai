/**
 * Calendar AI Service - Phase 40
 *
 * AI-powered calendar intelligence:
 * - Smart Scheduling: Find optimal time slots based on patterns
 * - Conflict Detection: Detect and resolve scheduling conflicts
 * - Daily Briefing: Morning summary with preparation tips
 */

import Anthropic from '@anthropic-ai/sdk';
import { queryContext, AIContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { getCalendarEvents, type CalendarEvent } from './calendar';

const anthropic = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

// ============================================================
// Daily Briefing
// ============================================================

export interface DailyBriefing {
  date: string;
  summary: string;
  event_count: number;
  busy_hours: number;
  free_slots: FreeSlot[];
  events: BriefingEvent[];
  tips: string[];
  focus_recommendation?: string;
}

interface BriefingEvent {
  id: string;
  title: string;
  start_time: string;
  end_time?: string;
  event_type: string;
  preparation?: string;
}

interface FreeSlot {
  start: string;
  end: string;
  duration_minutes: number;
}

export async function generateDailyBriefing(
  context: AIContext,
  date?: string
): Promise<DailyBriefing> {
  const targetDate = date ? new Date(date) : new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  // Also fetch tomorrow for prep info
  const tomorrowEnd = new Date(dayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  const events = await getCalendarEvents(context, {
    start: dayStart.toISOString(),
    end: dayEnd.toISOString(),
    limit: 50,
  });

  const tomorrowEvents = await getCalendarEvents(context, {
    start: dayEnd.toISOString(),
    end: tomorrowEnd.toISOString(),
    limit: 10,
  });

  // Calculate free slots (working hours 8-18)
  const freeSlots = calculateFreeSlots(events, dayStart, 8, 18);
  const busyMinutes = events.reduce((sum, e) => {
    if (!e.end_time) return sum + 60;
    return sum + (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000;
  }, 0);

  // Generate AI briefing
  const eventsDescription = events.map(e => {
    const start = new Date(e.start_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const end = e.end_time ? new Date(e.end_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
    return `- ${start}${end ? `-${end}` : ''}: ${e.title} (${e.event_type})${e.location ? ` @ ${e.location}` : ''}`;
  }).join('\n');

  const tomorrowDesc = tomorrowEvents.map(e => {
    const start = new Date(e.start_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `- ${start}: ${e.title}`;
  }).join('\n');

  const freeSlotsDesc = freeSlots.map(s => {
    const start = new Date(s.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const end = new Date(s.end).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `${start}-${end} (${s.duration_minutes} Min.)`;
  }).join(', ');

  const dateStr = targetDate.toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  let briefingContent: {
    summary: string;
    tips: string[];
    preparations: Record<string, string>;
    focus_recommendation: string;
  };

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: `Du bist ein intelligenter Kalender-Assistent. Erstelle ein kurzes, prägnantes Tages-Briefing auf Deutsch. Antworte NUR als JSON.`,
      messages: [{
        role: 'user',
        content: `Erstelle ein Tages-Briefing für ${dateStr}.

Termine heute:
${eventsDescription || '(Keine Termine)'}

Freie Zeitfenster (Arbeitszeit 8-18 Uhr):
${freeSlotsDesc || '(Keine freien Slots)'}

Morgen:
${tomorrowDesc || '(Keine Termine)'}

Antworte als JSON:
{
  "summary": "1-2 Sätze Zusammenfassung des Tages",
  "tips": ["3-5 praktische Tipps für den Tag"],
  "preparations": {"event_title": "Vorbereitungs-Empfehlung"},
  "focus_recommendation": "Empfehlung für Fokuszeiten"
}`
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    briefingContent = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      summary: 'Briefing konnte nicht generiert werden.',
      tips: [],
      preparations: {},
      focus_recommendation: '',
    };
  } catch (err) {
    logger.warn('AI briefing generation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    briefingContent = {
      summary: `${events.length} Termine heute.`,
      tips: ['Plane Pausen zwischen Meetings ein.'],
      preparations: {},
      focus_recommendation: freeSlots.length > 0 ? 'Nutze freie Slots für Fokusarbeit.' : '',
    };
  }

  const briefingEvents: BriefingEvent[] = events.map(e => ({
    id: e.id,
    title: e.title,
    start_time: e.start_time,
    end_time: e.end_time,
    event_type: e.event_type,
    preparation: briefingContent.preparations[e.title],
  }));

  // Cache the briefing
  const briefing: DailyBriefing = {
    date: dayStart.toISOString().split('T')[0],
    summary: briefingContent.summary,
    event_count: events.length,
    busy_hours: Math.round(busyMinutes / 60 * 10) / 10,
    free_slots: freeSlots,
    events: briefingEvents,
    tips: briefingContent.tips,
    focus_recommendation: briefingContent.focus_recommendation,
  };

  // Store in cache
  try {
    await queryContext(context, `
      INSERT INTO calendar_ai_insights (id, insight_type, insight_date, content, expires_at, context)
      VALUES ($1, 'daily_briefing', $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
    `, [
      require('uuid').v4(),
      briefing.date,
      JSON.stringify(briefing),
      new Date(dayEnd.getTime() + 6 * 60 * 60 * 1000).toISOString(), // Expires 6h after day end
      context,
    ]);
  } catch {
    // Cache write failure is non-critical
  }

  return briefing;
}

// ============================================================
// Smart Scheduling
// ============================================================

export interface SmartSuggestion {
  start_time: string;
  end_time: string;
  score: number;  // 0-100
  reason: string;
}

export async function suggestTimeSlots(
  context: AIContext,
  params: {
    title: string;
    duration_minutes: number;
    preferred_time?: 'morning' | 'afternoon' | 'evening';
    earliest_date?: string;
    latest_date?: string;
    participants?: string[];
  }
): Promise<SmartSuggestion[]> {
  const earliest = params.earliest_date ? new Date(params.earliest_date) : new Date();
  const latest = params.latest_date
    ? new Date(params.latest_date)
    : new Date(earliest.getTime() + 7 * 24 * 60 * 60 * 1000); // Next 7 days

  // Fetch existing events for the time range
  const events = await getCalendarEvents(context, {
    start: earliest.toISOString(),
    end: latest.toISOString(),
    limit: 200,
  });

  // Analyze patterns: when does the user typically schedule similar events?
  const patternEvents = await getCalendarEvents(context, {
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date().toISOString(),
    limit: 200,
  });

  // Calculate preferred hours from history
  const hourHistogram = new Array(24).fill(0);
  for (const e of patternEvents) {
    const hour = new Date(e.start_time).getHours();
    hourHistogram[hour]++;
  }

  // Find free slots across the date range
  const suggestions: SmartSuggestion[] = [];
  const duration = params.duration_minutes;
  const currentDate = new Date(earliest);

  while (currentDate <= latest && suggestions.length < 5) {
    // Skip weekends for work context
    const dow = currentDate.getDay();
    if (context === 'work' && (dow === 0 || dow === 6)) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    const dayStart = new Date(currentDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);

    const workStart = context === 'work' ? 9 : 8;
    const workEnd = context === 'work' ? 17 : 20;

    const dayEvents = events.filter(e => {
      const eDate = new Date(e.start_time);
      return eDate >= dayStart && eDate <= dayEnd;
    });

    const freeSlots = calculateFreeSlots(dayEvents, dayStart, workStart, workEnd);

    for (const slot of freeSlots) {
      if (slot.duration_minutes >= duration) {
        const slotStart = new Date(slot.start);
        const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

        // Score the slot
        let score = 50; // Base score

        // Prefer preferred time
        const hour = slotStart.getHours();
        if (params.preferred_time === 'morning' && hour >= 8 && hour < 12) score += 20;
        else if (params.preferred_time === 'afternoon' && hour >= 12 && hour < 17) score += 20;
        else if (params.preferred_time === 'evening' && hour >= 17) score += 20;

        // Boost based on historical preference
        score += Math.min(hourHistogram[hour] * 3, 15);

        // Buffer scoring: prefer slots with buffer before/after
        const minutesBefore = getMinutesToPrevEvent(dayEvents, slotStart);
        const minutesAfter = getMinutesToNextEvent(dayEvents, slotEnd);
        if (minutesBefore >= 30) score += 5;
        if (minutesAfter >= 30) score += 5;

        // Earlier in the week is slightly preferred
        const daysFromNow = Math.floor((slotStart.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        score -= daysFromNow * 2;

        score = Math.max(0, Math.min(100, score));

        const dayName = slotStart.toLocaleDateString('de-DE', { weekday: 'long' });
        const timeStr = slotStart.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

        suggestions.push({
          start_time: slotStart.toISOString(),
          end_time: slotEnd.toISOString(),
          score,
          reason: `${dayName} um ${timeStr} — ${slot.duration_minutes} Min. verfügbar`,
        });
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Sort by score descending
  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, 5);
}

// ============================================================
// Conflict Detection
// ============================================================

export interface ConflictInfo {
  type: 'overlap' | 'back_to_back' | 'travel_conflict' | 'overbooked_day';
  severity: 'warning' | 'error';
  events: Array<{ id: string; title: string; start_time: string; end_time?: string }>;
  message: string;
  suggestion?: string;
}

export async function detectConflicts(
  context: AIContext,
  dateRange?: { start: string; end: string }
): Promise<ConflictInfo[]> {
  const start = dateRange?.start || new Date().toISOString();
  const end = dateRange?.end || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const events = await getCalendarEvents(context, { start, end, limit: 200 });
  const conflicts: ConflictInfo[] = [];

  // Sort by start time
  const sorted = [...events].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  // Check overlaps
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    const currentEnd = current.end_time
      ? new Date(current.end_time)
      : new Date(new Date(current.start_time).getTime() + 60 * 60 * 1000);
    const nextStart = new Date(next.start_time);

    const overlap = currentEnd.getTime() - nextStart.getTime();

    if (overlap > 0) {
      conflicts.push({
        type: 'overlap',
        severity: 'error',
        events: [
          { id: current.id, title: current.title, start_time: current.start_time, end_time: current.end_time },
          { id: next.id, title: next.title, start_time: next.start_time, end_time: next.end_time },
        ],
        message: `"${current.title}" und "${next.title}" überschneiden sich um ${Math.round(overlap / 60000)} Min.`,
        suggestion: `Verschiebe "${next.title}" um ${Math.round(overlap / 60000)} Minuten nach hinten.`,
      });
    } else if (overlap === 0 || Math.abs(overlap) < 5 * 60 * 1000) {
      // Back-to-back (less than 5 min gap)
      conflicts.push({
        type: 'back_to_back',
        severity: 'warning',
        events: [
          { id: current.id, title: current.title, start_time: current.start_time, end_time: current.end_time },
          { id: next.id, title: next.title, start_time: next.start_time, end_time: next.end_time },
        ],
        message: `Kein Puffer zwischen "${current.title}" und "${next.title}".`,
        suggestion: 'Plane mindestens 10 Minuten Puffer zwischen Meetings ein.',
      });
    }

    // Travel conflict
    if (current.location && next.location && current.location !== next.location) {
      const gap = nextStart.getTime() - currentEnd.getTime();
      if (gap < 30 * 60 * 1000) { // Less than 30 min gap between different locations
        conflicts.push({
          type: 'travel_conflict',
          severity: 'warning',
          events: [
            { id: current.id, title: current.title, start_time: current.start_time, end_time: current.end_time },
            { id: next.id, title: next.title, start_time: next.start_time, end_time: next.end_time },
          ],
          message: `Ortswechsel von "${current.location}" zu "${next.location}" mit nur ${Math.round(gap / 60000)} Min. Puffer.`,
          suggestion: 'Prüfe, ob du genug Reisezeit hast.',
        });
      }
    }
  }

  // Overbooked day check
  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const day = new Date(e.start_time).toISOString().split('T')[0];
    if (!eventsByDay.has(day)) eventsByDay.set(day, []);
    eventsByDay.get(day)!.push(e);
  }

  for (const [day, dayEvents] of eventsByDay) {
    const totalMinutes = dayEvents.reduce((sum, e) => {
      if (!e.end_time) return sum + 60;
      return sum + (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000;
    }, 0);

    if (totalMinutes > 8 * 60) { // More than 8h of meetings
      conflicts.push({
        type: 'overbooked_day',
        severity: 'warning',
        events: dayEvents.map(e => ({
          id: e.id, title: e.title, start_time: e.start_time, end_time: e.end_time,
        })),
        message: `${new Date(day).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}: ${Math.round(totalMinutes / 60)}h Termine — Tag ist überbucht.`,
        suggestion: 'Versuche einige Termine zu verschieben oder abzusagen.',
      });
    }
  }

  return conflicts;
}

/**
 * Check conflicts for a specific event before creating/updating
 */
export async function checkEventConflicts(
  context: AIContext,
  startTime: string,
  endTime: string,
  excludeEventId?: string
): Promise<ConflictInfo[]> {
  const start = new Date(startTime);
  const end = new Date(endTime);

  // Fetch events that could overlap
  const bufferStart = new Date(start.getTime() - 30 * 60 * 1000);
  const bufferEnd = new Date(end.getTime() + 30 * 60 * 1000);

  const events = await getCalendarEvents(context, {
    start: bufferStart.toISOString(),
    end: bufferEnd.toISOString(),
    limit: 20,
  });

  const conflicts: ConflictInfo[] = [];
  const relevantEvents = events.filter(e => e.id !== excludeEventId);

  for (const existing of relevantEvents) {
    const existingStart = new Date(existing.start_time);
    const existingEnd = existing.end_time
      ? new Date(existing.end_time)
      : new Date(existingStart.getTime() + 60 * 60 * 1000);

    // Check overlap
    if (start < existingEnd && end > existingStart) {
      conflicts.push({
        type: 'overlap',
        severity: 'error',
        events: [{ id: existing.id, title: existing.title, start_time: existing.start_time, end_time: existing.end_time }],
        message: `Überschneidung mit "${existing.title}"`,
      });
    }
  }

  return conflicts;
}

// ============================================================
// Helpers
// ============================================================

function calculateFreeSlots(
  events: CalendarEvent[],
  dayStart: Date,
  workStartHour: number,
  workEndHour: number
): FreeSlot[] {
  const slots: FreeSlot[] = [];
  const workStart = new Date(dayStart);
  workStart.setHours(workStartHour, 0, 0, 0);
  const workEnd = new Date(dayStart);
  workEnd.setHours(workEndHour, 0, 0, 0);

  // Filter to non-cancelled, non-all-day events within working hours
  const dayEvents = events
    .filter(e => !e.all_day && e.status !== 'cancelled')
    .map(e => ({
      start: new Date(e.start_time),
      end: e.end_time ? new Date(e.end_time) : new Date(new Date(e.start_time).getTime() + 60 * 60 * 1000),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  let cursor = workStart;

  for (const event of dayEvents) {
    const eventStart = event.start < workStart ? workStart : event.start;
    const eventEnd = event.end > workEnd ? workEnd : event.end;

    if (cursor < eventStart) {
      const gap = (eventStart.getTime() - cursor.getTime()) / 60000;
      if (gap >= 15) { // At least 15 min
        slots.push({
          start: cursor.toISOString(),
          end: eventStart.toISOString(),
          duration_minutes: Math.round(gap),
        });
      }
    }

    if (eventEnd > cursor) {
      cursor = eventEnd;
    }
  }

  // Remaining time until work end
  if (cursor < workEnd) {
    const gap = (workEnd.getTime() - cursor.getTime()) / 60000;
    if (gap >= 15) {
      slots.push({
        start: cursor.toISOString(),
        end: workEnd.toISOString(),
        duration_minutes: Math.round(gap),
      });
    }
  }

  return slots;
}

function getMinutesToPrevEvent(events: CalendarEvent[], time: Date): number {
  let minGap = Infinity;
  for (const e of events) {
    const eEnd = e.end_time ? new Date(e.end_time) : new Date(new Date(e.start_time).getTime() + 60 * 60 * 1000);
    if (eEnd <= time) {
      const gap = (time.getTime() - eEnd.getTime()) / 60000;
      if (gap < minGap) minGap = gap;
    }
  }
  return minGap === Infinity ? 999 : minGap;
}

function getMinutesToNextEvent(events: CalendarEvent[], time: Date): number {
  let minGap = Infinity;
  for (const e of events) {
    const eStart = new Date(e.start_time);
    if (eStart >= time) {
      const gap = (eStart.getTime() - time.getTime()) / 60000;
      if (gap < minGap) minGap = gap;
    }
  }
  return minGap === Infinity ? 999 : minGap;
}
