/**
 * Proactive Intelligence Engine - Phase 6
 *
 * Central orchestrator for proactive AI features:
 * - Morning Briefing
 * - Meeting Preparation
 * - Follow-up Tracking
 * - Workflow Pattern Detection
 */

import { queryContext } from '../../utils/database-context';
import type { AIContext, QueryParam } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ============================================
// Types
// ============================================

export type BriefingType = 'morning' | 'evening' | 'meeting_prep' | 'follow_up';
export type TriggerType = 'after_meeting' | 'time_of_day' | 'email_received' | 'task_completed' | 'manual';

export interface ProactiveBriefing {
  id: string;
  briefing_type: BriefingType;
  content: BriefingContent;
  generated_at: string;
  read_at: string | null;
  dismissed_at: string | null;
  acted_on: unknown[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BriefingContent {
  title: string;
  greeting?: string;
  sections: BriefingSection[];
  summary?: string;
}

export interface BriefingSection {
  type: 'meetings' | 'tasks' | 'emails' | 'follow_ups' | 'insights' | 'custom';
  title: string;
  items: BriefingSectionItem[];
  priority: 'high' | 'medium' | 'low';
}

export interface BriefingSectionItem {
  label: string;
  detail?: string;
  action_type?: string;
  action_id?: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface WorkflowPattern {
  id: string;
  pattern_name: string;
  trigger_type: TriggerType;
  trigger_conditions: Record<string, unknown>;
  suggested_actions: unknown[];
  confidence: number;
  occurrence_count: number;
  last_seen_at: string;
  is_confirmed: boolean;
  is_automated: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MeetingPrepData {
  event_id: string;
  event_title: string;
  event_start: string;
  participants: string[];
  recent_emails: Array<{ subject: string; from: string; date: string; summary?: string }>;
  related_tasks: Array<{ title: string; status: string; priority: string }>;
  contact_info: Array<{ name: string; email: string; relationship?: string; last_interaction?: string }>;
  last_meeting_notes?: string;
}

// ============================================
// Morning Briefing
// ============================================

export async function generateMorningBriefing(context: AIContext): Promise<ProactiveBriefing> {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const sections: BriefingSection[] = [];

  // 1. Today's meetings
  try {
    const eventsRes = await queryContext(context, `
      SELECT id, title, start_time, end_time, location, attendees
      FROM calendar_events
      WHERE DATE(start_time) = $1
      ORDER BY start_time ASC
      LIMIT 10
    `, [today] as QueryParam[]);

    if (eventsRes.rows.length > 0) {
      sections.push({
        type: 'meetings',
        title: 'Heutige Termine',
        priority: 'high',
        items: eventsRes.rows.map((e: Record<string, unknown>) => ({
          label: e.title as string,
          detail: `${new Date(e.start_time as string).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}${e.location ? ` - ${e.location}` : ''}`,
          action_type: 'calendar_event',
          action_id: e.id as string,
        })),
      });
    }
  } catch (err) {
    logger.error('Morning briefing: failed to load events', err instanceof Error ? err : new Error(String(err)));
  }

  // 2. Due/overdue tasks
  try {
    const tasksRes = await queryContext(context, `
      SELECT id, title, status, priority, due_date
      FROM tasks
      WHERE status NOT IN ('done', 'cancelled')
        AND (due_date <= $1 OR due_date = $2)
      ORDER BY
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        due_date ASC NULLS LAST
      LIMIT 10
    `, [today, today] as QueryParam[]);

    if (tasksRes.rows.length > 0) {
      const overdue = tasksRes.rows.filter((t: Record<string, unknown>) => t.due_date && t.due_date < today);
      const todayTasks = tasksRes.rows.filter((t: Record<string, unknown>) => t.due_date === today);

      const items: BriefingSectionItem[] = [];
      if (overdue.length > 0) {
        items.push({ label: `${overdue.length} ueberfaellige Aufgaben`, priority: 'high' });
      }
      for (const task of todayTasks.slice(0, 5)) {
        items.push({
          label: (task as Record<string, unknown>).title as string,
          detail: `Prioritaet: ${(task as Record<string, unknown>).priority}`,
          action_type: 'task',
          action_id: (task as Record<string, unknown>).id as string,
          priority: (task as Record<string, unknown>).priority as 'high' | 'medium' | 'low',
        });
      }

      if (items.length > 0) {
        sections.push({ type: 'tasks', title: 'Aufgaben', priority: 'high', items });
      }
    }
  } catch (err) {
    logger.error('Morning briefing: failed to load tasks', err instanceof Error ? err : new Error(String(err)));
  }

  // 3. Unread emails
  try {
    const emailRes = await queryContext(context, `
      SELECT COUNT(*) as unread,
        COUNT(*) FILTER (WHERE ai_priority = 'high') as urgent
      FROM emails
      WHERE status = 'unread' AND direction = 'inbound'
    `, [] as QueryParam[]);

    const unread = Number(emailRes.rows[0]?.unread ?? 0);
    const urgent = Number(emailRes.rows[0]?.urgent ?? 0);

    if (unread > 0) {
      const items: BriefingSectionItem[] = [
        { label: `${unread} ungelesene E-Mails`, detail: urgent > 0 ? `${urgent} dringend` : undefined, priority: urgent > 0 ? 'high' : 'medium' },
      ];
      sections.push({ type: 'emails', title: 'E-Mails', priority: urgent > 0 ? 'high' : 'medium', items });
    }
  } catch (err) {
    logger.error('Morning briefing: failed to load emails', err instanceof Error ? err : new Error(String(err)));
  }

  // 4. Follow-up suggestions
  try {
    const followUpRes = await queryContext(context, `
      SELECT id, display_name, last_interaction_at
      FROM contacts
      WHERE last_interaction_at < NOW() - INTERVAL '14 days'
        AND is_favorite = true
      ORDER BY last_interaction_at ASC NULLS FIRST
      LIMIT 5
    `, [] as QueryParam[]);

    if (followUpRes.rows.length > 0) {
      sections.push({
        type: 'follow_ups',
        title: 'Follow-up Vorschlaege',
        priority: 'medium',
        items: followUpRes.rows.map((c: Record<string, unknown>) => {
          const days = c.last_interaction_at
            ? Math.floor((Date.now() - new Date(c.last_interaction_at as string).getTime()) / 86400000)
            : null;
          return {
            label: c.display_name as string,
            detail: days ? `Seit ${days} Tagen kein Kontakt` : 'Noch kein Kontakt',
            action_type: 'contact',
            action_id: c.id as string,
          };
        }),
      });
    }
  } catch (err) {
    logger.error('Morning briefing: failed to load follow-ups', err instanceof Error ? err : new Error(String(err)));
  }

  // Build greeting
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Guten Morgen!' : hour < 18 ? 'Guten Tag!' : 'Guten Abend!';

  const content: BriefingContent = {
    title: 'Tagesbriefing',
    greeting,
    sections,
    summary: `${sections.reduce((sum, s) => sum + s.items.length, 0)} Punkte fuer heute`,
  };

  // Store briefing
  const result = await queryContext(context, `
    INSERT INTO proactive_briefings (briefing_type, content)
    VALUES ('morning', $1)
    RETURNING *
  `, [JSON.stringify(content)] as QueryParam[]);

  return result.rows[0] as ProactiveBriefing;
}

// ============================================
// Meeting Preparation
// ============================================

export async function generateMeetingPrep(context: AIContext, eventId: string): Promise<MeetingPrepData | null> {
  // Get event details
  const eventRes = await queryContext(context, `
    SELECT id, title, start_time, end_time, location, attendees, description
    FROM calendar_events
    WHERE id = $1
  `, [eventId] as QueryParam[]);

  if (eventRes.rows.length === 0) {return null;}
  const event = eventRes.rows[0] as Record<string, unknown>;
  const attendees: string[] = (event.attendees as string[]) ?? [];

  // Get recent emails with participants
  let recentEmails: MeetingPrepData['recent_emails'] = [];
  if (attendees.length > 0) {
    try {
      const emailRes = await queryContext(context, `
        SELECT subject, sender_email as from, sent_at as date, ai_summary as summary
        FROM emails
        WHERE (sender_email = ANY($1) OR recipient_email && $1)
        ORDER BY sent_at DESC
        LIMIT 5
      `, [attendees] as QueryParam[]);
      recentEmails = emailRes.rows as MeetingPrepData['recent_emails'];
    } catch {
      // Table may not have recipient_email as array
    }
  }

  // Get related tasks
  let relatedTasks: MeetingPrepData['related_tasks'] = [];
  try {
    const title = event.title as string;
    const tasksRes = await queryContext(context, `
      SELECT title, status, priority
      FROM tasks
      WHERE status NOT IN ('done', 'cancelled')
        AND (title ILIKE $1 OR description ILIKE $1)
      LIMIT 5
    `, [`%${title.split(' ').slice(0, 3).join('%')}%`] as QueryParam[]);
    relatedTasks = tasksRes.rows as MeetingPrepData['related_tasks'];
  } catch {
    // optional
  }

  // Get contact info for attendees
  let contactInfo: MeetingPrepData['contact_info'] = [];
  if (attendees.length > 0) {
    try {
      const contactRes = await queryContext(context, `
        SELECT display_name as name, email[1] as email, relationship_type as relationship, last_interaction_at as last_interaction
        FROM contacts
        WHERE email && $1
        LIMIT 10
      `, [attendees] as QueryParam[]);
      contactInfo = contactRes.rows as MeetingPrepData['contact_info'];
    } catch {
      // optional
    }
  }

  // Store as briefing
  const prepContent: BriefingContent = {
    title: `Meeting-Vorbereitung: ${event.title}`,
    sections: [
      ...(recentEmails.length > 0 ? [{
        type: 'emails' as const,
        title: 'Relevante E-Mails',
        priority: 'medium' as const,
        items: recentEmails.map(e => ({ label: e.subject, detail: `Von: ${e.from}` })),
      }] : []),
      ...(relatedTasks.length > 0 ? [{
        type: 'tasks' as const,
        title: 'Offene Aufgaben',
        priority: 'medium' as const,
        items: relatedTasks.map(t => ({ label: t.title, detail: `Status: ${t.status}` })),
      }] : []),
      ...(contactInfo.length > 0 ? [{
        type: 'custom' as const,
        title: 'Teilnehmer',
        priority: 'low' as const,
        items: contactInfo.map(c => ({ label: c.name, detail: c.relationship || c.email })),
      }] : []),
    ],
  };

  await queryContext(context, `
    INSERT INTO proactive_briefings (briefing_type, content, metadata)
    VALUES ('meeting_prep', $1, $2)
  `, [JSON.stringify(prepContent), JSON.stringify({ event_id: eventId })] as QueryParam[]);

  return {
    event_id: event.id as string,
    event_title: event.title as string,
    event_start: event.start_time as string,
    participants: attendees,
    recent_emails: recentEmails,
    related_tasks: relatedTasks,
    contact_info: contactInfo,
  };
}

// ============================================
// Briefings CRUD
// ============================================

export async function getBriefings(
  context: AIContext,
  filters?: { type?: BriefingType; unread_only?: boolean; limit?: number }
): Promise<ProactiveBriefing[]> {
  const conditions: string[] = [];
  const params: QueryParam[] = [];
  let paramIndex = 1;

  if (filters?.type) {
    conditions.push(`briefing_type = $${paramIndex++}`);
    params.push(filters.type);
  }
  if (filters?.unread_only) {
    conditions.push('read_at IS NULL AND dismissed_at IS NULL');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit ?? 20;

  const result = await queryContext(context, `
    SELECT * FROM proactive_briefings
    ${where}
    ORDER BY generated_at DESC
    LIMIT $${paramIndex}
  `, [...params, limit] as QueryParam[]);

  return result.rows as ProactiveBriefing[];
}

export async function getBriefing(context: AIContext, id: string): Promise<ProactiveBriefing | null> {
  const result = await queryContext(context, `
    SELECT * FROM proactive_briefings WHERE id = $1
  `, [id] as QueryParam[]);
  return (result.rows[0] as ProactiveBriefing) ?? null;
}

export async function markBriefingRead(context: AIContext, id: string): Promise<void> {
  await queryContext(context, `
    UPDATE proactive_briefings SET read_at = NOW() WHERE id = $1
  `, [id] as QueryParam[]);
}

export async function dismissBriefing(context: AIContext, id: string): Promise<void> {
  await queryContext(context, `
    UPDATE proactive_briefings SET dismissed_at = NOW() WHERE id = $1
  `, [id] as QueryParam[]);
}

// ============================================
// Workflow Patterns
// ============================================

export async function getWorkflowPatterns(context: AIContext, confirmedOnly?: boolean): Promise<WorkflowPattern[]> {
  const where = confirmedOnly ? 'WHERE is_confirmed = true' : '';
  const result = await queryContext(context, `
    SELECT * FROM workflow_patterns
    ${where}
    ORDER BY occurrence_count DESC, confidence DESC
    LIMIT 20
  `, [] as QueryParam[]);
  return result.rows as WorkflowPattern[];
}

export async function createWorkflowPattern(context: AIContext, pattern: Partial<WorkflowPattern>): Promise<WorkflowPattern> {
  const result = await queryContext(context, `
    INSERT INTO workflow_patterns (pattern_name, trigger_type, trigger_conditions, suggested_actions, confidence)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [
    pattern.pattern_name ?? 'Unnamed Pattern',
    pattern.trigger_type ?? 'manual',
    JSON.stringify(pattern.trigger_conditions ?? {}),
    JSON.stringify(pattern.suggested_actions ?? []),
    pattern.confidence ?? 0.5,
  ] as QueryParam[]);
  return result.rows[0] as WorkflowPattern;
}

export async function confirmWorkflowPattern(context: AIContext, id: string, automate: boolean): Promise<void> {
  await queryContext(context, `
    UPDATE workflow_patterns SET is_confirmed = true, is_automated = $2, updated_at = NOW() WHERE id = $1
  `, [id, automate] as QueryParam[]);
}

export async function dismissWorkflowPattern(context: AIContext, id: string): Promise<void> {
  await queryContext(context, `
    DELETE FROM workflow_patterns WHERE id = $1
  `, [id] as QueryParam[]);
}

// ============================================
// Follow-up Tracker
// ============================================

export async function getFollowUpSuggestions(context: AIContext, daysSinceContact: number = 14): Promise<Array<{
  contact_id: string;
  display_name: string;
  last_interaction_at: string | null;
  days_since: number | null;
  relationship_type: string | null;
}>> {
  const result = await queryContext(context, `
    SELECT
      id as contact_id,
      display_name,
      last_interaction_at,
      EXTRACT(DAY FROM NOW() - last_interaction_at)::integer as days_since,
      relationship_type
    FROM contacts
    WHERE (last_interaction_at < NOW() - INTERVAL '1 day' * $1 OR last_interaction_at IS NULL)
    ORDER BY
      CASE WHEN is_favorite THEN 0 ELSE 1 END,
      last_interaction_at ASC NULLS FIRST
    LIMIT 10
  `, [daysSinceContact] as QueryParam[]);
  return result.rows as Array<{
    contact_id: string;
    display_name: string;
    last_interaction_at: string | null;
    days_since: number | null;
    relationship_type: string | null;
  }>;
}

// ============================================
// Smart Schedule
// ============================================

export async function getSmartSchedule(context: AIContext): Promise<{
  meetings: Array<{ id: string; title: string; start: string; end: string }>;
  tasks: Array<{ id: string; title: string; priority: string; due_date: string | null }>;
  suggestions: string[];
}> {
  const today = new Date().toISOString().split('T')[0];

  // Meetings today
  const meetingsRes = await queryContext(context, `
    SELECT id, title, start_time as start, end_time as "end"
    FROM calendar_events
    WHERE DATE(start_time) = $1
    ORDER BY start_time ASC
  `, [today] as QueryParam[]);

  // Priority tasks
  const tasksRes = await queryContext(context, `
    SELECT id, title, priority, due_date
    FROM tasks
    WHERE status NOT IN ('done', 'cancelled')
      AND (due_date IS NULL OR due_date <= $1 + INTERVAL '3 days')
    ORDER BY
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      due_date ASC NULLS LAST
    LIMIT 10
  `, [today] as QueryParam[]);

  // Simple scheduling suggestions
  const suggestions: string[] = [];
  const meetings = meetingsRes.rows as Array<{ id: string; title: string; start: string; end: string }>;
  const tasks = tasksRes.rows as Array<{ id: string; title: string; priority: string; due_date: string | null }>;

  if (meetings.length > 4) {
    suggestions.push(`Du hast ${meetings.length} Termine heute - plane Pausen ein.`);
  }

  const highPriorityTasks = tasks.filter(t => t.priority === 'high');
  if (highPriorityTasks.length > 0) {
    suggestions.push(`${highPriorityTasks.length} hoch-priorisierte Aufgaben warten auf dich.`);
  }

  const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today);
  if (overdueTasks.length > 0) {
    suggestions.push(`${overdueTasks.length} Aufgaben sind ueberfaellig.`);
  }

  return { meetings, tasks, suggestions };
}
