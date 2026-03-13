/**
 * Phase 8: Unified Inbox Service
 *
 * Aggregates notifications from all ZenAI sources into a single inbox:
 * - Unread emails
 * - Due/overdue tasks
 * - Upcoming meetings (within 30 min)
 * - Follow-up reminders (contacts)
 * - Budget alerts
 * - Proactive suggestions (workflow patterns)
 * - KI briefings
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export type InboxItemType =
  | 'email'
  | 'task_due'
  | 'meeting_soon'
  | 'follow_up'
  | 'budget_alert'
  | 'proactive_suggestion'
  | 'briefing';

export type InboxPriority = 'high' | 'medium' | 'low';

export interface InboxItem {
  id: string;
  type: InboxItemType;
  title: string;
  subtitle: string;
  priority: InboxPriority;
  timestamp: string;
  source_id: string;
  metadata: Record<string, unknown>;
  is_actionable: boolean;
  action_label?: string;
  action_page?: string;
}

export interface UnifiedInboxResult {
  items: InboxItem[];
  counts: Record<InboxItemType, number>;
  total: number;
  generated_at: string;
}

// ===========================================
// Unified Inbox Service
// ===========================================

export async function getUnifiedInbox(
  context: AIContext,
  options?: { types?: InboxItemType[]; limit?: number }
): Promise<UnifiedInboxResult> {
  const limit = options?.limit ?? 50;
  const types = options?.types;
  const allItems: InboxItem[] = [];

  const promises: Promise<void>[] = [];

  if (!types || types.includes('email')) {
    promises.push(
      fetchUnreadEmails(context).then(items => { allItems.push(...items); }).catch(err => {
        logger.debug('Unified inbox: email fetch failed', { error: err });
      })
    );
  }

  if (!types || types.includes('task_due')) {
    promises.push(
      fetchDueTasks(context).then(items => { allItems.push(...items); }).catch(err => {
        logger.debug('Unified inbox: task fetch failed', { error: err });
      })
    );
  }

  if (!types || types.includes('meeting_soon')) {
    promises.push(
      fetchUpcomingMeetings(context).then(items => { allItems.push(...items); }).catch(err => {
        logger.debug('Unified inbox: meeting fetch failed', { error: err });
      })
    );
  }

  if (!types || types.includes('follow_up')) {
    promises.push(
      fetchFollowUpReminders(context).then(items => { allItems.push(...items); }).catch(err => {
        logger.debug('Unified inbox: follow-up fetch failed', { error: err });
      })
    );
  }

  if (!types || types.includes('budget_alert')) {
    promises.push(
      fetchBudgetAlerts(context).then(items => { allItems.push(...items); }).catch(err => {
        logger.debug('Unified inbox: budget fetch failed', { error: err });
      })
    );
  }

  if (!types || types.includes('briefing')) {
    promises.push(
      fetchUnreadBriefings(context).then(items => { allItems.push(...items); }).catch(err => {
        logger.debug('Unified inbox: briefing fetch failed', { error: err });
      })
    );
  }

  await Promise.allSettled(promises);

  // Sort by priority (high first), then by timestamp (newest first)
  const priorityOrder: Record<InboxPriority, number> = { high: 0, medium: 1, low: 2 };
  allItems.sort((a, b) => {
    const priDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priDiff !== 0) {return priDiff;}
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const limited = allItems.slice(0, limit);

  // Count by type
  const counts = {} as Record<InboxItemType, number>;
  for (const item of allItems) {
    counts[item.type] = (counts[item.type] || 0) + 1;
  }

  return {
    items: limited,
    counts,
    total: allItems.length,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Lightweight counts-only query for badge display.
 * Runs COUNT(*) queries instead of fetching full records.
 */
export async function getUnifiedInboxCounts(
  context: AIContext
): Promise<{ counts: Record<InboxItemType, number>; total: number }> {
  const counts = {} as Record<InboxItemType, number>;

  const queries = [
    { type: 'email' as InboxItemType, sql: `SELECT COUNT(*) as cnt FROM emails WHERE status = 'unread' AND direction = 'inbound'` },
    { type: 'task_due' as InboxItemType, sql: `SELECT COUNT(*) as cnt FROM tasks WHERE status NOT IN ('done', 'cancelled') AND due_date IS NOT NULL AND due_date <= NOW() + INTERVAL '1 day'` },
    { type: 'meeting_soon' as InboxItemType, sql: `SELECT COUNT(*) as cnt FROM calendar_events WHERE start_time BETWEEN NOW() AND NOW() + INTERVAL '2 hours'` },
    { type: 'follow_up' as InboxItemType, sql: `SELECT COUNT(*) as cnt FROM contacts WHERE last_interaction_at IS NOT NULL AND last_interaction_at < NOW() - INTERVAL '14 days'` },
    { type: 'budget_alert' as InboxItemType, sql: `SELECT COUNT(*) as cnt FROM budgets WHERE is_active = true AND current_spent >= amount_limit * alert_threshold` },
    { type: 'briefing' as InboxItemType, sql: `SELECT COUNT(*) as cnt FROM proactive_briefings WHERE read_at IS NULL AND generated_at > NOW() - INTERVAL '24 hours'` },
  ];

  await Promise.allSettled(
    queries.map(async ({ type, sql }) => {
      try {
        const result = await queryContext(context, sql);
        counts[type] = parseInt(result.rows[0]?.cnt || '0', 10);
      } catch {
        counts[type] = 0;
      }
    })
  );

  // Ensure all types have a count
  for (const { type } of queries) {
    if (counts[type] === undefined) {counts[type] = 0;}
  }

  const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
  return { counts, total };
}

// ===========================================
// Data Fetchers
// ===========================================

async function fetchUnreadEmails(context: AIContext): Promise<InboxItem[]> {
  const result = await queryContext(
    context,
    `SELECT id, subject, from_address, ai_category, ai_priority, created_at
     FROM emails
     WHERE status = 'unread' AND direction = 'inbound'
     ORDER BY
       CASE ai_priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
       created_at DESC
     LIMIT 15`
  );

  return result.rows.map(row => ({
    id: `email-${row.id}`,
    type: 'email' as InboxItemType,
    title: row.subject as string || 'Kein Betreff',
    subtitle: `Von: ${row.from_address}`,
    priority: (row.ai_priority as InboxPriority) || 'medium',
    timestamp: (row.created_at as Date)?.toISOString() || new Date().toISOString(),
    source_id: row.id as string,
    metadata: { category: row.ai_category, from: row.from_address },
    is_actionable: true,
    action_label: 'Lesen',
    action_page: 'email',
  }));
}

async function fetchDueTasks(context: AIContext): Promise<InboxItem[]> {
  const result = await queryContext(
    context,
    `SELECT id, title, priority, status, due_date
     FROM tasks
     WHERE status NOT IN ('done', 'cancelled')
       AND due_date IS NOT NULL
       AND due_date <= NOW() + INTERVAL '1 day'
     ORDER BY
       CASE WHEN due_date < NOW() THEN 0 ELSE 1 END,
       due_date ASC
     LIMIT 10`
  );

  return result.rows.map(row => {
    const isOverdue = row.due_date && new Date(row.due_date as string) < new Date();
    return {
      id: `task-${row.id}`,
      type: 'task_due' as InboxItemType,
      title: row.title as string,
      subtitle: isOverdue ? 'Ueberfaellig!' : 'Heute faellig',
      priority: isOverdue ? 'high' as InboxPriority : (row.priority === 'high' ? 'high' : 'medium') as InboxPriority,
      timestamp: (row.due_date as Date)?.toISOString() || new Date().toISOString(),
      source_id: row.id as string,
      metadata: { status: row.status, priority: row.priority, overdue: isOverdue },
      is_actionable: true,
      action_label: 'Oeffnen',
      action_page: 'tasks',
    };
  });
}

async function fetchUpcomingMeetings(context: AIContext): Promise<InboxItem[]> {
  const result = await queryContext(
    context,
    `SELECT id, title, description, location, start_time, end_time
     FROM calendar_events
     WHERE start_time BETWEEN NOW() AND NOW() + INTERVAL '2 hours'
     ORDER BY start_time ASC
     LIMIT 5`
  );

  return result.rows.map(row => {
    const startTime = new Date(row.start_time as string);
    const minutesUntil = Math.round((startTime.getTime() - Date.now()) / 60000);
    return {
      id: `meeting-${row.id}`,
      type: 'meeting_soon' as InboxItemType,
      title: row.title as string || 'Termin',
      subtitle: minutesUntil <= 0 ? 'Jetzt!' : `In ${minutesUntil} Minuten`,
      priority: minutesUntil <= 15 ? 'high' as InboxPriority : 'medium' as InboxPriority,
      timestamp: startTime.toISOString(),
      source_id: row.id as string,
      metadata: { location: row.location, start_time: row.start_time, end_time: row.end_time },
      is_actionable: true,
      action_label: 'Details',
      action_page: 'calendar',
    };
  });
}

async function fetchFollowUpReminders(context: AIContext): Promise<InboxItem[]> {
  const result = await queryContext(
    context,
    `SELECT id, display_name, last_interaction_at, relationship_type
     FROM contacts
     WHERE last_interaction_at IS NOT NULL
       AND last_interaction_at < NOW() - INTERVAL '14 days'
     ORDER BY last_interaction_at ASC
     LIMIT 5`
  );

  return result.rows.map(row => {
    const lastDate = new Date(row.last_interaction_at as string);
    const daysSince = Math.round((Date.now() - lastDate.getTime()) / 86400000);
    return {
      id: `followup-${row.id}`,
      type: 'follow_up' as InboxItemType,
      title: `Follow-up: ${row.display_name}`,
      subtitle: `${daysSince} Tage ohne Kontakt`,
      priority: daysSince > 30 ? 'medium' as InboxPriority : 'low' as InboxPriority,
      timestamp: lastDate.toISOString(),
      source_id: row.id as string,
      metadata: { days_since: daysSince, relationship_type: row.relationship_type },
      is_actionable: true,
      action_label: 'Kontakt',
      action_page: 'contacts',
    };
  });
}

async function fetchBudgetAlerts(context: AIContext): Promise<InboxItem[]> {
  const result = await queryContext(
    context,
    `SELECT id, name, category, amount_limit, current_spent, alert_threshold
     FROM budgets
     WHERE is_active = true
       AND current_spent >= amount_limit * alert_threshold
     ORDER BY (current_spent / NULLIF(amount_limit, 0)) DESC
     LIMIT 5`
  );

  return result.rows.map(row => {
    const percentage = Number(row.amount_limit) > 0
      ? Math.round((Number(row.current_spent) / Number(row.amount_limit)) * 100)
      : 0;
    const isOver = percentage >= 100;
    return {
      id: `budget-${row.id}`,
      type: 'budget_alert' as InboxItemType,
      title: `Budget: ${row.name}`,
      subtitle: isOver ? `${percentage}% ueberschritten!` : `${percentage}% verbraucht`,
      priority: isOver ? 'high' as InboxPriority : 'medium' as InboxPriority,
      timestamp: new Date().toISOString(),
      source_id: row.id as string,
      metadata: { category: row.category, percentage, spent: row.current_spent, limit: row.amount_limit },
      is_actionable: true,
      action_label: 'Details',
      action_page: 'finance',
    };
  });
}

async function fetchUnreadBriefings(context: AIContext): Promise<InboxItem[]> {
  const result = await queryContext(
    context,
    `SELECT id, briefing_type, content, generated_at
     FROM proactive_briefings
     WHERE read_at IS NULL
       AND generated_at > NOW() - INTERVAL '24 hours'
     ORDER BY generated_at DESC
     LIMIT 3`
  );

  return result.rows.map(row => ({
    id: `briefing-${row.id}`,
    type: 'briefing' as InboxItemType,
    title: row.briefing_type === 'morning' ? 'Morgen-Briefing' : `KI-Briefing: ${row.briefing_type}`,
    subtitle: 'Neues KI-Briefing verfuegbar',
    priority: 'low' as InboxPriority,
    timestamp: (row.generated_at as Date)?.toISOString() || new Date().toISOString(),
    source_id: row.id as string,
    metadata: { briefing_type: row.briefing_type },
    is_actionable: true,
    action_label: 'Lesen',
    action_page: 'home',
  }));
}
