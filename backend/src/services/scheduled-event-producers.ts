/**
 * Scheduled Event Producers (Phase 55)
 *
 * Interval-based producers that emit system events for the Proactive Decision Engine.
 * These cover event types that aren't triggered by user actions but by time/state.
 *
 * Event types produced:
 * - task.overdue       (every 15 min) — tasks past due_date that aren't done
 * - calendar.event_approaching (every 5 min) — events starting within 30 min
 * - system.daily_digest  (daily 08:00) — yesterday's activity summary
 * - system.weekly_review (Monday 09:00) — last week's summary
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { emitSystemEvent } from './event-system';

// ===========================================
// Interval handles
// ===========================================

let overdueInterval: ReturnType<typeof setInterval> | null = null;
let approachingInterval: ReturnType<typeof setInterval> | null = null;
let dailyDigestTimeout: ReturnType<typeof setTimeout> | null = null;
let weeklyReviewTimeout: ReturnType<typeof setTimeout> | null = null;

const CONTEXTS: AIContext[] = ['personal', 'work', 'learning', 'creative'];

// ===========================================
// Producers
// ===========================================

async function checkOverdueTasks(): Promise<void> {
  for (const context of CONTEXTS) {
    try {
      const result = await queryContext(
        context,
        `SELECT id, title, due_date FROM tasks
         WHERE status != 'done' AND status != 'cancelled'
           AND due_date IS NOT NULL AND due_date < NOW()
           AND context = $1
         ORDER BY due_date ASC LIMIT 10`,
        [context]
      );

      for (const task of result.rows) {
        await emitSystemEvent({
          context,
          eventType: 'task.overdue',
          eventSource: 'scheduled_producer',
          payload: {
            taskId: task.id as string,
            title: task.title as string,
            dueDate: task.due_date as string,
          },
        });
      }
    } catch {
      // Non-critical — context may not have tasks table
    }
  }
}

async function checkApproachingEvents(): Promise<void> {
  for (const context of CONTEXTS) {
    try {
      const result = await queryContext(
        context,
        `SELECT id, title, start_time FROM calendar_events
         WHERE start_time BETWEEN NOW() AND NOW() + INTERVAL '30 minutes'
           AND context = $1
         ORDER BY start_time ASC LIMIT 10`,
        [context]
      );

      for (const event of result.rows) {
        await emitSystemEvent({
          context,
          eventType: 'calendar.event_approaching',
          eventSource: 'scheduled_producer',
          payload: {
            eventId: event.id as string,
            title: event.title as string,
            startTime: event.start_time as string,
          },
        });
      }
    } catch {
      // Non-critical
    }
  }
}

async function emitDailyDigest(): Promise<void> {
  for (const context of CONTEXTS) {
    try {
      const [tasksResult, ideasResult, eventsResult] = await Promise.all([
        queryContext(context, `SELECT COUNT(*) as c FROM tasks WHERE context = $1 AND updated_at > NOW() - INTERVAL '1 day'`, [context]),
        queryContext(context, `SELECT COUNT(*) as c FROM ideas WHERE context = $1 AND created_at > NOW() - INTERVAL '1 day'`, [context]),
        queryContext(context, `SELECT COUNT(*) as c FROM system_events WHERE context = $1 AND created_at > NOW() - INTERVAL '1 day'`, [context]),
      ]);

      await emitSystemEvent({
        context,
        eventType: 'system.daily_digest',
        eventSource: 'scheduled_producer',
        payload: {
          tasksUpdated: parseInt(tasksResult.rows[0]?.c as string, 10) || 0,
          ideasCreated: parseInt(ideasResult.rows[0]?.c as string, 10) || 0,
          eventsProcessed: parseInt(eventsResult.rows[0]?.c as string, 10) || 0,
          date: new Date().toISOString().slice(0, 10),
        },
      });
    } catch {
      // Non-critical
    }
  }
}

async function emitWeeklyReview(): Promise<void> {
  for (const context of CONTEXTS) {
    try {
      const [completedResult, createdResult] = await Promise.all([
        queryContext(context, `SELECT COUNT(*) as c FROM tasks WHERE context = $1 AND status = 'done' AND updated_at > NOW() - INTERVAL '7 days'`, [context]),
        queryContext(context, `SELECT COUNT(*) as c FROM ideas WHERE context = $1 AND created_at > NOW() - INTERVAL '7 days'`, [context]),
      ]);

      await emitSystemEvent({
        context,
        eventType: 'system.weekly_review',
        eventSource: 'scheduled_producer',
        payload: {
          tasksCompleted: parseInt(completedResult.rows[0]?.c as string, 10) || 0,
          ideasCreated: parseInt(createdResult.rows[0]?.c as string, 10) || 0,
          weekOf: new Date().toISOString().slice(0, 10),
        },
      });
    } catch {
      // Non-critical
    }
  }
}

// ===========================================
// Scheduling helpers
// ===========================================

function msUntilNextTime(hour: number, minute: number, dayOfWeek?: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);

  if (dayOfWeek !== undefined) {
    const currentDay = now.getDay();
    let daysUntil = dayOfWeek - currentDay;
    if (daysUntil < 0 || (daysUntil === 0 && now >= target)) {
      daysUntil += 7;
    }
    target.setDate(target.getDate() + daysUntil);
  } else if (now >= target) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime();
}

function scheduleDailyDigest(): void {
  const ms = msUntilNextTime(8, 0);
  dailyDigestTimeout = setTimeout(() => {
    emitDailyDigest().catch(() => {});
    scheduleDailyDigest();
  }, ms);
}

function scheduleWeeklyReview(): void {
  const ms = msUntilNextTime(9, 0, 1); // Monday 09:00
  weeklyReviewTimeout = setTimeout(() => {
    emitWeeklyReview().catch(() => {});
    scheduleWeeklyReview();
  }, ms);
}

// ===========================================
// Public API
// ===========================================

export function startScheduledEventProducers(): void {
  overdueInterval = setInterval(() => {
    checkOverdueTasks().catch((e) =>
      logger.debug('Overdue task check failed', { error: e instanceof Error ? e.message : 'Unknown' })
    );
  }, 15 * 60 * 1000);

  approachingInterval = setInterval(() => {
    checkApproachingEvents().catch((e) =>
      logger.debug('Approaching event check failed', { error: e instanceof Error ? e.message : 'Unknown' })
    );
  }, 5 * 60 * 1000);

  scheduleDailyDigest();
  scheduleWeeklyReview();

  logger.info('Scheduled event producers started', {
    producers: ['task.overdue (15m)', 'calendar.event_approaching (5m)', 'system.daily_digest (08:00)', 'system.weekly_review (Mon 09:00)'],
  });
}

export function stopScheduledEventProducers(): void {
  if (overdueInterval) { clearInterval(overdueInterval); overdueInterval = null; }
  if (approachingInterval) { clearInterval(approachingInterval); approachingInterval = null; }
  if (dailyDigestTimeout) { clearTimeout(dailyDigestTimeout); dailyDigestTimeout = null; }
  if (weeklyReviewTimeout) { clearTimeout(weeklyReviewTimeout); weeklyReviewTimeout = null; }
}
