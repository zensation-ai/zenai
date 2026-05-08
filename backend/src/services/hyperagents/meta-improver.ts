/**
 * HyperAgent Meta-Improver
 * Recursive self-improvement engine.
 * Level 0: Direct improvements (existing self-improvement)
 * Level 1: Meta-improvements (adjusts Level 0 strategies)
 * Level 2: Strategy improvements (adjusts Level 1 parameters)
 */

import { logger } from '../../utils/logger';
import {
  HYPERAGENT_BOUNDS,
  HyperAgentLevel,
  isPropertyImmutable,
  isDailyBudgetExceeded,
  isAdjustmentWithinBounds,
  requiresGovernance,
} from './safety-bounds';
import {
  recordImprovement,
  markReverted,
  getMetaMetrics,
  getImprovementById,
  getImprovementHistory,
} from './improvement-tracker';
import { runSandboxTest, QualityEvaluator, SandboxTestResult } from './sandbox';

export interface ImprovementProposal {
  level: HyperAgentLevel;
  type: string;
  description: string;
  targetProperty: string;
  currentValue: unknown;
  proposedValue: unknown;
  rationale: string;
  expectedImpact: number;  // estimated quality delta
}

export interface ImprovementResult {
  id: string;
  applied: boolean;
  reason: string;
  sandboxResult?: SandboxTestResult;
  governanceRequired: boolean;
}

// In-memory runtime config that HyperAgents can modify
const runtimeConfig: Map<string, unknown> = new Map();
const dailyActionCounts: Map<string, number> = new Map();

function getDailyKey(level: number): string {
  const date = new Date().toISOString().split('T')[0];
  return `${date}:level${level}`;
}

function getActionsToday(level: HyperAgentLevel): number {
  return dailyActionCounts.get(getDailyKey(level)) || 0;
}

function incrementActions(level: HyperAgentLevel): void {
  const key = getDailyKey(level);
  dailyActionCounts.set(key, (dailyActionCounts.get(key) || 0) + 1);
}

export function getRuntimeConfig(property: string): unknown {
  return runtimeConfig.get(property);
}

export function setRuntimeConfig(property: string, value: unknown): void {
  runtimeConfig.set(property, value);
}

export async function proposeImprovement(
  proposal: ImprovementProposal,
  evaluator?: QualityEvaluator,
  testQueries?: string[]
): Promise<ImprovementResult> {
  // 1. Check recursion depth
  if (proposal.level > HYPERAGENT_BOUNDS.maxRecursionDepth) {
    return { id: '', applied: false, reason: 'Exceeds max recursion depth', governanceRequired: false };
  }

  // 2. Check immutable properties
  if (isPropertyImmutable(proposal.targetProperty)) {
    return { id: '', applied: false, reason: `Property '${proposal.targetProperty}' is immutable`, governanceRequired: false };
  }

  // 3. Check daily budget
  if (isDailyBudgetExceeded(proposal.level, getActionsToday(proposal.level))) {
    return { id: '', applied: false, reason: `Daily budget exceeded for level ${proposal.level}`, governanceRequired: false };
  }

  // 4. Check adjustment bounds
  if (typeof proposal.currentValue === 'number' && typeof proposal.proposedValue === 'number') {
    if (!isAdjustmentWithinBounds(proposal.currentValue, proposal.proposedValue)) {
      return { id: '', applied: false, reason: 'Adjustment exceeds maximum 25% change', governanceRequired: false };
    }
  }

  // 5. Run sandbox test (if evaluator provided)
  let sandboxResult: SandboxTestResult | undefined = undefined;
  if (evaluator && testQueries && testQueries.length >= HYPERAGENT_BOUNDS.sandboxRequirements.minTestQueries) {
    const currentConfig = Object.fromEntries(runtimeConfig);
    const proposedConfig = { ...currentConfig, [proposal.targetProperty]: proposal.proposedValue };

    sandboxResult = await runSandboxTest(currentConfig, proposedConfig, testQueries, evaluator);

    if (!sandboxResult.passed) {
      return {
        id: '',
        applied: false,
        reason: `Sandbox test failed: ${sandboxResult.qualityDeltaPercent.toFixed(1)}% improvement (need ${HYPERAGENT_BOUNDS.sandboxRequirements.minImprovementPercent}%)`,
        sandboxResult,
        governanceRequired: false,
      };
    }
  }

  // 6. Check governance requirement
  const governanceRequired = requiresGovernance(proposal.level);

  // 7. Record the improvement
  const id = recordImprovement({
    level: proposal.level,
    type: proposal.type,
    description: proposal.description,
    appliedAt: new Date(),
    configBefore: { [proposal.targetProperty]: proposal.currentValue },
    configAfter: { [proposal.targetProperty]: proposal.proposedValue },
    qualityBefore: typeof proposal.currentValue === 'number' ? proposal.currentValue : 0,
  });

  // 8. Apply if no governance needed (Level 0 auto-applies)
  if (!governanceRequired) {
    runtimeConfig.set(proposal.targetProperty, proposal.proposedValue);
    incrementActions(proposal.level);

    logger.info('HyperAgent improvement applied', {
      id,
      level: proposal.level,
      property: proposal.targetProperty,
    });

    return { id, applied: true, reason: 'Applied successfully', sandboxResult, governanceRequired: false };
  }

  // 9. Return pending governance approval
  logger.info('HyperAgent improvement pending governance', {
    id,
    level: proposal.level,
    property: proposal.targetProperty,
  });

  return {
    id,
    applied: false,
    reason: 'Pending governance approval',
    sandboxResult,
    governanceRequired: true,
  };
}

export function approveAndApply(improvementId: string): boolean {
  const record = getImprovementById(improvementId);
  if (!record) return false;

  const property = Object.keys(record.configAfter)[0];
  const value = record.configAfter[property];

  runtimeConfig.set(property, value);
  incrementActions(record.level as HyperAgentLevel);

  logger.info('HyperAgent improvement approved and applied', { id: improvementId });
  return true;
}

export function rollbackImprovement(improvementId: string): boolean {
  const record = getImprovementById(improvementId);
  if (!record) return false;

  const property = Object.keys(record.configBefore)[0];
  const value = record.configBefore[property];

  runtimeConfig.set(property, value);
  markReverted(improvementId);

  logger.info('HyperAgent improvement rolled back', { id: improvementId });
  return true;
}

export function checkAutoRollback(): string[] {
  const metrics = getMetaMetrics(HYPERAGENT_BOUNDS.rollbackTrigger.windowDays);
  const rolledBack: string[] = [];

  if (metrics.totalImprovements < HYPERAGENT_BOUNDS.rollbackTrigger.minSamples) {
    return rolledBack;  // Not enough data
  }

  if (metrics.avgQualityDelta < -HYPERAGENT_BOUNDS.rollbackTrigger.qualityDropThreshold) {
    logger.warn('HyperAgent auto-rollback triggered', {
      avgDelta: metrics.avgQualityDelta,
      threshold: HYPERAGENT_BOUNDS.rollbackTrigger.qualityDropThreshold,
    });

    // Rollback most recent non-reverted improvements
    const history = getImprovementHistory(10);
    for (const record of history) {
      if (!record.reverted) {
        rollbackImprovement(record.id);
        rolledBack.push(record.id);
      }
    }
  }

  return rolledBack;
}

export function getStatus(): {
  config: Record<string, unknown>;
  actionsToday: Record<number, number>;
  metaMetrics: ReturnType<typeof getMetaMetrics>;
} {
  return {
    config: Object.fromEntries(runtimeConfig),
    actionsToday: {
      0: getActionsToday(0),
      1: getActionsToday(1),
      2: getActionsToday(2),
    },
    metaMetrics: getMetaMetrics(),
  };
}

// For testing
export function _resetForTesting(): void {
  runtimeConfig.clear();
  dailyActionCounts.clear();
}
