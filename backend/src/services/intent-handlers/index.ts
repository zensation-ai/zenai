/**
 * Intent Handler Registry - Phase 35
 *
 * Dispatches detected intents to appropriate handlers.
 * Each handler processes a specific intent type and returns a result.
 */

import { AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import type { IntentType, DetectedIntent } from '../intent-detector';
import { handleCalendarIntent } from './calendar-handler';
import { handleEmailIntent } from './email-handler';
import { handleTravelIntent } from './travel-handler';

// ============================================================
// Types
// ============================================================

export interface IntentHandlerResult {
  success: boolean;
  intent_type: IntentType;
  created_resource?: {
    type: string;
    id: string;
    summary: string;
    data?: Record<string, unknown>;
  };
  error?: string;
}

// ============================================================
// Dispatcher
// ============================================================

/**
 * Dispatch a detected intent to the appropriate handler
 */
export async function dispatchIntent(
  context: AIContext,
  intent: DetectedIntent,
  originalText: string
): Promise<IntentHandlerResult> {
  const startTime = Date.now();

  try {
    let result: IntentHandlerResult;

    switch (intent.type) {
      case 'calendar_event':
        result = await handleCalendarIntent(context, intent, originalText);
        break;
      case 'email_draft':
        result = await handleEmailIntent(context, intent, originalText);
        break;
      case 'travel_query':
        result = await handleTravelIntent(context, intent, originalText);
        break;
      default:
        return {
          success: false,
          intent_type: intent.type,
          error: `No handler for intent type: ${intent.type}`,
        };
    }

    logger.info('Intent handled', {
      type: intent.type,
      success: result.success,
      resourceId: result.created_resource?.id,
      processingTime: Date.now() - startTime,
      operation: 'dispatchIntent'
    });

    return result;
  } catch (err) {
    logger.error('Intent handler error', err instanceof Error ? err : undefined, {
      type: intent.type,
      operation: 'dispatchIntent'
    });

    return {
      success: false,
      intent_type: intent.type,
      error: (err as Error).message,
    };
  }
}

/**
 * Dispatch multiple intents in parallel
 */
export async function dispatchIntents(
  context: AIContext,
  intents: DetectedIntent[],
  originalText: string
): Promise<IntentHandlerResult[]> {
  const results = await Promise.allSettled(
    intents
      .filter(i => i.type !== 'idea') // Skip 'idea' type - handled by existing pipeline
      .map(intent => dispatchIntent(context, intent, originalText))
  );

  return results.map((r, idx) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      success: false,
      intent_type: intents[idx].type,
      error: (r.reason as Error).message,
    };
  });
}
