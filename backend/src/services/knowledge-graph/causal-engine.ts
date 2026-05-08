/**
 * Causal Engine (Knowledge Graph)
 *
 * Provides cause-effect pair extraction from text via Claude,
 * causal chain traversal through knowledge_relations, and
 * narrative explanation generation.
 *
 * @module services/knowledge-graph/causal-engine
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { generateClaudeResponse } from '../claude/core';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface CausalPair {
  cause: string;
  effect: string;
  confidence: number;
}

export interface CausalLink {
  sourceId: string;
  targetId: string;
  confidence: number;
  depth: number;
}

// ===========================================
// Decay constant: confidence multiplier per hop
// ===========================================

const DECAY_FACTOR = 0.85;

// ===========================================
// extractCausalPairs
// ===========================================

/**
 * Prompts Claude to extract cause-effect pairs from the given text.
 * Returns a JSON array of { cause, effect, confidence } objects.
 * Returns empty array on any error.
 */
export async function extractCausalPairs(
  text: string,
  context: AIContext
): Promise<CausalPair[]> {
  try {
    const systemPrompt = `You are a causal relation extractor. Given text, identify explicit or strongly implied cause-effect pairs.
Return ONLY a JSON array with objects: { "cause": string, "effect": string, "confidence": number (0-1) }.
If no causal relations are found, return [].`;

    const userPrompt = `Extract all causal pairs from the following text:\n\n${text}`;

    const raw = await generateClaudeResponse(systemPrompt, userPrompt, {
      maxTokens: 512,
    });

    // Strip markdown code fences if present
    const cleaned = raw.replace(/```(?:json)?\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as CausalPair[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch (err) {
    logger.debug('extractCausalPairs: failed to extract causal pairs', { error: err });
    return [];
  }
}

// ===========================================
// buildCausalChain
// ===========================================

/**
 * Traverses `caused_by` relations in the knowledge_relations table starting
 * from `entityId`, up to `maxDepth` hops. Each hop reduces confidence by
 * DECAY_FACTOR. Returns empty array for unknown entities or on error.
 */
export async function buildCausalChain(
  entityId: string,
  context: AIContext,
  maxDepth = 5
): Promise<CausalLink[]> {
  try {
    const chain: CausalLink[] = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number; parentConfidence: number }> = [
      { id: entityId, depth: 0, parentConfidence: 1.0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= maxDepth) {
        break;
      }

      if (visited.has(current.id)) {
        continue;
      }
      visited.add(current.id);

      const result = await queryContext(
        context,
        `SELECT source_id, target_id, strength
         FROM knowledge_relations
         WHERE source_id = $1
           AND relation_type = 'caused_by'
         ORDER BY strength DESC
         LIMIT 10`,
        [current.id]
      );

      for (const row of result.rows) {
        const hopConfidence = current.parentConfidence * DECAY_FACTOR * parseFloat(row.strength);
        chain.push({
          sourceId: row.source_id as string,
          targetId: row.target_id as string,
          confidence: hopConfidence,
          depth: current.depth + 1,
        });

        if (!visited.has(row.target_id as string)) {
          queue.push({
            id: row.target_id as string,
            depth: current.depth + 1,
            parentConfidence: hopConfidence,
          });
        }
      }
    }

    return chain;
  } catch (err) {
    logger.debug('buildCausalChain: failed to build chain', { entityId, error: err });
    return [];
  }
}

// ===========================================
// extractCausalRelations (spec-named alias for extractCausalPairs)
// ===========================================

/**
 * Alias for extractCausalPairs matching the spec function name.
 * Extracts cause-effect relations from text via Claude.
 */
export const extractCausalRelations = extractCausalPairs;

// ===========================================
// inferCausality
// ===========================================

/**
 * Infers whether factA causally contributes to factB by checking:
 * 1. Temporal ordering (factA precedes factB)
 * 2. Semantic overlap (shared keywords)
 * 3. Direct graph relation (caused_by edge between the two entities)
 *
 * Returns a confidence score 0–1. Returns 0 if inputs are empty or on error.
 */
export async function inferCausality(
  factA: string,
  factB: string,
  context: AIContext
): Promise<number> {
  if (!factA.trim() || !factB.trim()) {
    return 0;
  }

  try {
    // 1. Temporal check: look for past-tense verbs / temporal markers in factA vs factB
    const temporalMarkers = ['before', 'prior to', 'earlier', 'previously', 'led to', 'resulted in', 'caused', 'because of'];
    const hasTemporalSignal = temporalMarkers.some(m => factA.toLowerCase().includes(m) || factB.toLowerCase().includes(m));

    // 2. Semantic overlap: shared meaningful tokens
    const tokensA = new Set(factA.toLowerCase().split(/\W+/).filter(t => t.length > 3));
    const tokensB = new Set(factB.toLowerCase().split(/\W+/).filter(t => t.length > 3));
    const shared = [...tokensA].filter(t => tokensB.has(t));
    const semanticScore = shared.length / Math.max(tokensA.size, tokensB.size, 1);

    // 3. Graph relation check: look for a caused_by edge between entities matching factA/factB keywords
    const keywordA = [...tokensA].slice(0, 3).join(' ');
    const keywordB = [...tokensB].slice(0, 3).join(' ');
    let graphScore = 0;

    if (keywordA && keywordB) {
      const result = await queryContext(context, `
        SELECT COUNT(*) AS cnt
        FROM knowledge_relations kr
        JOIN knowledge_graph_nodes a ON a.id = kr.source_id
        JOIN knowledge_graph_nodes b ON b.id = kr.target_id
        WHERE kr.relation_type = 'caused_by'
          AND (a.label ILIKE $1 OR a.content ILIKE $1)
          AND (b.label ILIKE $2 OR b.content ILIKE $2)
        LIMIT 1
      `, [`%${keywordA}%`, `%${keywordB}%`]);
      graphScore = parseInt((result.rows[0] as { cnt: string }).cnt, 10) > 0 ? 0.4 : 0;
    }

    // Composite score
    const temporalBoost = hasTemporalSignal ? 0.15 : 0;
    const confidence = Math.min(1, semanticScore * 0.45 + graphScore + temporalBoost);

    return Math.round(confidence * 100) / 100;
  } catch (err) {
    logger.debug('inferCausality: inference failed', { error: err });
    return 0;
  }
}

// ===========================================
// explainWhy
// ===========================================

/**
 * Builds the causal chain for an entity, then asks Claude to produce
 * a human-readable narrative explanation. Returns null when the chain
 * is empty or on any error.
 */
export async function explainWhy(
  entityId: string,
  context: AIContext
): Promise<string | null> {
  try {
    const chain = await buildCausalChain(entityId, context);

    if (chain.length === 0) {
      return null;
    }

    const chainDescription = chain
      .map(
        (link, i) =>
          `Step ${i + 1}: "${link.sourceId}" caused "${link.targetId}" (confidence: ${link.confidence.toFixed(2)})`
      )
      .join('\n');

    const systemPrompt = `You are an AI assistant that explains causal chains in clear, concise language.`;
    const userPrompt = `Given the following causal chain, write a brief narrative explanation (2-4 sentences):\n\n${chainDescription}`;

    const narrative = await generateClaudeResponse(systemPrompt, userPrompt, {
      maxTokens: 256,
    });

    return narrative;
  } catch (err) {
    logger.debug('explainWhy: failed to generate explanation', { entityId, error: err });
    return null;
  }
}
