/**
 * Cross-Context Insight Sharing (HiMeS Enhancement)
 *
 * Breaks schema isolation for specific fact types that should be
 * consistent across all contexts (personal, work, learning, creative).
 *
 * Shared fact types:
 * - preference (communication style, language, format preferences)
 * - goal (aspirations that span contexts)
 *
 * NOT shared (context-specific):
 * - behavior (differs between work and personal)
 * - knowledge (domain-specific)
 * - context (inherently context-bound)
 *
 * Implementation:
 * Uses the public schema `personal_facts` table as a bridge.
 * During consolidation, eligible facts are promoted to shared status
 * and loaded into all contexts during initialization.
 */

import { AIContext, queryContext } from '../../utils/database-context';
import { query } from '../../utils/database';
import { logger } from '../../utils/logger';
import { longTermMemory, PersonalizationFact } from './long-term-memory';

// ===========================================
// Configuration
// ===========================================

const CONFIG = {
  /** Fact types that should be shared across contexts */
  SHARED_FACT_TYPES: ['preference', 'goal'] as const,
  /** Minimum confidence for a fact to be shared */
  MIN_SHARE_CONFIDENCE: 0.75,
  /** Minimum occurrences for a fact to be shared */
  MIN_SHARE_OCCURRENCES: 2,
  /** All contexts to share between */
  ALL_CONTEXTS: ['personal', 'work', 'learning', 'creative'] as AIContext[],
  /** Maximum shared facts to load per context */
  MAX_SHARED_FACTS: 50,
};

// ===========================================
// Types
// ===========================================

export interface SharedInsight {
  id: string;
  factType: 'preference' | 'goal';
  content: string;
  confidence: number;
  originContext: AIContext;
  occurrences: number;
  sharedAt: Date;
}

export interface SharingResult {
  factsShared: number;
  factsReceived: number;
  contextsUpdated: number;
}

// ===========================================
// Cross-Context Sharing Service
// ===========================================

class CrossContextSharingService {
  /**
   * Share eligible facts from one context to all others
   *
   * Called during nightly consolidation to propagate insights.
   */
  async shareFromContext(sourceContext: AIContext): Promise<SharingResult> {
    const result: SharingResult = { factsShared: 0, factsReceived: 0, contextsUpdated: 0 };

    try {
      // Get eligible facts from source context
      const facts = await longTermMemory.getFacts(sourceContext);
      const eligibleFacts = facts.filter(f =>
        (CONFIG.SHARED_FACT_TYPES as readonly string[]).includes(f.factType) &&
        f.confidence >= CONFIG.MIN_SHARE_CONFIDENCE &&
        f.occurrences >= CONFIG.MIN_SHARE_OCCURRENCES
      );

      if (eligibleFacts.length === 0) {
        return result;
      }

      // Share to all other contexts
      const targetContexts = CONFIG.ALL_CONTEXTS.filter(c => c !== sourceContext);

      for (const targetContext of targetContexts) {
        let received = 0;

        for (const fact of eligibleFacts) {
          try {
            // Check if this fact already exists in target context
            const existing = await this.findSimilarFact(targetContext, fact.content);
            if (existing) {
              // Boost confidence of existing fact if it's been confirmed in another context
              if (existing.confidence < fact.confidence) {
                await this.boostFactConfidence(targetContext, existing.id, 0.05);
              }
              continue;
            }

            // Add shared fact to target context with slightly lower confidence
            const sharedConfidence = fact.confidence * 0.85; // 15% confidence reduction for cross-context
            await longTermMemory.addFact(targetContext, {
              factType: fact.factType as PersonalizationFact['factType'],
              content: `[shared from ${sourceContext}] ${fact.content}`,
              confidence: sharedConfidence,
              source: 'inferred' as const,
            });

            received++;
            result.factsShared++;
          } catch (error) {
            logger.debug('Failed to share fact to context', {
              sourceContext,
              targetContext,
              factType: fact.factType,
              error,
            });
          }
        }

        if (received > 0) {
          result.contextsUpdated++;
          result.factsReceived += received;
          logger.info('Cross-context facts shared', {
            sourceContext,
            targetContext,
            factsReceived: received,
          });
        }
      }

      return result;
    } catch (error) {
      logger.error('Cross-context sharing failed', error instanceof Error ? error : undefined, {
        sourceContext,
      });
      return result;
    }
  }

  /**
   * Run cross-context sharing for all contexts
   * Called during nightly consolidation
   */
  async shareAll(): Promise<SharingResult> {
    const totalResult: SharingResult = { factsShared: 0, factsReceived: 0, contextsUpdated: 0 };

    for (const context of CONFIG.ALL_CONTEXTS) {
      try {
        const result = await this.shareFromContext(context);
        totalResult.factsShared += result.factsShared;
        totalResult.factsReceived += result.factsReceived;
        totalResult.contextsUpdated += result.contextsUpdated;
      } catch (error) {
        logger.debug('Sharing from context failed', { context, error });
      }
    }

    logger.info('Cross-context sharing complete', {
      factsShared: totalResult.factsShared,
      factsReceived: totalResult.factsReceived,
      contextsUpdated: totalResult.contextsUpdated,
    });
    return totalResult;
  }

  /**
   * Get all shared facts for a context (from other contexts)
   */
  async getSharedFacts(context: AIContext): Promise<PersonalizationFact[]> {
    try {
      const facts = await longTermMemory.getFacts(context);
      return facts.filter(f => f.content.startsWith('[shared from'));
    } catch {
      return [];
    }
  }

  /**
   * Find a similar fact in the target context to avoid duplicates
   */
  private async findSimilarFact(
    context: AIContext,
    content: string
  ): Promise<PersonalizationFact | null> {
    const facts = await longTermMemory.getFacts(context);
    const contentLower = content.toLowerCase();

    // Strip shared prefix for comparison
    const cleanContent = contentLower.replace(/\[shared from \w+\] /i, '');

    return facts.find(f => {
      const existingClean = f.content.toLowerCase().replace(/\[shared from \w+\] /i, '');
      return existingClean === cleanContent || existingClean.includes(cleanContent) || cleanContent.includes(existingClean);
    }) || null;
  }

  /**
   * Boost confidence of an existing fact
   */
  private async boostFactConfidence(
    context: AIContext,
    factId: string,
    boost: number
  ): Promise<void> {
    try {
      await queryContext(
        context,
        `UPDATE personalization_facts
         SET confidence = LEAST(1.0, confidence + $1),
             last_confirmed = NOW(),
             occurrences = occurrences + 1
         WHERE id = $2`,
        [boost, factId]
      );
    } catch (error) {
      logger.debug('Failed to boost fact confidence', { context, factId, error });
    }
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const crossContextSharing = new CrossContextSharingService();
