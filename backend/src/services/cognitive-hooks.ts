/**
 * Cognitive Architecture Post-Response Hooks (Phase 125-140)
 *
 * Fire-and-forget post-response cognitive processing.
 * Runs all Phase 125-140 subsystems after each chat response.
 * All steps catch errors independently — no step blocks others.
 */

import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostResponseHookParams {
  context: string;
  userId?: string;
  query: string;
  response: string;
  domain?: string;
  confidence?: number;
  toolsUsed?: string[];
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// Entity extraction heuristic (lightweight, no LLM call)
// ---------------------------------------------------------------------------

/**
 * Extract approximate entity-like tokens from text.
 * Very simple heuristic: words longer than 4 chars, capitalized, or known nouns.
 * Returns unique tokens suitable for Hebbian co-activation tracking.
 */
export function extractEntityCandidates(text: string): string[] {
  const words = text
    .replace(/[^\w\sÄÖÜäöüß-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 4);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const word of words) {
    const lower = word.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(lower);
    }
  }

  return result.slice(0, 20); // Cap at 20 to avoid excessive pairs
}

// ---------------------------------------------------------------------------
// Main hook function
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget post-response cognitive processing.
 * Runs all Phase 125-140 subsystems after each chat response.
 * All steps catch errors independently — no step blocks others.
 *
 * This function NEVER throws. Callers can safely call it without await.
 */
export async function runPostResponseHooks(params: PostResponseHookParams): Promise<void> {
  const { context, userId, query, response, domain, confidence, toolsUsed, sessionId } = params;

  const hookResults = await Promise.allSettled([

    // 1. Hebbian co-activation: strengthen connections between co-occurring entities
    (async () => {
      try {
        const { recordCoactivation } = await import('./knowledge-graph/hebbian-dynamics');
        const entities = extractEntityCandidates(`${query} ${response}`);
        if (entities.length >= 2) {
          await recordCoactivation(context as any, entities.slice(0, 10));
        }
      } catch (err) {
        logger.debug('Cognitive hook: Hebbian update skipped', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })(),

    // 2. Information Gain tracking: measure surprise/novelty of the interaction
    (async () => {
      try {
        const { recordInformationGain, computeInformationGain } = await import('./curiosity/information-gain');
        // Heuristic surprise: longer responses to short queries = more surprising
        const surprise = Math.min(1, (response.length / Math.max(query.length, 1)) / 20);
        // Heuristic novelty: if tools were used, slightly more novel
        const novelty = toolsUsed && toolsUsed.length > 0 ? 0.6 : 0.3;
        const gain = computeInformationGain(surprise, novelty);

        await recordInformationGain(context, {
          queryText: query.slice(0, 500),
          surprise,
          novelty,
          informationGain: gain,
        });
      } catch (err) {
        logger.debug('Cognitive hook: Information gain skipped', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })(),

    // 3. Calibration update: track AI confidence calibration over time
    (async () => {
      if (confidence === undefined) return;
      try {
        const { recordCalibrationData } = await import('./metacognition/calibration');
        // Assume positive outcome (user did not immediately correct)
        await recordCalibrationData(context, confidence, true);
      } catch (err) {
        logger.debug('Cognitive hook: Calibration update skipped', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })(),

    // 4. Capability model update: track domain competence
    (async () => {
      if (!domain) return;
      try {
        const { recordInteraction } = await import('./metacognition/capability-model');
        // Assume positive for now; negative feedback comes from explicit user signals
        await recordInteraction(context, domain, true);
      } catch (err) {
        logger.debug('Cognitive hook: Capability update skipped', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })(),

    // 5. Feedback bus: broadcast a response_rating event
    (async () => {
      try {
        const { createFeedbackEvent, recordFeedback } = await import('./feedback/feedback-bus');
        const event = createFeedbackEvent(
          'response_rating',
          sessionId || 'unknown-session',
          'chat-response',
          confidence !== undefined ? Math.min(1, Math.max(-1, confidence * 2 - 1)) : 0,
          {
            queryLength: query.length,
            responseLength: response.length,
            toolsUsed: toolsUsed || [],
            domain: domain || 'general',
          },
        );
        await recordFeedback(context, event);
      } catch (err) {
        logger.debug('Cognitive hook: Feedback broadcast skipped', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })(),

    // 6. Confidence propagation: trigger batch propagation periodically
    // Only run on ~10% of requests to avoid excessive DB load
    (async () => {
      if (Math.random() > 0.1) return;
      try {
        const { propagateBatch } = await import('./knowledge-graph/confidence-propagation');
        await propagateBatch(context as any);
      } catch (err) {
        logger.debug('Cognitive hook: Confidence propagation skipped', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })(),

    // 7. Hebbian decay: periodically run batch decay (~5% of requests)
    // FSRS recall tracking is handled separately by the memory coordinator
    // when it has the actual retrieved fact IDs available.
    (async () => {
      if (Math.random() > 0.05) return;
      try {
        const { applyHebbianDecayBatch } = await import('./knowledge-graph/hebbian-dynamics');
        await applyHebbianDecayBatch(context as any);
      } catch (err) {
        logger.debug('Cognitive hook: Hebbian decay skipped', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })(),
  ]);

  // Log aggregate results at debug level
  const failed = hookResults.filter(r => r.status === 'rejected').length;
  if (failed > 0) {
    logger.debug('Cognitive hooks completed with failures', {
      sessionId,
      total: hookResults.length,
      failed,
    });
  }
}
