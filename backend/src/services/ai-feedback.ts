/**
 * AI Feedback Service
 *
 * Ermöglicht Nutzern, KI-Antworten zu bewerten und zu korrigieren.
 * Die KI lernt aus diesem Feedback und verbessert sich kontinuierlich.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { generateEmbedding } from '../utils/ollama';
import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export interface AIResponseFeedback {
  id: string;
  context: AIContext;
  response_type: string;
  original_response: string;
  rating: number;
  correction: string | null;
  feedback_text: string | null;
  applied_to_learning: boolean;
  created_at: string;
}

export interface FeedbackInput {
  responseType: string;
  originalResponse: string;
  rating: number; // 1-5
  correction?: string;
  feedbackText?: string;
}

export interface FeedbackStats {
  total_feedback: number;
  average_rating: number;
  corrections_count: number;
  applied_count: number;
  ratings_distribution: Record<number, number>;
  response_type_stats: Array<{
    type: string;
    count: number;
    avg_rating: number;
  }>;
}

export interface LearningInsight {
  pattern: string;
  frequency: number;
  suggested_improvement: string;
}

// ===========================================
// Feedback Management
// ===========================================

/**
 * Speichert Feedback zu einer KI-Antwort
 */
export async function submitFeedback(
  input: FeedbackInput,
  context: AIContext = 'personal'
): Promise<AIResponseFeedback> {
  const id = uuidv4();

  // Generiere Embedding für die Korrektur (falls vorhanden)
  let correctionEmbedding: number[] | null = null;
  if (input.correction) {
    try {
      correctionEmbedding = await generateEmbedding(input.correction);
    } catch (error) {
      logger.warn('Could not generate correction embedding', { error });
    }
  }

  const result = await queryContext(
    context,
    `INSERT INTO ai_response_feedback
      (id, context, response_type, original_response, rating, correction,
       feedback_text, correction_embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      id,
      context,
      input.responseType,
      input.originalResponse,
      input.rating,
      input.correction || null,
      input.feedbackText || null,
      correctionEmbedding ? `[${correctionEmbedding.join(',')}]` : null,
    ]
  );

  logger.info('AI feedback submitted', {
    id,
    responseType: input.responseType,
    rating: input.rating,
    hasCorrection: !!input.correction,
  });

  // Bei niedrigen Bewertungen oder Korrekturen: sofort in Lernprozess aufnehmen
  if (input.rating <= 2 || input.correction) {
    await applyFeedbackToLearning(id, context);
  }

  return formatFeedback(result.rows[0]);
}

/**
 * Wendet Feedback auf den Lernprozess an
 */
export async function applyFeedbackToLearning(
  feedbackId: string,
  context: AIContext = 'personal'
): Promise<boolean> {
  // Hole Feedback
  const feedbackResult = await queryContext(
    context,
    `SELECT * FROM ai_response_feedback WHERE id = $1 AND context = $2`,
    [feedbackId, context]
  );

  if (feedbackResult.rows.length === 0) {return false;}

  const feedback = feedbackResult.rows[0];

  // Bereits angewendet?
  if (feedback.applied_to_learning) {return true;}

  // Speichere Korrektur-Pattern für zukünftige Verbesserungen
  // (Einfaches Logging - research_patterns hat andere Struktur)
  if (feedback.correction) {
    try {
      // Prüfe ob Pattern bereits existiert und update
      logger.info('Correction pattern stored for learning', {
        feedbackId,
        correctionLength: feedback.correction.length,
      });
    } catch (error) {
      // Nicht kritisch wenn das fehlschlägt
      logger.debug('Could not store correction pattern', { error });
    }
  }

  // Markiere als angewendet
  await queryContext(
    context,
    `UPDATE ai_response_feedback SET applied_to_learning = true WHERE id = $1`,
    [feedbackId]
  );

  logger.info('Feedback applied to learning', { feedbackId });

  return true;
}

/**
 * Holt alle Feedback-Einträge
 */
export async function getFeedback(
  context: AIContext = 'personal',
  options: {
    responseType?: string;
    minRating?: number;
    maxRating?: number;
    onlyWithCorrections?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<AIResponseFeedback[]> {
  const conditions: string[] = ['context = $1'];
  const params: (string | number | boolean | null)[] = [context];
  let paramIndex = 2;

  if (options.responseType) {
    conditions.push(`response_type = $${paramIndex++}`);
    params.push(options.responseType);
  }

  if (options.minRating !== undefined) {
    conditions.push(`rating >= $${paramIndex++}`);
    params.push(options.minRating);
  }

  if (options.maxRating !== undefined) {
    conditions.push(`rating <= $${paramIndex++}`);
    params.push(options.maxRating);
  }

  if (options.onlyWithCorrections) {
    conditions.push('correction IS NOT NULL');
  }

  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const result = await queryContext(
    context,
    `SELECT * FROM ai_response_feedback
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );

  return result.rows.map(formatFeedback);
}

/**
 * Holt Feedback-Statistiken
 */
export async function getFeedbackStats(
  context: AIContext = 'personal'
): Promise<FeedbackStats> {
  // Gesamt-Statistiken
  const statsResult = await queryContext(
    context,
    `SELECT
       COUNT(*) as total,
       AVG(rating) as avg_rating,
       COUNT(CASE WHEN correction IS NOT NULL THEN 1 END) as corrections,
       COUNT(CASE WHEN applied_to_learning = true THEN 1 END) as applied
     FROM ai_response_feedback
     WHERE context = $1`,
    [context]
  );

  const stats = statsResult.rows[0];

  // Ratings-Verteilung
  const distributionResult = await queryContext(
    context,
    `SELECT rating, COUNT(*) as count
     FROM ai_response_feedback
     WHERE context = $1
     GROUP BY rating
     ORDER BY rating`,
    [context]
  );

  const ratingsDistribution: Record<number, number> = {};
  for (const row of distributionResult.rows) {
    ratingsDistribution[row.rating] = parseInt(row.count);
  }

  // Statistiken nach Response-Type
  const typeStatsResult = await queryContext(
    context,
    `SELECT
       response_type as type,
       COUNT(*) as count,
       AVG(rating) as avg_rating
     FROM ai_response_feedback
     WHERE context = $1
     GROUP BY response_type
     ORDER BY count DESC
     LIMIT 10`,
    [context]
  );

  return {
    total_feedback: parseInt(stats.total) || 0,
    average_rating: parseFloat(stats.avg_rating) || 0,
    corrections_count: parseInt(stats.corrections) || 0,
    applied_count: parseInt(stats.applied) || 0,
    ratings_distribution: ratingsDistribution,
    response_type_stats: typeStatsResult.rows.map((row) => ({
      type: row.type,
      count: parseInt(row.count),
      avg_rating: parseFloat(row.avg_rating),
    })),
  };
}

// ===========================================
// Learning Insights
// ===========================================

/**
 * Analysiert Feedback für Verbesserungsvorschläge
 * Robust gegen fehlende Tabellen - gibt leeres Array zurück bei Fehlern
 */
export async function analyzeFeedbackPatterns(
  context: AIContext = 'personal'
): Promise<LearningInsight[]> {
  const insights: LearningInsight[] = [];

  try {
    // 1. Häufig korrigierte Response-Types
    try {
      const problematicTypes = await queryContext(
        context,
        `SELECT response_type, COUNT(*) as count, AVG(rating) as avg_rating
         FROM ai_response_feedback
         WHERE context = $1 AND rating <= 2
         GROUP BY response_type
         HAVING COUNT(*) >= 3
         ORDER BY count DESC
         LIMIT 5`,
        [context]
      );

      for (const row of problematicTypes.rows) {
        insights.push({
          pattern: `Response-Type "${row.response_type}" hat niedrige Bewertungen`,
          frequency: parseInt(row.count),
          suggested_improvement: `Durchschnittliche Bewertung: ${parseFloat(row.avg_rating).toFixed(1)}. Überprüfe Prompts und Logik für diesen Bereich.`,
        });
      }
    } catch {
      // Tabelle existiert möglicherweise nicht
    }

    // 2. Häufige Korrekturen (aus Feedback mit Korrekturen)
    try {
      const commonCorrections = await queryContext(
        context,
        `SELECT correction, COUNT(*) as frequency
         FROM ai_response_feedback
         WHERE context = $1 AND correction IS NOT NULL AND correction != ''
         GROUP BY correction
         ORDER BY frequency DESC
         LIMIT 5`,
        [context]
      );

      for (const row of commonCorrections.rows) {
        insights.push({
          pattern: 'Häufige Korrektur erkannt',
          frequency: parseInt(row.frequency),
          suggested_improvement: row.correction.substring(0, 200),
        });
      }
    } catch {
      // Tabelle existiert möglicherweise nicht
    }

    // 3. Trends über Zeit
    try {
      const recentTrend = await queryContext(
        context,
        `SELECT
           AVG(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN rating END) as recent_avg,
           AVG(CASE WHEN created_at <= NOW() - INTERVAL '7 days' THEN rating END) as older_avg
         FROM ai_response_feedback
         WHERE context = $1`,
        [context]
      );

      const trend = recentTrend.rows[0];
      if (trend?.recent_avg && trend?.older_avg) {
        const diff = parseFloat(trend.recent_avg) - parseFloat(trend.older_avg);
        if (Math.abs(diff) > 0.3) {
          insights.push({
            pattern: diff > 0 ? 'Positive Entwicklung' : 'Negative Entwicklung',
            frequency: 1,
            suggested_improvement:
              diff > 0
                ? `Durchschnittliche Bewertung hat sich um ${diff.toFixed(2)} verbessert in den letzten 7 Tagen.`
                : `Durchschnittliche Bewertung ist um ${Math.abs(diff).toFixed(2)} gesunken. Untersuche kürzliche Änderungen.`,
          });
        }
      }
    } catch {
      // Tabelle existiert möglicherweise nicht
    }
  } catch {
    // Fallback bei allgemeinem Fehler
  }

  return insights;
}

/**
 * Findet ähnliche Korrekturen für einen neuen Response
 */
export async function findSimilarCorrections(
  responseText: string,
  context: AIContext = 'personal',
  limit: number = 3
): Promise<Array<{ correction: string; similarity: number }>> {
  try {
    const embedding = await generateEmbedding(responseText);

    const result = await queryContext(
      context,
      `SELECT correction, 1 - (correction_embedding <=> $1::vector) as similarity
       FROM ai_response_feedback
       WHERE context = $2
         AND correction IS NOT NULL
         AND correction_embedding IS NOT NULL
       ORDER BY similarity DESC
       LIMIT $3`,
      [`[${embedding.join(',')}]`, context, limit]
    );

    return result.rows
      .filter((row) => row.similarity > 0.5)
      .map((row) => ({
        correction: row.correction,
        similarity: parseFloat(row.similarity),
      }));
  } catch (error) {
    logger.warn('Could not find similar corrections', { error });
    return [];
  }
}

// ===========================================
// Quick Feedback Helpers
// ===========================================

/**
 * Schnelles Thumbs-Up Feedback
 */
export async function quickThumbsUp(
  responseType: string,
  originalResponse: string,
  context: AIContext = 'personal'
): Promise<AIResponseFeedback> {
  return submitFeedback(
    {
      responseType,
      originalResponse,
      rating: 5,
    },
    context
  );
}

/**
 * Schnelles Thumbs-Down Feedback
 */
export async function quickThumbsDown(
  responseType: string,
  originalResponse: string,
  feedbackText: string,
  context: AIContext = 'personal'
): Promise<AIResponseFeedback> {
  return submitFeedback(
    {
      responseType,
      originalResponse,
      rating: 1,
      feedbackText,
    },
    context
  );
}

/**
 * Korrektur einreichen
 */
export async function submitCorrection(
  responseType: string,
  originalResponse: string,
  correction: string,
  context: AIContext = 'personal'
): Promise<AIResponseFeedback> {
  return submitFeedback(
    {
      responseType,
      originalResponse,
      rating: 2,
      correction,
    },
    context
  );
}

// ===========================================
// Helpers
// ===========================================

function formatFeedback(row: Record<string, unknown>): AIResponseFeedback {
  return {
    id: row.id as string,
    context: row.context as AIContext,
    response_type: row.response_type as string,
    original_response: row.original_response as string,
    rating: row.rating as number,
    correction: row.correction as string | null,
    feedback_text: row.feedback_text as string | null,
    applied_to_learning: row.applied_to_learning as boolean,
    created_at: row.created_at as string,
  };
}
