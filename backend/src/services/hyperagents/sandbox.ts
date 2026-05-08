/**
 * HyperAgent Sandbox
 * Tests improvements against sample queries before applying to production.
 * Runs improvements in isolation and compares quality scores.
 */

import { logger } from '../../utils/logger';
import { HYPERAGENT_BOUNDS } from './safety-bounds';

export interface SandboxTestResult {
  passed: boolean;
  testCount: number;
  avgQualityBefore: number;
  avgQualityAfter: number;
  qualityDelta: number;
  qualityDeltaPercent: number;
  worstDegradation: number;
  details: Array<{
    queryIndex: number;
    qualityBefore: number;
    qualityAfter: number;
    delta: number;
  }>;
}

export type QualityEvaluator = (config: Record<string, unknown>, query: string) => Promise<number>;

export async function runSandboxTest(
  currentConfig: Record<string, unknown>,
  proposedConfig: Record<string, unknown>,
  testQueries: string[],
  evaluator: QualityEvaluator
): Promise<SandboxTestResult> {
  const { minTestQueries, minImprovementPercent, maxDegradationPercent } = HYPERAGENT_BOUNDS.sandboxRequirements;

  if (testQueries.length < minTestQueries) {
    logger.warn('Sandbox: insufficient test queries', {
      provided: testQueries.length,
      required: minTestQueries,
    });
    return {
      passed: false,
      testCount: testQueries.length,
      avgQualityBefore: 0,
      avgQualityAfter: 0,
      qualityDelta: 0,
      qualityDeltaPercent: 0,
      worstDegradation: 0,
      details: [],
    };
  }

  const details: SandboxTestResult['details'] = [];
  let totalBefore = 0;
  let totalAfter = 0;
  let worstDegradation = 0;

  for (let i = 0; i < testQueries.length; i++) {
    try {
      const qualityBefore = await evaluator(currentConfig, testQueries[i]);
      const qualityAfter = await evaluator(proposedConfig, testQueries[i]);
      const delta = qualityAfter - qualityBefore;

      totalBefore += qualityBefore;
      totalAfter += qualityAfter;

      if (delta < 0) {
        worstDegradation = Math.max(worstDegradation, Math.abs(delta));
      }

      details.push({ queryIndex: i, qualityBefore, qualityAfter, delta });
    } catch (err) {
      logger.warn('Sandbox test query failed', { queryIndex: i, error: (err as Error).message });
      details.push({ queryIndex: i, qualityBefore: 0, qualityAfter: 0, delta: 0 });
    }
  }

  const avgBefore = totalBefore / testQueries.length;
  const avgAfter = totalAfter / testQueries.length;
  const qualityDelta = avgAfter - avgBefore;
  const qualityDeltaPercent = avgBefore > 0 ? (qualityDelta / avgBefore) * 100 : 0;
  const worstDegradationPercent = avgBefore > 0 ? (worstDegradation / avgBefore) * 100 : 0;

  const passed = qualityDeltaPercent >= minImprovementPercent
    && worstDegradationPercent <= maxDegradationPercent;

  logger.info('Sandbox test complete', {
    passed,
    qualityDeltaPercent: qualityDeltaPercent.toFixed(2),
    worstDegradation: worstDegradationPercent.toFixed(2),
  });

  return {
    passed,
    testCount: testQueries.length,
    avgQualityBefore: avgBefore,
    avgQualityAfter: avgAfter,
    qualityDelta,
    qualityDeltaPercent,
    worstDegradation,
    details,
  };
}
