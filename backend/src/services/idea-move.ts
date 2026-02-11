/**
 * Idea Move Service
 *
 * Moves an idea from one context schema to another.
 * Cross-schema operation: read from source → insert into target → delete from source.
 */

import { queryContext } from '../utils/database-context';
import { AIContext } from '../types';
import { logger } from '../utils/logger';

export interface MoveResult {
  success: boolean;
  ideaId: string;
  newIdeaId: string;
  sourceContext: AIContext;
  targetContext: AIContext;
}

/**
 * Move an idea from one context to another.
 *
 * Algorithm:
 * 1. Read full idea from source schema
 * 2. Insert into target schema with new UUID
 * 3. Delete from source schema (CASCADE cleans up relations/memberships)
 *
 * Deliberately NOT moved:
 * - idea_relations (reference other ideas in source schema)
 * - idea_topic_memberships (topics are context-specific)
 */
export async function moveIdea(
  sourceContext: AIContext,
  targetContext: AIContext,
  ideaId: string
): Promise<MoveResult> {
  logger.info('Starting idea move', {
    operation: 'moveIdea',
    sourceContext,
    targetContext,
    ideaId,
  });

  // 1. Read the full idea from source (try with extended columns, fallback to core)
  let sourceResult;
  try {
    sourceResult = await queryContext(sourceContext, `
      SELECT
        title, type, category, priority, summary, raw_input, raw_transcript,
        next_steps, context_needed, keywords, embedding, is_archived,
        viewed_count, created_at
      FROM ideas
      WHERE id = $1
    `, [ideaId]);
  } catch {
    // Fallback: raw_transcript/viewed_count may not exist in older schemas
    sourceResult = await queryContext(sourceContext, `
      SELECT
        title, type, category, priority, summary, raw_input,
        next_steps, context_needed, keywords, embedding, is_archived,
        created_at
      FROM ideas
      WHERE id = $1
    `, [ideaId]);
  }

  if (sourceResult.rows.length === 0) {
    throw new Error('IDEA_NOT_FOUND');
  }

  const idea = sourceResult.rows[0];
  const hasExtendedColumns = 'raw_transcript' in idea;

  // JSONB columns must be stringified before INSERT — the pg driver
  // serializes JS arrays as PostgreSQL array literals {a,b} instead of JSON ["a","b"]
  const jsonb = (val: unknown) => val != null ? JSON.stringify(val) : null;

  // 2. Insert into target schema (try extended columns, fallback to core if target schema differs)
  let insertResult;
  if (hasExtendedColumns) {
    try {
      insertResult = await queryContext(targetContext, `
        INSERT INTO ideas (
          title, type, category, priority, summary, raw_input, raw_transcript,
          next_steps, context_needed, keywords, embedding, is_archived,
          context, viewed_count, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13, $14, $15, NOW()
        )
        RETURNING id
      `, [
        idea.title,
        idea.type,
        idea.category,
        idea.priority,
        idea.summary,
        idea.raw_input,
        idea.raw_transcript,
        jsonb(idea.next_steps),
        jsonb(idea.context_needed),
        jsonb(idea.keywords),
        idea.embedding,
        idea.is_archived,
        targetContext,
        idea.viewed_count || 0,
        idea.created_at,
      ]);
    } catch (insertError) {
      // Fallback: target schema may not have raw_transcript/viewed_count columns
      logger.warn('Extended INSERT failed, falling back to basic columns', {
        operation: 'moveIdea',
        targetContext,
        error: insertError instanceof Error ? insertError.message : String(insertError),
      });
      try {
        insertResult = await queryContext(targetContext, `
          INSERT INTO ideas (
            title, type, category, priority, summary, raw_input,
            next_steps, context_needed, keywords, embedding, is_archived,
            context, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, NOW()
          )
          RETURNING id
        `, [
          idea.title,
          idea.type,
          idea.category,
          idea.priority,
          idea.summary,
          idea.raw_input,
          jsonb(idea.next_steps),
          jsonb(idea.context_needed),
          jsonb(idea.keywords),
          idea.embedding,
          idea.is_archived,
          targetContext,
          idea.created_at,
        ]);
      } catch (fallbackError) {
        const pgCode = (fallbackError as Record<string, unknown>)?.code;
        logger.error('Fallback INSERT into target schema also failed', fallbackError instanceof Error ? fallbackError : undefined, {
          operation: 'moveIdea',
          targetContext,
          pgCode,
        });
        const err = new Error('SCHEMA_MISMATCH');
        (err as unknown as Record<string, unknown>).pgCode = pgCode;
        (err as unknown as Record<string, unknown>).detail = `INSERT into ${targetContext}.ideas failed (pg code: ${pgCode}). Run fix_idea_move_schema.sql migration.`;
        throw err;
      }
    }
  } else {
    try {
      insertResult = await queryContext(targetContext, `
        INSERT INTO ideas (
          title, type, category, priority, summary, raw_input,
          next_steps, context_needed, keywords, embedding, is_archived,
          context, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, NOW()
        )
        RETURNING id
      `, [
        idea.title,
        idea.type,
        idea.category,
        idea.priority,
        idea.summary,
        idea.raw_input,
        jsonb(idea.next_steps),
        jsonb(idea.context_needed),
        jsonb(idea.keywords),
        idea.embedding,
        idea.is_archived,
        targetContext,
        idea.created_at,
      ]);
    } catch (insertError) {
      const pgCode = (insertError as Record<string, unknown>)?.code;
      logger.error('Basic INSERT into target schema failed', insertError instanceof Error ? insertError : undefined, {
        operation: 'moveIdea',
        targetContext,
        pgCode,
      });
      const err = new Error('SCHEMA_MISMATCH');
      (err as unknown as Record<string, unknown>).pgCode = pgCode;
      (err as unknown as Record<string, unknown>).detail = `INSERT into ${targetContext}.ideas failed (pg code: ${pgCode}). Run fix_idea_move_schema.sql migration.`;
      throw err;
    }
  }

  const newIdeaId = insertResult.rows[0].id;

  // 3. Delete from source schema (CASCADE handles relations, topic memberships)
  try {
    await queryContext(sourceContext, 'DELETE FROM ideas WHERE id = $1', [ideaId]);
  } catch (deleteError) {
    // If delete fails, we have a duplicate. Log it for manual cleanup.
    logger.error('Failed to delete source idea after move - duplicate may exist', deleteError instanceof Error ? deleteError : undefined, {
      operation: 'moveIdea',
      sourceContext,
      targetContext,
      oldIdeaId: ideaId,
      newIdeaId,
    });
    throw deleteError;
  }

  logger.info('Idea moved successfully', {
    operation: 'moveIdea',
    sourceContext,
    targetContext,
    oldIdeaId: ideaId,
    newIdeaId,
    title: idea.title?.substring(0, 50),
  });

  return {
    success: true,
    ideaId,
    newIdeaId,
    sourceContext,
    targetContext,
  };
}
