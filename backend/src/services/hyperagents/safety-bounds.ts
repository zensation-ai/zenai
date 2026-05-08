/**
 * HyperAgent Safety Bounds
 * Hardcoded limits for recursive self-improvement.
 * These bounds are immutable -- no system process can modify them.
 */

export const HYPERAGENT_BOUNDS = {
  /** Maximum recursion depth (Level 0, 1, 2) */
  maxRecursionDepth: 2,

  /** Maximum actions per day per level */
  maxDailyActions: {
    0: 3,   // Direct improvements (existing budget)
    1: 1,   // Meta-improvements
    2: 1,   // Strategy improvements
  } as Record<number, number>,

  /** Quality drop that triggers automatic rollback */
  rollbackTrigger: {
    qualityDropThreshold: 0.15,  // 15% quality drop
    windowDays: 3,               // Measured over 3 days
    minSamples: 5,               // Need at least 5 observations
  },

  /** Properties that can NEVER be modified by HyperAgents */
  immutableProperties: [
    'governance.policies',
    'security.*',
    'auth.*',
    'database.schema',
    'hyperagents.safety_bounds',
  ] as readonly string[],

  /** Which levels require governance approval */
  requiresGovernanceApproval: [1, 2] as readonly number[],

  /** Maximum percentage change per adjustment */
  maxAdjustmentPercent: 25,

  /** Sandbox test requirements before applying */
  sandboxRequirements: {
    minTestQueries: 10,
    minImprovementPercent: 5,  // Must show 5%+ improvement
    maxDegradationPercent: 2,  // Must not degrade more than 2% on any metric
  },
} as const;

export type HyperAgentLevel = 0 | 1 | 2;

export function isPropertyImmutable(property: string): boolean {
  return HYPERAGENT_BOUNDS.immutableProperties.some(pattern => {
    if (pattern.endsWith('.*')) {
      return property.startsWith(pattern.slice(0, -2));
    }
    return property === pattern;
  });
}

export function isDailyBudgetExceeded(level: HyperAgentLevel, actionsToday: number): boolean {
  const max = HYPERAGENT_BOUNDS.maxDailyActions[level];
  return actionsToday >= max;
}

export function isAdjustmentWithinBounds(currentValue: number, newValue: number): boolean {
  if (currentValue === 0) return true;
  const changePercent = Math.abs((newValue - currentValue) / currentValue) * 100;
  return changePercent <= HYPERAGENT_BOUNDS.maxAdjustmentPercent;
}

export function requiresGovernance(level: HyperAgentLevel): boolean {
  return HYPERAGENT_BOUNDS.requiresGovernanceApproval.includes(level);
}
