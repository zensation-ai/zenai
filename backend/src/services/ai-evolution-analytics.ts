/**
 * AI Evolution Analytics Service
 *
 * Tracks and analyzes how the AI system learns and improves over time.
 * Provides insights into:
 * - Learning curve (accuracy improvements)
 * - Domain strengths and weaknesses
 * - User satisfaction trends
 * - Proactive system effectiveness
 */

import { AIContext, queryContext } from '../utils/database-context';
import { logger } from '../utils/logger';

// ===========================================
// Types & Interfaces
// ===========================================

export interface LearningCurvePoint {
  date: string;
  accuracyScore: number;
  correctionRate: number;
  confidenceLevel: number;
  sampleSize: number;
}

export interface DomainStrength {
  domain: string;
  strength: number;
  sampleCount: number;
  improvementTrend: 'improving' | 'stable' | 'declining';
  commonCorrections: string[];
}

export interface SatisfactionPoint {
  date: string;
  avgRating: number;
  feedbackCount: number;
  positiveRatio: number;
}

export interface ProactiveEffectiveness {
  suggestionType: string;
  acceptanceRate: number;
  totalSuggestions: number;
  avgResponseTime: number;
}

export interface EvolutionMetrics {
  learningCurve: LearningCurvePoint[];
  domainStrengths: DomainStrength[];
  satisfactionTrend: SatisfactionPoint[];
  proactiveEffectiveness: ProactiveEffectiveness[];
  summary: EvolutionSummary;
}

export interface EvolutionSummary {
  overallAccuracy: number;
  overallSatisfaction: number;
  strongestDomain: string;
  weakestDomain: string;
  totalInteractions: number;
  improvementRate: number;
}

export interface CategoryPerformance {
  category: string;
  accuracy: number;
  sampleCount: number;
  avgConfidence: number;
}

export interface TimeSeriesMetric {
  date: string;
  value: number;
  count: number;
}

// ===========================================
// AI Evolution Analytics Service
// ===========================================

class AIEvolutionAnalytics {
  // ===========================================
  // Main Entry Point
  // ===========================================

  /**
   * Get comprehensive evolution metrics
   */
  async getEvolutionMetrics(context: AIContext, days: number = 30): Promise<EvolutionMetrics> {
    try {
      const [learningCurve, domainStrengths, satisfactionTrend, proactiveEffectiveness] =
        await Promise.all([
          this.calculateLearningCurve(context, days),
          this.analyzeDomainStrengths(context),
          this.getSatisfactionTrend(context, days),
          this.analyzeProactiveEffectiveness(context, days),
        ]);

      const summary = this.calculateSummary(
        learningCurve,
        domainStrengths,
        satisfactionTrend,
        proactiveEffectiveness
      );

      return {
        learningCurve,
        domainStrengths,
        satisfactionTrend,
        proactiveEffectiveness,
        summary,
      };
    } catch (error) {
      logger.error('Failed to get evolution metrics', error instanceof Error ? error : undefined);
      return this.getEmptyMetrics();
    }
  }

  // ===========================================
  // Learning Curve Analysis
  // ===========================================

  /**
   * Calculate learning curve over time
   * Tracks how accuracy improves as the system learns from corrections
   */
  async calculateLearningCurve(context: AIContext, days: number): Promise<LearningCurvePoint[]> {
    try {
      // Query for daily accuracy statistics
      const result = await queryContext(
        context,
        `WITH daily_stats AS (
          SELECT
            DATE(created_at) as date,
            COUNT(*) as total_ideas,
            COUNT(*) FILTER (WHERE
              title_corrected = true OR
              category_corrected = true OR
              type_corrected = true OR
              summary_corrected = true
            ) as corrected_ideas,
            AVG(CASE
              WHEN confidence_score IS NOT NULL THEN confidence_score
              ELSE 0.7
            END) as avg_confidence
          FROM ideas
          WHERE context = $1
            AND created_at >= NOW() - ($2 || ' days')::INTERVAL
            AND is_archived = false
          GROUP BY DATE(created_at)
        )
        SELECT
          date::text,
          total_ideas as sample_size,
          CASE
            WHEN total_ideas > 0 THEN
              1.0 - (corrected_ideas::DECIMAL / total_ideas)
            ELSE 0.7
          END as accuracy_score,
          CASE
            WHEN total_ideas > 0 THEN
              corrected_ideas::DECIMAL / total_ideas
            ELSE 0
          END as correction_rate,
          avg_confidence as confidence_level
        FROM daily_stats
        WHERE total_ideas >= 1
        ORDER BY date`,
        [context, days.toString()]
      );

      return result.rows.map((row: any) => ({
        date: row.date,
        accuracyScore: parseFloat(row.accuracy_score) || 0.7,
        correctionRate: parseFloat(row.correction_rate) || 0,
        confidenceLevel: parseFloat(row.confidence_level) || 0.7,
        sampleSize: parseInt(row.sample_size) || 0,
      }));
    } catch (error) {
      logger.debug('Learning curve calculation failed, using fallback', { error });
      return this.generateFallbackLearningCurve(days);
    }
  }

  /**
   * Generate fallback learning curve when data is unavailable
   */
  private generateFallbackLearningCurve(days: number): LearningCurvePoint[] {
    const result: LearningCurvePoint[] = [];
    const now = new Date();

    for (let i = days; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      result.push({
        date: date.toISOString().split('T')[0],
        accuracyScore: 0.7,
        correctionRate: 0,
        confidenceLevel: 0.7,
        sampleSize: 0,
      });
    }

    return result;
  }

  // ===========================================
  // Domain Strength Analysis
  // ===========================================

  /**
   * Analyze which domains/categories the AI handles well
   */
  async analyzeDomainStrengths(context: AIContext): Promise<DomainStrength[]> {
    try {
      // Get performance by category
      const categoryResult = await queryContext(
        context,
        `WITH category_stats AS (
          SELECT
            category,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE
              title_corrected = true OR
              category_corrected = true OR
              type_corrected = true OR
              summary_corrected = true
            ) as corrected,
            AVG(CASE WHEN confidence_score IS NOT NULL THEN confidence_score ELSE 0.7 END) as avg_confidence
          FROM ideas
          WHERE context = $1
            AND is_archived = false
            AND created_at >= NOW() - INTERVAL '90 days'
          GROUP BY category
          HAVING COUNT(*) >= 3
        )
        SELECT
          category,
          total,
          corrected,
          avg_confidence,
          CASE
            WHEN total > 0 THEN 1.0 - (corrected::DECIMAL / total)
            ELSE 0.7
          END as strength
        FROM category_stats
        ORDER BY strength DESC`,
        [context]
      );

      // Get common corrections per category
      const correctionsResult = await queryContext(
        context,
        `SELECT
           category,
           correction_field,
           COUNT(*) as count
         FROM idea_corrections
         WHERE context = $1
           AND created_at >= NOW() - INTERVAL '90 days'
         GROUP BY category, correction_field
         ORDER BY category, count DESC`,
        [context]
      );

      // Build corrections map
      const correctionsMap: Record<string, string[]> = {};
      for (const row of correctionsResult.rows) {
        if (!correctionsMap[row.category]) {
          correctionsMap[row.category] = [];
        }
        if (correctionsMap[row.category].length < 3) {
          correctionsMap[row.category].push(row.correction_field);
        }
      }

      // Calculate improvement trend
      return categoryResult.rows.map((row: any) => {
        const strength = parseFloat(row.strength) || 0.7;
        return {
          domain: row.category || 'Sonstiges',
          strength,
          sampleCount: parseInt(row.total) || 0,
          improvementTrend: this.calculateTrend(strength),
          commonCorrections: correctionsMap[row.category] || [],
        };
      });
    } catch (error) {
      logger.debug('Domain strength analysis failed, using fallback', { error });
      return this.getDefaultDomainStrengths();
    }
  }

  /**
   * Calculate trend based on strength
   */
  private calculateTrend(strength: number): 'improving' | 'stable' | 'declining' {
    if (strength >= 0.85) {return 'improving';}
    if (strength >= 0.6) {return 'stable';}
    return 'declining';
  }

  /**
   * Default domain strengths when data is unavailable
   */
  private getDefaultDomainStrengths(): DomainStrength[] {
    return [
      { domain: 'Arbeit', strength: 0.75, sampleCount: 0, improvementTrend: 'stable', commonCorrections: [] },
      { domain: 'Persönlich', strength: 0.75, sampleCount: 0, improvementTrend: 'stable', commonCorrections: [] },
      { domain: 'Lernen', strength: 0.75, sampleCount: 0, improvementTrend: 'stable', commonCorrections: [] },
    ];
  }

  // ===========================================
  // Satisfaction Trend Analysis
  // ===========================================

  /**
   * Get user satisfaction trend over time
   */
  async getSatisfactionTrend(context: AIContext, days: number): Promise<SatisfactionPoint[]> {
    try {
      const result = await queryContext(
        context,
        `WITH daily_feedback AS (
          SELECT
            DATE(created_at) as date,
            AVG(rating) as avg_rating,
            COUNT(*) as feedback_count,
            COUNT(*) FILTER (WHERE rating >= 4) as positive_count
          FROM user_feedback
          WHERE context = $1
            AND created_at >= NOW() - ($2 || ' days')::INTERVAL
          GROUP BY DATE(created_at)
        )
        SELECT
          date::text,
          COALESCE(avg_rating, 4.0) as avg_rating,
          feedback_count,
          CASE
            WHEN feedback_count > 0 THEN positive_count::DECIMAL / feedback_count
            ELSE 0.8
          END as positive_ratio
        FROM daily_feedback
        ORDER BY date`,
        [context, days.toString()]
      );

      return result.rows.map((row: any) => ({
        date: row.date,
        avgRating: parseFloat(row.avg_rating) || 4.0,
        feedbackCount: parseInt(row.feedback_count) || 0,
        positiveRatio: parseFloat(row.positive_ratio) || 0.8,
      }));
    } catch (error) {
      logger.debug('Satisfaction trend query failed, using fallback', { error });
      return [];
    }
  }

  // ===========================================
  // Proactive Effectiveness Analysis
  // ===========================================

  /**
   * Analyze how effective proactive suggestions are
   */
  async analyzeProactiveEffectiveness(
    context: AIContext,
    days: number
  ): Promise<ProactiveEffectiveness[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT
           suggestion_type,
           COUNT(*) as total_suggestions,
           COUNT(*) FILTER (WHERE accepted = true) as accepted_count,
           AVG(EXTRACT(EPOCH FROM (responded_at - created_at))) as avg_response_seconds
         FROM proactive_suggestions
         WHERE context = $1
           AND created_at >= NOW() - ($2 || ' days')::INTERVAL
         GROUP BY suggestion_type`,
        [context, days.toString()]
      );

      return result.rows.map((row: any) => ({
        suggestionType: row.suggestion_type || 'unknown',
        totalSuggestions: parseInt(row.total_suggestions) || 0,
        acceptanceRate:
          row.total_suggestions > 0
            ? (parseInt(row.accepted_count) || 0) / row.total_suggestions
            : 0,
        avgResponseTime: parseFloat(row.avg_response_seconds) || 0,
      }));
    } catch (error) {
      logger.debug('Proactive effectiveness query failed, using fallback', { error });
      return this.getDefaultProactiveEffectiveness();
    }
  }

  /**
   * Default proactive effectiveness when data is unavailable
   */
  private getDefaultProactiveEffectiveness(): ProactiveEffectiveness[] {
    return [
      { suggestionType: 'routine', acceptanceRate: 0.6, totalSuggestions: 0, avgResponseTime: 0 },
      { suggestionType: 'connection', acceptanceRate: 0.5, totalSuggestions: 0, avgResponseTime: 0 },
      { suggestionType: 'follow_up', acceptanceRate: 0.4, totalSuggestions: 0, avgResponseTime: 0 },
    ];
  }

  // ===========================================
  // Summary Calculation
  // ===========================================

  /**
   * Calculate overall summary from metrics
   */
  private calculateSummary(
    learningCurve: LearningCurvePoint[],
    domainStrengths: DomainStrength[],
    satisfactionTrend: SatisfactionPoint[],
    proactiveEffectiveness: ProactiveEffectiveness[]
  ): EvolutionSummary {
    // Calculate overall accuracy
    const recentAccuracy = learningCurve.slice(-7);
    const overallAccuracy =
      recentAccuracy.length > 0
        ? recentAccuracy.reduce((sum, p) => sum + p.accuracyScore, 0) / recentAccuracy.length
        : 0.7;

    // Calculate overall satisfaction
    const recentSatisfaction = satisfactionTrend.slice(-7);
    const overallSatisfaction =
      recentSatisfaction.length > 0
        ? recentSatisfaction.reduce((sum, p) => sum + p.avgRating, 0) / recentSatisfaction.length
        : 4.0;

    // Find strongest and weakest domains
    const sortedDomains = [...domainStrengths].sort((a, b) => b.strength - a.strength);
    const strongestDomain = sortedDomains[0]?.domain || 'Nicht verfügbar';
    const weakestDomain = sortedDomains[sortedDomains.length - 1]?.domain || 'Nicht verfügbar';

    // Calculate total interactions
    const totalInteractions = learningCurve.reduce((sum, p) => sum + p.sampleSize, 0);

    // Calculate improvement rate (comparing first and last week)
    const firstWeek = learningCurve.slice(0, 7);
    const lastWeek = learningCurve.slice(-7);
    const firstWeekAccuracy =
      firstWeek.length > 0
        ? firstWeek.reduce((sum, p) => sum + p.accuracyScore, 0) / firstWeek.length
        : 0.7;
    const lastWeekAccuracy =
      lastWeek.length > 0
        ? lastWeek.reduce((sum, p) => sum + p.accuracyScore, 0) / lastWeek.length
        : 0.7;
    const improvementRate = lastWeekAccuracy - firstWeekAccuracy;

    return {
      overallAccuracy,
      overallSatisfaction,
      strongestDomain,
      weakestDomain,
      totalInteractions,
      improvementRate,
    };
  }

  // ===========================================
  // Additional Analytics
  // ===========================================

  /**
   * Get category-level performance breakdown
   */
  async getCategoryPerformance(context: AIContext): Promise<CategoryPerformance[]> {
    try {
      const result = await queryContext(
        context,
        `SELECT
           category,
           COUNT(*) as sample_count,
           1.0 - (COUNT(*) FILTER (WHERE
             title_corrected = true OR
             category_corrected = true OR
             type_corrected = true
           )::DECIMAL / NULLIF(COUNT(*), 0)) as accuracy,
           AVG(COALESCE(confidence_score, 0.7)) as avg_confidence
         FROM ideas
         WHERE context = $1
           AND is_archived = false
           AND created_at >= NOW() - INTERVAL '30 days'
         GROUP BY category
         HAVING COUNT(*) >= 2
         ORDER BY accuracy DESC`,
        [context]
      );

      return result.rows.map((row: any) => ({
        category: row.category || 'Sonstiges',
        accuracy: parseFloat(row.accuracy) || 0.7,
        sampleCount: parseInt(row.sample_count) || 0,
        avgConfidence: parseFloat(row.avg_confidence) || 0.7,
      }));
    } catch (error) {
      logger.debug('Category performance query failed', { error });
      return [];
    }
  }

  /**
   * Get time-series metric for a specific measurement
   */
  async getTimeSeriesMetric(
    context: AIContext,
    metric: 'accuracy' | 'volume' | 'corrections',
    days: number
  ): Promise<TimeSeriesMetric[]> {
    try {
      let query: string;
      switch (metric) {
        case 'accuracy':
          query = `
            SELECT
              DATE(created_at)::text as date,
              1.0 - (COUNT(*) FILTER (WHERE title_corrected OR category_corrected)::DECIMAL / NULLIF(COUNT(*), 0)) as value,
              COUNT(*) as count
            FROM ideas
            WHERE context = $1 AND created_at >= NOW() - ($2 || ' days')::INTERVAL
            GROUP BY DATE(created_at)
            ORDER BY date`;
          break;
        case 'volume':
          query = `
            SELECT
              DATE(created_at)::text as date,
              COUNT(*) as value,
              COUNT(*) as count
            FROM ideas
            WHERE context = $1 AND created_at >= NOW() - ($2 || ' days')::INTERVAL
            GROUP BY DATE(created_at)
            ORDER BY date`;
          break;
        case 'corrections':
          query = `
            SELECT
              DATE(created_at)::text as date,
              COUNT(*) FILTER (WHERE title_corrected OR category_corrected OR type_corrected) as value,
              COUNT(*) as count
            FROM ideas
            WHERE context = $1 AND created_at >= NOW() - ($2 || ' days')::INTERVAL
            GROUP BY DATE(created_at)
            ORDER BY date`;
          break;
        default:
          return [];
      }

      const result = await queryContext(context, query, [context, days.toString()]);

      return result.rows.map((row: any) => ({
        date: row.date,
        value: parseFloat(row.value) || 0,
        count: parseInt(row.count) || 0,
      }));
    } catch (error) {
      logger.debug('Time series metric query failed', { error, metric });
      return [];
    }
  }

  /**
   * Get insights and recommendations based on analytics
   */
  async getInsights(context: AIContext): Promise<string[]> {
    try {
      const metrics = await this.getEvolutionMetrics(context, 30);
      const insights: string[] = [];

      // Accuracy insights
      if (metrics.summary.overallAccuracy >= 0.9) {
        insights.push('Die KI-Genauigkeit ist ausgezeichnet (>90%). Das System lernt effektiv.');
      } else if (metrics.summary.overallAccuracy < 0.7) {
        insights.push(
          'Die KI-Genauigkeit könnte verbessert werden. Mehr Korrekturen helfen beim Lernen.'
        );
      }

      // Domain insights
      if (metrics.domainStrengths.length > 0) {
        const strongest = metrics.domainStrengths[0];
        if (strongest.strength >= 0.85) {
          insights.push(`Besonders stark in der Kategorie "${strongest.domain}".`);
        }

        const weakest = metrics.domainStrengths[metrics.domainStrengths.length - 1];
        if (weakest && weakest.strength < 0.6) {
          insights.push(
            `Verbesserungspotenzial bei "${weakest.domain}". Korrekturen in diesem Bereich helfen.`
          );
        }
      }

      // Improvement insights
      if (metrics.summary.improvementRate > 0.05) {
        insights.push('Positive Entwicklung! Die Genauigkeit verbessert sich stetig.');
      } else if (metrics.summary.improvementRate < -0.05) {
        insights.push('Die Genauigkeit hat leicht abgenommen. Mehr Feedback könnte helfen.');
      }

      // Proactive insights
      const highAcceptance = metrics.proactiveEffectiveness.find((p) => p.acceptanceRate > 0.7);
      if (highAcceptance) {
        insights.push(
          `Proaktive ${highAcceptance.suggestionType}-Vorschläge werden gut angenommen (${Math.round(highAcceptance.acceptanceRate * 100)}%).`
        );
      }

      return insights.length > 0 ? insights : ['Noch nicht genügend Daten für detaillierte Insights.'];
    } catch (error) {
      logger.debug('Insights generation failed', { error });
      return ['Insights konnten nicht generiert werden.'];
    }
  }

  // ===========================================
  // Utility Methods
  // ===========================================

  /**
   * Get empty metrics structure
   */
  private getEmptyMetrics(): EvolutionMetrics {
    return {
      learningCurve: [],
      domainStrengths: [],
      satisfactionTrend: [],
      proactiveEffectiveness: [],
      summary: {
        overallAccuracy: 0.7,
        overallSatisfaction: 4.0,
        strongestDomain: 'Nicht verfügbar',
        weakestDomain: 'Nicht verfügbar',
        totalInteractions: 0,
        improvementRate: 0,
      },
    };
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const aiEvolutionAnalytics = new AIEvolutionAnalytics();
