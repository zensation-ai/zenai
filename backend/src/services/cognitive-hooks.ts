/**
 * Cognitive Architecture Post-Response Hooks (Phase 125-145)
 *
 * Fire-and-forget post-response cognitive processing.
 * Runs all Phase 125-145 subsystems after each chat response.
 * All steps catch errors independently — no step blocks others.
 *
 * Phase 145 additions:
 *   8. NeuromodulatorEngine: emit events based on RAG confidence
 *   9. MetacognitiveMonitor: track memory suggestion acceptance
 */

import { logger } from '../utils/logger';
import type { AIContext } from '../utils/database-context';

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
  /** Phase 145: memory tools called in this response (remember/recall/etc) */
  memoryToolsUsed?: string[];
  /** Phase 145: count of memory results accepted/used in the response */
  memoryResultsUsed?: number;
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
  const { context, userId: _userId, query, response, domain, confidence, toolsUsed, sessionId } = params;

  const hookResults = await Promise.allSettled([

    // 1. Hebbian co-activation: strengthen connections between co-occurring entities
    // NOTE: recordCoactivation expects UUID entity IDs from the knowledge graph,
    // NOT raw text keywords. We skip this hook until we have a proper entity
    // resolution step that maps keywords → entity UUIDs.
    // TODO: Wire this up via GraphBuilder.extractEntities when performance allows.
    (async () => {
      // Intentionally no-op: extractEntityCandidates returns keywords (strings),
      // but entity_coactivations.entity_a_id is UUID. Passing keywords here
      // causes "invalid input syntax for type uuid" errors that trip the
      // circuit breaker and cascade to unrelated queries.
      logger.debug('Cognitive hook: Hebbian co-activation skipped (no entity resolution)', {
        entityCandidateCount: extractEntityCandidates(`${query} ${response}`).length,
      });
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
      if (confidence === undefined) {return;}
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
      if (!domain) {return;}
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
      if (Math.random() > 0.1) {return;}
      try {
        const { propagateBatch } = await import('./knowledge-graph/confidence-propagation');
        await propagateBatch(context as AIContext);
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
      if (Math.random() > 0.05) {return;}
      try {
        const { applyHebbianDecayBatch } = await import('./knowledge-graph/hebbian-dynamics');
        await applyHebbianDecayBatch(context as AIContext);
      } catch (err) {
        logger.debug('Cognitive hook: Hebbian decay skipped', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })(),

    // 8. Phase 145 PMA: NeuromodulatorEngine — emit events based on RAG confidence
    // Maps confidence levels to biologically-inspired neuromodulator events:
    //   high confidence (≥0.7) → dopamine (prediction confirmed, exploration reward)
    //   medium confidence (0.4-0.7) → norepinephrine (uncertainty, learning rate boost)
    //   low confidence (<0.4) → acetylcholine (attention needed, new-info seeking)
    //   any response with tools → dopamine (action/reward)
    (async () => {
      if (!_userId) {return;}
      try {
        const { NeuromodulatorEngine } = await import('./memory/neuromodulator-engine');
        const engine = new NeuromodulatorEngine();
        const neuroEvent = { magnitude: 0, userId: _userId, context: context as AIContext };

        if (confidence !== undefined) {
          if (confidence >= 0.7) {
            // High confidence = prediction confirmed → dopamine burst
            await engine.emitEvent('confirmation', { ...neuroEvent, magnitude: confidence });
          } else if (confidence >= 0.4) {
            // Medium = uncertainty → norepinephrine (learning rate boost)
            await engine.emitEvent('prediction_error', { ...neuroEvent, magnitude: 1 - confidence });
          } else {
            // Low confidence = novelty/surprise → acetylcholine (attention)
            await engine.emitEvent('novelty', { ...neuroEvent, magnitude: Math.max(0.3, 1 - confidence) });
          }
        }

        // Tool use indicates exploration/action → small dopamine
        if (toolsUsed && toolsUsed.length > 0 && confidence === undefined) {
          await engine.emitEvent('exploration', { ...neuroEvent, magnitude: 0.3 });
        }

        // Persist tonic state periodically (~20% of requests)
        if (Math.random() < 0.2) {
          await engine.persistState(_userId, context as AIContext);
        }
      } catch (err) {
        logger.debug('Cognitive hook: Neuromodulator emission skipped', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })(),

    // 9. Phase 145 PMA: MetacognitiveMonitor — track memory tool acceptance
    // When memory tools (remember/recall) were used, track whether the AI
    // used/accepted the memory results (heuristic: if recall was called and
    // response contains memory content, it was "accepted")
    (async () => {
      if (!_userId) {return;}
      const memTools = params.memoryToolsUsed || (toolsUsed || []).filter(t =>
        ['remember', 'recall', 'memory_introspect', 'core_memory_read'].includes(t)
      );
      if (memTools.length === 0) {return;}

      try {
        const { metacognitiveMonitor } = await import('./memory/metacognitive-monitor');

        for (const tool of memTools) {
          // recall/core_memory_read = suggestion was presented; assume accepted if response is long
          const isRecallTool = ['recall', 'core_memory_read', 'memory_introspect'].includes(tool);
          const accepted = isRecallTool ? response.length > 200 : true; // remember = always accepted
          const suggestionType = isRecallTool ? 'positive' : 'confirming';

          metacognitiveMonitor.trackAcceptance(_userId, context, suggestionType, accepted);
        }

        // Open novelty window on high prediction error
        if (confidence !== undefined && confidence < 0.4) {
          metacognitiveMonitor.openNoveltyWindow(_userId, context, 1 - confidence);
        }

        // Track efficiency metrics (~10% of requests)
        if (Math.random() < 0.1) {
          const tokens = query.length + response.length; // rough proxy
          const precision = confidence || 0.5;
          const quality = Math.min(1, response.length / 500); // rough quality proxy
          metacognitiveMonitor.trackEfficiency(_userId, context, tokens, precision, quality);
        }
      } catch (err) {
        logger.debug('Cognitive hook: MetacognitiveMonitor tracking skipped', {
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
