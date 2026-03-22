/**
 * Unified Feedback Bus — Phase 137
 *
 * Pub/sub event bus for feedback signals across all ZenAI subsystems.
 * Handlers are fire-and-forget: errors in one handler do not affect others.
 */

import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import { queryContext } from '../../utils/database-context';
import type { AIContext } from '../../types/context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeedbackType =
  | 'response_rating'
  | 'fact_correction'
  | 'suggestion_action'
  | 'tool_success'
  | 'document_quality'
  | 'agent_performance';

export interface FeedbackEvent {
  id: string;
  type: FeedbackType;
  source: string;
  target: string;
  value: number; // -1 to +1
  details: Record<string, unknown>;
  timestamp: Date;
}

export type FeedbackHandler = (event: FeedbackEvent) => Promise<void>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a numeric value to the [-1, +1] range.
 */
export function clampValue(value: number): number {
  if (!Number.isFinite(value)) {return 0;}
  return Math.max(-1, Math.min(1, value));
}

/**
 * Factory that builds a FeedbackEvent with auto-generated id and timestamp.
 */
export function createFeedbackEvent(
  type: FeedbackType,
  source: string,
  target: string,
  value: number,
  details: Record<string, unknown> = {},
): FeedbackEvent {
  return {
    id: randomUUID(),
    type,
    source,
    target,
    value: clampValue(value),
    details,
    timestamp: new Date(),
  };
}

// ---------------------------------------------------------------------------
// DB persistence (fire-and-forget)
// ---------------------------------------------------------------------------

/**
 * Persist a feedback event to the database. Errors are logged but never thrown.
 */
export async function recordFeedback(
  context: string,
  event: FeedbackEvent,
): Promise<void> {
  try {
    await queryContext(
      context as AIContext,
      `INSERT INTO feedback_events (id, type, source, target, value, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.id,
        event.type,
        event.source,
        event.target,
        event.value,
        JSON.stringify(event.details),
        event.timestamp,
      ],
    );
  } catch (err) {
    logger.error('Failed to record feedback event', err instanceof Error ? err : new Error(String(err)), { eventId: event.id });
  }
}

// ---------------------------------------------------------------------------
// FeedbackBus
// ---------------------------------------------------------------------------

export class FeedbackBus {
  private handlers: Map<FeedbackType, Set<FeedbackHandler>> = new Map();

  /**
   * Register a handler for a specific feedback type.
   */
  subscribe(type: FeedbackType, handler: FeedbackHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)?.add(handler);
  }

  /**
   * Remove a previously registered handler.
   */
  unsubscribe(type: FeedbackType, handler: FeedbackHandler): void {
    const set = this.handlers.get(type);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(type);
      }
    }
  }

  /**
   * Emit a feedback event to all handlers registered for its type.
   * Each handler is called independently; errors are caught and logged.
   */
  async emit(event: FeedbackEvent): Promise<void> {
    const set = this.handlers.get(event.type);
    if (!set || set.size === 0) {return;}

    const promises = Array.from(set).map(async (handler) => {
      try {
        await handler(event);
      } catch (err) {
        logger.error('Feedback handler threw an error', err instanceof Error ? err : new Error(String(err)), {
          eventId: event.id,
        });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Return the number of registered handlers — total or for a specific type.
   */
  getHandlerCount(type?: FeedbackType): number {
    if (type) {
      return this.handlers.get(type)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.handlers.values()) {
      total += set.size;
    }
    return total;
  }
}
