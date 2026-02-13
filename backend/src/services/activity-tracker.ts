/**
 * Activity Tracker
 *
 * Centralized fire-and-forget wrapper that feeds both:
 * - Evolution Timeline (recordLearningEvent)
 * - Routine Detection / Suggestion Engine (learnFromAction)
 *
 * All operations are non-blocking and silently catch errors
 * to avoid impacting the calling request flow.
 */

import { AIContext } from '../utils/database-context';
import { recordLearningEvent, LearningEventType } from './evolution-analytics';
import { routineDetectionService } from './routine-detection';
import { logger } from '../utils/logger';

export interface TrackActivityOptions {
  // Learning event params
  eventType: LearningEventType;
  title: string;
  description?: string;
  impact_score?: number;
  related_entity_type?: string;
  related_entity_id?: string;
  metadata?: Record<string, unknown>;
  // User action params for routine detection
  actionType: string;
  actionData?: Record<string, unknown>;
}

/**
 * Fire-and-forget: records both a learning event AND a user action.
 * Never throws — all errors are logged silently.
 */
export async function trackActivity(
  context: AIContext,
  options: TrackActivityOptions
): Promise<void> {
  const promises: Promise<unknown>[] = [];

  // 1. Record learning event for evolution timeline
  promises.push(
    recordLearningEvent(context, options.eventType, options.title, {
      description: options.description,
      impact_score: options.impact_score ?? 0.5,
      related_entity_type: options.related_entity_type,
      related_entity_id: options.related_entity_id,
      metadata: options.metadata,
    }).catch(err => {
      logger.debug('Learning event recording failed (non-critical)', {
        error: err instanceof Error ? err.message : String(err),
        eventType: options.eventType,
      });
    })
  );

  // 2. Record user action for routine detection / suggestions
  promises.push(
    routineDetectionService.learnFromAction(context, {
      actionType: options.actionType,
      actionData: options.actionData ?? {},
    }).catch(err => {
      logger.debug('Action tracking failed (non-critical)', {
        error: err instanceof Error ? err.message : String(err),
        actionType: options.actionType,
      });
    })
  );

  await Promise.allSettled(promises);
}
