/**
 * Phase 51: Plugin Event Bus
 *
 * Simple pub/sub system for plugin event communication.
 * Handlers are stored per event type and invoked asynchronously.
 */

import { logger } from '../../utils/logger';
import { PluginEvent } from './plugin-types';

export type EventHandler = (event: PluginEvent) => void | Promise<void>;

// Internal handler registry
const handlers = new Map<string, Set<EventHandler>>();

/**
 * Subscribe to an event type.
 * Returns an unsubscribe function.
 */
export function subscribe(eventType: string, handler: EventHandler): () => void {
  if (!handlers.has(eventType)) {
    handlers.set(eventType, new Set());
  }

  handlers.get(eventType)!.add(handler);

  return () => {
    const set = handlers.get(eventType);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        handlers.delete(eventType);
      }
    }
  };
}

/**
 * Emit an event (fire-and-forget).
 * Errors in individual handlers are caught and logged.
 */
export function emit(event: PluginEvent): void {
  const set = handlers.get(event.type);
  if (!set || set.size === 0) return;

  for (const handler of set) {
    try {
      const result = handler(event);
      // If handler returns a promise, catch its errors
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((err) => {
          logger.warn(
            `Event handler error for "${event.type}" from "${event.source}": ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        });
      }
    } catch (err) {
      logger.warn(
        `Event handler error for "${event.type}" from "${event.source}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
}

/**
 * Emit an event and wait for all handlers to complete.
 * Errors in individual handlers are caught and logged.
 */
export async function emitAsync(event: PluginEvent): Promise<void> {
  const set = handlers.get(event.type);
  if (!set || set.size === 0) return;

  const promises: Promise<void>[] = [];

  for (const handler of set) {
    promises.push(
      Promise.resolve()
        .then(() => handler(event))
        .catch((err) => {
          logger.warn(
            `Async event handler error for "${event.type}" from "${event.source}": ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        })
    );
  }

  await Promise.all(promises);
}

/**
 * Unsubscribe all handlers, optionally for a specific event type.
 */
export function unsubscribeAll(eventType?: string): void {
  if (eventType) {
    handlers.delete(eventType);
  } else {
    handlers.clear();
  }
}

/**
 * Get the number of subscriptions, optionally for a specific event type.
 */
export function getSubscriptionCount(eventType?: string): number {
  if (eventType) {
    return handlers.get(eventType)?.size || 0;
  }

  let total = 0;
  for (const set of handlers.values()) {
    total += set.size;
  }
  return total;
}
