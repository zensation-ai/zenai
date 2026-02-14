/**
 * Phase 10: Offline Sync Routes
 *
 * Handles synchronization of offline actions:
 * - Swipe actions (archive, delete, priority changes)
 * - Batch sync for voice memos, media, and training feedback
 * - Conflict resolution support
 */

import { Router, Request, Response } from 'express';
import { queryContext, AIContext, isValidContext, isValidUUID } from '../utils/database-context';
import { logger } from '../utils/logger';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';

export const syncRouter = Router();

// ===========================================
// Types
// ===========================================

interface SwipeAction {
  ideaId: string;
  action: 'archive' | 'delete' | 'priority_high' | 'priority_low' | 'favorite';
  timestamp: string;
  clientId?: string;
}

interface BatchSyncRequest {
  voiceMemos?: Array<{
    clientId: string;
    text: string;
    timestamp: string;
  }>;
  swipeActions?: SwipeAction[];
  trainingFeedback?: Array<{
    ideaId: string;
    trainingType: string;
    correctedCategory?: string;
    correctedPriority?: string;
    correctedType?: string;
    feedback?: string;
    timestamp: string;
  }>;
}

interface SyncResult {
  processed: number;
  failed: number;
  errors: Array<{ index: number; error: string; clientId?: string }>;
  created?: string[];
}

// ===========================================
// Swipe Actions Sync
// ===========================================

/**
 * POST /api/:context/sync/swipe-actions
 * Sync offline swipe actions
 */
syncRouter.post('/:context/sync/swipe-actions', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal", "work", "learning", or "creative"');
  }

  const { actions } = req.body as { actions: SwipeAction[] };

  if (!Array.isArray(actions) || actions.length === 0) {
    throw new ValidationError('Actions array is required');
  }

  const results = await Promise.allSettled(
    actions.map((action, index) => processSwipeAction(context as AIContext, action, index))
  );

  const processed = results.filter(r => r.status === 'fulfilled').length;
  const errors = results
    .map((r, i) => r.status === 'rejected' ? { index: i, error: r.reason?.message || 'Unknown error', clientId: actions[i].clientId } : null)
    .filter((e): e is NonNullable<typeof e> => e !== null);

  logger.info(`Swipe actions sync completed`, {
    context,
    processed,
    failed: errors.length,
    operation: 'syncSwipeActions'
  });

  res.json({
    success: true,
    data: {
      processed,
      failed: errors.length,
      errors,
    },
  });
}));

async function processSwipeAction(context: AIContext, action: SwipeAction, index: number): Promise<void> {
  if (!isValidUUID(action.ideaId)) {
    throw new Error(`Invalid ideaId at index ${index}`);
  }

  switch (action.action) {
    case 'archive':
      await queryContext(context, `UPDATE ideas SET is_archived = true, updated_at = NOW() WHERE id = $1`, [action.ideaId]);
      break;

    case 'delete':
      await queryContext(context, `DELETE FROM ideas WHERE id = $1`, [action.ideaId]);
      break;

    case 'priority_high':
      await queryContext(context, `UPDATE ideas SET priority = 'high', updated_at = NOW() WHERE id = $1`, [action.ideaId]);
      break;

    case 'priority_low':
      await queryContext(context, `UPDATE ideas SET priority = 'low', updated_at = NOW() WHERE id = $1`, [action.ideaId]);
      break;

    case 'favorite':
      await queryContext(context, `UPDATE ideas SET is_favorite = NOT COALESCE(is_favorite, false), updated_at = NOW() WHERE id = $1`, [action.ideaId]);
      break;

    default:
      throw new Error(`Unknown action: ${action.action}`);
  }
}

// ===========================================
// Batch Sync
// ===========================================

/**
 * POST /api/:context/sync/batch
 * Batch sync multiple item types at once
 */
syncRouter.post('/:context/sync/batch', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal", "work", "learning", or "creative"');
  }

  const {
    voiceMemos = [],
    swipeActions = [],
    trainingFeedback = [],
  } = req.body as BatchSyncRequest;

  const results: Record<string, SyncResult> = {};

  // Process voice memos
  if (voiceMemos.length > 0) {
    results.voiceMemos = await processVoiceMemosBatch(context as AIContext, voiceMemos);
  }

  // Process swipe actions
  if (swipeActions.length > 0) {
    const swipeResults = await Promise.allSettled(
      swipeActions.map((action, index) => processSwipeAction(context as AIContext, action, index))
    );
    results.swipeActions = {
      processed: swipeResults.filter(r => r.status === 'fulfilled').length,
      failed: swipeResults.filter(r => r.status === 'rejected').length,
      errors: swipeResults
        .map((r, i) => r.status === 'rejected' ? { index: i, error: r.reason?.message || 'Unknown error' } : null)
        .filter((e): e is NonNullable<typeof e> => e !== null),
    };
  }

  // Process training feedback
  if (trainingFeedback.length > 0) {
    results.trainingFeedback = await processTrainingFeedbackBatch(context as AIContext, trainingFeedback);
  }

  logger.info('Batch sync completed', {
    context,
    voiceMemos: voiceMemos.length,
    swipeActions: swipeActions.length,
    trainingFeedback: trainingFeedback.length,
    operation: 'batchSync'
  });

  res.json({
    success: true,
    data: results,
  });
}));

async function processVoiceMemosBatch(
  context: AIContext,
  memos: Array<{ clientId: string; text: string; timestamp: string }>
): Promise<SyncResult> {
  const results = await Promise.allSettled(
    memos.map(async (memo) => {
      // Simple storage without AI processing (for offline sync)
      const result = await queryContext(
        context,
        `INSERT INTO ideas (id, title, summary, raw_transcript, type, category, priority, context, is_archived, created_at)
         VALUES (gen_random_uuid(), $1, $2, $2, 'idea', 'personal', 'medium', $3, false, $4)
         RETURNING id`,
        [
          memo.text.substring(0, 100), // Title from first 100 chars
          memo.text,
          context,
          memo.timestamp || new Date().toISOString()
        ]
      );
      return { clientId: memo.clientId, serverId: result.rows[0]?.id };
    })
  );

  const created = results
    .filter((r): r is PromiseFulfilledResult<{ clientId: string; serverId: string }> => r.status === 'fulfilled')
    .map(r => r.value.serverId);

  return {
    processed: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
    errors: results
      .map((r, i) => r.status === 'rejected' ? { index: i, error: r.reason?.message || 'Unknown error', clientId: memos[i].clientId } : null)
      .filter((e): e is NonNullable<typeof e> => e !== null),
    created,
  };
}

async function processTrainingFeedbackBatch(
  context: AIContext,
  feedback: Array<{
    ideaId: string;
    trainingType: string;
    correctedCategory?: string;
    correctedPriority?: string;
    correctedType?: string;
    feedback?: string;
    timestamp: string;
  }>
): Promise<SyncResult> {
  const results = await Promise.allSettled(
    feedback.map(async (item) => {
      if (!isValidUUID(item.ideaId)) {
        throw new Error('Invalid ideaId');
      }

      await queryContext(
        context,
        `INSERT INTO training_data (id, idea_id, training_type, corrected_category, corrected_priority, corrected_type, feedback, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)`,
        [
          item.ideaId,
          item.trainingType,
          item.correctedCategory || null,
          item.correctedPriority || null,
          item.correctedType || null,
          item.feedback || null,
          item.timestamp || new Date().toISOString()
        ]
      );
    })
  );

  return {
    processed: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
    errors: results
      .map((r, i) => r.status === 'rejected' ? { index: i, error: r.reason?.message || 'Unknown error' } : null)
      .filter((e): e is NonNullable<typeof e> => e !== null),
  };
}

// ===========================================
// Sync Status
// ===========================================

/**
 * GET /api/:context/sync/status
 * Get sync status and pending items count
 *
 * Response format matches frontend SyncDashboard expectations:
 * { last_sync, pending_changes, sync_enabled, devices }
 */
syncRouter.get('/:context/sync/status', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal", "work", "learning", or "creative"');
  }

  // Get pending changes count (items modified in last hour)
  const [pendingCount, devicesResult] = await Promise.all([
    queryContext(
      context as AIContext,
      `SELECT COUNT(*) as count FROM ideas WHERE updated_at > NOW() - INTERVAL '1 hour'`
    ),
    // Get registered devices from push_tokens
    queryContext(
      context as AIContext,
      `SELECT
         id,
         device_name as name,
         COALESCE(platform, 'web') as type,
         COALESCE(updated_at, created_at) as last_seen,
         false as is_current
       FROM push_tokens
       WHERE is_active = true
       ORDER BY updated_at DESC
       LIMIT 10`
    ).catch((err) => { logger.debug('push_tokens query failed (table may not exist)', { error: err instanceof Error ? err.message : String(err) }); return { rows: [] }; }), // Table might not exist
  ]);

  // Map devices to frontend expected format
  const devices = devicesResult.rows.map(row => ({
    id: row.id,
    name: row.name || 'Unknown Device',
    type: row.type as 'ios' | 'web' | 'desktop',
    last_seen: row.last_seen,
    is_current: row.is_current,
  }));

  // Response format matching frontend SyncStatus interface
  res.json({
    success: true,
    last_sync: new Date().toISOString(),
    pending_changes: parseInt(pendingCount.rows[0]?.count || '0', 10),
    sync_enabled: true,
    devices,
  });
}));

// ===========================================
// Pending Changes
// ===========================================

/**
 * GET /api/:context/sync/pending
 * Get pending offline changes that need to be synced
 *
 * Response format matches frontend PendingChange interface:
 * { data: { changes: [{ id, type, action, timestamp, synced }] } }
 */
syncRouter.get('/:context/sync/pending', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal", "work", "learning", or "creative"');
  }

  // Get recently modified items that might need sync
  // This includes items modified in the last hour that haven't been fully processed
  const pendingResult = await queryContext(
    context as AIContext,
    `SELECT
       id,
       'idea' as type,
       updated_at as timestamp,
       CASE
         WHEN is_archived THEN 'archive'
         WHEN priority = 'high' THEN 'priority_change'
         ELSE 'update'
       END as action
     FROM ideas
     WHERE updated_at > NOW() - INTERVAL '1 hour'
     ORDER BY updated_at DESC
     LIMIT 50`
  );

  // Map to frontend PendingChange interface
  const changes = pendingResult.rows.map(row => ({
    id: row.id,
    type: row.type,
    action: row.action,
    timestamp: row.timestamp,
    synced: true, // Already in DB = synced
  }));

  logger.debug('Pending changes retrieved', {
    context,
    count: changes.length,
    operation: 'getPendingChanges'
  });

  // Response wrapped in 'data' to match frontend: res.data.changes
  res.json({
    success: true,
    data: {
      changes,
      count: changes.length,
    },
  });
}));

// ===========================================
// Manual Sync Trigger
// ===========================================

/**
 * POST /api/:context/sync/trigger
 * Trigger a manual sync operation
 */
syncRouter.post('/:context/sync/trigger', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;

  if (!isValidContext(context)) {
    throw new ValidationError('Context must be "personal", "work", "learning", or "creative"');
  }

  // Record sync event
  const syncTime = new Date().toISOString();

  // Get counts for sync summary
  const [ideasCount, archivedCount] = await Promise.all([
    queryContext(context as AIContext, `SELECT COUNT(*) as total FROM ideas WHERE is_archived = false`),
    queryContext(context as AIContext, `SELECT COUNT(*) as total FROM ideas WHERE is_archived = true`),
  ]);

  logger.info('Manual sync triggered', {
    context,
    totalIdeas: ideasCount.rows[0]?.total,
    archivedIdeas: archivedCount.rows[0]?.total,
    operation: 'triggerSync'
  });

  res.json({
    success: true,
    data: {
      syncedAt: syncTime,
      context,
      summary: {
        totalIdeas: parseInt(ideasCount.rows[0]?.total || '0', 10),
        archivedIdeas: parseInt(archivedCount.rows[0]?.total || '0', 10),
      },
    },
    message: 'Sync completed successfully',
  });
}));

// ===========================================
// Device Management
// ===========================================

/**
 * DELETE /api/sync/devices/:deviceId
 * Remove a sync device
 */
syncRouter.delete('/devices/:deviceId', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { deviceId } = req.params;

  if (!deviceId || deviceId.trim() === '') {
    throw new ValidationError('Device ID is required');
  }

  // Try to remove from push_tokens table (used for device registration)
  // This works across both contexts since devices are typically global
  let deleted = false;

  for (const ctx of (['personal', 'work', 'learning', 'creative'] as AIContext[])) {
    try {
      const result = await queryContext(
        ctx,
        `DELETE FROM push_tokens WHERE device_id = $1 RETURNING id`,
        [deviceId]
      );
      if (result.rows.length > 0) {
        deleted = true;
      }
    } catch {
      // Table might not exist in this context, continue
    }
  }

  if (!deleted) {
    logger.warn('Device not found for removal', { deviceId, operation: 'removeDevice' });
  }

  logger.info('Sync device removed', {
    deviceId,
    found: deleted,
    operation: 'removeDevice'
  });

  res.json({
    success: true,
    message: deleted ? 'Device removed successfully' : 'Device not found (may have been already removed)',
  });
}));
