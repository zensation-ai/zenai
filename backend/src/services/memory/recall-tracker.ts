/**
 * Phase 125: Recall Tracker
 *
 * After Claude generates a response, classifies retrieved facts as:
 *   - success:  fact entities were referenced in the response
 *   - partial:  fact was retrieved but none of its entities referenced
 *   - forgot:   existed but was never retrieved (caller responsibility)
 *
 * Feeds classified events into the FSRS spaced-repetition scheduler to
 * update difficulty, stability, and next-review date for each fact.
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import {
  FSRSState,
  getRetrievability,
  updateAfterRecall,
  updateAfterForgot,
} from './fsrs-scheduler';

// ===========================================
// Types
// ===========================================

export interface RecallEvent {
  factId: string;
  /** success = entity referenced in response; partial = retrieved but unused; forgot = never retrieved */
  type: 'success' | 'partial' | 'forgot';
  /** Current retrievability R at the moment of the recall attempt (0–1) */
  retrievability: number;
}

// ===========================================
// classifyRecallEvents
// ===========================================

/**
 * Pure function — classify retrieved facts by whether their linked entities
 * appear in the AI response.
 *
 * @param retrievedFactIds  IDs of facts that the RAG pipeline returned
 * @param responseEntityIds Entity identifiers detected in the AI response text
 * @param factEntityMap     Maps each fact ID → its linked entity IDs
 * @returns Array of RecallEvents (one per retrieved fact)
 */
export function classifyRecallEvents(
  retrievedFactIds: string[],
  responseEntityIds: string[],
  factEntityMap: Map<string, string[]>,
): RecallEvent[] {
  if (retrievedFactIds.length === 0) {
    return [];
  }

  const responseEntitySet = new Set(responseEntityIds);
  const DEFAULT_RETRIEVABILITY = 0.7;

  return retrievedFactIds.map((factId) => {
    const linkedEntities = factEntityMap.get(factId) ?? [];

    const isSuccess =
      linkedEntities.length > 0 &&
      linkedEntities.some((entityId) => responseEntitySet.has(entityId));

    return {
      factId,
      type: isSuccess ? 'success' : 'partial',
      retrievability: DEFAULT_RETRIEVABILITY,
    };
  });
}

// ===========================================
// processRecallEvents
// ===========================================

/**
 * Async — load FSRS state from DB, apply the appropriate scheduler update,
 * and persist the new state back to `learned_facts`.
 *
 * Fire-and-forget per event: a single DB error will not abort the batch.
 *
 * @param context DB context (personal | work | learning | creative)
 * @param events  Recall events produced by classifyRecallEvents (or the caller)
 */
export async function processRecallEvents(
  context: AIContext,
  events: RecallEvent[],
): Promise<void> {
  if (events.length === 0) {
    return;
  }

  for (const event of events) {
    try {
      await processSingleEvent(context, event);
    } catch (err) {
      logger.error(
        'recall-tracker: failed to process event',
        err instanceof Error ? err : new Error(String(err)),
        { factId: event.factId, type: event.type },
      );
    }
  }
}

// ===========================================
// processSingleEvent (internal)
// ===========================================

async function processSingleEvent(context: AIContext, event: RecallEvent): Promise<void> {
  // 1. Load current FSRS state from DB
  const selectResult = await queryContext(
    context,
    `SELECT fsrs_difficulty, fsrs_stability, fsrs_next_review, retrieval_count, last_accessed
     FROM learned_facts
     WHERE id = $1`,
    [event.factId],
  );

  if (selectResult.rows.length === 0) {
    logger.debug('recall-tracker: fact not found, skipping', { factId: event.factId, context });
    return;
  }

  const row = selectResult.rows[0];

  const currentState: FSRSState = {
    difficulty: Number(row.fsrs_difficulty ?? 5.0),
    stability: Number(row.fsrs_stability ?? 7.0),
    nextReview: row.fsrs_next_review ? new Date(row.fsrs_next_review) : new Date(),
  };

  // 2. Compute actual retrievability from the current FSRS state.
  //    If the event already carries a non-default value the caller computed,
  //    use the live FSRS value (most accurate).
  const R = getRetrievability(currentState);
  // Use the event retrievability when it differs from the classification-time
  // default (0.7), so callers can supply a precise value (e.g. for forgot events
  // where no retrieval occurred and retrievability may be very low).
  const effectiveR = event.retrievability !== 0.7 ? event.retrievability : R;

  // 3. Apply FSRS update based on recall type
  let newState: FSRSState;
  if (event.type === 'success') {
    newState = updateAfterRecall(currentState, 4, effectiveR); // grade 4 = good
  } else if (event.type === 'partial') {
    newState = updateAfterRecall(currentState, 3, effectiveR); // grade 3 = neutral
  } else {
    newState = updateAfterForgot(currentState, effectiveR);
  }

  // 4. Persist new state
  await queryContext(
    context,
    `UPDATE learned_facts
     SET fsrs_difficulty  = $1,
         fsrs_stability   = $2,
         fsrs_next_review = $3,
         retrieval_count  = retrieval_count + 1,
         last_accessed    = NOW()
     WHERE id = $4`,
    [newState.difficulty, newState.stability, newState.nextReview, event.factId],
  );

  logger.debug('recall-tracker: updated FSRS state', {
    factId: event.factId,
    type: event.type,
    oldStability: currentState.stability,
    newStability: newState.stability,
    nextReview: newState.nextReview,
  });
}
