/**
 * Phase 133: Artificial Curiosity Engine — Hypothesis Engine
 *
 * Generates hypotheses from incomplete knowledge graph patterns,
 * temporal gaps in facts, and contradictions between facts.
 */

import { logger } from '../../utils/logger';
import { queryContext } from '../../utils/database-context';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface Hypothesis {
  hypothesis: string;
  sourceType: 'incomplete_pattern' | 'temporal_gap' | 'contradiction' | 'analogy';
  sourceEntities: string[];
  confidence: number;
}

export interface Relation {
  source: string;
  target: string;
  type: string;
}

export interface FactWithTimestamp {
  id: string;
  content: string;
  entities: string[];
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMPORAL_GAP_DAYS = 30;
const MAX_HYPOTHESES = 10;

const NEGATION_PATTERNS = [
  /\bnot\b/i,
  /\bno longer\b/i,
  /\bdoes not\b/i,
  /\bdoesn't\b/i,
  /\bisn't\b/i,
  /\bnever\b/i,
  /\bno\b/i,
];

// ---------------------------------------------------------------------------
// generateFromIncompletePatterns
// ---------------------------------------------------------------------------

/**
 * Finds graph patterns where A->B, A->C, B->D exist but C->D is missing.
 * Generates hypotheses about potential connections between C and D.
 */
export function generateFromIncompletePatterns(relations: Relation[]): Hypothesis[] {
  if (relations.length < 2) return [];

  // Build adjacency list (source -> set of targets)
  const adj = new Map<string, Set<string>>();
  const edgeSet = new Set<string>();

  for (const rel of relations) {
    if (!adj.has(rel.source)) adj.set(rel.source, new Set());
    adj.get(rel.source)!.add(rel.target);
    edgeSet.add(`${rel.source}->${rel.target}`);
  }

  const hypotheses: Hypothesis[] = [];
  const seen = new Set<string>();

  // For each node A with at least 2 outgoing edges
  for (const [a, neighbors] of adj) {
    const targets = Array.from(neighbors);
    if (targets.length < 2) continue;

    // For each pair (B, C) of A's targets
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const b = targets[i];
        const c = targets[j];

        // Check if B->D exists for some D
        const bTargets = adj.get(b);
        if (!bTargets) continue;

        for (const d of bTargets) {
          if (d === c || d === a) continue;

          // Check if C->D is missing
          if (!edgeSet.has(`${c}->${d}`)) {
            const key = [c, d].sort().join(',');
            if (!seen.has(key)) {
              seen.add(key);
              hypotheses.push({
                hypothesis: `Could "${c}" be related to "${d}"? Both share a common ancestor "${a}", and "${b}" (also from "${a}") connects to "${d}".`,
                sourceType: 'incomplete_pattern',
                sourceEntities: [c, d],
                confidence: 0.5,
              });
            }
          }
        }

        // Also check opposite direction: C->D exists, B->D missing
        const cTargets = adj.get(c);
        if (!cTargets) continue;

        for (const d of cTargets) {
          if (d === b || d === a) continue;

          if (!edgeSet.has(`${b}->${d}`)) {
            const key = [b, d].sort().join(',');
            if (!seen.has(key)) {
              seen.add(key);
              hypotheses.push({
                hypothesis: `Could "${b}" be related to "${d}"? Both share a common ancestor "${a}", and "${c}" (also from "${a}") connects to "${d}".`,
                sourceType: 'incomplete_pattern',
                sourceEntities: [b, d],
                confidence: 0.5,
              });
            }
          }
        }
      }
    }
  }

  return hypotheses;
}

// ---------------------------------------------------------------------------
// generateFromTemporalGaps
// ---------------------------------------------------------------------------

/**
 * Finds facts older than 30 days and generates "Is this still current?" hypotheses.
 */
export function generateFromTemporalGaps(facts: FactWithTimestamp[]): Hypothesis[] {
  if (facts.length === 0) return [];

  const now = Date.now();
  const thresholdMs = TEMPORAL_GAP_DAYS * 24 * 60 * 60 * 1000;
  const hypotheses: Hypothesis[] = [];

  for (const fact of facts) {
    const ageMs = now - fact.createdAt.getTime();
    if (ageMs > thresholdMs) {
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      hypotheses.push({
        hypothesis: `Is this still current (${ageDays} days old)? "${fact.content}"`,
        sourceType: 'temporal_gap',
        sourceEntities: fact.entities.length > 0 ? fact.entities : [fact.id],
        confidence: Math.min(0.9, 0.4 + (ageDays - TEMPORAL_GAP_DAYS) / 100),
      });
    }
  }

  return hypotheses;
}

// ---------------------------------------------------------------------------
// generateFromContradictions
// ---------------------------------------------------------------------------

/**
 * Finds facts with overlapping entities but contradictory content.
 * Uses negation detection and word-level similarity to identify contradictions.
 */
export function generateFromContradictions(
  facts: Array<{ id: string; content: string; entities: string[] }>,
): Hypothesis[] {
  if (facts.length < 2) return [];

  const hypotheses: Hypothesis[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const a = facts[i];
      const b = facts[j];

      // Check for overlapping entities
      const overlap = a.entities.filter((e) => b.entities.includes(e));
      if (overlap.length === 0) continue;

      // Check if one negates the other
      if (isContradiction(a.content, b.content)) {
        const key = [a.id, b.id].sort().join(',');
        if (!seen.has(key)) {
          seen.add(key);
          hypotheses.push({
            hypothesis: `Potential contradiction about ${overlap.join(', ')}: "${a.content}" vs "${b.content}"`,
            sourceType: 'contradiction',
            sourceEntities: overlap,
            confidence: 0.7,
          });
        }
      }
    }
  }

  return hypotheses;
}

/**
 * Determines if two content strings are contradictory.
 * Checks for negation patterns and word-level similarity.
 */
function isContradiction(contentA: string, contentB: string): boolean {
  const wordsA = normalizeContent(contentA);
  const wordsB = normalizeContent(contentB);

  // Check if one has negation that the other doesn't
  const hasNegationA = NEGATION_PATTERNS.some((p) => p.test(contentA));
  const hasNegationB = NEGATION_PATTERNS.some((p) => p.test(contentB));

  if (hasNegationA === hasNegationB) {
    // Both have or both lack negation — not a simple contradiction
    return false;
  }

  // Check word overlap (excluding negation words) to confirm they're about the same claim
  const negationWords = new Set(['not', 'no', 'never', 'longer', 'anymore', "doesn't", "isn't", 'does']);
  const cleanA = wordsA.filter((w) => !negationWords.has(w));
  const cleanB = wordsB.filter((w) => !negationWords.has(w));

  const setA = new Set(cleanA);
  const setB = new Set(cleanB);
  const intersection = cleanA.filter((w) => setB.has(w));
  const union = new Set([...setA, ...setB]);

  if (union.size === 0) return false;

  const jaccard = intersection.length / union.size;
  // High overlap + one negated = contradiction
  return jaccard > 0.3;
}

function normalizeContent(content: string): string[] {
  return content
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

// ---------------------------------------------------------------------------
// generateHypotheses (orchestrator)
// ---------------------------------------------------------------------------

/**
 * Orchestrates all hypothesis generators via DB queries.
 * Combines results, sorts by confidence descending, limits to top 10.
 */
export async function generateHypotheses(
  context: string,
  userId?: string,
): Promise<Hypothesis[]> {
  try {
    logger.info('Generating hypotheses', { context, userId });

    // Fetch relations from knowledge graph
    const relationsResult = await queryContext(
      context,
      `SELECT source_id, target_id, relation_type
       FROM idea_relations
       ${userId ? 'WHERE user_id = $1' : ''}
       LIMIT 500`,
      userId ? [userId] : [],
    );

    // Fetch facts with timestamps for temporal gap detection
    const factsResult = await queryContext(
      context,
      `SELECT id, content, entities, created_at
       FROM learned_facts
       ${userId ? 'WHERE user_id = $1' : ''}
       ORDER BY created_at ASC
       LIMIT 200`,
      userId ? [userId] : [],
    );

    // Fetch facts for contradiction detection
    const contradictionFactsResult = await queryContext(
      context,
      `SELECT id, content, entities
       FROM learned_facts
       WHERE entities IS NOT NULL AND array_length(entities, 1) > 0
       ${userId ? 'AND user_id = $1' : ''}
       ORDER BY created_at DESC
       LIMIT 200`,
      userId ? [userId] : [],
    );

    // Transform DB rows to typed data
    const relations: Relation[] = (relationsResult.rows || []).map((r: any) => ({
      source: r.source_id,
      target: r.target_id,
      type: r.relation_type,
    }));

    const factsWithTimestamps: FactWithTimestamp[] = (factsResult.rows || []).map((r: any) => ({
      id: r.id,
      content: r.content,
      entities: r.entities || [],
      createdAt: new Date(r.created_at),
    }));

    const contradictionFacts = (contradictionFactsResult.rows || []).map((r: any) => ({
      id: r.id,
      content: r.content,
      entities: r.entities || [],
    }));

    // Run all generators
    const patternHypotheses = generateFromIncompletePatterns(relations);
    const temporalHypotheses = generateFromTemporalGaps(factsWithTimestamps);
    const contradictionHypotheses = generateFromContradictions(contradictionFacts);

    // Combine, sort by confidence descending, limit
    const all = [...patternHypotheses, ...temporalHypotheses, ...contradictionHypotheses];
    all.sort((a, b) => b.confidence - a.confidence);

    const result = all.slice(0, MAX_HYPOTHESES);

    logger.info('Hypotheses generated', {
      context,
      total: result.length,
      patterns: patternHypotheses.length,
      temporal: temporalHypotheses.length,
      contradictions: contradictionHypotheses.length,
    });

    return result;
  } catch (error) {
    logger.error('Failed to generate hypotheses', { context, error });
    return [];
  }
}
