/**
 * Procedural Memory Service (HiMeS Extension - Layer 5)
 *
 * Stores learned workflows, skills, and routines as reusable procedures.
 * This is the "muscle memory" of the AI - automated sequences that don't
 * need to be re-derived from scratch each time.
 *
 * Inspired by Mem^p Framework (2025): Agents with Procedural Memory achieve
 * 20% fewer steps on average and significantly higher task success rates.
 *
 * Procedure types:
 * - workflow: Multi-step task sequences (e.g., "create idea from voice memo")
 * - tool_sequence: Frequently successful tool combinations
 * - response_template: Proven response patterns for recurring queries
 * - sop: Standard Operating Procedures (Enterprise)
 *
 * Lifecycle:
 * 1. After successful interactions, extract procedures from tool call sequences
 * 2. Store with success metrics and context
 * 3. During new interactions, match against stored procedures
 * 4. Suggest or auto-apply relevant procedures
 */

import { v4 as uuidv4 } from 'uuid';
import { AIContext, queryContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

export type ProcedureType = 'workflow' | 'tool_sequence' | 'response_template' | 'sop';

export interface Procedure {
  id: string;
  context: AIContext;
  type: ProcedureType;
  /** Human-readable name */
  name: string;
  /** Description of when to use this procedure */
  triggerDescription: string;
  /** The actual steps/content of the procedure */
  steps: ProcedureStep[];
  /** Success metrics */
  successCount: number;
  failureCount: number;
  /** Confidence in this procedure (0-1) */
  confidence: number;
  /** Tags for matching */
  tags: string[];
  /** When this was first learned */
  createdAt: Date;
  /** Last time this was used */
  lastUsed: Date;
  /** Source: extracted from interaction or manually defined */
  source: 'extracted' | 'manual';
}

export interface ProcedureStep {
  order: number;
  action: string;
  toolName?: string;
  description: string;
  /** Expected output pattern */
  expectedOutput?: string;
}

export interface ProcedureMatch {
  procedure: Procedure;
  relevance: number; // 0-1
  matchReason: string;
}

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Maximum procedures per context */
  MAX_PROCEDURES: 100,
  /** Minimum success rate to keep a procedure */
  MIN_SUCCESS_RATE: 0.3,
  /** Minimum uses before confidence stabilizes */
  MIN_USES_FOR_STABLE: 3,
  /** Maximum steps in a single procedure */
  MAX_STEPS: 10,
  /** Minimum word overlap for procedure matching */
  MIN_MATCH_OVERLAP: 0.3,
};

// ===========================================
// Procedural Memory Service
// ===========================================

class ProceduralMemoryService {
  /**
   * Extract a procedure from a successful tool call sequence.
   * Called after a chat session with tool use that got positive feedback.
   */
  async extractProcedure(
    context: AIContext,
    name: string,
    triggerDescription: string,
    toolCalls: Array<{ toolName: string; input: Record<string, unknown>; output: string }>,
    tags: string[] = []
  ): Promise<Procedure | null> {
    if (toolCalls.length === 0 || toolCalls.length > CONFIG.MAX_STEPS) {
      return null;
    }

    try {
      // Check if a similar procedure already exists
      const existing = await this.findSimilar(context, triggerDescription);
      if (existing) {
        // Boost existing procedure
        existing.successCount++;
        existing.lastUsed = new Date();
        existing.confidence = Math.min(1.0,
          existing.successCount / (existing.successCount + existing.failureCount)
        );
        await this.persist(context, existing);
        return existing;
      }

      const steps: ProcedureStep[] = toolCalls.map((call, i) => ({
        order: i + 1,
        action: call.toolName,
        toolName: call.toolName,
        description: `${call.toolName}: ${JSON.stringify(call.input).substring(0, 100)}`,
        expectedOutput: call.output.substring(0, 200),
      }));

      const procedure: Procedure = {
        id: uuidv4(),
        context,
        type: 'tool_sequence',
        name,
        triggerDescription,
        steps,
        successCount: 1,
        failureCount: 0,
        confidence: 0.5, // Start at 50%, grows with usage
        tags,
        createdAt: new Date(),
        lastUsed: new Date(),
        source: 'extracted',
      };

      await this.persist(context, procedure);

      logger.info('Procedure extracted', {
        context,
        name,
        steps: steps.length,
        tags,
      });

      return procedure;
    } catch (error) {
      logger.debug('Failed to extract procedure', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return null;
    }
  }

  /**
   * Find procedures relevant to a user query.
   * Returns sorted by relevance.
   */
  async findRelevant(
    context: AIContext,
    query: string,
    limit: number = 3
  ): Promise<ProcedureMatch[]> {
    try {
      const procedures = await this.getAll(context);
      if (procedures.length === 0) return [];

      const queryWords = new Set(
        query.toLowerCase().split(/\s+/).filter(w => w.length > 3)
      );

      const matches: ProcedureMatch[] = [];

      for (const proc of procedures) {
        // Match against trigger description and tags
        const triggerWords = new Set(
          proc.triggerDescription.toLowerCase().split(/\s+/).filter(w => w.length > 3)
        );

        let overlap = 0;
        for (const word of queryWords) {
          if (triggerWords.has(word)) overlap++;
          // Also check tags
          if (proc.tags.some(t => t.toLowerCase().includes(word))) overlap += 0.5;
        }

        const overlapRatio = overlap / Math.max(1, Math.min(queryWords.size, triggerWords.size));

        if (overlapRatio >= CONFIG.MIN_MATCH_OVERLAP) {
          matches.push({
            procedure: proc,
            relevance: overlapRatio * proc.confidence,
            matchReason: `${Math.round(overlapRatio * 100)}% Wort-Uebereinstimmung`,
          });
        }
      }

      return matches
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, limit);
    } catch (error) {
      logger.debug('Failed to find relevant procedures', { error });
      return [];
    }
  }

  /**
   * Record a procedure failure (used but didn't help)
   */
  async recordFailure(context: AIContext, procedureId: string): Promise<void> {
    try {
      await queryContext(
        context,
        `UPDATE procedural_memory
         SET failure_count = failure_count + 1,
             confidence = GREATEST(0.1,
               success_count::float / GREATEST(1, success_count + failure_count + 1)
             )
         WHERE id = $1`,
        [procedureId]
      );
    } catch (error) {
      logger.debug('Failed to record procedure failure', { procedureId, error });
    }
  }

  /**
   * Get all procedures for a context
   */
  async getAll(context: AIContext): Promise<Procedure[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT * FROM procedural_memory
         WHERE context = $1 AND confidence > $2
         ORDER BY confidence DESC, last_used DESC
         LIMIT $3`,
        [context, CONFIG.MIN_SUCCESS_RATE, CONFIG.MAX_PROCEDURES]
      );

      return result.rows.map(row => this.rowToProcedure(row));
    } catch (error) {
      // Table might not exist yet
      if (error instanceof Error && error.message.includes('does not exist')) {
        return [];
      }
      logger.debug('Failed to get procedures', { context, error });
      return [];
    }
  }

  /**
   * Find similar existing procedure
   */
  private async findSimilar(context: AIContext, triggerDescription: string): Promise<Procedure | null> {
    const all = await this.getAll(context);
    const triggerWords = new Set(
      triggerDescription.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    );

    for (const proc of all) {
      const existingWords = new Set(
        proc.triggerDescription.toLowerCase().split(/\s+/).filter(w => w.length > 3)
      );

      let overlap = 0;
      for (const word of triggerWords) {
        if (existingWords.has(word)) overlap++;
      }

      const ratio = overlap / Math.max(1, Math.min(triggerWords.size, existingWords.size));
      if (ratio >= 0.7) return proc;
    }

    return null;
  }

  /**
   * Persist procedure to database
   */
  private async persist(context: AIContext, proc: Procedure): Promise<void> {
    await queryContext(
      context,
      `INSERT INTO procedural_memory
       (id, context, type, name, trigger_description, steps, success_count,
        failure_count, confidence, tags, created_at, last_used, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET
         success_count = $7,
         failure_count = $8,
         confidence = $9,
         last_used = $12`,
      [
        proc.id, context, proc.type, proc.name,
        proc.triggerDescription, JSON.stringify(proc.steps),
        proc.successCount, proc.failureCount, proc.confidence,
        proc.tags, proc.createdAt, proc.lastUsed, proc.source,
      ]
    );
  }

  /**
   * Convert database row to Procedure
   */
  private rowToProcedure(row: Record<string, unknown>): Procedure {
    let steps: ProcedureStep[] = [];
    try {
      const stepsData = typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps;
      if (Array.isArray(stepsData)) {
        steps = stepsData as ProcedureStep[];
      }
    } catch {
      steps = [];
    }

    return {
      id: row.id as string,
      context: row.context as AIContext,
      type: row.type as ProcedureType,
      name: row.name as string,
      triggerDescription: row.trigger_description as string,
      steps,
      successCount: (row.success_count as number) || 0,
      failureCount: (row.failure_count as number) || 0,
      confidence: (row.confidence as number) || 0.5,
      tags: Array.isArray(row.tags) ? row.tags as string[] : [],
      createdAt: new Date(row.created_at as string),
      lastUsed: new Date(row.last_used as string),
      source: (row.source as 'extracted' | 'manual') || 'extracted',
    };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const proceduralMemory = new ProceduralMemoryService();
