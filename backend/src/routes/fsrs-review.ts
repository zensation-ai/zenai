/**
 * FSRS Spaced Repetition Review API Routes (Phase 141)
 *
 * Endpoints for the review queue, grading reviews, and FSRS statistics.
 *
 * @module routes/fsrs-review
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { queryContext } from '../utils/database-context';
import type { AIContext } from '../types/context';
import { getRetrievability, updateAfterRecall, updateAfterForgot } from '../services/memory/fsrs-scheduler';
import type { FSRSState } from '../services/memory/fsrs-scheduler';

const router = Router();

// ─── Review Queue ────────────────────────────────────────────────────────────

/** GET /api/:context/memory/review-queue — Facts due for spaced repetition review */
router.get('/:context/memory/review-queue', asyncHandler(async (req, res) => {
  const { context } = req.params;
  try {
    const result = await queryContext(
      context as AIContext,
      `SELECT id, content, domain, confidence, fsrs_difficulty, fsrs_stability, fsrs_next_review
       FROM learned_facts
       WHERE fsrs_next_review IS NOT NULL AND fsrs_next_review <= NOW()
       ORDER BY fsrs_next_review ASC LIMIT 10`,
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Failed to load review queue', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to load review queue' });
  }
}));

// ─── Review Fact ─────────────────────────────────────────────────────────────

/** POST /api/:context/memory/review/:factId — Grade a fact review (1-5) */
router.post('/:context/memory/review/:factId', asyncHandler(async (req, res) => {
  const { context, factId } = req.params;
  const { grade } = req.body;

  if (!grade || grade < 1 || grade > 5) {
    res.status(400).json({ success: false, error: 'grade must be between 1 and 5' });
    return;
  }

  try {
    // Load current FSRS state
    const factResult = await queryContext(
      context as AIContext,
      'SELECT fsrs_difficulty, fsrs_stability, fsrs_next_review FROM learned_facts WHERE id = $1',
      [factId],
    );

    if (!factResult.rows.length) {
      res.status(404).json({ success: false, error: 'Fact not found' });
      return;
    }

    const row = factResult.rows[0];
    const currentState: FSRSState = {
      difficulty: parseFloat(row.fsrs_difficulty) || 5.0,
      stability: parseFloat(row.fsrs_stability) || 1.0,
      nextReview: row.fsrs_next_review ? new Date(row.fsrs_next_review) : new Date(),
    };

    // Compute current retrievability for FSRS update
    const retrievability = getRetrievability(currentState);

    // Apply FSRS update
    const newState = grade >= 3
      ? updateAfterRecall(currentState, grade, retrievability)
      : updateAfterForgot(currentState, retrievability);

    // Persist updated state
    await queryContext(
      context as AIContext,
      `UPDATE learned_facts
       SET fsrs_difficulty = $1, fsrs_stability = $2, fsrs_next_review = $3, updated_at = NOW()
       WHERE id = $4`,
      [newState.difficulty, newState.stability, newState.nextReview.toISOString(), factId],
    );

    res.json({
      success: true,
      data: {
        factId,
        grade,
        newDifficulty: Math.round(newState.difficulty * 100) / 100,
        newStability: Math.round(newState.stability * 100) / 100,
        nextReview: newState.nextReview.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to process review', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to process review' });
  }
}));

// ─── FSRS Stats ──────────────────────────────────────────────────────────────

/** GET /api/:context/memory/fsrs/stats — FSRS statistics */
router.get('/:context/memory/fsrs/stats', asyncHandler(async (req, res) => {
  const { context } = req.params;
  try {
    const result = await queryContext(
      context as AIContext,
      `SELECT
        COUNT(*) FILTER (WHERE fsrs_stability IS NOT NULL) as total_fsrs,
        COUNT(*) FILTER (WHERE fsrs_next_review IS NOT NULL AND fsrs_next_review <= NOW()) as due_today,
        AVG(fsrs_difficulty) FILTER (WHERE fsrs_difficulty IS NOT NULL) as avg_difficulty,
        AVG(fsrs_stability) FILTER (WHERE fsrs_stability IS NOT NULL) as avg_stability
       FROM learned_facts`,
    );

    const row = result.rows[0] || {};
    res.json({
      success: true,
      data: {
        totalWithFSRS: parseInt(row.total_fsrs ?? '0'),
        dueToday: parseInt(row.due_today ?? '0'),
        avgDifficulty: Math.round(parseFloat(row.avg_difficulty ?? '0') * 100) / 100,
        avgStability: Math.round(parseFloat(row.avg_stability ?? '0') * 100) / 100,
      },
    });
  } catch (error) {
    logger.error('Failed to load FSRS stats', error instanceof Error ? error : new Error(String(error)));
    res.json({ success: false, error: 'Failed to load FSRS stats' });
  }
}));

export default router;
