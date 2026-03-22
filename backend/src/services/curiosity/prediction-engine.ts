/**
 * Phase 134: Prediction Engine
 *
 * Combines temporal and sequential activity patterns to predict
 * the user's next intent, domain, and entities. Records predictions
 * and computes error signals for model improvement.
 */

import { logger } from '../../utils/logger';
import { queryContext } from '../../utils/database-context';
import type { AIContext } from '../../types/context';
import {
  extractTemporalPatterns,
  extractSequentialPatterns,
  findDominantPattern,
} from './pattern-tracker';
import type { TemporalPattern, SequentialPattern } from './pattern-tracker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserPrediction {
  predictedIntent: string;
  predictedDomain: string;
  predictedEntities: string[];
  confidence: number;
  basis: string[];
}

export interface PredictionError {
  predicted: UserPrediction;
  actualIntent: string;
  actualDomain: string;
  errorMagnitude: number;
  learningSignal: string;
}

export interface QueryAnalysis {
  intent: string;
  domain: string;
  entities: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMPORAL_WEIGHT = 0.4;
const SEQUENTIAL_WEIGHT = 0.4;
const RECENCY_WEIGHT = 0.2;
const DEFAULT_INTENT = 'general';
const DEFAULT_DOMAIN = 'personal';

// ---------------------------------------------------------------------------
// predictNextIntent
// ---------------------------------------------------------------------------

export function predictNextIntent(
  temporalPatterns: TemporalPattern[],
  sequentialPatterns: SequentialPattern[],
  currentHour: number,
  currentDay: number,
  lastIntent?: string,
): UserPrediction {
  const basis: string[] = [];
  let intentScores = new Map<string, number>();
  let domainScores = new Map<string, number>();
  let totalWeight = 0;

  // --- Temporal signal (weight 0.4) ---
  const temporalMatch = findDominantPattern(temporalPatterns, currentHour, currentDay);
  if (temporalMatch) {
    const temporalStrength = Math.min(temporalMatch.frequency / 10, 1.0);
    const score = TEMPORAL_WEIGHT * temporalStrength;
    intentScores.set(
      temporalMatch.intent,
      (intentScores.get(temporalMatch.intent) || 0) + score,
    );
    domainScores.set(
      temporalMatch.domain,
      (domainScores.get(temporalMatch.domain) || 0) + score,
    );
    totalWeight += score;
    basis.push(`temporal: ${temporalMatch.intent} at hour=${currentHour} day=${currentDay} (freq=${temporalMatch.frequency})`);
  }

  // --- Sequential signal (weight 0.4) ---
  if (lastIntent && sequentialPatterns.length > 0) {
    const relevant = sequentialPatterns.filter((p) => p.fromIntent === lastIntent);
    if (relevant.length > 0) {
      // Pick the highest probability transition
      const best = relevant.reduce((a, b) => (b.probability > a.probability ? b : a));
      const score = SEQUENTIAL_WEIGHT * best.probability;
      intentScores.set(
        best.toIntent,
        (intentScores.get(best.toIntent) || 0) + score,
      );
      totalWeight += score;
      basis.push(`sequential: ${lastIntent}→${best.toIntent} (p=${best.probability.toFixed(2)})`);
    }
  }

  // --- Recency signal (weight 0.2) ---
  if (lastIntent) {
    const recencyScore = RECENCY_WEIGHT * 0.5; // Mild bias toward recent intent
    intentScores.set(
      lastIntent,
      (intentScores.get(lastIntent) || 0) + recencyScore,
    );
    totalWeight += recencyScore;
    basis.push(`recency: last_intent=${lastIntent}`);
  }

  // --- Pick winner ---
  let predictedIntent = DEFAULT_INTENT;
  let maxIntentScore = 0;
  for (const [intent, score] of intentScores.entries()) {
    if (score > maxIntentScore) {
      maxIntentScore = score;
      predictedIntent = intent;
    }
  }

  let predictedDomain = DEFAULT_DOMAIN;
  let maxDomainScore = 0;
  for (const [domain, score] of domainScores.entries()) {
    if (score > maxDomainScore) {
      maxDomainScore = score;
      predictedDomain = domain;
    }
  }

  // Use temporal match domain if available and no better signal
  if (temporalMatch && maxDomainScore === 0) {
    predictedDomain = temporalMatch.domain;
  }

  // Confidence = normalized total weight (max possible ~1.0)
  const maxPossibleWeight = TEMPORAL_WEIGHT + SEQUENTIAL_WEIGHT + RECENCY_WEIGHT;
  const confidence = totalWeight > 0
    ? Math.min(totalWeight / maxPossibleWeight, 1.0)
    : 0.1; // Low confidence fallback

  // Entities: empty for now (could be expanded with entity patterns)
  const predictedEntities: string[] = [];

  if (basis.length === 0) {
    basis.push('no_pattern_match');
  }

  return {
    predictedIntent,
    predictedDomain,
    predictedEntities,
    confidence,
    basis,
  };
}

// ---------------------------------------------------------------------------
// computePredictionError
// ---------------------------------------------------------------------------

export function computePredictionError(
  predicted: UserPrediction,
  actual: QueryAnalysis,
): PredictionError {
  // Intent error: exact match = 0, partial = 0.5, miss = 1.0
  let intentError: number;
  if (predicted.predictedIntent === actual.intent) {
    intentError = 0.0;
  } else if (
    predicted.predictedIntent.includes(actual.intent) ||
    actual.intent.includes(predicted.predictedIntent)
  ) {
    intentError = 0.5;
  } else {
    intentError = 1.0;
  }

  // Domain error: match = 0, miss = 0.3
  const domainError = predicted.predictedDomain === actual.domain ? 0.0 : 0.3;

  // Weighted error magnitude
  const errorMagnitude = Math.min(intentError * 0.7 + domainError * 0.3, 1.0);

  // Learning signal
  let learningSignal: string;
  if (intentError === 0 && domainError === 0) {
    learningSignal = 'correct';
  } else if (intentError > 0 && domainError === 0) {
    learningSignal = 'wrong_intent';
  } else if (intentError === 0 && domainError > 0) {
    learningSignal = 'wrong_domain';
  } else {
    learningSignal = 'surprise';
  }

  return {
    predicted,
    actualIntent: actual.intent,
    actualDomain: actual.domain,
    errorMagnitude,
    learningSignal,
  };
}

// ---------------------------------------------------------------------------
// updateModel
// ---------------------------------------------------------------------------

export async function updateModel(
  context: string,
  error: PredictionError,
): Promise<void> {
  try {
    const sql = `INSERT INTO prediction_log
                 (predicted_intent, predicted_domain, actual_intent, actual_domain,
                  error_magnitude, learning_signal, confidence, basis)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
    await queryContext(context as AIContext, sql, [
      error.predicted.predictedIntent,
      error.predicted.predictedDomain,
      error.actualIntent,
      error.actualDomain,
      error.errorMagnitude,
      error.learningSignal,
      error.predicted.confidence,
      JSON.stringify(error.predicted.basis),
    ]);
    logger.debug('Prediction error logged', {
      signal: error.learningSignal,
      magnitude: error.errorMagnitude,
    });
  } catch (err) {
    // Fire-and-forget
    logger.error('Failed to log prediction error', err instanceof Error ? err : new Error(String(err)));
  }
}

// ---------------------------------------------------------------------------
// makePrediction
// ---------------------------------------------------------------------------

export async function makePrediction(
  context: string,
  userId?: string,
  currentTime?: Date,
): Promise<UserPrediction> {
  try {
    const now = currentTime || new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    // Load activity history
    const activitySQL = userId
      ? `SELECT timestamp, domain, intent, entities
         FROM activity_patterns
         WHERE user_id = $1
         ORDER BY timestamp DESC
         LIMIT 500`
      : `SELECT timestamp, domain, intent, entities
         FROM activity_patterns
         ORDER BY timestamp DESC
         LIMIT 500`;

    const params = userId ? [userId] : [];
    const result = await queryContext(context as AIContext, activitySQL, params);

    if (!result.rows || result.rows.length === 0) {
      logger.debug('No activity history for prediction, returning generic');
      return {
        predictedIntent: DEFAULT_INTENT,
        predictedDomain: DEFAULT_DOMAIN,
        predictedEntities: [],
        confidence: 0.1,
        basis: ['no_history'],
      };
    }

    const activities = result.rows.map((r: any) => ({
      timestamp: new Date(r.timestamp),
      domain: r.domain,
      intent: r.intent,
      entities: typeof r.entities === 'string' ? JSON.parse(r.entities) : (r.entities || []),
    }));

    const temporalPatterns = extractTemporalPatterns(activities);
    const sequentialPatterns = extractSequentialPatterns(activities);

    // Last intent from most recent activity
    const lastIntent = activities.length > 0 ? activities[0].intent : undefined;

    const prediction = predictNextIntent(
      temporalPatterns,
      sequentialPatterns,
      currentHour,
      currentDay,
      lastIntent,
    );

    logger.info('Prediction generated', {
      intent: prediction.predictedIntent,
      confidence: prediction.confidence,
    });

    return prediction;
  } catch (error) {
    logger.error('Prediction failed, returning fallback', error instanceof Error ? error : new Error(String(error)));
    return {
      predictedIntent: DEFAULT_INTENT,
      predictedDomain: DEFAULT_DOMAIN,
      predictedEntities: [],
      confidence: 0.1,
      basis: ['error_fallback'],
    };
  }
}

// ---------------------------------------------------------------------------
// recordPredictionResult
// ---------------------------------------------------------------------------

export async function recordPredictionResult(
  context: string,
  predictionId: string,
  actual: QueryAnalysis,
): Promise<void> {
  try {
    const sql = `UPDATE prediction_log
                 SET actual_intent = $1, actual_domain = $2, resolved_at = NOW()
                 WHERE id = $3`;
    await queryContext(context as AIContext, sql, [actual.intent, actual.domain, predictionId]);
    logger.debug('Prediction result recorded', { predictionId });
  } catch (error) {
    logger.error('Failed to record prediction result', error instanceof Error ? error : new Error(String(error)));
  }
}
