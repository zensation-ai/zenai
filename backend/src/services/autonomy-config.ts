/**
 * Autonomy Configuration Service
 *
 * Defines a 4-level autonomy dial that controls how proactive decisions
 * are executed: from passive suggestions to fully autonomous actions.
 *
 * Levels:
 *  - suggest: Show suggestion only (via smart-suggestions)
 *  - ask:     Show + require governance approval before execution
 *  - act:     Execute + notify user afterward
 *  - auto:    Execute silently (no notification)
 *
 * Each action type has a default level, overridable per context.
 */

import { logger } from '../utils/logger';

// ===========================================
// Types
// ===========================================

export type AutonomyLevel = 'suggest' | 'ask' | 'act' | 'auto';

export type DecisionType = 'notify' | 'prepare_context' | 'take_action' | 'trigger_agent';

export interface AutonomyConfig {
  actionType: string;
  level: AutonomyLevel;
  context?: string;
  updatedAt: string;
}

// ===========================================
// Defaults
// ===========================================

const DEFAULT_LEVELS: Record<DecisionType, AutonomyLevel> = {
  notify: 'auto',
  prepare_context: 'auto',
  take_action: 'ask',
  trigger_agent: 'ask',
};

const VALID_LEVELS: readonly AutonomyLevel[] = ['suggest', 'ask', 'act', 'auto'] as const;

// ===========================================
// In-Memory Store
// ===========================================

/**
 * Key format:
 *  - Global:  `actionType`
 *  - Context: `actionType:context`
 */
const overrides = new Map<string, AutonomyLevel>();

function buildKey(actionType: string, context?: string): string {
  return context ? `${actionType}:${context}` : actionType;
}

// ===========================================
// Public API
// ===========================================

/**
 * Get the effective autonomy level for an action type.
 * Resolution order: context-specific override → global override → default.
 */
export function getAutonomyLevel(actionType: string, context?: string): AutonomyLevel {
  // 1. Context-specific override
  if (context) {
    const contextLevel = overrides.get(buildKey(actionType, context));
    if (contextLevel) {return contextLevel;}
  }

  // 2. Global override
  const globalLevel = overrides.get(buildKey(actionType));
  if (globalLevel) {return globalLevel;}

  // 3. Default
  return DEFAULT_LEVELS[actionType as DecisionType] ?? 'ask';
}

/**
 * Set the autonomy level for an action type, optionally scoped to a context.
 */
export function setAutonomyLevel(
  actionType: string,
  level: AutonomyLevel,
  context?: string
): void {
  if (!VALID_LEVELS.includes(level)) {
    logger.warn('Invalid autonomy level', { actionType, level });
    return;
  }
  const key = buildKey(actionType, context);
  overrides.set(key, level);
  logger.info('Autonomy level updated', { actionType, level, autonomyScope: context ?? 'global' });
}

/**
 * Get all current autonomy levels (defaults + overrides).
 * Returns one entry per action type, with context-specific entries if present.
 */
export function getAllAutonomyLevels(context?: string): AutonomyConfig[] {
  const result: AutonomyConfig[] = [];
  const now = new Date().toISOString();

  for (const actionType of Object.keys(DEFAULT_LEVELS)) {
    const level = getAutonomyLevel(actionType, context);
    result.push({
      actionType,
      level,
      context: context ?? undefined,
      updatedAt: now,
    });
  }

  return result;
}

/**
 * Check whether a given autonomy level is valid.
 */
export function isValidAutonomyLevel(level: string): level is AutonomyLevel {
  return VALID_LEVELS.includes(level as AutonomyLevel);
}

/**
 * Reset all overrides (useful for testing).
 */
export function resetAutonomyLevels(): void {
  overrides.clear();
}
