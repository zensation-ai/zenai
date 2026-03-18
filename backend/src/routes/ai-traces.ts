/**
 * Phase 73: AI Observability Dashboard Routes
 *
 * Endpoints for querying AI traces, spans, and aggregated stats.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { queryPublic } from '../utils/database-context';
import { getUserId } from '../utils/user-context';
import { escapeLike } from '../utils/sql-helpers';

export const aiTracesRouter = Router();

// ===========================================
// GET /api/observability/ai-traces/stats
// Token/cost aggregates per day and model
// NOTE: Must be before /:id to avoid route conflict
// ===========================================

aiTracesRouter.get(
  '/ai-traces/stats',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const days = Math.min(parseInt(req.query.days as string) || 7, 90);
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Daily aggregates (scoped to user)
    const dailyResult = await queryPublic(
      `SELECT
        DATE(start_time) AS day,
        COUNT(*) AS trace_count,
        SUM(total_tokens) AS total_tokens,
        SUM(total_cost) AS total_cost,
        AVG(EXTRACT(EPOCH FROM (end_time - start_time)) * 1000)::INTEGER AS avg_duration_ms
      FROM ai_traces
      WHERE start_time >= $1 AND end_time IS NOT NULL AND user_id = $2
      GROUP BY DATE(start_time)
      ORDER BY day DESC`,
      [since.toISOString(), userId],
    );

    // Per-model aggregates from generation spans (scoped via trace user_id)
    const modelResult = await queryPublic(
      `SELECT
        COALESCE(s.metadata->>'model', 'unknown') AS model,
        COUNT(*) AS generation_count,
        SUM(s.input_tokens) AS total_input_tokens,
        SUM(s.output_tokens) AS total_output_tokens,
        SUM(s.cost) AS total_cost
      FROM ai_spans s
      JOIN ai_traces t ON s.trace_id = t.id
      WHERE s.type = 'generation' AND s.start_time >= $1 AND t.user_id = $2
      GROUP BY COALESCE(s.metadata->>'model', 'unknown')
      ORDER BY total_cost DESC`,
      [since.toISOString(), userId],
    );

    // Per-type span breakdown (scoped via trace user_id)
    const typeResult = await queryPublic(
      `SELECT
        s.type,
        COUNT(*) AS span_count,
        AVG(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) * 1000)::INTEGER AS avg_duration_ms
      FROM ai_spans s
      JOIN ai_traces t ON s.trace_id = t.id
      WHERE s.start_time >= $1 AND s.end_time IS NOT NULL AND t.user_id = $2
      GROUP BY s.type
      ORDER BY span_count DESC`,
      [since.toISOString(), userId],
    );

    res.json({
      success: true,
      data: {
        days,
        daily: dailyResult.rows,
        byModel: modelResult.rows,
        bySpanType: typeResult.rows,
      },
    });
  }),
);

// ===========================================
// GET /api/observability/ai-traces
// List recent traces (with optional filters)
// ===========================================

aiTracesRouter.get(
  '/ai-traces',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const authUserId = getUserId(req);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const name = req.query.name as string | undefined;

    // Always scope to authenticated user
    const conditions: string[] = [`user_id = $1`];
    const params: (string | number)[] = [authUserId];
    let paramIdx = 2;

    if (name) {
      conditions.push(`name ILIKE $${paramIdx++}`);
      params.push(`%${escapeLike(name)}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await queryPublic(
      `SELECT COUNT(*) AS total FROM ai_traces ${where}`,
      params,
    );

    const result = await queryPublic(
      `SELECT id, session_id, user_id, name, start_time, end_time,
              total_tokens, total_cost, metadata,
              (SELECT COUNT(*) FROM ai_spans WHERE trace_id = ai_traces.id) AS span_count
       FROM ai_traces ${where}
       ORDER BY start_time DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset],
    );

    res.json({
      success: true,
      data: {
        traces: result.rows,
        total: parseInt((countResult.rows[0] as { total: string }).total),
        limit,
        offset,
      },
    });
  }),
);

// ===========================================
// GET /api/observability/ai-traces/:id
// Single trace with all spans
// ===========================================

aiTracesRouter.get(
  '/ai-traces/:id',
  apiKeyAuth,
  requireScope('read'),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const { id } = req.params;

    const traceResult = await queryPublic(
      `SELECT id, session_id, user_id, name, start_time, end_time,
              total_tokens, total_cost, metadata
       FROM ai_traces WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );

    if (traceResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Trace not found' });
      return;
    }

    const spansResult = await queryPublic(
      `SELECT id, trace_id, parent_span_id, name, type, start_time, end_time,
              input_tokens, output_tokens, cost, metadata, status
       FROM ai_spans WHERE trace_id = $1 ORDER BY start_time ASC`,
      [id],
    );

    res.json({
      success: true,
      data: {
        trace: traceResult.rows[0],
        spans: spansResult.rows,
      },
    });
  }),
);
