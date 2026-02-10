/**
 * Draft Feedback & Analytics
 *
 * Enhanced feedback system with detailed tracking,
 * sentiment analysis, pattern effectiveness metrics,
 * and learning suggestions.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';

// ===========================================
// Types
// ===========================================

/**
 * Detailed feedback submission interface
 */
export interface DetailedFeedback {
  rating: number;                           // 1-5 star rating
  feedbackText?: string;                    // Free-text feedback
  contentReusedPercent?: number;            // 0-100%
  editsDescription?: string;                // What was edited
  editCategories?: EditCategory[];          // Categories of edits made
  wasHelpful?: boolean;                     // Quick helpful/not helpful
  wouldUseAgain?: boolean;                  // Would use draft feature again
  qualityAspects?: QualityAspects;          // Detailed quality ratings
  finalWordCount?: number;                  // Word count after editing
  sessionDurationMs?: number;               // Time spent with draft
  feedbackSource?: FeedbackSource;          // Where feedback came from
}

export type EditCategory = 'tone' | 'length' | 'content' | 'structure' | 'formatting' | 'accuracy';
export type FeedbackSource = 'manual' | 'prompt' | 'auto_detected' | 'copy_action';

export interface QualityAspects {
  accuracy?: number;      // 1-5: How accurate was the content
  tone?: number;          // 1-5: Was the tone appropriate
  completeness?: number;  // 1-5: How complete was the draft
  relevance?: number;     // 1-5: How relevant to the task
  structure?: number;     // 1-5: How well structured
}

/**
 * Feedback analytics data
 */
export interface FeedbackAnalytics {
  draftType: string;
  totalDrafts: number;
  totalFeedback: number;
  avgRating: number;
  avgContentReused: number;
  helpfulPercent: number;
  topIssues: string[];
  conversionRate: number;
  satisfactionScore: number;
}

/**
 * Pattern effectiveness data
 */
export interface PatternEffectiveness {
  patternId: string;
  patternText: string;
  draftType: string;
  isActive: boolean;
  timesTriggered: number;
  timesUsed: number;
  avgRating: number | null;
  qualityScore: number | null;
  successRate: number | null;
  performanceTier: 'excellent' | 'good' | 'average' | 'needs_improvement' | 'new';
  consecutiveLowRatings: number;
}

// Database row types
interface FeedbackAnalyticsRow {
  draft_type: string;
  total_drafts: string;
  total_feedback: string;
  avg_rating: string;
  avg_content_reused: string;
  helpful_percent: string;
  conversion_rate: string;
}

interface PatternEffectivenessRow {
  pattern_id: string;
  pattern_text: string;
  draft_type: string;
  is_active: boolean;
  times_triggered: string;
  times_used: string;
  avg_rating: string | null;
  quality_score: string | null;
  success_rate: string | null;
  performance_tier: 'excellent' | 'good' | 'average' | 'needs_improvement' | 'new';
  consecutive_low_ratings: string;
}

interface DraftsNeedingFeedbackRow {
  id: string;
  idea_id: string;
  idea_title: string;
  draft_type: string;
  status: string;
  word_count: number;
  created_at: string;
  viewed_at: string | null;
  used_at: string | null;
  copy_count: string;
}

interface FeedbackHistoryRow {
  id: string;
  rating: number;
  feedback_text: string | null;
  content_reused_percent: number | null;
  was_helpful: boolean | null;
  feedback_sentiment: string | null;
  created_at: string;
}

interface LearningSuggestionRow {
  id: string;
  draft_type: string;
  suggestion_type: string;
  suggestion_text: string;
  rationale: string | null;
  based_on_feedback_count: number;
  avg_rating_before: string | null;
  common_issues: string[] | null;
  priority: string;
  created_at: string;
}

interface PatternRow {
  id: string;
  consecutive_low_ratings: number;
  avg_rating: number | null;
  times_triggered: number;
  pattern_text?: string;
}

// ===========================================
// Feedback Submission
// ===========================================

/**
 * Submits detailed feedback for a draft with full tracking
 */
export async function submitDetailedFeedback(
  draftId: string,
  context: AIContext,
  feedback: DetailedFeedback
): Promise<{ success: boolean; feedbackId?: string; message?: string }> {
  const feedbackId = uuidv4();

  try {
    // 1. Get draft info for validation
    const draftResult = await queryContext(
      context,
      `SELECT id, word_count, draft_type, trigger_pattern FROM idea_drafts WHERE id = $1 AND context = $2`,
      [draftId, context]
    );

    if (draftResult.rows.length === 0) {
      return { success: false, message: 'Draft not found' };
    }

    const draft = draftResult.rows[0];

    // 2. Analyze feedback sentiment (simple rule-based for now)
    const sentiment = analyzeFeedbackSentiment(feedback);

    // 3. Identify improvement areas
    const improvementAreas = identifyImprovementAreas(feedback);

    // 4. Calculate quality score
    const qualityScore = calculateQualityScore(feedback);

    // 5. Insert into feedback history
    await queryContext(
      context,
      `INSERT INTO draft_feedback_history (
        id, draft_id, context, rating, feedback_text, content_reused_percent,
        edits_description, edit_categories, original_word_count, final_word_count,
        was_helpful, would_use_again, quality_aspects, feedback_sentiment,
        improvement_areas, feedback_source, session_duration_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        feedbackId,
        draftId,
        context,
        feedback.rating,
        feedback.feedbackText || null,
        feedback.contentReusedPercent ?? null,
        feedback.editsDescription || null,
        feedback.editCategories || null,
        draft.word_count,
        feedback.finalWordCount || null,
        feedback.wasHelpful ?? null,
        feedback.wouldUseAgain ?? null,
        feedback.qualityAspects ? JSON.stringify(feedback.qualityAspects) : null,
        sentiment,
        improvementAreas.length > 0 ? improvementAreas : null,
        feedback.feedbackSource || 'manual',
        feedback.sessionDurationMs || null,
      ]
    );

    // 6. Update the draft record
    await queryContext(
      context,
      `UPDATE idea_drafts
       SET user_rating = $3,
           user_feedback = $4,
           content_reused_percent = $5,
           status = CASE WHEN status = 'discarded' THEN status ELSE 'used' END,
           used_at = COALESCE(used_at, NOW()),
           feedback_count = COALESCE(feedback_count, 0) + 1,
           last_feedback_at = NOW(),
           feedback_sentiment = $6,
           quality_score = $7
       WHERE id = $1 AND context = $2`,
      [
        draftId,
        context,
        feedback.rating,
        feedback.feedbackText || null,
        feedback.contentReusedPercent ?? null,
        sentiment,
        qualityScore,
      ]
    );

    // 7. Update pattern metrics (trigger in DB handles most of this, but we add extra logic)
    await updatePatternFromFeedback(context, draft.draft_type, draft.trigger_pattern, feedback);

    logger.info('Detailed feedback submitted', {
      feedbackId,
      draftId,
      rating: feedback.rating,
      sentiment,
      qualityScore,
    });

    return { success: true, feedbackId };
  } catch (error) {
    logger.error('Failed to submit detailed feedback', error instanceof Error ? error : undefined, { draftId });
    return { success: false, message: 'Failed to submit feedback' };
  }
}

// ===========================================
// Sentiment & Quality Analysis
// ===========================================

/**
 * Analyzes feedback sentiment
 */
function analyzeFeedbackSentiment(feedback: DetailedFeedback): 'positive' | 'neutral' | 'negative' | 'mixed' {
  let positiveSignals = 0;
  let negativeSignals = 0;

  // Rating signals
  if (feedback.rating >= 4) {positiveSignals += 2;}
  else if (feedback.rating <= 2) {negativeSignals += 2;}

  // Helpful signal
  if (feedback.wasHelpful === true) {positiveSignals++;}
  else if (feedback.wasHelpful === false) {negativeSignals++;}

  // Would use again signal
  if (feedback.wouldUseAgain === true) {positiveSignals++;}
  else if (feedback.wouldUseAgain === false) {negativeSignals++;}

  // Content reuse signal
  if (feedback.contentReusedPercent !== undefined) {
    if (feedback.contentReusedPercent >= 70) {positiveSignals++;}
    else if (feedback.contentReusedPercent <= 30) {negativeSignals++;}
  }

  // Quality aspects average
  if (feedback.qualityAspects) {
    const aspects = Object.values(feedback.qualityAspects).filter(v => v !== undefined) as number[];
    if (aspects.length > 0) {
      const avg = aspects.reduce((a, b) => a + b, 0) / aspects.length;
      if (avg >= 4) {positiveSignals++;}
      else if (avg <= 2) {negativeSignals++;}
    }
  }

  // Determine overall sentiment
  if (positiveSignals > negativeSignals + 1) {return 'positive';}
  if (negativeSignals > positiveSignals + 1) {return 'negative';}
  if (positiveSignals > 0 && negativeSignals > 0) {return 'mixed';}
  return 'neutral';
}

/**
 * Identifies areas for improvement based on feedback
 */
function identifyImprovementAreas(feedback: DetailedFeedback): string[] {
  const areas: string[] = [];

  // From edit categories
  if (feedback.editCategories) {
    areas.push(...feedback.editCategories);
  }

  // From quality aspects
  if (feedback.qualityAspects) {
    if (feedback.qualityAspects.accuracy && feedback.qualityAspects.accuracy <= 2) {
      areas.push('accuracy');
    }
    if (feedback.qualityAspects.tone && feedback.qualityAspects.tone <= 2) {
      areas.push('tone');
    }
    if (feedback.qualityAspects.completeness && feedback.qualityAspects.completeness <= 2) {
      areas.push('completeness');
    }
    if (feedback.qualityAspects.relevance && feedback.qualityAspects.relevance <= 2) {
      areas.push('relevance');
    }
    if (feedback.qualityAspects.structure && feedback.qualityAspects.structure <= 2) {
      areas.push('structure');
    }
  }

  // From content reuse
  if (feedback.contentReusedPercent !== undefined && feedback.contentReusedPercent < 30) {
    if (!areas.includes('content')) {areas.push('content');}
  }

  return [...new Set(areas)]; // Remove duplicates
}

/**
 * Calculates quality score (0-10 scale)
 */
function calculateQualityScore(feedback: DetailedFeedback): number {
  let score = (feedback.rating || 3) * 2.0; // Base: 0-10 from rating

  // Adjust for content reuse
  if (feedback.contentReusedPercent !== undefined) {
    score += ((feedback.contentReusedPercent - 50) / 50) * 1.5;
  }

  // Helpful bonus
  if (feedback.wasHelpful === true) {score += 0.5;}
  else if (feedback.wasHelpful === false) {score -= 0.5;}

  // Would use again bonus
  if (feedback.wouldUseAgain === true) {score += 0.5;}

  // Quality aspects average bonus
  if (feedback.qualityAspects) {
    const aspects = Object.values(feedback.qualityAspects).filter(v => v !== undefined) as number[];
    if (aspects.length > 0) {
      const avg = aspects.reduce((a, b) => a + b, 0) / aspects.length;
      score += (avg - 3) * 0.3; // ±0.6 based on average
    }
  }

  return Math.max(0, Math.min(10, Math.round(score * 100) / 100));
}

// ===========================================
// Pattern Learning
// ===========================================

/**
 * Updates pattern metrics based on feedback
 */
async function updatePatternFromFeedback(
  context: AIContext,
  draftType: string,
  triggerPattern: string,
  feedback: DetailedFeedback
): Promise<void> {
  if (!triggerPattern) {return;}

  try {
    // The DB trigger handles most updates, but we add extra logic for consecutive low ratings
    if (feedback.rating <= 2) {
      // Check if we should suggest improvements for this pattern
      const patternResult = await queryContext(
        context,
        `SELECT id, consecutive_low_ratings, avg_rating, times_triggered
         FROM draft_trigger_patterns
         WHERE context = $1 AND draft_type = $2 AND pattern_text = $3`,
        [context, draftType, triggerPattern]
      );

      if (patternResult.rows.length > 0) {
        const pattern = patternResult.rows[0];
        // If pattern has 2+ consecutive low ratings, create improvement suggestion
        if (pattern.consecutive_low_ratings >= 2) {
          await createImprovementSuggestion(context, draftType, pattern, feedback);
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to update pattern from feedback', { error });
  }
}

/**
 * Creates an improvement suggestion for a struggling pattern
 */
async function createImprovementSuggestion(
  context: AIContext,
  draftType: string,
  pattern: PatternRow,
  feedback: DetailedFeedback
): Promise<void> {
  try {
    // Check if we already have a pending suggestion for this pattern
    const existingResult = await queryContext(
      context,
      `SELECT id FROM draft_learning_suggestions
       WHERE context = $1 AND draft_type = $2 AND status = 'pending'
       LIMIT 1`,
      [context, draftType]
    );

    if (existingResult.rows.length > 0) {
      // Update existing suggestion
      await queryContext(
        context,
        `UPDATE draft_learning_suggestions
         SET based_on_feedback_count = based_on_feedback_count + 1,
             avg_rating_before = $3,
             updated_at = NOW()
         WHERE id = $1`,
        [existingResult.rows[0].id, pattern.avg_rating]
      );
    } else {
      // Create new suggestion
      const improvementAreas = identifyImprovementAreas(feedback);
      await queryContext(
        context,
        `INSERT INTO draft_learning_suggestions (
          id, context, draft_type, suggestion_type, suggestion_text, rationale,
          based_on_feedback_count, avg_rating_before, common_issues, priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          uuidv4(),
          context,
          draftType,
          'prompt_improvement',
          `Consider improving ${draftType} generation for "${pattern.pattern_text}" pattern`,
          `Pattern has ${pattern.consecutive_low_ratings} consecutive low ratings (avg: ${pattern.avg_rating})`,
          1,
          pattern.avg_rating,
          improvementAreas,
          pattern.consecutive_low_ratings >= 3 ? 'high' : 'medium',
        ]
      );
    }
  } catch (error) {
    logger.warn('Failed to create improvement suggestion', { error });
  }
}

// ===========================================
// Draft Copy Tracking
// ===========================================

/**
 * Records a draft copy event
 */
export async function recordDraftCopy(
  draftId: string,
  context: AIContext
): Promise<void> {
  try {
    await queryContext(
      context,
      `UPDATE idea_drafts
       SET copy_count = COALESCE(copy_count, 0) + 1,
           last_copy_at = NOW(),
           status = CASE WHEN status = 'ready' THEN 'viewed' ELSE status END
       WHERE id = $1 AND context = $2`,
      [draftId, context]
    );
  } catch (error) {
    logger.warn('Failed to record draft copy', { error });
  }
}

// ===========================================
// Analytics & Reporting
// ===========================================

/**
 * Gets feedback analytics for a context
 */
export async function getFeedbackAnalytics(
  context: AIContext,
  days: number = 30
): Promise<FeedbackAnalytics[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        d.draft_type,
        COUNT(DISTINCT d.id) as total_drafts,
        COUNT(f.id) as total_feedback,
        ROUND(AVG(f.rating)::DECIMAL, 2) as avg_rating,
        ROUND(AVG(f.content_reused_percent)::DECIMAL, 2) as avg_content_reused,
        ROUND((SUM(CASE WHEN f.was_helpful THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(f.id), 0)) * 100, 2) as helpful_percent,
        ROUND((COUNT(DISTINCT CASE WHEN d.status = 'used' THEN d.id END)::DECIMAL / NULLIF(COUNT(DISTINCT d.id), 0)) * 100, 2) as conversion_rate
      FROM idea_drafts d
      LEFT JOIN draft_feedback_history f ON f.draft_id = d.id
      WHERE d.context = $1
        AND d.created_at >= NOW() - ($2 || ' days')::INTERVAL
      GROUP BY d.draft_type
      ORDER BY total_drafts DESC`,
      [context, days]
    );

    return result.rows.map((row: FeedbackAnalyticsRow) => ({
      draftType: row.draft_type,
      totalDrafts: parseInt(row.total_drafts, 10),
      totalFeedback: parseInt(row.total_feedback, 10),
      avgRating: parseFloat(row.avg_rating) || 0,
      avgContentReused: parseFloat(row.avg_content_reused) || 0,
      helpfulPercent: parseFloat(row.helpful_percent) || 0,
      topIssues: [], // Would need separate query for this
      conversionRate: parseFloat(row.conversion_rate) || 0,
      satisfactionScore: calculateSatisfactionScore(row),
    }));
  } catch (error) {
    logger.error('Failed to get feedback analytics', error instanceof Error ? error : undefined);
    return [];
  }
}

function calculateSatisfactionScore(row: FeedbackAnalyticsRow): number {
  const rating = parseFloat(row.avg_rating) || 3;
  const helpful = parseFloat(row.helpful_percent) || 50;
  const conversion = parseFloat(row.conversion_rate) || 50;
  const reuse = parseFloat(row.avg_content_reused) || 50;

  // Weighted score: rating (40%), helpful (20%), conversion (20%), reuse (20%)
  return Math.round(((rating / 5) * 40 + (helpful / 100) * 20 + (conversion / 100) * 20 + (reuse / 100) * 20) * 10) / 10;
}

/**
 * Gets pattern effectiveness data
 */
export async function getPatternEffectiveness(
  context: AIContext
): Promise<PatternEffectiveness[]> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        p.id as pattern_id,
        p.pattern_text,
        p.draft_type,
        p.is_active,
        p.times_triggered,
        p.times_used,
        p.avg_rating,
        p.quality_score,
        p.success_rate,
        p.consecutive_low_ratings,
        CASE
          WHEN p.times_triggered = 0 THEN 'new'
          WHEN p.quality_score >= 8 THEN 'excellent'
          WHEN p.quality_score >= 6 THEN 'good'
          WHEN p.quality_score >= 4 THEN 'average'
          ELSE 'needs_improvement'
        END as performance_tier
      FROM draft_trigger_patterns p
      WHERE p.context = $1
      ORDER BY p.quality_score DESC NULLS LAST, p.times_triggered DESC`,
      [context]
    );

    return result.rows.map((row: PatternEffectivenessRow) => ({
      patternId: row.pattern_id,
      patternText: row.pattern_text,
      draftType: row.draft_type,
      isActive: row.is_active,
      timesTriggered: parseInt(row.times_triggered, 10) || 0,
      timesUsed: parseInt(row.times_used, 10) || 0,
      avgRating: row.avg_rating ? parseFloat(row.avg_rating) : null,
      qualityScore: row.quality_score ? parseFloat(row.quality_score) : null,
      successRate: row.success_rate ? parseFloat(row.success_rate) : null,
      performanceTier: row.performance_tier,
      consecutiveLowRatings: parseInt(row.consecutive_low_ratings, 10) || 0,
    }));
  } catch (error) {
    logger.error('Failed to get pattern effectiveness', error instanceof Error ? error : undefined);
    return [];
  }
}

// ===========================================
// Feedback Retrieval
// ===========================================

/**
 * Gets drafts that need feedback (used but not rated)
 */
export async function getDraftsNeedingFeedback(
  context: AIContext,
  limit: number = 10
): Promise<Array<{
  id: string;
  ideaId: string;
  ideaTitle: string;
  draftType: string;
  status: string;
  wordCount: number;
  createdAt: string;
  viewedAt: string | null;
  usedAt: string | null;
  copyCount: number;
}>> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        d.id,
        d.idea_id,
        i.title as idea_title,
        d.draft_type,
        d.status,
        d.word_count,
        d.created_at,
        d.viewed_at,
        d.used_at,
        COALESCE(d.copy_count, 0) as copy_count
      FROM idea_drafts d
      JOIN ideas i ON i.id = d.idea_id
      WHERE d.context = $1
        AND d.status IN ('used', 'viewed')
        AND d.user_rating IS NULL
        AND d.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY d.copy_count DESC, d.used_at DESC NULLS LAST, d.viewed_at DESC NULLS LAST
      LIMIT $2`,
      [context, limit]
    );

    return result.rows.map((row: DraftsNeedingFeedbackRow) => ({
      id: row.id,
      ideaId: row.idea_id,
      ideaTitle: row.idea_title,
      draftType: row.draft_type,
      status: row.status,
      wordCount: row.word_count,
      createdAt: row.created_at,
      viewedAt: row.viewed_at,
      usedAt: row.used_at,
      copyCount: parseInt(row.copy_count, 10),
    }));
  } catch (error) {
    logger.error('Failed to get drafts needing feedback', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Gets feedback history for a draft
 */
export async function getDraftFeedbackHistory(
  draftId: string,
  context: AIContext
): Promise<Array<{
  id: string;
  rating: number;
  feedbackText: string | null;
  contentReusedPercent: number | null;
  wasHelpful: boolean | null;
  sentiment: string;
  createdAt: string;
}>> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        id, rating, feedback_text, content_reused_percent,
        was_helpful, feedback_sentiment, created_at
      FROM draft_feedback_history
      WHERE draft_id = $1 AND context = $2
      ORDER BY created_at DESC`,
      [draftId, context]
    );

    return result.rows.map((row: FeedbackHistoryRow) => ({
      id: row.id,
      rating: row.rating,
      feedbackText: row.feedback_text,
      contentReusedPercent: row.content_reused_percent,
      wasHelpful: row.was_helpful,
      sentiment: row.feedback_sentiment || 'neutral',
      createdAt: row.created_at,
    }));
  } catch (error) {
    logger.error('Failed to get draft feedback history', error instanceof Error ? error : undefined, { draftId });
    return [];
  }
}

// ===========================================
// Learning Suggestions
// ===========================================

/**
 * Gets learning suggestions for improvement
 */
export async function getLearningSuggestions(
  context: AIContext,
  status: 'pending' | 'applied' | 'rejected' | 'testing' = 'pending'
): Promise<Array<{
  id: string;
  draftType: string;
  suggestionType: string;
  suggestionText: string;
  rationale: string | null;
  basedOnFeedbackCount: number;
  avgRatingBefore: number | null;
  commonIssues: string[];
  priority: string;
  createdAt: string;
}>> {
  try {
    const result = await queryContext(
      context,
      `SELECT
        id, draft_type, suggestion_type, suggestion_text, rationale,
        based_on_feedback_count, avg_rating_before, common_issues, priority, created_at
      FROM draft_learning_suggestions
      WHERE context = $1 AND status = $2
      ORDER BY
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC`,
      [context, status]
    );

    return result.rows.map((row: LearningSuggestionRow) => ({
      id: row.id,
      draftType: row.draft_type,
      suggestionType: row.suggestion_type,
      suggestionText: row.suggestion_text,
      rationale: row.rationale,
      basedOnFeedbackCount: row.based_on_feedback_count,
      avgRatingBefore: row.avg_rating_before ? parseFloat(row.avg_rating_before) : null,
      commonIssues: row.common_issues || [],
      priority: row.priority,
      createdAt: row.created_at,
    }));
  } catch (error) {
    logger.error('Failed to get learning suggestions', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Applies or rejects a learning suggestion
 */
export async function updateLearningSuggestion(
  suggestionId: string,
  context: AIContext,
  action: 'applied' | 'rejected' | 'testing'
): Promise<boolean> {
  try {
    await queryContext(
      context,
      `UPDATE draft_learning_suggestions
       SET status = $3, applied_at = CASE WHEN $3 = 'applied' THEN NOW() ELSE applied_at END, updated_at = NOW()
       WHERE id = $1 AND context = $2`,
      [suggestionId, context, action]
    );
    return true;
  } catch (error) {
    logger.error('Failed to update learning suggestion', error instanceof Error ? error : undefined);
    return false;
  }
}

/**
 * Quick thumbs up/down feedback
 */
export async function quickFeedback(
  draftId: string,
  context: AIContext,
  isPositive: boolean
): Promise<boolean> {
  return (await submitDetailedFeedback(draftId, context, {
    rating: isPositive ? 5 : 2,
    wasHelpful: isPositive,
    feedbackSource: 'prompt',
  })).success;
}
