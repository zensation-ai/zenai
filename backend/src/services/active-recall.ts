/**
 * Active Recall Learning Service
 *
 * Replaces passive review with active recall (challenge → verify → schedule).
 *
 * Research: Meta-analysis 2025 (N>3000, d=0.54): Active recall is significantly
 * more effective than re-reading. Cell Reports 2025: vmPFC activation only
 * during active reconstruction, not passive re-exposure.
 *
 * FSRS-inspired scheduling:
 * - Perfect recall → interval × 2.5
 * - Partial recall → interval × 1.3
 * - Failed recall → max(1, interval × 0.3)
 *
 * @module services/active-recall
 */

import { queryContext, AIContext } from '../utils/database-context';
import { generateEmbedding } from './ai';
import { cosineSimilarity } from '../utils/semantic-cache';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface RecallChallenge {
  taskId: string;
  title: string;
  context: string;
  tags: string[];
  createdAt: string;
  prompt: string;
}

export type RecallQuality = 'perfect' | 'partial' | 'failed';

export interface RecallResult {
  quality: RecallQuality;
  similarityScore: number;
  feedback: string;
  originalSummary: string;
  nextReviewDate: string;
  intervalDays: number;
  easeFactor: number;
}

export interface ReviewScheduleItem {
  taskId: string;
  title: string;
  summary: string;
  dueDate: string;
  overdueDays: number;
  intervalDays: number;
  easeFactor: number;
  reviewCount: number;
}

// ===========================================
// Constants
// ===========================================

const FSRS = {
  INITIAL_INTERVAL: 1,        // 1 day
  INITIAL_EASE: 2.5,
  MIN_EASE: 1.3,
  PERFECT_MULTIPLIER: 2.5,    // interval × 2.5 for perfect recall
  PARTIAL_MULTIPLIER: 1.3,    // interval × 1.3 for partial recall
  FAILED_MULTIPLIER: 0.3,     // interval × 0.3 for failed recall
  MIN_INTERVAL: 1,            // Never less than 1 day
  PERFECT_THRESHOLD: 0.8,     // Similarity >= 80% = perfect
  PARTIAL_THRESHOLD: 0.5,     // Similarity >= 50% = partial
};

// ===========================================
// Core Functions
// ===========================================

/**
 * Generate a recall challenge for a learning task.
 * Shows only title + tags, asks user to recall content.
 */
export async function generateChallenge(
  taskId: string,
  context: AIContext
): Promise<RecallChallenge | null> {
  try {
    const result = await queryContext(context, `
      SELECT
        t.id, t.title, t.description, t.tags, t.created_at,
        t.metadata
      FROM daily_learning_tasks t
      WHERE t.id = $1 AND t.context = $2
    `, [taskId, context]);

    if (result.rows.length === 0) {
      return null;
    }

    const task = result.rows[0];
    const tags = Array.isArray(task.tags) ? task.tags : [];

    return {
      taskId: task.id,
      title: task.title,
      context: context,
      tags,
      createdAt: task.created_at,
      prompt: `Was erinnerst du zu "${task.title}"? Beschreibe den Kerngedanken in deinen eigenen Worten.`,
    };
  } catch (error) {
    logger.warn('Failed to generate recall challenge', { taskId, error });
    return null;
  }
}

/**
 * Evaluate a user's recall attempt against the original content.
 * Uses embedding similarity for objective comparison.
 */
export async function evaluateRecall(
  taskId: string,
  context: AIContext,
  userRecall: string
): Promise<RecallResult | null> {
  try {
    // Get original task content
    const result = await queryContext(context, `
      SELECT
        t.id, t.title, t.description, t.summary,
        t.metadata
      FROM daily_learning_tasks t
      WHERE t.id = $1 AND t.context = $2
    `, [taskId, context]);

    if (result.rows.length === 0) {
      return null;
    }

    const task = result.rows[0];
    const originalContent = task.description || task.summary || task.title;
    const metadata = (task.metadata || {}) as Record<string, unknown>;

    // Calculate semantic similarity using embeddings
    let similarityScore = 0;
    try {
      const [recallEmbedding, originalEmbedding] = await Promise.all([
        generateEmbedding(userRecall),
        generateEmbedding(originalContent),
      ]);

      if (recallEmbedding && originalEmbedding) {
        similarityScore = cosineSimilarity(recallEmbedding, originalEmbedding);
      }
    } catch {
      // Fallback: simple word overlap
      similarityScore = calculateWordOverlap(userRecall, originalContent);
    }

    // Determine recall quality
    let quality: RecallQuality;
    if (similarityScore >= FSRS.PERFECT_THRESHOLD) {
      quality = 'perfect';
    } else if (similarityScore >= FSRS.PARTIAL_THRESHOLD) {
      quality = 'partial';
    } else {
      quality = 'failed';
    }

    // Generate feedback
    const feedback = generateFeedback(quality, similarityScore, userRecall, originalContent);

    // Calculate next review using FSRS
    const currentInterval = (metadata.interval_days as number) || FSRS.INITIAL_INTERVAL;
    const currentEase = (metadata.ease_factor as number) || FSRS.INITIAL_EASE;
    const { nextInterval, newEase } = calculateNextReview(quality, currentInterval, currentEase);

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + nextInterval);

    // Store recall result in task metadata
    const reviewCount = ((metadata.review_count as number) || 0) + 1;
    await queryContext(context, `
      UPDATE daily_learning_tasks
      SET metadata = COALESCE(metadata, '{}'::jsonb) ||
        $3::jsonb,
        updated_at = NOW()
      WHERE id = $1 AND context = $2
    `, [taskId, context, JSON.stringify({
      interval_days: nextInterval,
      ease_factor: newEase,
      next_review_date: nextReviewDate.toISOString(),
      review_count: reviewCount,
      last_recall_quality: quality,
      last_recall_score: Math.round(similarityScore * 100) / 100,
      last_review_date: new Date().toISOString(),
    })]);

    // Also log as a learning session
    await queryContext(context, `
      INSERT INTO learning_sessions (
        id, task_id, context, session_type, duration_minutes,
        understanding_level, notes, metadata, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, 'review', 0,
        $3, $4, $5, NOW()
      )
    `, [
      taskId,
      context,
      quality === 'perfect' ? 5 : quality === 'partial' ? 3 : 1,
      `Active Recall: ${quality} (${Math.round(similarityScore * 100)}%)`,
      JSON.stringify({
        type: 'active_recall',
        user_recall: userRecall.substring(0, 500),
        similarity_score: similarityScore,
        quality,
      }),
    ]);

    return {
      quality,
      similarityScore: Math.round(similarityScore * 100) / 100,
      feedback,
      originalSummary: originalContent.substring(0, 300),
      nextReviewDate: nextReviewDate.toISOString().split('T')[0],
      intervalDays: nextInterval,
      easeFactor: Math.round(newEase * 100) / 100,
    };
  } catch (error) {
    logger.warn('Failed to evaluate recall', { taskId, error });
    return null;
  }
}

/**
 * Get tasks due for review (next_review_date <= now).
 */
export async function getReviewSchedule(
  context: AIContext,
  limit: number = 10
): Promise<ReviewScheduleItem[]> {
  try {
    const result = await queryContext(context, `
      SELECT
        t.id, t.title, t.summary, t.metadata
      FROM daily_learning_tasks t
      WHERE t.context = $1
        AND t.status != 'completed'
        AND (t.metadata->>'next_review_date') IS NOT NULL
        AND (t.metadata->>'next_review_date')::timestamp <= NOW()
      ORDER BY (t.metadata->>'next_review_date')::timestamp ASC
      LIMIT $2
    `, [context, limit]);

    const now = new Date();

    return result.rows.map((row: Record<string, unknown>) => {
      const metadata = (row.metadata || {}) as Record<string, unknown>;
      const dueDate = new Date(metadata.next_review_date as string);
      const overdueDays = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

      return {
        taskId: row.id as string,
        title: row.title as string,
        summary: ((row.summary as string) || '').substring(0, 200),
        dueDate: dueDate.toISOString().split('T')[0],
        overdueDays,
        intervalDays: (metadata.interval_days as number) || 1,
        easeFactor: (metadata.ease_factor as number) || FSRS.INITIAL_EASE,
        reviewCount: (metadata.review_count as number) || 0,
      };
    });
  } catch (error) {
    logger.warn('Failed to get review schedule', { error });
    return [];
  }
}

// ===========================================
// FSRS Scheduling
// ===========================================

/**
 * Calculate next review interval using FSRS-inspired algorithm.
 */
export function calculateNextReview(
  quality: RecallQuality,
  currentInterval: number,
  currentEase: number
): { nextInterval: number; newEase: number } {
  let newEase = currentEase;
  let nextInterval: number;

  switch (quality) {
    case 'perfect':
      // Strong recall → extend interval significantly
      nextInterval = Math.round(currentInterval * FSRS.PERFECT_MULTIPLIER);
      newEase = Math.min(currentEase + 0.15, 3.0); // Ease increases slightly
      break;

    case 'partial':
      // Partial recall → modest interval increase
      nextInterval = Math.round(currentInterval * FSRS.PARTIAL_MULTIPLIER);
      // Ease stays the same
      break;

    case 'failed':
      // Failed recall → reset interval
      nextInterval = Math.max(
        FSRS.MIN_INTERVAL,
        Math.round(currentInterval * FSRS.FAILED_MULTIPLIER)
      );
      newEase = Math.max(FSRS.MIN_EASE, currentEase - 0.2); // Ease decreases
      break;
  }

  return {
    nextInterval: Math.max(FSRS.MIN_INTERVAL, nextInterval),
    newEase: Math.round(newEase * 100) / 100,
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * Simple word overlap score as embedding fallback.
 */
function calculateWordOverlap(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  if (words1.size === 0 || words2.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const word of words1) {
    if (words2.has(word)) {
      overlap++;
    }
  }

  return overlap / Math.max(words1.size, words2.size);
}

/**
 * Generate human-readable feedback based on recall quality.
 */
function generateFeedback(
  quality: RecallQuality,
  score: number,
  _userRecall: string,
  _original: string
): string {
  const percentage = Math.round(score * 100);

  switch (quality) {
    case 'perfect':
      return `Ausgezeichnet! Du hast ${percentage}% des Kerngedankens erfasst. Dein Verständnis ist sehr gut.`;
    case 'partial':
      return `Guter Ansatz! Du hast ${percentage}% erfasst. Schau dir die Details noch einmal an.`;
    case 'failed':
      return `Diesmal nicht ganz getroffen (${percentage}%). Lies den Originaltext und versuche es beim nächsten Review erneut.`;
  }
}
