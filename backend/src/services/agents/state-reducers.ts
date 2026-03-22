/**
 * Phase 129: Reducer-Driven State Management for Agent Shared Memory
 *
 * Provides REDUCER functions that define how concurrent updates merge,
 * replacing the naive last-write-wins approach in shared memory.
 */

import { logger } from '../../utils/logger';

export type StateReducer = (currentState: unknown, update: unknown) => unknown;

/**
 * Built-in reducer implementations for common merge strategies.
 */
export const BUILT_IN_REDUCERS: Record<string, StateReducer> = {
  /**
   * append — Arrays are concatenated. Non-arrays are wrapped before concatenation.
   * Used for: findings, errors, warnings, sources
   */
  append: (current, update) => [
    ...(Array.isArray(current) ? current : current !== null && current !== undefined ? [current] : []),
    ...(Array.isArray(update) ? update : update !== null && update !== undefined ? [update] : []),
  ],

  /**
   * replace — Last write wins.
   * Used for: summary, conclusion, draft
   */
  replace: (_current, update) => update,

  /**
   * max — Takes the maximum numeric value.
   * Used for: confidence scores (keeps the highest confidence seen)
   */
  max: (current, update) => Math.max(Number(current) || 0, Number(update) || 0),

  /**
   * min — Takes the minimum numeric value.
   */
  min: (current, update) => Math.min(
    Number(current) === 0 && current === null ? Infinity : (Number(current) || Infinity),
    Number(update) === 0 && update === null ? Infinity : (Number(update) || Infinity),
  ),

  /**
   * merge — Shallow object merge (update keys overwrite current keys).
   * Used for: metadata objects
   */
  merge: (current, update) => ({
    ...(typeof current === 'object' && current !== null ? (current as Record<string, unknown>) : {}),
    ...(typeof update === 'object' && update !== null ? (update as Record<string, unknown>) : {}),
  }),

  /**
   * increment — Adds update to current (defaults to +1 if update is not a number).
   * Used for: step counters, retry counts
   */
  increment: (current, update) => (Number(current) || 0) + (Number(update) || 1),
};

/**
 * Default reducer mapping for common state keys.
 * Keys not listed here fall back to 'replace'.
 */
export const DEFAULT_KEY_REDUCERS: Record<string, string> = {
  findings: 'append',
  errors: 'append',
  warnings: 'append',
  sources: 'append',
  summary: 'replace',
  conclusion: 'replace',
  draft: 'replace',
  confidence: 'max',
  metadata: 'merge',
  stepCount: 'increment',
};

/**
 * Returns the reducer name for a given state key.
 * Falls back to 'replace' for unknown keys.
 */
export function getReducerForKey(key: string): string {
  return DEFAULT_KEY_REDUCERS[key] ?? 'replace';
}

/**
 * Applies a reducer to produce a merged value for a single state key.
 *
 * Priority order:
 * 1. Explicit reducerName parameter
 * 2. DEFAULT_KEY_REDUCERS lookup by key
 * 3. 'replace' fallback
 */
export function applyReducer(
  key: string,
  currentValue: unknown,
  newValue: unknown,
  reducerName?: string,
): unknown {
  const name = reducerName ?? getReducerForKey(key);
  const reducer = BUILT_IN_REDUCERS[name];

  if (!reducer) {
    logger.warn(`Unknown reducer '${name}' for key '${key}', falling back to replace`);
    return newValue;
  }

  return reducer(currentValue, newValue);
}

/**
 * Applies reducers for every key in `updates` against `currentState`,
 * returning a new merged state object. Does not mutate `currentState`.
 *
 * @param currentState  - Existing agent shared state
 * @param updates       - Partial state patch from an agent
 * @param reducerOverrides - Optional per-key reducer name overrides
 */
export function applyBatchReducers(
  currentState: Record<string, unknown>,
  updates: Record<string, unknown>,
  reducerOverrides?: Record<string, string>,
): Record<string, unknown> {
  // Start with a shallow copy so we don't mutate the original
  const result: Record<string, unknown> = { ...currentState };

  for (const [key, newValue] of Object.entries(updates)) {
    const reducerName = reducerOverrides?.[key];
    result[key] = applyReducer(key, currentState[key], newValue, reducerName);
  }

  logger.debug(`applyBatchReducers applied ${Object.keys(updates).length} updates`);
  return result;
}
