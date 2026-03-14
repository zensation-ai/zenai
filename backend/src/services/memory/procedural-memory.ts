/**
 * Phase 59: Procedural Memory Service (Letta-Paradigm)
 *
 * Manages procedural knowledge - learned sequences of actions
 * that the AI system has performed successfully. Enables
 * recall of "how to do things" based on semantic similarity.
 *
 * @module services/memory/procedural-memory
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { generateEmbedding } from '../ai';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

export interface ProceduralMemoryInput {
  triggerDescription: string;
  steps: string[];
  toolsUsed: string[];
  outcome: 'success' | 'partial' | 'failure';
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface ProceduralMemoryRecord extends ProceduralMemoryInput {
  id: string;
  usageCount: number;
  successRate: number;
  feedbackScore: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// ProceduralMemory Class
// ===========================================

export class ProceduralMemory {
  /**
   * Store a new procedural memory with embedding
   */
  async recordProcedure(
    context: AIContext,
    procedure: ProceduralMemoryInput
  ): Promise<ProceduralMemoryRecord> {
    const { triggerDescription, steps, toolsUsed, outcome, durationMs, metadata } = procedure;

    // Generate embedding from trigger + steps description
    const embeddingText = `${triggerDescription}\n${steps.join(' -> ')}`;
    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(embeddingText);
    } catch (err) {
      logger.debug('Embedding generation failed for procedural memory', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const result = await queryContext(
      context,
      `INSERT INTO procedural_memories
       (trigger_description, steps, tools_used, outcome, duration_ms, embedding, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, trigger_description, steps, tools_used, outcome, duration_ms,
                 usage_count, success_rate, feedback_score, metadata, created_at, updated_at`,
      [
        triggerDescription,
        steps,
        toolsUsed,
        outcome,
        durationMs || null,
        embedding ? JSON.stringify(embedding) : null,
        JSON.stringify(metadata || {}),
      ]
    );

    const row = result.rows[0];
    logger.info('Procedural memory recorded', {
      id: row.id,
      trigger: triggerDescription.substring(0, 80),
      outcome,
      context,
    });

    return this.mapRow(row);
  }

  /**
   * Semantic search for similar procedures
   */
  async recallProcedure(
    context: AIContext,
    situation: string,
    limit: number = 5
  ): Promise<ProceduralMemoryRecord[]> {
    let embedding: number[];
    try {
      embedding = await generateEmbedding(situation);
    } catch (err) {
      logger.debug('Embedding generation failed for recall', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }

    const result = await queryContext(
      context,
      `SELECT id, trigger_description, steps, tools_used, outcome, duration_ms,
              usage_count, success_rate, feedback_score, metadata, created_at, updated_at,
              1 - (embedding <=> $1::vector) AS similarity
       FROM procedural_memories
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [JSON.stringify(embedding), limit]
    );

    // Update usage count for recalled procedures
    if (result.rows.length > 0) {
      const ids = result.rows.map((r: { id: string }) => r.id);
      await queryContext(
        context,
        `UPDATE procedural_memories SET usage_count = usage_count + 1, updated_at = NOW()
         WHERE id = ANY($1)`,
        [ids]
      ).catch(err => {
        logger.debug('Usage count update failed', { error: err instanceof Error ? err.message : String(err) });
      });
    }

    return result.rows.map((row: Record<string, unknown>) => this.mapRow(row));
  }

  /**
   * Update success_rate and feedback based on user feedback
   */
  async optimizeProcedure(
    procedureId: string,
    context: AIContext,
    feedback: { success: boolean; score?: number }
  ): Promise<ProceduralMemoryRecord | null> {
    // First get current state
    const current = await queryContext(
      context,
      `SELECT usage_count, success_rate FROM procedural_memories WHERE id = $1`,
      [procedureId]
    );

    if (current.rows.length === 0) {
      return null;
    }

    const { usage_count, success_rate } = current.rows[0];
    const total = usage_count || 1;
    // Exponential moving average for success rate
    const newRate = feedback.success
      ? success_rate + (1 - success_rate) / (total + 1)
      : success_rate - success_rate / (total + 1);

    const result = await queryContext(
      context,
      `UPDATE procedural_memories
       SET success_rate = $2,
           feedback_score = COALESCE($3, feedback_score),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, trigger_description, steps, tools_used, outcome, duration_ms,
                 usage_count, success_rate, feedback_score, metadata, created_at, updated_at`,
      [procedureId, Math.max(0, Math.min(1, newRate)), feedback.score ?? null]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get the most successful procedures
   */
  async getTopProcedures(
    context: AIContext,
    limit: number = 10
  ): Promise<ProceduralMemoryRecord[]> {
    const result = await queryContext(
      context,
      `SELECT id, trigger_description, steps, tools_used, outcome, duration_ms,
              usage_count, success_rate, feedback_score, metadata, created_at, updated_at
       FROM procedural_memories
       WHERE outcome != 'failure'
       ORDER BY success_rate DESC, usage_count DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row: Record<string, unknown>) => this.mapRow(row));
  }

  /**
   * Delete a procedure
   */
  async deleteProcedure(
    procedureId: string,
    context: AIContext
  ): Promise<boolean> {
    const result = await queryContext(
      context,
      `DELETE FROM procedural_memories WHERE id = $1`,
      [procedureId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get a single procedure by ID
   */
  async getProcedure(
    procedureId: string,
    context: AIContext
  ): Promise<ProceduralMemoryRecord | null> {
    const result = await queryContext(
      context,
      `SELECT id, trigger_description, steps, tools_used, outcome, duration_ms,
              usage_count, success_rate, feedback_score, metadata, created_at, updated_at
       FROM procedural_memories WHERE id = $1`,
      [procedureId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * List procedures with optional filters
   */
  async listProcedures(
    context: AIContext,
    options: { limit?: number; outcome?: string }
  ): Promise<ProceduralMemoryRecord[]> {
    const { limit = 20, outcome } = options;

    let sql = `SELECT id, trigger_description, steps, tools_used, outcome, duration_ms,
                      usage_count, success_rate, feedback_score, metadata, created_at, updated_at
               FROM procedural_memories`;
    const params: (string | number)[] = [];

    if (outcome) {
      sql += ` WHERE outcome = $1`;
      params.push(outcome);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await queryContext(context, sql, params);
    return result.rows.map((row: Record<string, unknown>) => this.mapRow(row));
  }

  /**
   * Map a database row to a ProceduralMemoryRecord
   */
  private mapRow(row: Record<string, unknown>): ProceduralMemoryRecord {
    return {
      id: row.id as string,
      triggerDescription: row.trigger_description as string,
      steps: row.steps as string[],
      toolsUsed: row.tools_used as string[],
      outcome: row.outcome as 'success' | 'partial' | 'failure',
      durationMs: row.duration_ms as number | undefined,
      usageCount: row.usage_count as number,
      successRate: row.success_rate as number,
      feedbackScore: row.feedback_score as number | null,
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}

// Singleton export
export const proceduralMemory = new ProceduralMemory();
