/**
 * Phase 10: Duplicate Detection Service
 *
 * Uses semantic similarity (pgvector) to find potential duplicate ideas.
 * Helps prevent users from creating redundant entries.
 */

import { queryContext, AIContext, isPgTrgmAvailable } from '../utils/database-context';
import { generateEmbedding } from '../utils/ollama';
import { formatForPgVector } from '../utils/embedding';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface DuplicateCandidate {
  id: string;
  title: string;
  content: string;
  type: string;
  category: string;
  similarity: number;
  createdAt: Date;
}

export interface DuplicateCheckResult {
  hasDuplicates: boolean;
  count: number;
  suggestions: DuplicateCandidate[];
  threshold: number;
}

// ===========================================
// Configuration
// ===========================================

const DEFAULT_THRESHOLD = 0.85; // 85% similarity
const MAX_DUPLICATES = 5;

// ===========================================
// Main Functions
// ===========================================

/**
 * Find potential duplicate ideas based on semantic similarity
 *
 * @param context - The AI context (personal/work)
 * @param content - The content to check for duplicates
 * @param threshold - Similarity threshold (0-1), default 0.85
 * @param excludeId - Optional ID to exclude from results (for updates)
 * @returns Duplicate check result with candidates
 */
export async function findDuplicates(
  context: AIContext,
  content: string,
  threshold: number = DEFAULT_THRESHOLD,
  excludeId?: string
): Promise<DuplicateCheckResult> {
  try {
    // Generate embedding for the new content
    const embedding = await generateEmbedding(content);

    if (!embedding || embedding.length === 0) {
      logger.warn('Failed to generate embedding for duplicate check', { context, operation: 'findDuplicates' });
      return { hasDuplicates: false, count: 0, suggestions: [], threshold };
    }

    const pgvectorEmbedding = formatForPgVector(embedding);

    // Build query with optional exclusion
    let excludeClause = '';
    const params: (string | number)[] = [pgvectorEmbedding, threshold, MAX_DUPLICATES];

    if (excludeId) {
      excludeClause = 'AND id != $4';
      params.push(excludeId);
    }

    // Find similar ideas using cosine similarity
    const result = await queryContext(
      context,
      `SELECT
        id,
        title,
        content,
        type,
        category,
        created_at,
        1 - (embedding <=> $1) as similarity
       FROM ideas
       WHERE is_archived = false
         AND embedding IS NOT NULL
         AND 1 - (embedding <=> $1) > $2
         ${excludeClause}
       ORDER BY similarity DESC
       LIMIT $3`,
      params
    );

    const suggestions: DuplicateCandidate[] = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      content: row.content?.substring(0, 200) + (row.content?.length > 200 ? '...' : ''),
      type: row.type,
      category: row.category,
      similarity: parseFloat(row.similarity),
      createdAt: row.created_at,
    }));

    logger.info('Duplicate check completed', {
      context,
      found: suggestions.length,
      threshold,
      operation: 'findDuplicates'
    });

    return {
      hasDuplicates: suggestions.length > 0,
      count: suggestions.length,
      suggestions,
      threshold,
    };
  } catch (error) {
    logger.error('Duplicate detection error', error instanceof Error ? error : undefined, {
      context,
      operation: 'findDuplicates'
    });
    // Return empty result on error - don't block idea creation
    return { hasDuplicates: false, count: 0, suggestions: [], threshold };
  }
}

/**
 * Quick check if content is likely a duplicate (faster, less accurate)
 * Uses title matching in addition to embeddings
 *
 * @param context - The AI context
 * @param title - The title to check
 * @param content - Optional content for semantic check
 * @returns true if likely duplicate exists
 */
export async function isLikelyDuplicate(
  context: AIContext,
  title: string,
  content?: string
): Promise<boolean> {
  try {
    // Step 1: Check for exact title match (always works)
    const exactCheck = await queryContext(
      context,
      `SELECT id FROM ideas
       WHERE is_archived = false
         AND LOWER(title) = LOWER($1)
       LIMIT 1`,
      [title]
    );

    if (exactCheck.rows.length > 0) {
      return true;
    }

    // Step 2: Fuzzy title match (only if pg_trgm is available)
    if (isPgTrgmAvailable()) {
      const fuzzyCheck = await queryContext(
        context,
        `SELECT id FROM ideas
         WHERE is_archived = false
           AND similarity(LOWER(title), LOWER($1)) > 0.8
         LIMIT 1`,
        [title]
      );

      if (fuzzyCheck.rows.length > 0) {
        return true;
      }
    }

    // Step 3: Semantic check via embeddings (if content provided)
    if (content && content.length > 50) {
      const result = await findDuplicates(context, content, 0.9);
      return result.hasDuplicates;
    }

    return false;
  } catch (error) {
    logger.error('Likely duplicate check error', error instanceof Error ? error : undefined, {
      context,
      operation: 'isLikelyDuplicate'
    });
    return false;
  }
}

/**
 * Merge two ideas into one
 *
 * @param context - The AI context
 * @param primaryId - The ID of the idea to keep
 * @param secondaryId - The ID of the idea to merge into primary
 * @returns Updated primary idea
 */
export async function mergeIdeas(
  context: AIContext,
  primaryId: string,
  secondaryId: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Get both ideas
    const [primary, secondary] = await Promise.all([
      queryContext(context, `SELECT * FROM ideas WHERE id = $1`, [primaryId]),
      queryContext(context, `SELECT * FROM ideas WHERE id = $1`, [secondaryId]),
    ]);

    if (primary.rows.length === 0 || secondary.rows.length === 0) {
      return { success: false, message: 'One or both ideas not found' };
    }

    const p = primary.rows[0];
    const s = secondary.rows[0];

    // Merge content
    const mergedContent = [p.content, s.content].filter(Boolean).join('\n\n---\n\n');

    // Merge tags/keywords
    const mergedKeywords = [...new Set([
      ...(p.keywords || []),
      ...(s.keywords || [])
    ])];

    // Merge next_steps
    const mergedNextSteps = [...new Set([
      ...(p.next_steps || []),
      ...(s.next_steps || [])
    ])];

    // Update primary idea
    await queryContext(
      context,
      `UPDATE ideas SET
        content = $1,
        keywords = $2,
        next_steps = $3,
        updated_at = NOW()
       WHERE id = $4`,
      [mergedContent, JSON.stringify(mergedKeywords), JSON.stringify(mergedNextSteps), primaryId]
    );

    // Archive secondary idea
    await queryContext(
      context,
      `UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1`,
      [secondaryId]
    );

    logger.info('Ideas merged successfully', {
      context,
      primaryId,
      secondaryId,
      operation: 'mergeIdeas'
    });

    return { success: true, message: 'Ideas merged successfully' };
  } catch (error) {
    logger.error('Merge ideas error', error instanceof Error ? error : undefined, {
      context,
      primaryId,
      secondaryId,
      operation: 'mergeIdeas'
    });
    return { success: false, message: 'Failed to merge ideas' };
  }
}
