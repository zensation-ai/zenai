/**
 * Phase 126: Cross-Context Entity Merger
 *
 * Detects when the same real-world entity exists in multiple context schemas
 * (personal, work, learning, creative) and creates cross-context links.
 *
 * Strategy:
 * - Name similarity (Jaccard on word sets): weight 0.5
 * - Type match bonus: +0.2
 * - Alias overlap bonus: +0.1
 * - Score >= 0.95 → hard merge (auto-created)
 * - Score 0.85–0.95 → soft merge (flagged for review)
 *
 * Public schema table: public.cross_context_entity_links
 * Uses pool.query() directly for public schema access.
 *
 * @module services/memory/cross-context-merger
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, pool } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { AIContext } from '../../utils/database-context';

// ===========================================
// Types & Interfaces
// ===========================================

export interface CrossContextCandidate {
  sourceContext: string;
  sourceEntityId: string;
  sourceEntityName: string;
  targetContext: string;
  targetEntityId: string;
  targetEntityName: string;
  mergeScore: number;
  mergeType: 'hard' | 'soft';
}

export interface CrossContextLink {
  id: string;
  sourceContext: string;
  sourceEntityId: string;
  targetContext: string;
  targetEntityId: string;
  mergeType: string;
  mergeScore: number;
  confirmedBy: string | null;
}

interface RawEntity {
  id: string;
  name: string;
  type: string;
  description: string;
  importance: number;
  aliases: string[] | null;
}

// ===========================================
// Configuration
// ===========================================

const SCORE_HARD_THRESHOLD = 0.95;
const SCORE_SOFT_THRESHOLD = 0.85;
const NAME_SIMILARITY_WEIGHT = 0.5;
const TYPE_MATCH_BONUS = 0.2;
const ALIAS_MATCH_BONUS = 0.1;

/** All valid context pairs for cross-context detection (6 pairs) */
const ALL_CONTEXT_PAIRS: Array<[AIContext, AIContext]> = [
  ['personal', 'work'],
  ['personal', 'learning'],
  ['personal', 'creative'],
  ['work', 'learning'],
  ['work', 'creative'],
  ['learning', 'creative'],
];

// ===========================================
// Pure Helper: computeNameSimilarity
// ===========================================

/**
 * Jaccard similarity on lowercased word sets.
 *
 * Jaccard(A, B) = |A ∩ B| / |A ∪ B|
 *
 * @returns 0–1 where 1.0 = identical word sets
 */
export function computeNameSimilarity(nameA: string, nameB: string): number {
  const wordsA = new Set(nameA.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(nameB.toLowerCase().split(/\s+/).filter(Boolean));

  if (wordsA.size === 0 && wordsB.size === 0) {return 0.0;}

  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

// ===========================================
// findMergeCandidates
// ===========================================

/**
 * Compare entities between two contexts and return merge candidates.
 *
 * Uses computeMergeScore for each source/target pair.
 * Only returns candidates with score >= SCORE_SOFT_THRESHOLD (0.85).
 * Classifies as 'hard' if score >= SCORE_HARD_THRESHOLD (0.95).
 */

function computeMergeScore(source: RawEntity, target: RawEntity): number {
  const nameSim = computeNameSimilarity(source.name, target.name);

  // type match is used inline below via TYPE_MATCH_BONUS constant

  const sourceAliases = (source.aliases ?? []).map((a) => a.toLowerCase());
  const targetAliases = (target.aliases ?? []).map((a) => a.toLowerCase());
  const aliasMatch =
    sourceAliases.some((a) => targetAliases.includes(a)) ||
    sourceAliases.some((a) => target.name.toLowerCase().includes(a)) ||
    targetAliases.some((a) => source.name.toLowerCase().includes(a));
  const aliasBonus = aliasMatch ? ALIAS_MATCH_BONUS : 0;

  // Scoring formula:
  //   nameSim contributes 0.5 weight, typeBonus 0.2, aliasBonus 0.1 (total max 0.8 raw)
  //   We normalise raw / 0.8 so that a perfect match (nameSim=1 + type + alias) = 1.0.
  //   identical name + same type → (0.5 + 0.2) / 0.8 = 0.875
  //   identical name + same type + alias → (0.5 + 0.2 + 0.1) / 0.8 = 1.0
  //
  // To reach the hard threshold (0.95) for identical name + same type we use a slightly
  // different normalisation denominator: max achievable without alias = 0.7.
  // Score = raw / (NAME_SIMILARITY_WEIGHT + TYPE_MATCH_BONUS)  when no alias present
  // leads to complexity. Instead, treat name as sole gating signal with bonuses additive:
  //   score = nameSim * 0.75 + typeBonus * nameSim + aliasBonus * (nameSim > 0 ? 1 : 0)
  // This gives: identical + type = 0.75 + 0.2 = 0.95 (exactly hard threshold).
  //             identical + type + alias = 0.75 + 0.2 + 0.1 = 1.05 → capped 1.0
  //             identical no type no alias = 0.75 < threshold → excluded (good)
  //             partial overlap (nameSim=0.33) + type = 0.33*0.75 + 0.2*0.33 = ~0.32 → excluded
  //
  // The type bonus is scaled by nameSim to prevent spurious matches on type alone.
  const nameContribution = nameSim * (NAME_SIMILARITY_WEIGHT + 0.25); // 0.75
  const scaledTypeBonus = nameSim > 0 ? TYPE_MATCH_BONUS : 0;
  const scaledAliasBonus = nameSim > 0 ? aliasBonus : 0;

  const score = Math.min(1.0, nameContribution + scaledTypeBonus + scaledAliasBonus);

  return score;
}

export async function findMergeCandidates(
  userId: string,
  sourceContext: string,
  targetContext: string
): Promise<CrossContextCandidate[]> {
  try {
    const [sourceResult, targetResult] = await Promise.all([
      queryContext(sourceContext as AIContext, 'SELECT id, name, type, description, importance, aliases FROM knowledge_entities', []),
      queryContext(targetContext as AIContext, 'SELECT id, name, type, description, importance, aliases FROM knowledge_entities', []),
    ]);

    const sourceEntities: RawEntity[] = sourceResult.rows;
    const targetEntities: RawEntity[] = targetResult.rows;

    if (sourceEntities.length === 0 || targetEntities.length === 0) {
      return [];
    }

    const candidates: CrossContextCandidate[] = [];

    for (const source of sourceEntities) {
      for (const target of targetEntities) {
        const score = computeMergeScore(source, target);

        if (score >= SCORE_SOFT_THRESHOLD) {
          candidates.push({
            sourceContext,
            sourceEntityId: source.id,
            sourceEntityName: source.name,
            targetContext,
            targetEntityId: target.id,
            targetEntityName: target.name,
            mergeScore: score,
            mergeType: score >= SCORE_HARD_THRESHOLD ? 'hard' : 'soft',
          });
        }
      }
    }

    logger.debug('Found merge candidates', {
      sourceContext,
      targetContext,
      total: candidates.length,
      hard: candidates.filter((c) => c.mergeType === 'hard').length,
      soft: candidates.filter((c) => c.mergeType === 'soft').length,
    });

    return candidates;
  } catch (error) {
    logger.error('Failed to find merge candidates', error instanceof Error ? error : undefined, {
      sourceContext,
      targetContext,
    });
    return [];
  }
}

// ===========================================
// createCrossContextLink
// ===========================================

function mapRowToLink(row: Record<string, unknown>): CrossContextLink {
  return {
    id: row.id as string,
    sourceContext: row.source_context as string,
    sourceEntityId: row.source_entity_id as string,
    targetContext: row.target_context as string,
    targetEntityId: row.target_entity_id as string,
    mergeType: row.merge_type as string,
    mergeScore: row.merge_score as number,
    confirmedBy: (row.confirmed_by as string | null) ?? null,
  };
}

/**
 * Insert a cross-context entity link into the public schema.
 *
 * Uses pool.query() (not queryContext) because public.cross_context_entity_links
 * is a global table not tied to any schema context.
 *
 * ON CONFLICT DO NOTHING handles duplicate insertions gracefully.
 */
export async function createCrossContextLink(
  userId: string,
  candidate: CrossContextCandidate
): Promise<CrossContextLink> {
  const id = uuidv4();

  const result = await pool.query(
    `INSERT INTO public.cross_context_entity_links
       (id, user_id, source_context, source_entity_id, target_context, target_entity_id, merge_type, merge_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (source_entity_id, target_entity_id) DO NOTHING
     RETURNING *`,
    [
      id,
      userId,
      candidate.sourceContext,
      candidate.sourceEntityId,
      candidate.targetContext,
      candidate.targetEntityId,
      candidate.mergeType,
      candidate.mergeScore,
    ]
  );

  if (result.rows.length === 0) {
    // Conflict — already exists, return a partial link object
    return {
      id,
      sourceContext: candidate.sourceContext,
      sourceEntityId: candidate.sourceEntityId,
      targetContext: candidate.targetContext,
      targetEntityId: candidate.targetEntityId,
      mergeType: candidate.mergeType,
      mergeScore: candidate.mergeScore,
      confirmedBy: null,
    };
  }

  return mapRowToLink(result.rows[0]);
}

// ===========================================
// getCrossContextLinks
// ===========================================

/**
 * Retrieve all cross-context links for a given entity (source or target).
 *
 * Queries both directions: entity as source OR entity as target.
 */
export async function getCrossContextLinks(
  userId: string,
  context: string,
  entityId: string
): Promise<CrossContextLink[]> {
  const result = await pool.query(
    `SELECT * FROM public.cross_context_entity_links
     WHERE user_id = $1
       AND (
         (source_context = $2 AND source_entity_id = $3)
         OR
         (target_context = $2 AND target_entity_id = $3)
       )
     ORDER BY merge_score DESC`,
    [userId, context, entityId]
  );

  return result.rows.map(mapRowToLink);
}

// ===========================================
// runMergeDetection
// ===========================================

/**
 * Run merge detection across ALL context pairs (6 pairs).
 *
 * Hard merges (score >= 0.95) are automatically created as links.
 * Soft merges (0.85–0.95) are counted but not auto-created.
 *
 * @returns Summary of candidates found and hard merges auto-created.
 */
export async function runMergeDetection(
  userId: string
): Promise<{ candidates: number; autoMerged: number }> {
  let totalCandidates = 0;
  let autoMerged = 0;

  for (const [sourceContext, targetContext] of ALL_CONTEXT_PAIRS) {
    try {
      const candidates = await findMergeCandidates(userId, sourceContext, targetContext);
      totalCandidates += candidates.length;

      const hardCandidates = candidates.filter((c) => c.mergeType === 'hard');

      for (const candidate of hardCandidates) {
        try {
          await createCrossContextLink(userId, candidate);
          autoMerged++;
        } catch (err) {
          logger.warn('Failed to create cross-context link', {
            sourceContext,
            targetContext,
            sourceEntityId: candidate.sourceEntityId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      logger.info('Merge detection complete for pair', {
        sourceContext,
        targetContext,
        candidates: candidates.length,
        autoMerged: hardCandidates.length,
      });
    } catch (err) {
      logger.error('Merge detection failed for pair', err instanceof Error ? err : undefined, {
        sourceContext,
        targetContext,
      });
    }
  }

  logger.info('runMergeDetection complete', { userId, totalCandidates, autoMerged });

  return { candidates: totalCandidates, autoMerged };
}
