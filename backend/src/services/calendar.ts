/**
 * Calendar Service - Phase 35
 *
 * AI-powered calendar with context isolation across all 4 schemas.
 * Supports events, reminders, recurring events (rrule), and travel blocks.
 */

import { v4 as uuidv4 } from 'uuid';
import { RRule } from 'rrule';
import { queryContext, AIContext } from '../utils/database-context';
import { generateEmbedding } from '../utils/ollama';
import { formatForPgVector } from '../utils/embedding';
import { logger } from '../utils/logger';

// ============================================================
// Types
// ============================================================

export type EventType = 'appointment' | 'reminder' | 'deadline' | 'travel_block' | 'focus_time';
export type EventStatus = 'tentative' | 'confirmed' | 'cancelled';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  event_type: EventType;
  start_time: string;
  end_time?: string;
  all_day: boolean;
  location?: string;
  participants: string[];
  rrule?: string;
  recurrence_parent_id?: string;
  recurrence_exception: boolean;
  source_idea_id?: string;
  source_voice_memo_id?: string;
  travel_duration_minutes?: number;
  travel_origin?: string;
  travel_destination?: string;
  status: EventStatus;
  color?: string;
  context: string;
  reminder_minutes: number[];
  notes?: string;
  metadata: Record<string, unknown>;
  ai_generated: boolean;
  ai_confidence?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  event_type?: EventType;
  start_time: string;
  end_time?: string;
  all_day?: boolean;
  location?: string;
  participants?: string[];
  rrule?: string;
  source_idea_id?: string;
  source_voice_memo_id?: string;
  travel_duration_minutes?: number;
  travel_origin?: string;
  travel_destination?: string;
  status?: EventStatus;
  color?: string;
  reminder_minutes?: number[];
  notes?: string;
  metadata?: Record<string, unknown>;
  ai_generated?: boolean;
  ai_confidence?: number;
}

export interface CalendarEventFilters {
  start?: string;
  end?: string;
  event_type?: EventType;
  status?: EventStatus;
  limit?: number;
  offset?: number;
}

export interface CalendarReminder {
  id: string;
  event_id: string;
  remind_at: string;
  type: 'push' | 'in_app' | 'email';
  sent: boolean;
  sent_at?: string;
  context: string;
  created_at: string;
  // Joined fields
  event_title?: string;
  event_start_time?: string;
}

// ============================================================
// Core CRUD
// ============================================================

/**
 * Create a calendar event with automatic reminder generation
 */
export async function createCalendarEvent(
  context: AIContext,
  input: CreateCalendarEventInput
): Promise<CalendarEvent> {
  const id = uuidv4();
  const now = new Date().toISOString();

  const eventType = input.event_type || 'appointment';
  const status = input.status || 'confirmed';
  const reminderMinutes = input.reminder_minutes || [15];
  const participants = input.participants || [];
  const metadata = input.metadata || {};
  const allDay = input.all_day || false;
  const aiGenerated = input.ai_generated || false;

  // Generate embedding for semantic search
  let embeddingStr: string | null = null;
  try {
    const searchText = `${input.title} ${input.description || ''} ${input.location || ''}`.trim();
    const embedding = await generateEmbedding(searchText);
    if (embedding && embedding.length > 0) {
      embeddingStr = formatForPgVector(embedding);
    }
  } catch (err) {
    logger.warn('Failed to generate calendar event embedding', { id, error: (err as Error).message });
  }

  const result = await queryContext(context, `
    INSERT INTO calendar_events (
      id, title, description, event_type, start_time, end_time, all_day,
      location, participants, rrule, source_idea_id, source_voice_memo_id,
      travel_duration_minutes, travel_origin, travel_destination,
      status, color, context, reminder_minutes, notes, metadata,
      ai_generated, ai_confidence, embedding, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12,
      $13, $14, $15,
      $16, $17, $18, $19, $20, $21,
      $22, $23, $24, $25, $25
    )
    RETURNING *
  `, [
    id, input.title, input.description || null, eventType,
    input.start_time, input.end_time || null, allDay,
    input.location || null, JSON.stringify(participants),
    input.rrule || null, input.source_idea_id || null, input.source_voice_memo_id || null,
    input.travel_duration_minutes || null, input.travel_origin || null, input.travel_destination || null,
    status, input.color || null, context, JSON.stringify(reminderMinutes),
    input.notes || null, JSON.stringify(metadata),
    aiGenerated, input.ai_confidence || null, embeddingStr,
    now
  ]);

  const event = mapRowToEvent(result.rows[0]);

  // Generate reminders
  await generateReminders(context, event);

  logger.info('Calendar event created', {
    id, title: input.title, eventType, context, aiGenerated,
    operation: 'createCalendarEvent'
  });

  return event;
}

/**
 * Get calendar events for a date range
 */
export async function getCalendarEvents(
  context: AIContext,
  filters: CalendarEventFilters
): Promise<CalendarEvent[]> {
  const conditions: string[] = ["status != 'cancelled'"];
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (filters.start) {
    conditions.push(`start_time >= $${paramIdx}`);
    params.push(filters.start);
    paramIdx++;
  }

  if (filters.end) {
    conditions.push(`(start_time <= $${paramIdx} OR start_time IS NOT NULL)`);
    params.push(filters.end);
    paramIdx++;
  }

  if (filters.event_type) {
    conditions.push(`event_type = $${paramIdx}`);
    params.push(filters.event_type);
    paramIdx++;
  }

  if (filters.status) {
    // Override the default status filter
    conditions[0] = `status = $${paramIdx}`;
    params.push(filters.status);
    paramIdx++;
  }

  const limit = Math.min(filters.limit || 100, 500);
  const offset = filters.offset || 0;

  const result = await queryContext(context, `
    SELECT * FROM calendar_events
    WHERE ${conditions.join(' AND ')}
    ORDER BY start_time ASC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `, [...params, limit, offset]);

  const events = result.rows.map(mapRowToEvent);

  // Expand recurring events if date range specified
  if (filters.start && filters.end) {
    const recurring = events.filter(e => e.rrule);
    const expanded: CalendarEvent[] = [];

    for (const event of recurring) {
      const instances = expandRecurringEvent(event, new Date(filters.start), new Date(filters.end));
      expanded.push(...instances);
    }

    // Replace recurring events with expanded instances
    const nonRecurring = events.filter(e => !e.rrule);
    return [...nonRecurring, ...expanded].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
  }

  return events;
}

/**
 * Get a single calendar event
 */
export async function getCalendarEvent(
  context: AIContext,
  id: string
): Promise<CalendarEvent | null> {
  const result = await queryContext(context, `
    SELECT * FROM calendar_events WHERE id = $1
  `, [id]);

  return result.rows.length > 0 ? mapRowToEvent(result.rows[0]) : null;
}

/**
 * Update a calendar event
 */
export async function updateCalendarEvent(
  context: AIContext,
  id: string,
  updates: Partial<CreateCalendarEventInput>
): Promise<CalendarEvent | null> {
  const setClauses: string[] = [];
  const params: (string | number | boolean | null)[] = [];
  let paramIdx = 1;

  const fieldMap: Record<string, string> = {
    title: 'title',
    description: 'description',
    event_type: 'event_type',
    start_time: 'start_time',
    end_time: 'end_time',
    all_day: 'all_day',
    location: 'location',
    rrule: 'rrule',
    status: 'status',
    color: 'color',
    notes: 'notes',
    travel_duration_minutes: 'travel_duration_minutes',
    travel_origin: 'travel_origin',
    travel_destination: 'travel_destination',
    ai_confidence: 'ai_confidence',
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in updates) {
      setClauses.push(`${column} = $${paramIdx}`);
      params.push((updates as Record<string, unknown>)[key] as string | number | boolean | null);
      paramIdx++;
    }
  }

  // JSON fields need special handling
  if (updates.participants !== undefined) {
    setClauses.push(`participants = $${paramIdx}`);
    params.push(JSON.stringify(updates.participants));
    paramIdx++;
  }
  if (updates.reminder_minutes !== undefined) {
    setClauses.push(`reminder_minutes = $${paramIdx}`);
    params.push(JSON.stringify(updates.reminder_minutes));
    paramIdx++;
  }
  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIdx}`);
    params.push(JSON.stringify(updates.metadata));
    paramIdx++;
  }

  if (setClauses.length === 0) return null;

  setClauses.push(`updated_at = NOW()`);

  const result = await queryContext(context, `
    UPDATE calendar_events
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIdx}
    RETURNING *
  `, [...params, id]);

  if (result.rows.length === 0) return null;

  const event = mapRowToEvent(result.rows[0]);

  // Regenerate reminders if time changed
  if (updates.start_time || updates.reminder_minutes) {
    await regenerateReminders(context, event);
  }

  logger.info('Calendar event updated', { id, context, operation: 'updateCalendarEvent' });
  return event;
}

/**
 * Delete (cancel) a calendar event
 */
export async function deleteCalendarEvent(
  context: AIContext,
  id: string
): Promise<boolean> {
  const result = await queryContext(context, `
    UPDATE calendar_events
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = $1 AND status != 'cancelled'
    RETURNING id
  `, [id]);

  if (result.rows.length > 0) {
    // Mark reminders as sent so they won't fire
    await queryContext(context, `
      UPDATE calendar_reminders SET sent = TRUE WHERE event_id = $1
    `, [id]);

    logger.info('Calendar event cancelled', { id, context, operation: 'deleteCalendarEvent' });
    return true;
  }
  return false;
}

/**
 * Get upcoming events (for dashboard widget)
 */
export async function getUpcomingEvents(
  context: AIContext,
  hours: number = 24
): Promise<CalendarEvent[]> {
  const now = new Date().toISOString();
  const end = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  const result = await queryContext(context, `
    SELECT * FROM calendar_events
    WHERE start_time >= $1 AND start_time <= $2
      AND status != 'cancelled'
    ORDER BY start_time ASC
    LIMIT 10
  `, [now, end]);

  return result.rows.map(mapRowToEvent);
}

/**
 * Semantic search for calendar events
 */
export async function searchCalendarEvents(
  context: AIContext,
  query: string,
  limit: number = 10
): Promise<CalendarEvent[]> {
  // Try embedding-based search first
  try {
    const embedding = await generateEmbedding(query);
    if (embedding && embedding.length > 0) {
      const embeddingStr = formatForPgVector(embedding);
      const result = await queryContext(context, `
        SELECT *, 1 - (embedding <=> $1::vector) as similarity
        FROM calendar_events
        WHERE embedding IS NOT NULL AND status != 'cancelled'
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `, [embeddingStr, limit]);
      return result.rows.map(mapRowToEvent);
    }
  } catch (err) {
    logger.warn('Embedding search failed, falling back to text', { error: (err as Error).message });
  }

  // Fallback to text search
  const result = await queryContext(context, `
    SELECT * FROM calendar_events
    WHERE status != 'cancelled'
      AND (title ILIKE $1 OR description ILIKE $1 OR location ILIKE $1 OR notes ILIKE $1)
    ORDER BY start_time DESC
    LIMIT $2
  `, [`%${query}%`, limit]);

  return result.rows.map(mapRowToEvent);
}

// ============================================================
// Recurring Events
// ============================================================

/**
 * Expand a recurring event into instances within a date range
 */
export function expandRecurringEvent(
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date
): CalendarEvent[] {
  if (!event.rrule) return [event];

  try {
    const rule = RRule.fromString(event.rrule);
    const occurrences = rule.between(rangeStart, rangeEnd, true);

    const duration = event.end_time
      ? new Date(event.end_time).getTime() - new Date(event.start_time).getTime()
      : 60 * 60 * 1000; // Default 1 hour

    return occurrences.map((date, index) => ({
      ...event,
      id: `${event.id}_${index}`,
      start_time: date.toISOString(),
      end_time: new Date(date.getTime() + duration).toISOString(),
      recurrence_parent_id: event.id,
    }));
  } catch (err) {
    logger.warn('Failed to expand rrule', { eventId: event.id, rrule: event.rrule, error: (err as Error).message });
    return [event];
  }
}

// ============================================================
// Reminders
// ============================================================

/**
 * Generate reminders for a calendar event
 */
async function generateReminders(context: AIContext, event: CalendarEvent): Promise<void> {
  if (!event.reminder_minutes || event.reminder_minutes.length === 0) return;

  const eventStart = new Date(event.start_time);

  for (const minutes of event.reminder_minutes) {
    const remindAt = new Date(eventStart.getTime() - minutes * 60 * 1000);

    // Skip if reminder time is in the past
    if (remindAt <= new Date()) continue;

    await queryContext(context, `
      INSERT INTO calendar_reminders (id, event_id, remind_at, type, context)
      VALUES ($1, $2, $3, 'push', $4)
    `, [uuidv4(), event.id, remindAt.toISOString(), context]);
  }
}

/**
 * Regenerate reminders (delete old + create new)
 */
async function regenerateReminders(context: AIContext, event: CalendarEvent): Promise<void> {
  await queryContext(context, `
    DELETE FROM calendar_reminders WHERE event_id = $1 AND sent = FALSE
  `, [event.id]);
  await generateReminders(context, event);
}

/**
 * Get pending reminders across all contexts (for scheduler)
 */
export async function getPendingReminders(context: AIContext): Promise<CalendarReminder[]> {
  const now = new Date().toISOString();

  const result = await queryContext(context, `
    SELECT r.*, e.title as event_title, e.start_time as event_start_time
    FROM calendar_reminders r
    JOIN calendar_events e ON r.event_id = e.id
    WHERE r.sent = FALSE AND r.remind_at <= $1
      AND e.status != 'cancelled'
    ORDER BY r.remind_at ASC
    LIMIT 50
  `, [now]);

  return result.rows.map(row => ({
    id: row.id,
    event_id: row.event_id,
    remind_at: row.remind_at,
    type: row.type,
    sent: row.sent,
    sent_at: row.sent_at,
    context: row.context,
    created_at: row.created_at,
    event_title: row.event_title,
    event_start_time: row.event_start_time,
  }));
}

/**
 * Mark a reminder as sent
 */
export async function markReminderSent(context: AIContext, reminderId: string): Promise<void> {
  await queryContext(context, `
    UPDATE calendar_reminders SET sent = TRUE, sent_at = NOW() WHERE id = $1
  `, [reminderId]);
}

// ============================================================
// Helpers
// ============================================================

function parseJsonbSafe<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

function mapRowToEvent(row: Record<string, unknown>): CalendarEvent {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string | undefined,
    event_type: row.event_type as EventType,
    start_time: (row.start_time as Date).toISOString?.() ?? row.start_time as string,
    end_time: row.end_time ? ((row.end_time as Date).toISOString?.() ?? row.end_time as string) : undefined,
    all_day: row.all_day as boolean,
    location: row.location as string | undefined,
    participants: parseJsonbSafe<string[]>(row.participants, []),
    rrule: row.rrule as string | undefined,
    recurrence_parent_id: row.recurrence_parent_id as string | undefined,
    recurrence_exception: row.recurrence_exception as boolean,
    source_idea_id: row.source_idea_id as string | undefined,
    source_voice_memo_id: row.source_voice_memo_id as string | undefined,
    travel_duration_minutes: row.travel_duration_minutes as number | undefined,
    travel_origin: row.travel_origin as string | undefined,
    travel_destination: row.travel_destination as string | undefined,
    status: row.status as EventStatus,
    color: row.color as string | undefined,
    context: row.context as string,
    reminder_minutes: parseJsonbSafe<number[]>(row.reminder_minutes, [15]),
    notes: row.notes as string | undefined,
    metadata: parseJsonbSafe<Record<string, unknown>>(row.metadata, {}),
    ai_generated: row.ai_generated as boolean,
    ai_confidence: row.ai_confidence as number | undefined,
    created_at: (row.created_at as Date).toISOString?.() ?? row.created_at as string,
    updated_at: (row.updated_at as Date).toISOString?.() ?? row.updated_at as string,
  };
}
