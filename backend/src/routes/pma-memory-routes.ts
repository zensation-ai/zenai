/**
 * PMA Memory API Routes
 *
 * Endpoints for neuromodulators, reconsolidation, memory copies,
 * rediscoveries, and semantic clusters.
 *
 * @module routes/pma-memory-routes
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { apiKeyAuth } from '../middleware/auth';
import { logger } from '../utils/logger';
import { queryContext } from '../utils/database-context';
import type { AIContext } from '../types/context';

const router = Router();

// Sprint 1.5 Item 4 — blanket auth for all PMA memory routes.
router.use(apiKeyAuth);

// ─── Neuromodulators ────────────────────────────────────────────────────────

/** GET /api/:context/memory/neuromodulators — Current neuromodulator levels */
router.get('/:context/memory/neuromodulators', asyncHandler(async (req, res) => {
  const context = req.params.context as AIContext;
  try {
    const result = await queryContext(context,
      `SELECT dopamine, norepinephrine, serotonin, acetylcholine, updated_at
       FROM neuromodulator_state WHERE user_id = $1`,
      [req.user?.id ?? 'anonymous']);
    const row = result.rows[0];
    const state = row ? {
      dopamine: row.dopamine,
      norepinephrine: row.norepinephrine,
      serotonin: row.serotonin,
      acetylcholine: row.acetylcholine,
    } : {
      dopamine: 0.5,
      norepinephrine: 0.5,
      serotonin: 0.5,
      acetylcholine: 0.5,
    };
    res.json({ success: true, data: state });
  } catch (error) {
    logger.error('Failed to load neuromodulator state', error instanceof Error ? error : new Error(String(error)));
    res.json({
      success: true,
      data: {
        dopamine: 0.5,
        norepinephrine: 0.5,
        serotonin: 0.5,
        acetylcholine: 0.5,
      },
    });
  }
}));

/** GET /api/:context/memory/neuromodulators/history — 7-day tonic history */
router.get('/:context/memory/neuromodulators/history', asyncHandler(async (req, res) => {
  const context = req.params.context as AIContext;
  try {
    const result = await queryContext(context,
      `SELECT dopamine, norepinephrine, serotonin, acetylcholine, updated_at
       FROM neuromodulator_state WHERE user_id = $1
       AND updated_at > NOW() - INTERVAL '7 days' ORDER BY updated_at DESC`,
      [req.user?.id ?? 'anonymous']);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Failed to load neuromodulator history', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: true, data: [] });
  }
}));

// ─── Reconsolidation ────────────────────────────────────────────────────────

/** GET /api/:context/memory/reconsolidation/active — Currently labile memories */
router.get('/:context/memory/reconsolidation/active', asyncHandler(async (_req, res) => {
  // Lability windows are tracked in-memory by NeuromodulatorEngine.
  // No persistent table for active windows; return empty placeholder.
  res.json({ success: true, data: [] });
}));

/** GET /api/:context/memory/reconsolidation/history — Recent reconsolidation events */
router.get('/:context/memory/reconsolidation/history', asyncHandler(async (req, res) => {
  const context = req.params.context as AIContext;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  try {
    const result = await queryContext(context,
      `SELECT id, memory_id, prediction_error, update_mode, context, session_id,
       rolled_back, created_at FROM reconsolidation_events
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.user?.id ?? 'anonymous', limit]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Failed to load reconsolidation history', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: true, data: [] });
  }
}));

/** POST /api/:context/memory/reconsolidation/:eventId/rollback — Restore pre-update state */
router.post('/:context/memory/reconsolidation/:eventId/rollback', asyncHandler(async (req, res) => {
  const context = req.params.context as AIContext;
  const { eventId } = req.params;
  try {
    const result = await queryContext(context,
      `UPDATE reconsolidation_events SET rolled_back = true, rolled_back_at = NOW()
       WHERE id = $1 AND user_id = $2 AND NOT rolled_back RETURNING id`,
      [eventId, req.user?.id ?? 'anonymous']);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Event not found or already rolled back' });
      return;
    }
    res.json({ success: true, data: { eventId, rolledBack: true } });
  } catch (error) {
    logger.error('Failed to rollback reconsolidation event', error instanceof Error ? error : new Error(String(error)));
    res.status(500).json({ success: false, error: 'Failed to rollback event' });
  }
}));

// ─── PMA Health (Triple-Copy Strengths) ─────────────────────────────────────

/** GET /api/:context/memory/pma-health — Triple-copy strengths for recent memories */
router.get('/:context/memory/pma-health', asyncHandler(async (req, res) => {
  const context = req.params.context as AIContext;
  const userId = req.user?.id ?? 'anonymous';
  try {
    // Get recent memory events with their copies (fast/medium/deep)
    const result = await queryContext(context,
      `SELECT mc.memory_event_id, mc.copy_type, mc.strength, mc.created_at, mc.storage_ref,
              st.rescued_at
       FROM memory_copies mc
       LEFT JOIN stc_tags st ON st.memory_id = mc.memory_event_id AND st.rescued = true
       WHERE mc.user_id = $1 AND mc.context = $2
       ORDER BY mc.created_at DESC
       LIMIT 60`,
      [userId, context]);

    // Group by memory_event_id
    const grouped = new Map<string, {
      id: string;
      content: string;
      fastStrength: number;
      mediumStrength: number;
      deepStrength: number;
      lastRescue?: string;
      createdAt: Date;
    }>();

    for (const row of result.rows) {
      const eventId = row.memory_event_id;
      if (!grouped.has(eventId)) {
        grouped.set(eventId, {
          id: eventId,
          content: row.storage_ref || '',
          fastStrength: 0,
          mediumStrength: 0,
          deepStrength: 0,
          lastRescue: row.rescued_at ? new Date(row.rescued_at).toISOString() : undefined,
          createdAt: row.created_at,
        });
      }

      const entry = grouped.get(eventId)!;
      // Compute current strength with decay
      const { TripleCopyMemory } = await import('../services/memory/triple-copy-memory');
      const tc = new TripleCopyMemory();
      const currentStrength = tc.computeStrength(
        row.copy_type,
        new Date(row.created_at),
        row.strength,
      );

      if (row.copy_type === 'fast') entry.fastStrength = currentStrength;
      else if (row.copy_type === 'medium') entry.mediumStrength = currentStrength;
      else if (row.copy_type === 'deep') entry.deepStrength = currentStrength;

      // Use storage_ref as content if available
      if (row.storage_ref && row.storage_ref.length > entry.content.length) {
        entry.content = row.storage_ref;
      }
      if (row.rescued_at && !entry.lastRescue) {
        entry.lastRescue = new Date(row.rescued_at).toISOString();
      }
    }

    const entries = Array.from(grouped.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
      .map(({ createdAt: _createdAt, ...rest }) => rest);

    res.json({ success: true, data: entries });
  } catch (error) {
    logger.error('Failed to load PMA health data', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: true, data: [] });
  }
}));

// ─── Memory Copies ──────────────────────────────────────────────────────────

/** GET /api/:context/memory/copies/:eventId — All copies of a memory event */
router.get('/:context/memory/copies/:eventId', asyncHandler(async (req, res) => {
  const context = req.params.context as AIContext;
  try {
    const result = await queryContext(context,
      `SELECT id, memory_event_id, copy_type, storage_ref, strength, created_at, last_accessed
       FROM memory_copies WHERE memory_event_id = $1 AND user_id = $2`,
      [req.params.eventId, req.user?.id ?? 'anonymous']);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Failed to load memory copies', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: true, data: [] });
  }
}));

// ─── Rediscoveries ──────────────────────────────────────────────────────────

/** GET /api/:context/memory/rediscoveries — Sudden recall events */
router.get('/:context/memory/rediscoveries', asyncHandler(async (req, res) => {
  // Sudden recall tracking comes from TripleCopyMemory retrieve().
  // Placeholder until event logging is wired up.
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  res.json({ success: true, data: [], limit });
}));

// ─── Clusters ───────────────────────────────────────────────────────────────

/** GET /api/:context/memory/clusters — List semantic clusters */
router.get('/:context/memory/clusters', asyncHandler(async (req, res) => {
  const context = req.params.context as AIContext;
  try {
    const result = await queryContext(context,
      `SELECT id, member_count, avg_importance, last_accessed, label
       FROM memory_clusters WHERE user_id = $1 AND context = $2
       ORDER BY last_accessed DESC LIMIT 20`,
      [req.user?.id ?? 'anonymous', context]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Failed to load memory clusters', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: true, data: [] });
  }
}));

/** GET /api/:context/memory/clusters/:id/members — Cluster members */
router.get('/:context/memory/clusters/:id/members', asyncHandler(async (req, res) => {
  const context = req.params.context as AIContext;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  try {
    const result = await queryContext(context,
      `SELECT memory_id, similarity_to_centroid, added_at
       FROM memory_cluster_members WHERE cluster_id = $1
       ORDER BY similarity_to_centroid DESC LIMIT $2`,
      [req.params.id, limit]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Failed to load cluster members', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: true, data: [] });
  }
}));

export default router;
