/**
 * Event System Service
 *
 * Persistent event bus that extends the plugin event-bus with DB persistence.
 * Events are stored in system_events table and can be processed by the
 * ProactiveDecisionEngine.
 *
 * Backward compatible: subscribe/emit API matches plugins/event-bus.ts
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';
import { emit as pluginEmit, subscribe as pluginSubscribe } from './plugins/event-bus';
import type { PluginEvent } from './plugins/plugin-types';

// ===========================================
// Types
// ===========================================

export type SystemEventType =
  | 'email.received' | 'email.sent'
  | 'task.created' | 'task.overdue' | 'task.completed'
  | 'calendar.event_approaching' | 'calendar.event_started'
  | 'idea.created' | 'idea.updated'
  | 'memory.fact_learned' | 'memory.pattern_detected'
  | 'agent.completed' | 'agent.failed'
  | 'system.daily_digest' | 'system.weekly_review';

export interface SystemEvent {
  id: string;
  context: AIContext;
  eventType: string;
  eventSource: string;
  payload: Record<string, unknown>;
  processed: boolean;
  decision: string | null;
  decisionReason: string | null;
  processedBy: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface EmitOptions {
  context: AIContext;
  eventType: string;
  eventSource: string;
  payload?: Record<string, unknown>;
}

// ===========================================
// Event Emission (Persistent)
// ===========================================

/**
 * Emit a system event with DB persistence.
 * Also forwards to the plugin event bus for backward compatibility.
 */
export async function emitSystemEvent(options: EmitOptions): Promise<string | null> {
  const { context, eventType, eventSource, payload = {} } = options;

  try {
    const result = await queryContext(
      context,
      `INSERT INTO system_events (context, event_type, event_source, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [context, eventType, eventSource, JSON.stringify(payload)]
    );

    const eventId = result.rows[0]?.id as string;

    // Forward to plugin event bus for backward compat
    const pluginEvent: PluginEvent = {
      type: eventType,
      source: eventSource,
      data: { ...payload, systemEventId: eventId },
      timestamp: new Date().toISOString(),
      context,
    };
    pluginEmit(pluginEvent);

    return eventId;
  } catch (error) {
    logger.debug('Failed to persist system event', {
      eventType,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return null;
  }
}

// ===========================================
// Event Queries
// ===========================================

export async function getUnprocessedEvents(
  context: AIContext,
  limit = 50
): Promise<SystemEvent[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT id, context, event_type, event_source, payload, processed,
              decision, decision_reason, processed_by, created_at, processed_at
       FROM system_events
       WHERE context = $1 AND processed = false
       ORDER BY created_at ASC
       LIMIT $2`,
      [context, limit]
    );
    return result.rows.map(parseEvent);
  } catch {
    return [];
  }
}

export async function markEventProcessed(
  context: AIContext,
  eventId: string,
  decision: string,
  reason: string,
  processedBy: string
): Promise<void> {
  try {
    await queryContext(
      context,
      `UPDATE system_events
       SET processed = true, decision = $1, decision_reason = $2,
           processed_by = $3, processed_at = NOW()
       WHERE id = $4 AND context = $5`,
      [decision, reason, processedBy, eventId, context]
    );
  } catch {
    // Non-critical
  }
}

export async function getEventHistory(
  context: AIContext,
  options?: { eventType?: string; limit?: number; offset?: number }
): Promise<{ events: SystemEvent[]; total: number }> {
  const limit = Math.min(options?.limit || 50, 100);
  const offset = options?.offset || 0;

  try {
    const hasEventType = !!options?.eventType;
    const whereClause = hasEventType
      ? 'WHERE context = $1 AND event_type = $2'
      : 'WHERE context = $1';
    const baseParams: (string | number)[] = hasEventType ? [context, options!.eventType!] : [context];
    const nextIdx = baseParams.length + 1;

    const countResult = await queryContext(
      context,
      `SELECT COUNT(*) as total FROM system_events ${whereClause}`,
      baseParams
    );

    const result = await queryContext(
      context,
      `SELECT id, context, event_type, event_source, payload, processed,
              decision, decision_reason, processed_by, created_at, processed_at
       FROM system_events ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      [...baseParams, limit, offset]
    );

    return {
      events: result.rows.map(parseEvent),
      total: parseInt(countResult.rows[0]?.total as string, 10) || 0,
    };
  } catch {
    return { events: [], total: 0 };
  }
}

export async function getEventStats(context: AIContext): Promise<{
  totalEvents: number;
  unprocessed: number;
  byType: Record<string, number>;
  byDecision: Record<string, number>;
}> {
  try {
    const [totalResult, unprocessedResult, typeResult, decisionResult] = await Promise.all([
      queryContext(context, `SELECT COUNT(*) as c FROM system_events WHERE context = $1`, [context]),
      queryContext(context, `SELECT COUNT(*) as c FROM system_events WHERE context = $1 AND processed = false`, [context]),
      queryContext(context, `SELECT event_type, COUNT(*) as c FROM system_events WHERE context = $1 GROUP BY event_type`, [context]),
      queryContext(context, `SELECT decision, COUNT(*) as c FROM system_events WHERE context = $1 AND decision IS NOT NULL GROUP BY decision`, [context]),
    ]);

    const byType: Record<string, number> = {};
    for (const r of typeResult.rows) byType[r.event_type as string] = parseInt(r.c as string, 10);

    const byDecision: Record<string, number> = {};
    for (const r of decisionResult.rows) byDecision[r.decision as string] = parseInt(r.c as string, 10);

    return {
      totalEvents: parseInt(totalResult.rows[0]?.c as string, 10) || 0,
      unprocessed: parseInt(unprocessedResult.rows[0]?.c as string, 10) || 0,
      byType,
      byDecision,
    };
  } catch {
    return { totalEvents: 0, unprocessed: 0, byType: {}, byDecision: {} };
  }
}

// ===========================================
// Backward Compatibility
// ===========================================

/**
 * Subscribe wrapper - delegates to plugin event bus.
 */
export { pluginSubscribe as subscribe };

// ===========================================
// Helpers
// ===========================================

function parseEvent(r: Record<string, unknown>): SystemEvent {
  return {
    id: r.id as string,
    context: r.context as AIContext,
    eventType: r.event_type as string,
    eventSource: r.event_source as string,
    payload: (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload || {}) as Record<string, unknown>,
    processed: r.processed as boolean,
    decision: (r.decision as string) || null,
    decisionReason: (r.decision_reason as string) || null,
    processedBy: (r.processed_by as string) || null,
    createdAt: r.created_at ? String(r.created_at) : new Date().toISOString(),
    processedAt: r.processed_at ? String(r.processed_at) : null,
  };
}
