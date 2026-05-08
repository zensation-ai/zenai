/**
 * Self-Improvement Worker
 *
 * Runs daily to identify and execute self-improvement opportunities
 * across all 4 contexts. Respects daily budget (3 actions/context).
 * Routes through HyperAgent Level 0 (auto-apply, no governance needed).
 */

import { logger } from '../../../utils/logger';
import type { AIContext } from '../../../utils/database-context';

interface SelfImprovementJob {
  id?: string;
  name?: string;
  data: Record<string, unknown>;
  updateProgress(progress: number | Record<string, unknown>): Promise<void>;
}

const CONTEXTS: AIContext[] = ['operations', 'finance', 'people', 'strategy'];

export async function processSelfImprovement(
  job: SelfImprovementJob,
): Promise<Record<string, unknown>> {
  logger.info('Starting daily self-improvement cycle', { jobId: job.id });

  // Lazy-import to avoid circular dependencies
  const { identifyImprovements, checkBudget, executeWithHyperAgent } = await import(
    '../../integration/self-improvement'
  );

  const results: Array<{ context: string; identified: number; executed: number }> = [];

  for (let i = 0; i < CONTEXTS.length; i++) {
    const ctx = CONTEXTS[i];
    try {
      const budget = await checkBudget(ctx);
      if (budget.remainingToday <= 0) {
        logger.info(`Budget exhausted for ${ctx}, skipping`, { context: ctx });
        results.push({ context: ctx, identified: 0, executed: 0 });
        continue;
      }

      // Gather improvement parameters (lightweight — no heavy DB queries)
      const improvements = identifyImprovements({
        gaps: [],         // Will be populated from DB by the service
        procedures: [],
        calibration: { ece: 0 },
        teamStats: [],
      });

      let executed = 0;
      for (const improvement of improvements.slice(0, budget.remainingToday)) {
        if (improvement.requiresApproval) continue; // Skip — needs human
        try {
          await executeWithHyperAgent(ctx, improvement);
          executed++;
        } catch (err) {
          logger.warn(`Improvement execution failed in ${ctx}`, {
            type: improvement.type,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }

      results.push({ context: ctx, identified: improvements.length, executed });
    } catch (err) {
      logger.error(`Self-improvement failed for context ${ctx}`, err instanceof Error ? err : undefined);
      results.push({ context: ctx, identified: 0, executed: 0 });
    }

    await job.updateProgress(((i + 1) / CONTEXTS.length) * 100);
  }

  const totalExecuted = results.reduce((sum, r) => sum + r.executed, 0);

  // --- Metacognitive Strategy Analysis (DGM-H, arXiv 2603.19461) ---
  // After the improvement cycle, analyze which strategies work and which don't.
  // This enables the self-improvement mechanism to improve itself.
  try {
    const { analyzeImprovementStrategies, getImprovementHistory } = await import(
      '../../integration/self-improvement'
    );
    const history = await getImprovementHistory('operations', 50);
    if (history.length >= 5) {
      const strategyHistory = history.map(h => ({
        id: h.id,
        type: h.type,
        successRate: h.estimatedImpact,
        attempts: 1,
      }));
      const { underperforming, insight } = analyzeImprovementStrategies(strategyHistory);
      if (underperforming.length > 0) {
        logger.info('Metacognitive analysis: underperforming strategies detected', {
          count: underperforming.length,
          insight: insight.recommendation,
        });
      }
    }
  } catch (err) {
    logger.debug('Metacognitive strategy analysis skipped', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }

  logger.info('Daily self-improvement cycle completed', {
    totalExecuted,
    results,
  });

  return { status: 'completed', contextsProcessed: CONTEXTS.length, totalExecuted, results };
}
